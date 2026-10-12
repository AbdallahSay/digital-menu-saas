using System.Security.Claims;
using DigitalMenu.Api.Auth;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class TenantSecurityTests
{
    private sealed class Fixture : IAsyncDisposable
    {
        public AuthFixture Auth { get; private set; } = null!;
        public Browser A { get; private set; } = null!;
        public Browser B { get; private set; } = null!;
        public Guid RestaurantA { get; private set; }
        public Guid RestaurantB { get; private set; }
        public Guid OwnerA { get; private set; }
        public Category CategoryA { get; } = new() { NameAr = "A category" };
        public Category CategoryB { get; } = new() { NameAr = "Protected B category" };
        public MenuItem ItemA { get; } = new() { NameAr = "A item", Price = 1 };
        public MenuItem ItemB { get; } = new() { NameAr = "Protected B item", Price = 2 };
        public MenuItemImage ImageA { get; } = new() { Width = 100, Height = 100 };
        public MenuItemImage ImageB { get; } = new() { Width = 100, Height = 100 };

        public static async Task<Fixture> Create()
        {
            var fixture = new Fixture { Auth = await AuthFixture.Create() };
            using var scope = fixture.Auth.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
            fixture.OwnerA = (await users.FindByEmailAsync("owner@example.test"))!.Id;
            var ownerB = new ApplicationUser { Id = Guid.NewGuid(), Email = "b@example.test", UserName = "b@example.test" };
            Assert.True((await users.CreateAsync(ownerB, fixture.Auth.Password)).Succeeded);
            fixture.RestaurantA = (await db.Set<Restaurant>().SingleAsync(r => r.Slug == "a")).Id;
            fixture.RestaurantB = (await db.Set<Restaurant>().SingleAsync(r => r.Slug == "b")).Id;
            db.Add(new RestaurantUser { UserId = ownerB.Id, RestaurantId = fixture.RestaurantB });
            fixture.CategoryA.RestaurantId = fixture.ItemA.RestaurantId = fixture.ImageA.RestaurantId = fixture.RestaurantA;
            fixture.CategoryB.RestaurantId = fixture.ItemB.RestaurantId = fixture.ImageB.RestaurantId = fixture.RestaurantB;
            fixture.ItemA.CategoryId = fixture.CategoryA.Id;
            fixture.ItemB.CategoryId = fixture.CategoryB.Id;
            fixture.ImageA.MenuItemId = fixture.ItemA.Id;
            fixture.ImageB.MenuItemId = fixture.ItemB.Id;
            fixture.ImageA.ObjectKey = fixture.RestaurantA + "/a.webp";
            fixture.ImageB.ObjectKey = fixture.RestaurantB + "/protected-b.webp";
            db.AddRange(fixture.CategoryA, fixture.CategoryB, fixture.ItemA, fixture.ItemB, fixture.ImageA, fixture.ImageB,
                new RestaurantSettings { RestaurantId = fixture.RestaurantA },
                new RestaurantSettings { RestaurantId = fixture.RestaurantB, Description = "Protected B settings" });
            await db.SaveChangesAsync();
            fixture.A = new Browser(fixture.Auth.Factory);
            fixture.B = new Browser(fixture.Auth.Factory);
            await fixture.A.Csrf();
            Assert.Equal(System.Net.HttpStatusCode.NoContent, (await fixture.A.Login(fixture.Auth.Password)).StatusCode);
            await fixture.B.Csrf();
            Assert.Equal(System.Net.HttpStatusCode.NoContent, (await fixture.B.Login(fixture.Auth.Password, "b@example.test")).StatusCode);
            return fixture;
        }
        public async Task Run(Browser? browser, Func<IServiceProvider, DefaultHttpContext, Task> action)
        {
            using var scope = Auth.Factory.Services.CreateScope();
            var http = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
            http.Request.Scheme = "https";
            http.Request.Host = new HostString("localhost");
            http.Response.Body = new MemoryStream();
            if (browser is not null) http.Request.Headers.Cookie = string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value));
            var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
            var previous = accessor.HttpContext;
            accessor.HttpContext = http;
            try { await action(scope.ServiceProvider, http); }
            finally { accessor.HttpContext = previous; }
        }
        public async ValueTask DisposeAsync() => await Auth.DisposeAsync();
    }
    private static async Task Reject(Func<Task> action, TenantFailure failure = TenantFailure.NotFound)
    {
        var error = await Assert.ThrowsAsync<TenantBoundaryException>(action);
        Assert.Equal(failure, error.Failure);
        Assert.Equal("Tenant boundary rejected the operation.", error.Message);
    }

    [SqlServerFact]
    public async Task Signed_identity_membership_select_scope_and_forged_headers_roles_claims_do_not_override_it()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, http) =>
        {
            http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, fixture.RestaurantB.ToString()),
                new Claim(ClaimTypes.Role, "PlatformAdmin"), new Claim("RestaurantId", fixture.RestaurantB.ToString()) }, "forged"));
            http.Request.Headers["X-Restaurant-Id"] = fixture.RestaurantB.ToString();
            http.Request.Headers["X-Tenant-Id"] = fixture.RestaurantB.ToString();
            http.Request.QueryString = new QueryString("?restaurantId=" + fixture.RestaurantB + "&role=PlatformAdmin");
            var tenant = await services.GetRequiredService<ITenantContext>().RequireAsync();
            Assert.Equal(fixture.RestaurantA, tenant.RestaurantId);
            Assert.Equal(fixture.OwnerA, tenant.UserId);
            var authorization = services.GetRequiredService<IAuthorizationService>();
            Assert.True((await authorization.AuthorizeAsync(http.User, fixture.RestaurantA, new[] { new TenantRestaurantRequirement() })).Succeeded);
            Assert.False((await authorization.AuthorizeAsync(http.User, fixture.RestaurantB, new[] { new TenantRestaurantRequirement() })).Succeeded);
        });
        await fixture.Run(null, async (services, http) =>
        {
            http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, fixture.OwnerA.ToString()), new Claim(ClaimTypes.Role, "Owner") }, "forged"));
            await Reject(() => services.GetRequiredService<ITenantContext>().RequireAsync(), TenantFailure.Unauthenticated);
        });
        var original = fixture.A.Cookies["__Host-DigitalMenu.Session"];
        fixture.A.Cookies["__Host-DigitalMenu.Session"] = "forged-cookie";
        await fixture.Run(fixture.A, async (services, _) =>
            await Reject(() => services.GetRequiredService<ITenantContext>().RequireAsync(), TenantFailure.Unauthenticated));
        fixture.A.Cookies["__Host-DigitalMenu.Session"] = original;
    }

    [SqlServerFact]
    public async Task Foreign_read_edit_delete_matrix_is_non_disclosing_and_B_is_unchanged()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            Assert.Empty(await session.ReadAsync<Category, string>(c => c.Id == fixture.CategoryB.Id, c => c.NameAr));
            Assert.Empty(await session.ReadAsync<MenuItem, string>(i => i.RestaurantId == fixture.RestaurantB, i => i.NameAr));
            Assert.Empty(await session.ReadAsync<MenuItemImage, string>(i => i.Id == fixture.ImageB.Id, i => i.ObjectKey));
            Assert.Empty(await session.ReadAsync<RestaurantSettings, string?>(s => s.RestaurantId == fixture.RestaurantB, s => s.Description));
            Assert.Empty(await session.ReadAsync<Restaurant, string>(r => r.Id == fixture.RestaurantB, r => r.Name));
            await Reject(() => session.EditAsync<Category>(fixture.CategoryB.Id));
            await Reject(() => session.EditAsync<MenuItem>(fixture.ItemB.Id));
            await Reject(() => session.EditAsync<MenuItemImage>(fixture.ImageB.Id));
            await Reject(() => session.EditAsync<RestaurantSettings>(fixture.RestaurantB));
            await Reject(() => session.EditAsync<Restaurant>(fixture.RestaurantB));
            await Reject(() => session.DeleteAsync<Category>(fixture.CategoryB.Id));
            await Reject(() => session.DeleteAsync<MenuItem>(fixture.ItemB.Id));
            await Reject(() => session.DeleteAsync<MenuItemImage>(fixture.ImageB.Id));
            await Reject(() => session.DeleteAsync<RestaurantSettings>(fixture.RestaurantB));
            await Reject(() => session.DeleteAsync<Restaurant>(fixture.RestaurantB));
            await Reject(() => session.EditAsync<Category>(Guid.NewGuid()));
        });
        using var check = fixture.Auth.Factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal("Protected B category", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryB.Id)).NameAr);
        Assert.Equal("Protected B item", (await db.Set<MenuItem>().SingleAsync(c => c.Id == fixture.ItemB.Id)).NameAr);
        Assert.True(await db.Set<MenuItemImage>().AnyAsync(i => i.Id == fixture.ImageB.Id));
        var audit = await db.Set<AuditEntry>().ToListAsync();
        Assert.NotEmpty(audit);
        Assert.All(audit, a => { Assert.Equal(fixture.RestaurantA, a.RestaurantId); Assert.Null(a.ResourceId); Assert.Null(a.CorrelationId); Assert.Equal("TenantAccessDenied", a.Action); });
    }

    [SqlServerFact]
    public async Task Forged_disconnected_entities_and_foreign_associations_are_rejected_before_writes()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            await Reject(() => session.StageAsync(new Category { Id = fixture.CategoryB.Id, RestaurantId = fixture.RestaurantA, NameAr = "overwrite" }, false));
            await Reject(() => session.StageAsync(new Category { Id = fixture.CategoryB.Id, RestaurantId = fixture.RestaurantA, NameAr = "collision" }, true));
            await Reject(() => session.StageAsync(new Category { RestaurantId = fixture.RestaurantB, NameAr = "wrong tenant" }, true));
            await Reject(() => session.StageAsync(new MenuItem { RestaurantId = fixture.RestaurantA, CategoryId = fixture.CategoryB.Id, NameAr = "foreign parent" }, true));
            await Reject(() => session.StageAsync(new MenuItemImage { RestaurantId = fixture.RestaurantA, MenuItemId = fixture.ItemB.Id, ObjectKey = fixture.RestaurantA + "/new.webp", Width = 1, Height = 1 }, true));
            await Reject(() => session.StageAsync(new MenuItemImage { RestaurantId = fixture.RestaurantA, MenuItemId = fixture.ItemA.Id, ObjectKey = fixture.ImageB.ObjectKey, Width = 1, Height = 1 }, true));
            await Reject(() => session.StageAsync(new MenuItemImage
            {
                Id = fixture.ImageA.Id,
                RestaurantId = fixture.RestaurantA,
                MenuItemId = fixture.ItemA.Id,
                ObjectKey = fixture.RestaurantA + "/renamed.webp",
                Width = 100,
                Height = 100
            }, false));
            await Reject(() => session.StageAsync(new RestaurantSettings { RestaurantId = fixture.RestaurantA, LogoObjectKey = fixture.ImageB.ObjectKey }, false));
            await Reject(() => session.StageAsync(new RestaurantSettings { RestaurantId = fixture.RestaurantA, CoverObjectKey = fixture.RestaurantA + "/%2e%2e/foreign.webp" }, false));
            await Reject(() => session.StageAsync(new RestaurantUser { RestaurantId = fixture.RestaurantA, UserId = Guid.NewGuid() }, true));
            await Reject(() => session.StageAsync(new ApplicationUser { Id = Guid.NewGuid(), UserName = "escalation" }, true));
        });
        using var check = fixture.Auth.Factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(2, await db.Set<Category>().CountAsync());
        Assert.Equal(2, await db.Set<MenuItem>().CountAsync());
        Assert.Null((await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == fixture.RestaurantA)).LogoObjectKey);
    }

    [SqlServerFact]
    public async Task Tracked_key_tenant_parent_and_settings_substitution_cannot_poison_a_batch()
    {
        await using var fixture = await Fixture.Create();
        foreach (var attack in Enumerable.Range(0, 5))
            await fixture.Run(fixture.A, async (services, _) =>
            {
                var session = services.GetRequiredService<ITenantDataSession>();
                var category = await session.EditAsync<Category>(fixture.CategoryA.Id);
                category.NameAr = "must roll back";
                if (attack == 0) category.RestaurantId = fixture.RestaurantB;
                if (attack == 1) category.Id = fixture.CategoryB.Id;
                if (attack == 2) (await session.EditAsync<MenuItem>(fixture.ItemA.Id)).CategoryId = fixture.CategoryB.Id;
                if (attack == 3) (await session.EditAsync<MenuItemImage>(fixture.ImageA.Id)).MenuItemId = fixture.ItemB.Id;
                if (attack == 4) (await session.EditAsync<RestaurantSettings>(fixture.RestaurantA)).CoverObjectKey = fixture.ImageB.ObjectKey;
                await Reject(() => session.CommitAsync());
            });
        using var check = fixture.Auth.Factory.Services.CreateScope();
        Assert.Equal("A category", (await check.ServiceProvider.GetRequiredService<MenuDbContext>().Set<Category>().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
    }

    [SqlServerFact]
    public async Task Ambiguous_inactive_suspended_and_revoked_accounts_fail_closed_including_pending_writes()
    {
        await using var fixture = await Fixture.Create();
        using var admin = fixture.Auth.Factory.Services.CreateScope();
        var db = admin.ServiceProvider.GetRequiredService<MenuDbContext>();
        var membership = await db.Set<RestaurantUser>().SingleAsync(m => m.UserId == fixture.OwnerA);
        db.Add(new RestaurantUser { UserId = fixture.OwnerA, RestaurantId = fixture.RestaurantB });
        await db.SaveChangesAsync();
        await fixture.Run(fixture.A, async (services, _) => await Reject(() => services.GetRequiredService<ITenantContext>().RequireAsync(), TenantFailure.Forbidden));
        var extra = await db.Set<RestaurantUser>().SingleAsync(m => m.UserId == fixture.OwnerA && m.RestaurantId == fixture.RestaurantB);
        extra.IsActive = false;
        await db.SaveChangesAsync();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "denied pending change";
            membership.IsActive = false;
            await db.SaveChangesAsync();
            await Reject(() => session.CommitAsync(), TenantFailure.Forbidden);
        });
        membership.IsActive = true;
        await db.SaveChangesAsync();
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == fixture.RestaurantA);
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "denied suspended change";
            restaurant.Status = "Suspended";
            await db.SaveChangesAsync();
            await Reject(() => session.CommitAsync(), TenantFailure.Forbidden);
        });
        restaurant.Status = "Active";
        await db.SaveChangesAsync();
        var user = await db.Users.SingleAsync(u => u.Id == fixture.OwnerA);
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "denied revoked change";
            user.SecurityStamp = Guid.NewGuid().ToString();
            await db.SaveChangesAsync();
            await Reject(() => session.CommitAsync(), TenantFailure.Forbidden);
        });
        Assert.Equal("A category", (await db.Set<Category>().AsNoTracking().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
    }

    [SqlServerFact]
    public async Task Concurrent_scopes_are_independent_and_stale_own_writes_get_concurrency_conflict()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            await Reject(() => session.EditAsync<Category>(fixture.CategoryB.Id, new byte[8]));
            await Reject(() => session.EditAsync<Category>(fixture.CategoryA.Id, new byte[8]), TenantFailure.Concurrency);
            Assert.Equal(fixture.CategoryA.Id, (await session.EditAsync<Category>(fixture.CategoryA.Id, fixture.CategoryA.RowVersion)).Id);
        });
        await Task.WhenAll(Enumerable.Range(0, 12).Select(i => fixture.Run(i % 2 == 0 ? fixture.A : fixture.B, async (services, _) =>
        {
            var own = i % 2 == 0 ? fixture.CategoryA : fixture.CategoryB;
            var session = services.GetRequiredService<ITenantDataSession>();
            Assert.Equal(new[] { own.NameAr }, await session.ReadAsync<Category, string>(c => true, c => c.NameAr));
            var entity = await session.EditAsync<MenuItem>(i % 2 == 0 ? fixture.ItemA.Id : fixture.ItemB.Id);
            Assert.Equal(own.RestaurantId, entity.RestaurantId);
        })));
        var loaded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var changed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var stale = fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            var category = await session.EditAsync<Category>(fixture.CategoryA.Id);
            category.NameAr = "stale";
            loaded.SetResult();
            await changed.Task;
            await Reject(() => session.CommitAsync(), TenantFailure.Concurrency);
        });
        await loaded.Task;
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "winner";
            Assert.True(await session.CommitAsync() > 0);
        });
        changed.SetResult();
        await stale;
        using var check = fixture.Auth.Factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal("winner", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
        Assert.Equal("Protected B category", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryB.Id)).NameAr);
        Assert.Single(await db.Set<AuditEntry>().Where(a => a.Action == "TenantWriteCommitted").ToListAsync());
    }

    [SqlServerFact]
    public async Task Owner_cannot_change_platform_lifecycle_with_a_disconnected_snapshot()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            var restaurant = await session.EditAsync<Restaurant>(fixture.RestaurantA);
            var forged = new Restaurant
            {
                Id = restaurant.Id,
                Name = restaurant.Name,
                Slug = restaurant.Slug,
                PublicCode = restaurant.PublicCode,
                Status = "Suspended",
                CreatedAtUtc = restaurant.CreatedAtUtc,
                RowVersion = restaurant.RowVersion
            };
            // Separate session exercises the detached path, not EF's duplicate-instance protection.
            await fixture.Run(fixture.A, async (other, _) => await Reject(() => other.GetRequiredService<ITenantDataSession>().StageAsync(forged, false)));
        });
    }

    [Fact]
    public async Task Foreign_resource_problem_details_are_generic_without_test_only_endpoints()
    {
        await using var factory = new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>();
        var context = new DefaultHttpContext { RequestServices = factory.Services };
        context.Response.Body = new MemoryStream();
        Assert.True(await new TenantProblemHandler().TryHandleAsync(context, new TenantBoundaryException(TenantFailure.NotFound), CancellationToken.None));
        Assert.Equal(404, context.Response.StatusCode);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
        context.Response.Body.Position = 0;
        var text = await new StreamReader(context.Response.Body).ReadToEndAsync();
        Assert.Contains("Resource not found.", text);
        Assert.DoesNotContain("restaurantId", text, StringComparison.OrdinalIgnoreCase);
    }

    [SqlServerFact]
    public async Task Owned_writes_and_media_references_succeed_atomically_without_touching_B()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            await session.StageAsync(new Category { RestaurantId = fixture.RestaurantA, NameAr = "New A category" }, true);
            await session.StageAsync(new MenuItem { RestaurantId = fixture.RestaurantA, CategoryId = fixture.CategoryA.Id, NameAr = "New A item", Price = 3 }, true);
            (await session.EditAsync<RestaurantSettings>(fixture.RestaurantA)).LogoObjectKey = fixture.ImageA.ObjectKey;
            Assert.True(await session.CommitAsync() > 0);
        });
        using var check = fixture.Auth.Factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(3, await db.Set<Category>().CountAsync());
        Assert.Equal(3, await db.Set<MenuItem>().CountAsync());
        Assert.Equal(fixture.ImageA.ObjectKey, (await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == fixture.RestaurantA)).LogoObjectKey);
        Assert.Equal("Protected B settings", (await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == fixture.RestaurantB)).Description);
    }

    [SqlServerFact]
    public async Task Locked_accounts_and_expired_cached_authentication_cannot_commit_pending_edits()
    {
        await using var fixture = await Fixture.Create();
        using var admin = fixture.Auth.Factory.Services.CreateScope();
        var db = admin.ServiceProvider.GetRequiredService<MenuDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == fixture.OwnerA);
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "must not commit";
            user.LockoutEnd = DateTimeOffset.MaxValue;
            await db.SaveChangesAsync();
            await Reject(() => session.CommitAsync(), TenantFailure.Forbidden);
        });
        user.LockoutEnd = null;
        await db.SaveChangesAsync();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "expired pending edit";
            fixture.Auth.Clock.Advance(TimeSpan.FromMinutes(31));
            await Reject(() => session.CommitAsync(), TenantFailure.Unauthenticated);
        });
        Assert.Equal("A category", (await db.Set<Category>().AsNoTracking().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
    }

    [SqlServerFact]
    public async Task Platform_authority_is_not_an_implicit_tenant_bypass()
    {
        await using var fixture = await Fixture.Create();
        using var scope = fixture.Auth.Factory.Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.RoleManager<Microsoft.AspNetCore.Identity.IdentityRole<Guid>>>();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        await roles.CreateAsync(new Microsoft.AspNetCore.Identity.IdentityRole<Guid>("PlatformAdmin"));
        var admin = new ApplicationUser { Id = Guid.NewGuid(), Email = "platform@example.test", UserName = "platform@example.test" };
        await users.CreateAsync(admin, fixture.Auth.Password);
        await users.AddToRoleAsync(admin, "PlatformAdmin");
        var browser = new Browser(fixture.Auth.Factory);
        await browser.Csrf();
        Assert.Equal(System.Net.HttpStatusCode.NoContent, (await browser.Login(fixture.Auth.Password, admin.Email)).StatusCode);
        await fixture.Run(browser, async (services, _) =>
            await Reject(() => services.GetRequiredService<ITenantContext>().RequireAsync(), TenantFailure.Forbidden));
    }

    [SqlServerFact]
    public async Task Denied_foreign_lookup_clears_pending_writes_and_scope_cannot_switch_after_membership_change()
    {
        await using var fixture = await Fixture.Create();
        await fixture.Run(fixture.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(fixture.CategoryA.Id)).NameAr = "discard this";
            await Reject(() => session.EditAsync<Category>(fixture.CategoryB.Id));
            Assert.Equal(0, await session.CommitAsync());
            using var admin = fixture.Auth.Factory.Services.CreateScope();
            var db = admin.ServiceProvider.GetRequiredService<MenuDbContext>();
            var old = await db.Set<RestaurantUser>().SingleAsync(m => m.UserId == fixture.OwnerA);
            old.IsActive = false;
            db.Add(new RestaurantUser { UserId = fixture.OwnerA, RestaurantId = fixture.RestaurantB });
            await db.SaveChangesAsync();
            await Reject(() => session.ReadAsync<Category, string>(c => true, c => c.NameAr), TenantFailure.Forbidden);
            Assert.Equal("A category", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
        });
    }

    [SqlServerFact]
    public async Task Simultaneous_A_and_B_commits_never_share_tracked_entities_or_audit_scope()
    {
        await using var fixture = await Fixture.Create();
        var loaded = 0;
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await Task.WhenAll(Enumerable.Range(0, 2).Select(i => fixture.Run(i == 0 ? fixture.A : fixture.B, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Category>(i == 0 ? fixture.CategoryA.Id : fixture.CategoryB.Id)).NameAr = i == 0 ? "parallel A" : "parallel B";
            if (Interlocked.Increment(ref loaded) == 2) gate.SetResult();
            await gate.Task.WaitAsync(TimeSpan.FromSeconds(10));
            Assert.True(await session.CommitAsync() > 0);
        })));
        using var check = fixture.Auth.Factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal("parallel A", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryA.Id)).NameAr);
        Assert.Equal("parallel B", (await db.Set<Category>().SingleAsync(c => c.Id == fixture.CategoryB.Id)).NameAr);
        Assert.Equal(1, await db.Set<AuditEntry>().CountAsync(a => a.RestaurantId == fixture.RestaurantA && a.Action == "TenantWriteCommitted"));
        Assert.Equal(1, await db.Set<AuditEntry>().CountAsync(a => a.RestaurantId == fixture.RestaurantB && a.Action == "TenantWriteCommitted"));
    }
}
