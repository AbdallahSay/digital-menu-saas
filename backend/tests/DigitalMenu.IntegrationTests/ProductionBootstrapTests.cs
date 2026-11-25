using DigitalMenu.Api.Auth;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace DigitalMenu.IntegrationTests;

public sealed class ProductionBootstrapTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(string? confirm, string? email = "admin@example.test", string? password = "x") =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MenuDatabase"] = "Server=db.example.test;Database=prod_db;User ID=u;Password=p;Encrypt=True",
            ["Bootstrap:ConfirmDatabase"] = confirm,
            ["Bootstrap:Email"] = email,
            ["Bootstrap:Password"] = password
        }).Build();

    [Theory]
    [InlineData("Development")]
    [InlineData("Staging")]
    public async Task Refuses_outside_Production_before_touching_services(string env) =>
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(null!, new Env(env), Config("prod_db")));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("other_db")]
    [InlineData("PROD_DB")]
    public async Task Requires_exact_database_confirmation(string? confirm) =>
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(null!, new Env("Production"), Config(confirm)));

    [Fact]
    public async Task Requires_email_and_password_secret() =>
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(null!, new Env("Production"), Config("prod_db", password: " ")));

    [SqlServerFact]
    public async Task Creates_first_platform_admin_once_and_refuses_when_users_exist()
    {
        await using var fixture = await AuthenticationTests.AuthFixture.Create(empty: true);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MenuDatabase"] = fixture.Connection,
            ["Bootstrap:ConfirmDatabase"] = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(fixture.Connection).InitialCatalog,
            ["Bootstrap:Email"] = "first-admin@example.test",
            ["Bootstrap:Password"] = "weak"
        }).Build();
        var env = new Env("Production");
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(fixture.Factory.Services, env, config));
        using (var s = fixture.Factory.Services.CreateScope())
        {
            var d = s.ServiceProvider.GetRequiredService<MenuDbContext>();
            Assert.False(await d.Users.AnyAsync());
            Assert.False(await d.Roles.AnyAsync());
        }
        config["Bootstrap:Password"] = fixture.Password;
        await ProductionBootstrap.RunAsync(fixture.Factory.Services, env, config);
        using var scope = fixture.Factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var created = (await users.FindByEmailAsync("first-admin@example.test"))!;
        Assert.True(await users.IsInRoleAsync(created, "PlatformAdmin"));
        Assert.True(await users.CheckPasswordAsync(created, fixture.Password));
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(fixture.Factory.Services, env, config));
    }

    [SqlServerFact]
    public async Task Refuses_when_confirmed_target_differs_from_the_resolved_database_and_writes_nothing()
    {
        await using var fixture = await AuthenticationTests.AuthFixture.Create(empty: true);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MenuDatabase"] = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(fixture.Connection) { InitialCatalog = "some_other_db" }.ConnectionString,
            ["Bootstrap:ConfirmDatabase"] = "some_other_db",
            ["Bootstrap:Email"] = "first-admin@example.test",
            ["Bootstrap:Password"] = fixture.Password
        }).Build();
        await Assert.ThrowsAsync<InvalidOperationException>(() => ProductionBootstrap.RunAsync(fixture.Factory.Services, new Env("Production"), config));
        using var scope = fixture.Factory.Services.CreateScope();
        var d = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.False(await d.Users.AnyAsync());
        Assert.False(await d.Roles.AnyAsync());
    }
}
