using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Leads;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class LeadTests
{
    private const string Route = "/api/v1/auth/leads";
    private const string Admin = "/api/v1/platform/leads";
    private static readonly LeadOptions Open = new("notice-test-1", 30, "Test Seller", "wa:+200000000000");

    private static object Body(string? website = null, string? notice = "notice-test-1", bool consent = true, string phone = "+201001112222") =>
        new { contactName = "Test Person", businessName = "Test Cafe", phone, email = "t@example.test", notes = "synthetic", consent, noticeVersion = notice, website };

    private static async Task<(AuthFixture Fixture, Browser Public, Browser Admin, Browser Owner)> Setup(LeadOptions? options)
    {
        var fixture = await AuthFixture.Create(configure: s => s.AddSingleton(new LeadEndpoints.LeadOptionsHolder(options)));
        using (var scope = fixture.Factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
            Assert.True((await roles.CreateAsync(new IdentityRole<Guid>("PlatformAdmin"))).Succeeded);
            var admin = new ApplicationUser { Id = Guid.NewGuid(), UserName = "admin@example.test", Email = "admin@example.test" };
            Assert.True((await users.CreateAsync(admin, fixture.Password)).Succeeded);
            Assert.True((await users.AddToRoleAsync(admin, "PlatformAdmin")).Succeeded);
        }
        var pub = new Browser(fixture.Factory); await pub.Csrf();
        var adm = new Browser(fixture.Factory); await adm.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await adm.Login(fixture.Password, "admin@example.test")).StatusCode); await adm.Csrf();
        var own = new Browser(fixture.Factory); await own.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await own.Login(fixture.Password)).StatusCode); await own.Csrf();
        return (fixture, pub, adm, own);
    }

    private static async Task<int> Count(AuthFixture f)
    {
        using var scope = f.Factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Set<Lead>().CountAsync();
    }

    [SqlServerFact]
    public async Task Closed_intake_reports_closed_and_stores_nothing()
    {
        var (f, pub, _, _) = await Setup(null);
        await using var _c = f;
        var status = await (await pub.Send(HttpMethod.Get, "/api/v1/leads/status")).Content.ReadFromJsonAsync<LeadStatusResponse>();
        Assert.False(status!.Open); Assert.Null(status.NoticeVersion); Assert.Null(status.ControllerName); Assert.Null(status.ContactChannel);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        Assert.Equal(0, await Count(f));
    }

    [SqlServerFact]
    public async Task Valid_lead_is_stored_with_expiry_and_invalid_ones_are_not()
    {
        var (f, pub, _, _) = await Setup(Open);
        await using var _c = f;
        var status = await (await pub.Send(HttpMethod.Get, "/api/v1/leads/status")).Content.ReadFromJsonAsync<LeadStatusResponse>();
        Assert.True(status!.Open); Assert.Equal("notice-test-1", status.NoticeVersion);
        Assert.Equal(30, status.RetentionDays); Assert.Equal("Test Seller", status.ControllerName); Assert.Equal("wa:+200000000000", status.ContactChannel);
        Assert.Equal(HttpStatusCode.Created, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        using (var scope = f.Factory.Services.CreateScope())
        {
            var lead = await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Set<Lead>().SingleAsync();
            Assert.Equal("notice-test-1", lead.NoticeVersion); Assert.Equal("New", lead.Status);
            Assert.InRange((lead.ExpiresUtc - lead.CreatedUtc).TotalDays, 29.99, 30.01);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await pub.Send(HttpMethod.Post, Route, Body(phone: "abc"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await pub.Send(HttpMethod.Post, Route, Body(notice: "old"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await pub.Send(HttpMethod.Post, Route, Body(consent: false))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await pub.Send(HttpMethod.Post, Route, new { contactName = "", businessName = "x", phone = "+201001112222", consent = true, noticeVersion = "notice-test-1" })).StatusCode);
        Assert.Equal(1, await Count(f));
    }

    [SqlServerFact]
    public async Task Honeypot_and_non_json_and_oversized_bodies_store_nothing()
    {
        var (f, pub, _, _) = await Setup(Open);
        await using var _c = f;
        Assert.Equal(HttpStatusCode.Created, (await pub.Send(HttpMethod.Post, Route, Body(website: "http://spam.example"))).StatusCode);
        Assert.Equal(0, await Count(f));
        using var form = new HttpRequestMessage(HttpMethod.Post, Route) { Content = new StringContent("a=b", System.Text.Encoding.UTF8, "application/x-www-form-urlencoded") };
        form.Headers.Add("Cookie", string.Join("; ", pub.Cookies.Select(x => x.Key + "=" + x.Value))); form.Headers.Add("X-XSRF-TOKEN", pub.Token);
        var formResult = await pub.Client.SendAsync(form);
        Assert.NotEqual(HttpStatusCode.Created, formResult.StatusCode);
        var big = await pub.Send(HttpMethod.Post, Route, new { contactName = "x", businessName = "x", phone = "+201001112222", notes = new string('n', 20000), consent = true, noticeVersion = "notice-test-1" });
        Assert.NotEqual(HttpStatusCode.Created, big.StatusCode);
        Assert.Equal(0, await Count(f));
    }

    [SqlServerFact]
    public async Task Csrf_is_required_and_per_source_rate_limit_applies()
    {
        var (f, pub, _, _) = await Setup(Open);
        await using var _c = f;
        var noToken = new Browser(f.Factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await noToken.Send(HttpMethod.Post, Route, Body())).StatusCode);
        // The rejected no-token request already spent one of the 5 permits: the limiter runs before CSRF.
        for (var i = 0; i < 4; i++) Assert.Equal(HttpStatusCode.Created, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        Assert.Equal(4, await Count(f));
    }

    [SqlServerFact]
    public async Task Global_hourly_cap_and_expired_cleanup_hold()
    {
        var (f, pub, admin, _) = await Setup(Open);
        await using var _c = f;
        using (var scope = f.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            db.Add(new Lead { CreatedUtc = DateTime.UtcNow.AddDays(-40), ExpiresUtc = DateTime.UtcNow.AddDays(-10), ContactName = "old", BusinessName = "old", Phone = "+201000000000", NoticeVersion = "n" });
            await db.SaveChangesAsync();
        }
        var list = await (await admin.Send(HttpMethod.Get, Admin)).Content.ReadFromJsonAsync<LeadPageResponse>();
        Assert.Equal(0, list!.Total);
        Assert.Equal(HttpStatusCode.Created, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        Assert.Equal(1, await Count(f));
        using (var scope = f.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            for (var i = 0; i < LeadEndpoints.GlobalHourlyCap; i++)
                db.Add(new Lead { CreatedUtc = DateTime.UtcNow, ExpiresUtc = DateTime.UtcNow.AddDays(1), ContactName = "c", BusinessName = "b", Phone = "+201000000000", NoticeVersion = "n" });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
    }

    [SqlServerFact]
    public async Task Only_platform_admin_can_read_change_or_delete_leads()
    {
        var (f, pub, admin, owner) = await Setup(Open);
        await using var _c = f;
        Assert.Equal(HttpStatusCode.Created, (await pub.Send(HttpMethod.Post, Route, Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await new Browser(f.Factory).Send(HttpMethod.Get, Admin)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Get, Admin)).StatusCode);
        var page = await (await admin.Send(HttpMethod.Get, Admin)).Content.ReadFromJsonAsync<LeadPageResponse>();
        Assert.Equal(1, page!.Total);
        var id = page.Items[0].Id;
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Patch, Admin + "/" + id, new { status = "Closed" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Send(HttpMethod.Delete, Admin + "/" + id)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.Send(HttpMethod.Patch, Admin + "/" + id, new { status = "Bogus" })).StatusCode);
        var changed = await (await admin.Send(HttpMethod.Patch, Admin + "/" + id, new { status = "Contacted" })).Content.ReadFromJsonAsync<LeadResponse>();
        Assert.Equal("Contacted", changed!.Status);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Send(HttpMethod.Delete, Admin + "/" + id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Send(HttpMethod.Delete, Admin + "/" + id)).StatusCode);
        Assert.Equal(0, await Count(f));
    }

    [Theory]
    [InlineData(null, null, null, null, null, false)]
    [InlineData("false", null, null, null, null, false)]
    [InlineData("true", null, "30", "C", "W", false)]
    [InlineData("true", "n1", null, "C", "W", false)]
    [InlineData("true", "n1", "0", "C", "W", false)]
    [InlineData("true", "n1", "366", "C", "W", false)]
    [InlineData("true", "n1", "abc", "C", "W", false)]
    [InlineData("true", "n1", "30", null, "W", false)]
    [InlineData("true", "n1", "30", "C", " ", false)]
    [InlineData("true", "n1", "30", "C", "W", true)]
    public void Options_require_notice_retention_controller_and_contact_when_enabled(string? enabled, string? notice, string? days, string? controller, string? contact, bool valid)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Leads:Enabled"] = enabled, ["Leads:NoticeVersion"] = notice, ["Leads:RetentionDays"] = days, ["Leads:ControllerName"] = controller, ["Leads:ContactChannel"] = contact }).Build();
        if (enabled != "true") Assert.Null(LeadOptions.FromConfiguration(config));
        else if (valid) Assert.Equal(new LeadOptions("n1", 30, "C", "W"), LeadOptions.FromConfiguration(config));
        else Assert.Throws<InvalidOperationException>(() => LeadOptions.FromConfiguration(config));
    }
}
