using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Auth;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace DigitalMenu.IntegrationTests;

public sealed class AuthenticationTests
{
    [SqlServerFact]
    public async Task Signed_sessions_enforce_platform_and_owner_policies_without_role_escalation()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Send(HttpMethod.Post, "/login",
            new { email = "owner@example.test", password = fixture.Password, role = "PlatformAdmin", restaurantId = Guid.NewGuid() })).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Authorization.IAuthorizationService>();
        var cookieOptions = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions>>()
            .Get(IdentityConstants.ApplicationScheme);
        var owner = cookieOptions.TicketDataFormat.Unprotect(browser.Cookies["__Host-DigitalMenu.Session"])!.Principal;
        Assert.True((await authorization.AuthorizeAsync(owner, null, "Owner")).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(owner, null, "PlatformAdmin")).Succeeded);
        var anonymous = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity());
        Assert.False((await authorization.AuthorizeAsync(anonymous, null, "Owner")).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(anonymous, null, "PlatformAdmin")).Succeeded);

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        Assert.True((await roles.CreateAsync(new IdentityRole<Guid>("PlatformAdmin"))).Succeeded);
        var admin = new ApplicationUser { Id = Guid.NewGuid(), UserName = "admin@example.test", Email = "admin@example.test" };
        Assert.True((await users.CreateAsync(admin, fixture.Password)).Succeeded);
        Assert.True((await users.AddToRoleAsync(admin, "PlatformAdmin")).Succeeded);
        var adminBrowser = new Browser(fixture.Factory);
        await adminBrowser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await adminBrowser.Login(fixture.Password, admin.Email)).StatusCode);
        var principal = cookieOptions.TicketDataFormat.Unprotect(adminBrowser.Cookies["__Host-DigitalMenu.Session"])!.Principal;
        Assert.True((await authorization.AuthorizeAsync(principal, null, "PlatformAdmin")).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(principal, null, "Owner")).Succeeded);
    }

    [SqlServerFact]
    public async Task Secure_session_csrf_logout_and_replay_are_enforced()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Get, "/me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Login(fixture.Password)).StatusCode);
        await browser.Csrf();
        using var login = await browser.Login(fixture.Password);
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("__Host-DigitalMenu.Session="));
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("expires=", cookie, StringComparison.OrdinalIgnoreCase);
        var replay = new Browser(fixture.Factory);
        replay.Cookies["__Host-DigitalMenu.Session"] = browser.Cookies["__Host-DigitalMenu.Session"];
        var me = await browser.Send(HttpMethod.Get, "/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var payload = await me.Content.ReadAsStringAsync();
        Assert.Contains("Restaurant A", payload);
        Assert.DoesNotContain("Restaurant B", payload);
        Assert.DoesNotContain("password", payload, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("userId", payload, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("no-store", me.Headers.CacheControl!.ToString());
        // The anonymous token must not validate after the identity changes.
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Send(HttpMethod.Post, "/logout")).StatusCode);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Send(HttpMethod.Post, "/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.Send(HttpMethod.Get, "/me")).StatusCode);
    }

    [SqlServerFact]
    public async Task Invalid_credentials_lockout_and_rate_limit_are_generic()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        string? failure = null;
        for (var i = 0; i < 5; i++)
        {
            var result = await browser.Login("Incorrect!Password42");
            Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
            failure = await result.Content.ReadAsStringAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password)).StatusCode);
        var unknown = await browser.Login(fixture.Password, "absent@example.test");
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        using var knownProblem = System.Text.Json.JsonDocument.Parse(failure!);
        using var unknownProblem = System.Text.Json.JsonDocument.Parse(await unknown.Content.ReadAsStringAsync());
        Assert.Equal(knownProblem.RootElement.GetProperty("title").GetString(), unknownProblem.RootElement.GetProperty("title").GetString());
        Assert.Equal(knownProblem.RootElement.GetProperty("status").GetInt32(), unknownProblem.RootElement.GetProperty("status").GetInt32());
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True(await users.IsLockedOutAsync((await users.FindByEmailAsync("owner@example.test"))!));
        HttpResponseMessage? limited = null;
        for (var i = 0; i < 5; i++) limited = await browser.Login(fixture.Password);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited!.StatusCode);
        Assert.Contains("application/problem+json", limited.Content.Headers.ContentType!.ToString());
    }

    [SqlServerFact]
    public async Task Suspension_inactive_membership_and_stamp_changes_revoke_access()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password)).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var restaurant = await db.Set<Restaurant>().SingleAsync(x => x.Name == "Restaurant A");
        restaurant.Status = "Suspended";
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Get, "/me")).StatusCode);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password)).StatusCode);
        restaurant.Status = "Active";
        var membership = await db.Set<RestaurantUser>().SingleAsync();
        membership.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password)).StatusCode);
        membership.IsActive = true;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password)).StatusCode);
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await users.UpdateSecurityStampAsync((await users.FindByEmailAsync("owner@example.test"))!);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Get, "/me")).StatusCode);
    }

    [SqlServerFact]
    public async Task Bootstrap_is_explicit_local_only_and_cannot_replace_users()
    {
        await using var fixture = await AuthFixture.Create();
        await Assert.ThrowsAsync<InvalidOperationException>(() => DevelopmentBootstrap.RunAsync(fixture.Factory.Services,
            fixture.Factory.Services.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>(),
            fixture.Factory.Services.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()));
        var browser = new Browser(fixture.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Client.PostAsJsonAsync("/api/v1/auth/register", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Client.GetAsync("http://localhost/api/v1/auth/csrf")).StatusCode);
        await browser.Csrf();
        browser.Token = "forged-token";
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Login(fixture.Password)).StatusCode);
    }

    [SqlServerFact]
    public async Task Session_expires_and_MFA_cannot_be_bypassed()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password)).StatusCode);
        fixture.Clock.Advance(TimeSpan.FromMinutes(31));
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Get, "/me")).StatusCode);
        await browser.Csrf();
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await users.SetTwoFactorEnabledAsync((await users.FindByEmailAsync("owner@example.test"))!, true);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password)).StatusCode);
    }

    [SqlServerFact]
    public async Task Development_bootstrap_creates_one_admin_transactionally()
    {
        await using var fixture = await AuthFixture.Create(empty: true);
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:MenuDatabase"] = fixture.Connection,
                ["Bootstrap:Email"] = "bootstrap@example.test",
                ["Bootstrap:Password"] = fixture.Password
            }).Build();
        var environment = fixture.Factory.Services.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>();
        config["Bootstrap:Password"] = "weak";
        await Assert.ThrowsAsync<InvalidOperationException>(() => DevelopmentBootstrap.RunAsync(fixture.Factory.Services, environment, config));
        using (var rollbackScope = fixture.Factory.Services.CreateScope())
            Assert.False(await rollbackScope.ServiceProvider.GetRequiredService<MenuDbContext>().Roles.AnyAsync());
        config["Bootstrap:Password"] = fixture.Password;
        await DevelopmentBootstrap.RunAsync(fixture.Factory.Services, environment, config);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByEmailAsync("bootstrap@example.test"))!;
        Assert.True(await users.IsInRoleAsync(user, "PlatformAdmin"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => DevelopmentBootstrap.RunAsync(fixture.Factory.Services, environment, config));
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(fixture.Password, "bootstrap@example.test")).StatusCode);
        Assert.Contains("PlatformAdmin", await (await browser.Send(HttpMethod.Get, "/me")).Content.ReadAsStringAsync());
    }

    [SqlServerFact]
    public async Task Disabled_accounts_and_invalid_input_are_rejected()
    {
        await using var fixture = await AuthFixture.Create();
        var browser = new Browser(fixture.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.Login(fixture.Password, "not-an-email")).StatusCode);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByEmailAsync("owner@example.test"))!;
        Assert.True((await users.SetLockoutEndDateAsync(user, DateTimeOffset.MaxValue)).Succeeded);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Login(fixture.Password)).StatusCode);
    }

    [Fact]
    public async Task Bootstrap_refuses_production_before_any_database_access()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.UseEnvironment("Production"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => DevelopmentBootstrap.RunAsync(factory.Services,
            factory.Services.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>(),
            factory.Services.GetRequiredService<IConfiguration>()));
    }

    [Fact]
    public async Task Missing_database_configuration_fails_closed()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.UseEnvironment("Development").UseSetting("ConnectionStrings:MenuDatabase", ""));
        var browser = new Browser(factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await browser.Login("F03!" + Guid.NewGuid().ToString("N"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Get, "/me")).StatusCode);
    }

    private sealed class Browser
    {
        public HttpClient Client { get; }
        public Dictionary<string, string> Cookies { get; } = [];
        public string? Token { get; set; }
        public Browser(WebApplicationFactory<Program> factory) => Client = factory.CreateClient(new()
        { BaseAddress = new Uri("https://localhost"), HandleCookies = false, AllowAutoRedirect = false });
        public Task<HttpResponseMessage> Login(string password, string email = "owner@example.test")
            => Send(HttpMethod.Post, "/login", new LoginRequest(email, password));
        public async Task Csrf()
        {
            Assert.Equal(HttpStatusCode.OK, (await Send(HttpMethod.Get, "/csrf")).StatusCode);
            Token = Uri.UnescapeDataString(Cookies["XSRF-TOKEN"]);
        }
        public async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? body = null)
        {
            using var request = new HttpRequestMessage(method, "/api/v1/auth" + path);
            if (Cookies.Count > 0) request.Headers.Add("Cookie", string.Join("; ", Cookies.Select(x => x.Key + "=" + x.Value)));
            if (Token is not null) request.Headers.Add("X-XSRF-TOKEN", Token);
            if (body is not null) request.Content = JsonContent.Create(body);
            var response = await Client.SendAsync(request);
            if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
                foreach (var cookie in cookies)
                {
                    var pair = cookie.Split(';')[0].Split('=', 2);
                    Cookies[pair[0]] = pair[1];
                }
            return response;
        }
    }

    private sealed class AuthFixture : IAsyncDisposable
    {
        public WebApplicationFactory<Program> Factory { get; private set; } = null!;
        public string Connection { get; private set; } = "";
        public TestClock Clock { get; } = new();
        public string Password { get; } = "F03!" + Guid.NewGuid().ToString("N");
        public static async Task<AuthFixture> Create(bool empty = false)
        {
            var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION"));
            if (connection.DataSource != "(localdb)\\DigitalMenuF02" && connection.DataSource != "localhost,1433")
                throw new InvalidOperationException("Dedicated disposable SQL Server required.");
            connection.InitialCatalog = "DigitalMenu_Dev_F03_Test_" + Guid.NewGuid().ToString("N");
            var fixture = new AuthFixture { Connection = connection.ConnectionString };
            fixture.Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
                b.UseEnvironment("Development").UseSetting("ConnectionStrings:MenuDatabase", connection.ConnectionString)
                 .ConfigureServices(s => s.Configure<Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme,
                     o => o.TimeProvider = fixture.Clock)));
            using var scope = fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            await db.Database.MigrateAsync();
            if (empty) return fixture;
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "owner@example.test", UserName = "owner@example.test" };
            Assert.True((await users.CreateAsync(user, fixture.Password)).Succeeded);
            var a = new Restaurant { Name = "Restaurant A", Slug = "a", PublicCode = "code-a" };
            var b = new Restaurant { Name = "Restaurant B", Slug = "b", PublicCode = "code-b" };
            db.AddRange(a, b, new RestaurantUser { RestaurantId = a.Id, UserId = user.Id });
            await db.SaveChangesAsync();
            return fixture;
        }
        public async ValueTask DisposeAsync()
        {
            using var scope = Factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Database.EnsureDeletedAsync();
            await Factory.DisposeAsync();
        }
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
}
