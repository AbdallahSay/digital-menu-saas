using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Auth;

public static class DevelopmentBootstrap
{
    public static async Task RunAsync(IServiceProvider services, IHostEnvironment environment, IConfiguration config)
    {
        if (!environment.IsDevelopment() || string.IsNullOrWhiteSpace(config.GetConnectionString("MenuDatabase")))
            throw new InvalidOperationException("Bootstrap requires an explicitly configured Development database.");
        var connection = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(config.GetConnectionString("MenuDatabase"));
        if ((connection.DataSource != "(localdb)\\DigitalMenuF02" && connection.DataSource != "localhost,1433") ||
            !connection.InitialCatalog.StartsWith("DigitalMenu_Dev_", StringComparison.Ordinal))
            throw new InvalidOperationException("Bootstrap is restricted to dedicated local/test SQL Server and DigitalMenu_Dev_ databases.");
        var email = config["Bootstrap:Email"];
        var password = config["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Supply bootstrap credentials through user secrets or environment configuration.");
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        if (await db.Users.AnyAsync()) throw new InvalidOperationException("Bootstrap requires an empty Identity user store.");
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        if (!await roles.RoleExistsAsync("PlatformAdmin")) Ensure(await roles.CreateAsync(new IdentityRole<Guid>("PlatformAdmin")));
        var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email };
        Ensure(await users.CreateAsync(user, password));
        Ensure(await users.AddToRoleAsync(user, "PlatformAdmin"));
        await transaction.CommitAsync();
    }

    private static void Ensure(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException("Bootstrap validation failed; no account was committed.");
    }
}
