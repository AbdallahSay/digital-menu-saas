using Microsoft.Extensions.Configuration;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Platform;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class ProvisioningTests(Xunit.Abstractions.ITestOutputHelper output)
{
    private const string Route = "/api/v1/platform/restaurants";
    private sealed class TestDelivery : IOwnerOnboardingDelivery
    {
        public bool IsAvailable => true;
        public bool Fail { get; set; }
        public ConcurrentDictionary<string, (Guid UserId, string Token)> Invitations { get; } = new();
        public Task StageAsync(Guid userId, string email, string token, CancellationToken cancellationToken)
        {
            Invitations[email] = (userId, token);
            if (Fail) throw new OnboardingDeliveryException();
            return Task.CompletedTask;
        }
    }
    private sealed class CollidingCodes : IRestaurantPublicCodeGenerator
    {
        public string Generate() => "0123456789abcdef0123";
    }
    private static async Task<(AuthFixture Fixture, Browser Admin, TestDelivery Delivery)> Setup(Action<IServiceCollection>? configure = null)
    {
        var delivery = new TestDelivery();
        var fixture = await AuthFixture.Create(configure: s =>
        {
            s.AddSingleton<IOwnerOnboardingDelivery>(delivery);
            configure?.Invoke(s);
        });
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roles.CreateAsync(new IdentityRole<Guid>("PlatformAdmin"))).Succeeded);
        var admin = new ApplicationUser { Id = Guid.NewGuid(), UserName = "admin@example.test", Email = "admin@example.test" };
        Assert.True((await users.CreateAsync(admin, fixture.Password)).Succeeded);
        Assert.True((await users.AddToRoleAsync(admin, "PlatformAdmin")).Succeeded);
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password, admin.Email)).StatusCode);
        await browser.Csrf();
        return (fixture, browser, delivery);
    }
    private static object Request(string slug, string? email = null) => new { name = "مطعم " + slug, slug, ownerEmail = email ?? slug + "@example.test" };
    private static async Task<RestaurantResponse> Provision(Browser admin, string slug)
    {
        var result = await admin.Send(HttpMethod.Post, Route, Request(slug));
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        var restaurant = (await result.Content.ReadFromJsonAsync<RestaurantResponse>())!;
        Assert.Equal(Route + "/" + restaurant.Id, result.Headers.Location!.OriginalString);
        return restaurant;
    }
    private static async Task<RestaurantResponse> State(Browser admin, RestaurantResponse restaurant, string path, object payload)
    {
        var result = await admin.Send(HttpMethod.Patch, Route + "/" + restaurant.Id + path, payload);
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<RestaurantResponse>())!;
    }

    [SqlServerFact]
    public async Task Provisioning_is_atomic_independent_and_onboarding_is_single_use()
    {
        var (fixture, admin, delivery) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "new-a");
        var b = await Provision(admin, "new-b");
        Assert.NotEqual(a.PublicCode, b.PublicCode);
        Assert.Equal(20, a.PublicCode.Length);
        Assert.False(a.IsPublished);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var owner = (await users.FindByEmailAsync("new-a@example.test"))!;
        Assert.Null(owner.PasswordHash);
        Assert.Empty(await users.GetRolesAsync(owner));
        var membership = await db.Set<RestaurantUser>().SingleAsync(m => m.RestaurantId == a.Id);
        Assert.Equal(owner.Id, membership.UserId);
        Assert.True(membership.IsActive);
        Assert.Equal("Owner", membership.Role);
        Assert.Equal("ar", (await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == a.Id)).DefaultLocale);
        Assert.Single(await db.Set<AuditEntry>().Where(e => e.RestaurantId == a.Id && e.Action == "RestaurantProvisioned").ToListAsync());
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        var invitation = delivery.Invitations["new-a@example.test"];
        var payload = new CompleteOnboardingRequest(invitation.UserId, invitation.Token, fixture.Password);
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Send(HttpMethod.Post, "/onboarding", payload with { Token = "forged" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Send(HttpMethod.Post, "/onboarding", payload with { Password = "weak" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Send(HttpMethod.Post, "/onboarding", payload)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Send(HttpMethod.Post, "/onboarding", payload)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password, "new-a@example.test")).StatusCode);
        var me = await (await browser.Send(HttpMethod.Get, "/me")).Content.ReadAsStringAsync();
        Assert.Contains("new-a", me);
        Assert.DoesNotContain("new-b", me);
        var details = await admin.Send(HttpMethod.Get, Route + "/" + a.Id);
        Assert.Equal(a, await details.Content.ReadFromJsonAsync<RestaurantResponse>());
        var text = await details.Content.ReadAsStringAsync();
        Assert.DoesNotContain(invitation.Token, text);
        Assert.DoesNotContain("email", text, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("no-store", details.Headers.CacheControl!.ToString());
    }

    [SqlServerFact]
    public async Task Every_platform_endpoint_denies_owners_guests_and_forged_fields_and_requires_csrf()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password)).StatusCode);
        await owner.Csrf();
        var guest = new Browser(fixture.Factory);
        foreach (var (method, path, body) in new (HttpMethod, string, object?)[]
        {
            (HttpMethod.Get, Route, null), (HttpMethod.Post, Route, Request("denied")),
            (HttpMethod.Get, Route + "/" + Guid.NewGuid(), null),
            (HttpMethod.Patch, Route + "/" + Guid.NewGuid() + "/status", new { status = "Suspended", rowVersion = "AAAAAAAAAAA=" }),
            (HttpMethod.Patch, Route + "/" + Guid.NewGuid() + "/publication", new { isPublished = true, rowVersion = "AAAAAAAAAAA=" })
        })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(method, path, body)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(method, path, body)).StatusCode);
        }
        var a = await Provision(admin, "csrf-test");
        var token = admin.Token;
        foreach (var invalid in new string?[] { null, "forged" })
        {
            admin.Token = invalid;
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Post, Route, Request("csrf-fail"))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/status", new { status = "Suspended", a.RowVersion })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/publication", new { isPublished = true, a.RowVersion })).StatusCode);
        }
        admin.Token = token;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Post, Route,
            new { name = "test", slug = "forged", ownerEmail = "forged@example.test", role = "PlatformAdmin" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Post, Route,
            new { name = "test", slug = "forged", ownerEmail = "forged@example.test", publicCode = "client-code" })).StatusCode);
    }

    [SqlServerFact]
    public async Task Duplicate_requests_delivery_failure_and_concurrent_provisioning_leave_no_partial_rows()
    {
        var (fixture, admin, delivery) = await Setup();
        await using var cleanup = fixture;
        await Provision(admin, "duplicate");
        Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, Route, Request("duplicate"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, Route, Request("other", "duplicate@example.test"))).StatusCode);
        delivery.Fail = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await admin.Send(HttpMethod.Post, Route, Request("rollback"))).StatusCode);
        var rolledBack = delivery.Invitations["rollback@example.test"];
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.Send(HttpMethod.Post, "/onboarding",
            new CompleteOnboardingRequest(rolledBack.UserId, rolledBack.Token, fixture.Password))).StatusCode);
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            Assert.False(await db.Users.AnyAsync(u => u.Email == "rollback@example.test"));
            Assert.False(await db.Set<Restaurant>().AnyAsync(r => r.Slug == "rollback"));
            Assert.Equal(1, await db.Set<RestaurantSettings>().CountAsync());
            Assert.Equal(2, await db.Set<RestaurantUser>().CountAsync());
            Assert.Equal(1, await db.Set<AuditEntry>().CountAsync());
        }
        delivery.Fail = false;
        // Independent browser instances avoid shared cookie mutation during concurrent requests.
        var second = new Browser(fixture.Factory) { Token = admin.Token };
        foreach (var cookie in admin.Cookies) second.Cookies[cookie.Key] = cookie.Value;
        var responses = await Task.WhenAll(admin.Send(HttpMethod.Post, Route, Request("race")), second.Send(HttpMethod.Post, Route, Request("race")));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        using var check = fixture.Factory.Services.CreateScope();
        var store = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Single(await store.Set<Restaurant>().Where(r => r.Slug == "race").ToListAsync());
        Assert.Single(await store.Users.Where(u => u.Email == "race@example.test").ToListAsync());
        var accountRace = await Task.WhenAll(admin.Send(HttpMethod.Post, Route, Request("email-race-a", "same-owner@example.test")),
            second.Send(HttpMethod.Post, Route, Request("email-race-b", "SAME-OWNER@example.test")));
        Assert.Single(accountRace, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(accountRace, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(1, await store.Users.CountAsync(u => u.NormalizedEmail == "SAME-OWNER@EXAMPLE.TEST"));
        Assert.Equal(1, await store.Set<Restaurant>().CountAsync(r => r.Slug.StartsWith("email-race-")));
    }

    [SqlServerFact]
    public async Task Status_publication_concurrency_audits_and_reactivation_respect_current_membership()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "state-a");
        var b = await Provision(admin, "state-b");
        var published = await State(admin, a, "/publication", new { isPublished = true, a.RowVersion });
        Assert.True(published.IsPublished);
        Assert.Equal(a.PublishedMenuVersion + 1, published.PublishedMenuVersion);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/status", new { status = "Suspended", a.RowVersion })).StatusCode);
        var suspended = await State(admin, published, "/status", new { status = "Suspended", published.RowVersion });
        var noOp = await State(admin, suspended, "/status", new { status = "Suspended", suspended.RowVersion });
        Assert.Equal(suspended, noOp);
        var active = await State(admin, suspended, "/status", new { status = "Active", suspended.RowVersion });
        var draft = await State(admin, active, "/publication", new { isPublished = false, active.RowVersion });
        Assert.Equal(a.PublicCode, draft.PublicCode);
        Assert.Equal(b, await (await admin.Send(HttpMethod.Get, Route + "/" + b.Id)).Content.ReadFromJsonAsync<RestaurantResponse>());
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(new[] { "RestaurantProvisioned", "RestaurantPublished", "RestaurantSuspended", "RestaurantReactivated", "RestaurantUnpublished" },
            await db.Set<AuditEntry>().Where(e => e.RestaurantId == a.Id).OrderBy(e => e.TimestampUtc).Select(e => e.Action).ToArrayAsync());
        // Existing authenticated F03 owner must lose access through the new platform endpoint.
        var existing = await db.Set<Restaurant>().SingleAsync(r => r.Slug == "a");
        var existingDto = (await (await admin.Send(HttpMethod.Get, Route + "/" + existing.Id)).Content.ReadFromJsonAsync<RestaurantResponse>())!;
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password)).StatusCode);
        var stopped = await State(admin, existingDto, "/status", new { status = "Suspended", existingDto.RowVersion });
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Login(fixture.Password)).StatusCode);
        var restored = await State(admin, stopped, "/status", new { status = "Active", stopped.RowVersion });
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password)).StatusCode);
        var membership = await db.Set<RestaurantUser>().SingleAsync(m => m.RestaurantId == existing.Id);
        membership.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
        membership.IsActive = true;
        await db.SaveChangesAsync();
        Assert.Equal("Active", restored.Status);
    }

    [SqlServerFact]
    public async Task Pagination_validation_missing_resources_and_concurrent_updates_are_predictable()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "paged-a");
        await Provision(admin, "paged-b");
        using var page = System.Text.Json.JsonDocument.Parse(await (await admin.Send(HttpMethod.Get, Route + "?page=2&pageSize=1&search=paged-")).Content.ReadAsStringAsync());
        Assert.Equal(2, page.RootElement.GetProperty("total").GetInt32());
        Assert.Single(page.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Get, Route + "?page=0&pageSize=101")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Send(HttpMethod.Get, Route + "/" + Guid.NewGuid())).StatusCode);
        foreach (var invalid in new object[] { Request("../bad"), new { name = "", slug = "valid", ownerEmail = "invalid" }, new { name = new string('x', 151), slug = "valid", ownerEmail = "valid@example.test" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Post, Route, invalid)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/status", new { status = "Deleted", a.RowVersion })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/publication", new { isPublished = true, rowVersion = "bad" })).StatusCode);
        var second = new Browser(fixture.Factory) { Token = admin.Token };
        foreach (var cookie in admin.Cookies) second.Cookies[cookie.Key] = cookie.Value;
        var updates = await Task.WhenAll(admin.Send(HttpMethod.Patch, Route + "/" + a.Id + "/status", new { status = "Suspended", a.RowVersion }),
            second.Send(HttpMethod.Patch, Route + "/" + a.Id + "/publication", new { isPublished = true, a.RowVersion }));
        Assert.Single(updates, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(updates, r => r.StatusCode == HttpStatusCode.PreconditionFailed);
        using var scope = fixture.Factory.Services.CreateScope();
        Assert.Equal(2, await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Set<AuditEntry>().CountAsync(e => e.RestaurantId == a.Id));
    }

    [SqlServerFact]
    public async Task Unconfigured_delivery_fails_closed_without_creating_an_account()
    {
        // Exercise default adapter in a separate fixture, with the existing F03 bootstrap.
        await using var unavailable = await AuthFixture.Create(empty: true);
        using var scope = unavailable.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        await roles.CreateAsync(new IdentityRole<Guid>("PlatformAdmin"));
        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = "admin@example.test", Email = "admin@example.test" };
        await users.CreateAsync(user, unavailable.Password);
        await users.AddToRoleAsync(user, "PlatformAdmin");
        var browser = new Browser(unavailable.Factory);
        await browser.Csrf();
        await browser.Login(unavailable.Password, user.Email);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await browser.Send(HttpMethod.Post, Route, Request("disabled"))).StatusCode);
        Assert.False(await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Set<Restaurant>().AnyAsync());
    }

    [Fact]
    public void Public_codes_are_fixed_length_random_routing_identifiers()
    {
        var codes = Enumerable.Range(0, 1000).Select(_ => Provisioning.NewPublicCode()).ToArray();
        Assert.Equal(1000, codes.Distinct().Count());
        Assert.All(codes, code => Assert.Matches("^[a-f0-9]{20}$", code));
    }

    [SqlServerFact]
    public async Task Concurrent_onboarding_consumes_the_token_once_and_requires_csrf()
    {
        var (fixture, admin, delivery) = await Setup();
        await using var cleanup = fixture;
        await Provision(admin, "onboarding-race");
        var invitation = delivery.Invitations["onboarding-race@example.test"];
        var payload = new CompleteOnboardingRequest(invitation.UserId, invitation.Token, fixture.Password);
        var first = new Browser(fixture.Factory);
        var second = new Browser(fixture.Factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.Send(HttpMethod.Post, "/onboarding", payload)).StatusCode);
        await first.Csrf();
        await second.Csrf();
        var results = await Task.WhenAll(first.Send(HttpMethod.Post, "/onboarding", payload), second.Send(HttpMethod.Post, "/onboarding", payload));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.BadRequest);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True(await users.CheckPasswordAsync((await users.FindByIdAsync(invitation.UserId.ToString()))!, fixture.Password));
    }

    [SqlServerFact]
    public async Task Expired_onboarding_cannot_set_password_or_create_an_authenticated_session()
    {
        var (fixture, admin, delivery) = await Setup(s => s.Configure<DataProtectionTokenProviderOptions>(o => o.TokenLifespan = TimeSpan.FromSeconds(-1)));
        await using var cleanup = fixture;
        await Provision(admin, "expired");
        var invitation = delivery.Invitations["expired@example.test"];
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Send(HttpMethod.Post, "/onboarding",
            new CompleteOnboardingRequest(invitation.UserId, invitation.Token, fixture.Password))).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.False(await users.HasPasswordAsync((await users.FindByIdAsync(invitation.UserId.ToString()))!));
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password, "expired@example.test")).StatusCode);
    }

    private static (Guid UserId, string Token) ParseLink(string url)
    {
        var uri = new Uri(url);
        Assert.Equal("https://menu.example/owner-setup", uri.GetLeftPart(UriPartial.Path));
        Assert.Equal("", uri.Query);
        var parts = uri.Fragment.TrimStart('#').Split('&').Select(p => p.Split('=', 2)).ToDictionary(p => p[0], p => p[1]);
        return (Guid.ParseExact(parts["u"], "N"), System.Text.Encoding.UTF8.GetString(Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlDecode(parts["t"])));
    }

    // The 10/min credential limiter is per IP and shared by a fixture, so each scenario stays under it on purpose.
    private static Task<(AuthFixture Fixture, Browser Admin, TestDelivery Delivery)> HandoffSetup() => Setup(s =>
    {
        var links = new OwnerSetupLinks(new Uri("https://menu.example"));
        s.AddSingleton(new OwnerSetupLinkOptions(links));
        s.AddScoped<IOwnerOnboardingDelivery>(_ => new OperatorHandoffDelivery(links));
    });
    private static async Task<(Guid RestaurantId, (Guid UserId, string Token) Link)> ProvisionWithLink(Browser admin, string slug)
    {
        var created = await admin.Send(HttpMethod.Post, Route, Request(slug));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("no-store", created.Headers.CacheControl!.ToString());
        var body = await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        return (body.GetProperty("id").GetGuid(), ParseLink(body.GetProperty("ownerSetupUrl").GetString()!));
    }
    private static async Task<(Guid UserId, string Token)> Reissue(Browser admin, Guid restaurantId)
    {
        var response = await admin.Send(HttpMethod.Post, Route + "/" + restaurantId + "/owner-setup-link");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        return ParseLink((await response.Content.ReadFromJsonAsync<OwnerSetupLinkResponse>())!.OwnerSetupUrl);
    }

    [SqlServerFact]
    public async Task Operator_handoff_first_link_is_single_use_and_owners_cannot_mint_links()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, first) = await ProvisionWithLink(admin, "handoff");
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(first.UserId, first.Token, fixture.Password))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(first.UserId, first.Token, fixture.Password + "x9!"))).StatusCode);
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password, "handoff@example.test")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Post, Route + "/" + restaurantId + "/owner-setup-link")).StatusCode);
    }

    [SqlServerFact]
    public async Task Operator_handoff_reissue_revokes_earlier_links_and_unknown_restaurants_are_404()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, _) = await ProvisionWithLink(admin, "reissue");
        var a = await Reissue(admin, restaurantId);
        var b = await Reissue(admin, restaurantId);
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(a.UserId, a.Token, fixture.Password))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(b.UserId, b.Token, fixture.Password))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(b.UserId, b.Token, fixture.Password))).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(2, await db.Set<AuditEntry>().CountAsync(x => x.Action == "OwnerSetupLinkIssued"));
        Assert.DoesNotContain(await db.Set<AuditEntry>().Select(x => x.Action + x.ResourceType).ToListAsync(), v => v.Contains(a.Token));
    }

    [SqlServerFact]
    public async Task Minting_a_link_signs_the_owner_out_immediately_before_the_link_is_used()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, first) = await ProvisionWithLink(admin, "midsession");
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(first.UserId, first.Token, fixture.Password))).StatusCode);
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password, "midsession@example.test")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
        await Reissue(admin, restaurantId);
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
    }

    [SqlServerFact]
    public async Task Concurrent_consumption_of_a_reissued_link_succeeds_exactly_once()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, _) = await ProvisionWithLink(admin, "raceissue");
        var link = await Reissue(admin, restaurantId);
        var one = new Browser(fixture.Factory);
        var two = new Browser(fixture.Factory);
        await one.Csrf();
        await two.Csrf();
        var payload = new CompleteOnboardingRequest(link.UserId, link.Token, fixture.Password);
        var results = await Task.WhenAll(one.Send(HttpMethod.Post, "/onboarding", payload), two.Send(HttpMethod.Post, "/onboarding", payload));
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.BadRequest);
    }

    // Reads validity against the CURRENT persisted security stamp without consuming the token
    // (VerifyUserToken does not rotate the stamp, unlike a password reset).
    private static async Task<bool> TokenIsValid(AuthFixture fixture, (Guid UserId, string Token) link)
    {
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByIdAsync(link.UserId.ToString());
        return user is not null && await users.VerifyUserTokenAsync(user, users.Options.Tokens.PasswordResetTokenProvider, "ResetPassword", link.Token);
    }

    // SMOKE coverage, not a controlled interleaving: overlapping HTTP requests with no barrier inside the
    // handler. Four concurrent mints were used when this test first failed ("accepted 0, expected 1" with
    // the earlier sequential-consumption oracle); that failure's cause was never isolated and is UNRESOLVED.
    [SqlServerFact]
    public async Task Concurrent_minting_smoke_validity_is_checked_against_the_final_state_before_any_consumption()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, first) = await ProvisionWithLink(admin, "racemint");
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => admin.Send(HttpMethod.Post, Route + "/" + restaurantId + "/owner-setup-link")));
        var statuses = string.Join(",", responses.Select(r => (int)r.StatusCode));
        // Contention on the security stamp is the documented fail-closed 503 (nothing minted); any other status is a defect.
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.OK or HttpStatusCode.ServiceUnavailable, "mint statuses " + statuses));
        var links = new List<(Guid UserId, string Token)>();
        foreach (var r in responses.Where(r => r.StatusCode == HttpStatusCode.OK))
            links.Add(ParseLink((await r.Content.ReadFromJsonAsync<OwnerSetupLinkResponse>())!.OwnerSetupUrl));
        Assert.NotEmpty(links);
        Assert.False(await TokenIsValid(fixture, first), "pre-existing link survived; mint statuses " + statuses);
        var validity = new List<bool>();
        foreach (var l in links) validity.Add(await TokenIsValid(fixture, l));
        Assert.True(validity.Count(v => v) == 1, "valid links " + string.Join(",", validity) + "; mint statuses " + statuses);
        // Now consume the valid one over HTTP (budgeted: guest csrf + 2 onboarding requests), then prove replay fails.
        var valid = links[validity.IndexOf(true)];
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        var consumed = await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(valid.UserId, valid.Token, fixture.Password));
        Assert.True(consumed.StatusCode == HttpStatusCode.NoContent, "consume " + (int)consumed.StatusCode + "; mint statuses " + statuses);
        var replay = await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(valid.UserId, valid.Token, fixture.Password));
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
        // The links that validated false are dead for the same reason (stamp rotated); check each without HTTP.
        foreach (var l in links) Assert.False(await TokenIsValid(fixture, l));
    }

    // SMOKE coverage of a mint racing a consume of the previous link (no barrier). Distinct passwords show which
    // operation set the final one.
    [SqlServerFact]
    public async Task Minting_racing_with_consumption_smoke_old_token_dead_new_link_usable_once_with_distinct_passwords()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, first) = await ProvisionWithLink(admin, "raceconsume");
        var oldPassword = fixture.Password;
        var newPassword = fixture.Password + "N7#q";
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        var consume = guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(first.UserId, first.Token, oldPassword));
        var mint = admin.Send(HttpMethod.Post, Route + "/" + restaurantId + "/owner-setup-link");
        await Task.WhenAll(consume, mint);
        var outcome = "consume " + (int)consume.Result.StatusCode + ", mint " + (int)mint.Result.StatusCode;
        Assert.True(consume.Result.StatusCode is HttpStatusCode.NoContent or HttpStatusCode.BadRequest, outcome);
        Assert.True(mint.Result.StatusCode == HttpStatusCode.OK, outcome);
        var fresh = ParseLink((await mint.Result.Content.ReadFromJsonAsync<OwnerSetupLinkResponse>())!.OwnerSetupUrl);
        Assert.False(await TokenIsValid(fixture, first), "old token still valid; " + outcome);
        // Whichever side won, the link the operator was handed must be usable. (If consume committed after
        // the mint's stamp read, the stamp rotates and the handed-out link is dead: that would be a real finding.)
        Assert.True(await TokenIsValid(fixture, fresh), "freshly minted link is not valid after the race; " + outcome);
        var set = await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(fresh.UserId, fresh.Token, newPassword));
        Assert.True(set.StatusCode == HttpStatusCode.NoContent, "set new password " + (int)set.StatusCode + "; " + outcome);
        var replay = await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(fresh.UserId, fresh.Token, newPassword));
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
        // Request budget on the 10/min "auth" limiter (csrf, login, onboarding and the mint all count): setup 3,
        // guest csrf 1, consume 1, mint 1, set 1, replay 1, login 1 = 9. The old-password check therefore uses
        // UserManager instead of another HTTP login, to stay under the limit.
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Login(newPassword, "raceconsume@example.test")).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByIdAsync(fresh.UserId.ToString()))!;
        Assert.True(await users.CheckPasswordAsync(user, newPassword));
        Assert.False(await users.CheckPasswordAsync(user, oldPassword));
    }

    [SqlServerFact]
    public async Task Operator_handoff_reset_replaces_the_password_and_signs_the_owner_out()
    {
        var (fixture, admin, _) = await HandoffSetup();
        await using var cleanup = fixture;
        var (restaurantId, first) = await ProvisionWithLink(admin, "reset");
        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(first.UserId, first.Token, fixture.Password))).StatusCode);
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password, "reset@example.test")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
        var link = await Reissue(admin, restaurantId);
        var newPassword = fixture.Password + "x9!";
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding", new CompleteOnboardingRequest(link.UserId, link.Token, newPassword))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByIdAsync(link.UserId.ToString()))!;
        Assert.True(await users.CheckPasswordAsync(user, newPassword));
        Assert.False(await users.CheckPasswordAsync(user, fixture.Password));
    }

    [Theory]
    [InlineData("https://menu.example", "Production", true)]
    [InlineData("http://127.0.0.1:4000", "Development", true)]
    [InlineData("http://127.0.0.1:4000", "Production", false)]
    [InlineData("http://menu.example", "Development", false)]
    [InlineData("https://user:pw@menu.example", "Production", false)]
    [InlineData("https://menu.example/app", "Production", false)]
    [InlineData("https://menu.example/?x=1", "Production", false)]
    [InlineData("https://menu.example/#f", "Production", false)]
    [InlineData("ftp://127.0.0.1", "Development", false)]
    [InlineData("", "Production", false)]
    public void Public_origin_is_validated_from_configuration_only(string origin, string environment, bool accepted)
    {
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Onboarding:OperatorHandoff:Enabled"] = "true", ["Onboarding:PublicOrigin"] = origin }).Build();
        var env = new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = environment };
        if (accepted) Assert.NotNull(OwnerSetupLinks.FromConfiguration(config, env));
        else Assert.Throws<InvalidOperationException>((Action)(() => _ = OwnerSetupLinks.FromConfiguration(config, env)));
    }

    [Fact]
    public void Handoff_disabled_yields_no_links()
    {
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
        Assert.Null(OwnerSetupLinks.FromConfiguration(config, new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Production" }));
    }

    [SqlServerFact]
    public async Task Without_handoff_or_pipe_production_provisioning_fails_closed_and_links_are_unavailable()
    {
        var (f2, admin, _) = await Setup(s => s.AddSingleton<IOwnerOnboardingDelivery, UnconfiguredOwnerOnboardingDelivery>()); // default host: OwnerSetupLinkOptions comes from the real registration
        await using var cleanup2 = f2;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await admin.Send(HttpMethod.Post, Route, Request("nolink"))).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await admin.Send(HttpMethod.Post, Route + "/" + Guid.NewGuid() + "/owner-setup-link")).StatusCode);
    }

    [SqlServerFact]
    public async Task Platform_listing_load_smoke_returns_bounded_independent_results()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        await Provision(admin, "smoke-a");
        await Provision(admin, "smoke-b");
        var elapsed = await Task.WhenAll(Enumerable.Range(0, 20).Select(async _ =>
        {
            var browser = new Browser(fixture.Factory);
            foreach (var cookie in admin.Cookies) browser.Cookies[cookie.Key] = cookie.Value;
            var timer = System.Diagnostics.Stopwatch.StartNew();
            var response = await browser.Send(HttpMethod.Get, Route + "?pageSize=1&search=smoke-");
            var page = await response.Content.ReadFromJsonAsync<RestaurantPageResponse>();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(2, page!.Total);
            Assert.Single(page.Items);
            return timer.Elapsed.TotalMilliseconds;
        }));
        Array.Sort(elapsed);
        output.WriteLine($"Local TestServer + LocalDB, 20 concurrent GETs, 2 matching tenants: p50={elapsed[9]:F1}ms p95={elapsed[18]:F1}ms max={elapsed[19]:F1}ms, 0 errors. Not a production benchmark.");
    }

    [SqlServerFact]
    public async Task Generated_public_code_collision_returns_conflict_and_rolls_back_the_new_owner()
    {
        var (fixture, admin, _) = await Setup(s => s.AddSingleton<IRestaurantPublicCodeGenerator, CollidingCodes>());
        await using var cleanup = fixture;
        var original = await Provision(admin, "code-original");
        Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, Route, Request("code-collision"))).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.False(await db.Users.AnyAsync(u => u.Email == "code-collision@example.test"));
        Assert.False(await db.Set<Restaurant>().AnyAsync(r => r.Slug == "code-collision"));
        Assert.Equal(1, await db.Set<AuditEntry>().CountAsync());
        Assert.Equal(original, await (await admin.Send(HttpMethod.Get, Route + "/" + original.Id)).Content.ReadFromJsonAsync<RestaurantResponse>());
    }
}
