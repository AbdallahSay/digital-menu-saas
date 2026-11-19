using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using DigitalMenu.Api.Platform;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using static DigitalMenu.IntegrationTests.ProvisioningTests;

namespace DigitalMenu.IntegrationTests;

// L1d: platform audit browsing/export, suspension reasons, onboarding resend and D4 plan labels.
public sealed class PlatformAuditTests
{
    private const string Restaurants = "/api/v1/platform/restaurants";
    private const string Audit = "/api/v1/platform/audit";
    private static readonly Action<IServiceCollection> NoCooldown =
        s => s.Configure<OnboardingResendOptions>(o => o.Cooldown = TimeSpan.Zero);

    private static async Task<AuditPageResponse> Page(Browser admin, string query)
    {
        var response = await admin.Send(HttpMethod.Get, Audit + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        return (await response.Content.ReadFromJsonAsync<AuditPageResponse>())!;
    }

    [SqlServerFact]
    public async Task Suspension_requires_a_bounded_reason_that_is_stored_in_audit_metadata()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "reason-a");
        var url = Restaurants + "/" + a.Id + "/status";
        foreach (var reason in new string?[] { null, "", "   ", "ab", new string('x', Provisioning.MaxReasonLength + 1), "bad\u0000reason", "line\nbreak" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, url, new { status = "Suspended", reason, a.RowVersion })).StatusCode);
        const string arabic = "فاتورة غير مدفوعة \"منذ شهرين\"";
        var suspended = await State(admin, a, "/status", new { status = "Suspended", reason = "  " + arabic + "  ", a.RowVersion });
        Assert.Equal("Suspended", suspended.Status);
        var active = await State(admin, suspended, "/status", new { status = "Active", suspended.RowVersion });
        Assert.Equal("Active", active.Status);

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var stored = await db.Set<AuditEntry>().SingleAsync(e => e.RestaurantId == a.Id && e.Action == "RestaurantSuspended");
        Assert.Equal(arabic, JsonSerializer.Deserialize<Dictionary<string, string>>(stored.MetadataJson!)!["reason"]);
        Assert.Contains("فاتورة", stored.MetadataJson); // stored readable, not \u-escaped
        Assert.Null((await db.Set<AuditEntry>().SingleAsync(e => e.RestaurantId == a.Id && e.Action == "RestaurantReactivated")).MetadataJson);

        var page = await Page(admin, "?action=RestaurantSuspended&restaurantId=" + a.Id);
        var item = Assert.Single(page.Items);
        Assert.Equal(arabic, item.Metadata!["reason"]);
        Assert.Equal("مطعم reason-a", item.RestaurantName);
        Assert.Equal(DateTimeKind.Utc, item.TimestampUtc.Kind);
    }

    [SqlServerFact]
    public async Task Audit_listing_filters_paginates_validates_and_orders_newest_first()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var before = DateTime.UtcNow.AddSeconds(-1);
        var a = await Provision(admin, "audit-a");
        var b = await Provision(admin, "audit-b");
        var published = await State(admin, a, "/publication", new { isPublished = true, a.RowVersion });
        await State(admin, b, "/status", new { status = "Suspended", reason = "Chargeback dispute", b.RowVersion });

        var all = await Page(admin, "");
        Assert.Equal(4, all.Total);
        Assert.Equal(50, all.PageSize);
        Assert.Equal(new[] { "RestaurantSuspended", "RestaurantPublished", "RestaurantProvisioned", "RestaurantProvisioned" },
            all.Items.Select(i => i.Action).ToArray());
        Assert.True(all.Items.Zip(all.Items.Skip(1)).All(p => p.First.TimestampUtc >= p.Second.TimestampUtc));

        var onlyA = await Page(admin, "?restaurantId=" + a.Id);
        Assert.Equal(2, onlyA.Total);
        Assert.All(onlyA.Items, i => Assert.Equal(a.Id, i.RestaurantId));
        Assert.Equal(2, (await Page(admin, "?action=RestaurantProvisioned")).Total);
        Assert.Equal(0, (await Page(admin, "?action=RestaurantProvisioned&restaurantId=" + Guid.NewGuid())).Total);
        Assert.Equal(4, (await Page(admin, "?fromUtc=" + Uri.EscapeDataString(before.ToString("O")))).Total);
        Assert.Equal(0, (await Page(admin, "?toUtc=" + Uri.EscapeDataString(before.ToString("O")))).Total);
        Assert.Equal(0, (await Page(admin, "?fromUtc=2100-01-01")).Total);
        var second = await Page(admin, "?page=2&pageSize=3");
        Assert.Equal(4, second.Total);
        Assert.Equal("RestaurantProvisioned", Assert.Single(second.Items).Action);

        foreach (var invalid in new[] { "?action=bad%20action", "?action=" + new string('a', 101), "?action=Drop;--",
                     "?restaurantId=" + Guid.Empty, "?restaurantId=not-a-guid", "?fromUtc=garbage", "?toUtc=" + new string('1', 41),
                     "?fromUtc=2026-02-01&toUtc=2026-01-01", "?fromUtc=2026-01-01&toUtc=2026-01-01",
                     "?page=0", "?pageSize=0", "?pageSize=201" })
        {
            var response = await admin.Send(HttpMethod.Get, Audit + invalid);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.Equal(published.Id, a.Id);
    }

    [SqlServerFact]
    public async Task Csv_export_is_bounded_neutralises_formulas_and_is_itself_audited()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "csv-a");
        const string hostile = "=HYPERLINK(\"https://evil.example\",\"x\")";
        await State(admin, a, "/status", new { status = "Suspended", reason = hostile, a.RowVersion });

        var response = await admin.Send(HttpMethod.Get, Audit + "/export?restaurantId=" + a.Id);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Matches("^audit-\\d{8}T\\d{6}Z\\.csv$", response.Content.Headers.ContentDisposition.FileName!.Trim('"'));
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);
        var lines = Encoding.UTF8.GetString(bytes[3..]).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("timestampUtc,action,resourceType,resourceId,restaurantId,restaurantName,actorUserId,correlationId,reason,metadata", lines[0]);
        Assert.Equal(3, lines.Length);
        Assert.Contains("\"RestaurantSuspended\"", lines[1]);
        Assert.Contains("\"مطعم csv-a\"", lines[1]);
        Assert.Contains("\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"x\"\")\"", lines[1]);
        Assert.DoesNotContain(",\"=", string.Join('\n', lines));

        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var exported = await db.Set<AuditEntry>().SingleAsync(e => e.Action == "AuditExported");
        Assert.Equal(a.Id, exported.RestaurantId);
        Assert.Equal("2", JsonSerializer.Deserialize<Dictionary<string, string?>>(exported.MetadataJson!)!["rows"]);

        // Unknown restaurant filters still export (empty) without violating the audit foreign key.
        Assert.Equal(HttpStatusCode.OK, (await admin.Send(HttpMethod.Get, Audit + "/export?restaurantId=" + Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Get, Audit + "/export?fromUtc=garbage")).StatusCode);

        db.AddRange(Enumerable.Range(0, PlatformAudit.MaxExportRows).Select(_ => new AuditEntry { Action = "Fixture", ResourceType = "Load" }));
        await db.SaveChangesAsync();
        var tooMany = await admin.Send(HttpMethod.Get, Audit + "/export");
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.Send(HttpMethod.Get, Audit + "/export?action=RestaurantSuspended")).StatusCode);
        Assert.Equal(PlatformAudit.MaxExportRows, (await Page(admin, "?action=Fixture&pageSize=1")).Total);
    }

    [SqlServerFact]
    public async Task Resend_rotates_onboarding_token_and_fails_closed_on_state_delivery_and_csrf()
    {
        var (fixture, admin, delivery) = await Setup(NoCooldown);
        await using var cleanup = fixture;
        var a = await Provision(admin, "resend-a");
        var url = Restaurants + "/" + a.Id + "/onboarding/resend";
        var original = delivery.Invitations["resend-a@example.test"];

        var token = admin.Token;
        foreach (var invalid in new string?[] { null, "forged" })
        {
            admin.Token = invalid;
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Post, url)).StatusCode);
        }
        admin.Token = token;

        // Failed delivery rolls back the stamp rotation: the earlier link remains the valid one.
        delivery.Fail = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await admin.Send(HttpMethod.Post, url)).StatusCode);
        delivery.Fail = false;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var owner = (await users.FindByIdAsync(original.UserId.ToString()))!;
            Assert.True(await users.VerifyUserTokenAsync(owner, users.Options.Tokens.PasswordResetTokenProvider, "ResetPassword", original.Token));
            Assert.False(await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Set<AuditEntry>().AnyAsync(e => e.Action == "OwnerOnboardingResent"));
        }

        var resent = await admin.Send(HttpMethod.Post, url);
        Assert.Equal(HttpStatusCode.NoContent, resent.StatusCode);
        Assert.Empty(await resent.Content.ReadAsByteArrayAsync());
        var fresh = delivery.Invitations["resend-a@example.test"];
        Assert.Equal(original.UserId, fresh.UserId);
        Assert.NotEqual(original.Token, fresh.Token);

        var guest = new Browser(fixture.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.Send(HttpMethod.Post, "/onboarding",
            new CompleteOnboardingRequest(original.UserId, original.Token, fixture.Password))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Send(HttpMethod.Post, "/onboarding",
            new CompleteOnboardingRequest(fresh.UserId, fresh.Token, fixture.Password))).StatusCode);

        // Completed onboarding, suspended restaurants, multi/absent owners and unknown ids cannot resend.
        Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, url)).StatusCode);
        var b = await Provision(admin, "resend-b");
        var suspended = await State(admin, b, "/status", new { status = "Suspended", reason = "Fraud review", b.RowVersion });
        Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, Restaurants + "/" + b.Id + "/onboarding/resend")).StatusCode);
        await State(admin, suspended, "/status", new { status = "Active", suspended.RowVersion });
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Send(HttpMethod.Post, Restaurants + "/" + Guid.NewGuid() + "/onboarding/resend")).StatusCode);
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var membership = await db.Set<RestaurantUser>().SingleAsync(m => m.RestaurantId == b.Id);
            membership.IsActive = false;
            await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.Conflict, (await admin.Send(HttpMethod.Post, Restaurants + "/" + b.Id + "/onboarding/resend")).StatusCode);
            var entry = await db.Set<AuditEntry>().SingleAsync(e => e.Action == "OwnerOnboardingResent");
            Assert.Equal(a.Id, entry.RestaurantId);
            Assert.Null(entry.MetadataJson);
        }
        var page = await (await admin.Send(HttpMethod.Get, Audit + "?action=OwnerOnboardingResent")).Content.ReadAsStringAsync();
        Assert.DoesNotContain(fresh.Token, page);
        Assert.DoesNotContain("@example.test", page);
    }

    [SqlServerFact]
    public async Task Resend_is_throttled_per_restaurant_including_the_provisioning_send()
    {
        var (fixture, admin, delivery) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "throttle-a");
        var throttled = await admin.Send(HttpMethod.Post, Restaurants + "/" + a.Id + "/onboarding/resend");
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.Equal("60", throttled.Headers.GetValues("Retry-After").Single());
        Assert.Single(delivery.Invitations);
    }

    [SqlServerFact]
    public async Task Plan_labels_are_validated_audited_and_visible_only_to_platform_admin()
    {
        var (fixture, admin, _) = await Setup();
        await using var cleanup = fixture;
        var a = await Provision(admin, "plan-a");
        var url = Restaurants + "/" + a.Id + "/plan";
        Assert.Null(a.PlanName);
        Assert.Null(a.PaidUntilUtc);

        var pro = await State(admin, a, "/plan", new { planName = " Pro ", paidUntilUtc = "2027-01-31", a.RowVersion });
        Assert.Equal("Pro", pro.PlanName);
        Assert.Equal(new DateTime(2027, 1, 31, 0, 0, 0, DateTimeKind.Utc), pro.PaidUntilUtc);
        Assert.Equal(a.PublishedMenuVersion, pro.PublishedMenuVersion);
        Assert.Equal(a.Status, pro.Status);
        Assert.Equal(a.IsPublished, pro.IsPublished);
        Assert.Equal(pro, await State(admin, pro, "/plan", new { planName = "Pro", paidUntilUtc = "2027-01-31T02:00:00+02:00", pro.RowVersion }));
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await admin.Send(HttpMethod.Patch, url, new { planName = "Basic", paidUntilUtc = (string?)null, a.RowVersion })).StatusCode);
        foreach (var invalid in new object[]
                 {
                     new { planName = new string('p', 51), paidUntilUtc = (string?)null, pro.RowVersion },
                     new { planName = "Pro\u0007", paidUntilUtc = (string?)null, pro.RowVersion },
                     new { planName = "Pro", paidUntilUtc = "not-a-date", pro.RowVersion },
                     new { planName = "Pro", paidUntilUtc = "1999-12-31", pro.RowVersion },
                     new { planName = "Pro", paidUntilUtc = "2100-01-01", pro.RowVersion },
                     new { planName = "Pro", paidUntilUtc = (string?)null, rowVersion = "bad" },
                     new { planName = "Pro", paidUntilUtc = (string?)null, pro.RowVersion, status = "Suspended" }
                 })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, url, invalid)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Send(HttpMethod.Patch, Restaurants + "/" + Guid.NewGuid() + "/plan",
            new { planName = "Pro", paidUntilUtc = (string?)null, pro.RowVersion })).StatusCode);
        var cleared = await State(admin, pro, "/plan", new { planName = "  ", paidUntilUtc = (string?)null, pro.RowVersion });
        Assert.Null(cleared.PlanName);
        Assert.Null(cleared.PaidUntilUtc);

        var changes = await Page(admin, "?action=RestaurantPlanChanged&restaurantId=" + a.Id);
        Assert.Equal(2, changes.Total);
        Assert.Equal("Pro", changes.Items[1].Metadata!["planName"]);
        Assert.Equal("2027-01-31T00:00:00Z", changes.Items[1].Metadata!["paidUntilUtc"]);
        Assert.Null(changes.Items[0].Metadata!["planName"]);
        var listed = await (await admin.Send(HttpMethod.Get, Restaurants + "?search=plan-a")).Content.ReadFromJsonAsync<RestaurantPageResponse>();
        Assert.Equal(cleared, Assert.Single(listed!.Items));

        // Owner and anonymous public projections must never carry D4 labels.
        Guid existingId;
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var existing = await db.Set<Restaurant>().SingleAsync(r => r.Slug == "a");
            existingId = existing.Id;
            db.AddRange(new RestaurantSettings { RestaurantId = existing.Id },
                new Category { RestaurantId = existing.Id, NameAr = "قسم", IsPublished = true });
            await db.SaveChangesAsync();
        }
        var existingDto = (await (await admin.Send(HttpMethod.Get, Restaurants + "/" + existingId)).Content.ReadFromJsonAsync<RestaurantResponse>())!;
        var labelled = await State(admin, existingDto, "/plan", new { planName = "SecretPlanLabel", paidUntilUtc = "2031-05-06", existingDto.RowVersion });
        await State(admin, labelled, "/publication", new { isPublished = true, labelled.RowVersion });
        var owner = new Browser(fixture.Factory);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Login(fixture.Password)).StatusCode);
        foreach (var path in new[] { "/me", "/api/v1/admin/categories", "/api/v1/public/restaurants/by-slug/a" })
        {
            var response = await owner.Send(HttpMethod.Get, path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("SecretPlanLabel", body);
            Assert.DoesNotContain("2031-05-06", body);
            Assert.DoesNotContain("paidUntil", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("planName", body, StringComparison.OrdinalIgnoreCase);
        }
        foreach (var path in new[] { Audit, Audit + "/export", Restaurants + "/" + existingId })
            Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Get, path)).StatusCode);
        await owner.Csrf();
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Patch, Restaurants + "/" + existingId + "/plan",
            new { planName = "Free", paidUntilUtc = (string?)null, labelled.RowVersion })).StatusCode);
    }

    [Theory]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("plain", "\"plain\"")]
    [InlineData("say \"hi\", ok", "\"say \"\"hi\"\", ok\"")]
    [InlineData("=1+1", "\"'=1+1\"")]
    [InlineData("+cmd", "\"'+cmd\"")]
    [InlineData("-2", "\"'-2\"")]
    [InlineData("@SUM(A1)", "\"'@SUM(A1)\"")]
    [InlineData("\tx", "\"'\tx\"")]
    [InlineData("مطعم", "\"مطعم\"")]
    public void Csv_cells_are_quoted_and_formula_prefixes_neutralised(string? input, string expected)
        => Assert.Equal(expected, PlatformAudit.Cell(input));
}
