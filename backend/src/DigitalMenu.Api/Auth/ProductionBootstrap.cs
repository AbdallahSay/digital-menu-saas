using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Auth;

/// <summary>
/// One-time operator command for a Production host: creates the FIRST PlatformAdmin only when the Identity user store is empty.
/// Run once as: DigitalMenu.Api --bootstrap-admin=production with Bootstrap__Email, Bootstrap__Password (out-of-band secret) and
/// Bootstrap__ConfirmDatabase (must equal the connected database name). Never prints the password. Refuses when any user exists.
/// </summary>
public static class ProductionBootstrap
{
    public static async Task RunAsync(IServiceProvider services, IHostEnvironment environment, IConfiguration config)
    {
        if (!environment.IsProduction()) throw new InvalidOperationException("Production bootstrap requires the Production environment.");
        var cs = config.GetConnectionString("MenuDatabase");
        if (string.IsNullOrWhiteSpace(cs)) throw new InvalidOperationException("ConnectionStrings:MenuDatabase is required.");
        var catalog = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(cs).InitialCatalog;
        if (string.IsNullOrWhiteSpace(catalog) || !string.Equals(config["Bootstrap:ConfirmDatabase"], catalog, StringComparison.Ordinal))
            throw new InvalidOperationException("Bootstrap:ConfirmDatabase must equal the target database name.");
        var email = config["Bootstrap:Email"];
        var password = config["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Bootstrap:Email and Bootstrap:Password are required (secret supplied out-of-band).");
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        // Bind the confirmation to the connection the identity stores will actually write through, not only the supplied string.
        var actual = (await db.Database.SqlQueryRaw<string>("SELECT DB_NAME() AS [Value]").ToListAsync()).SingleOrDefault();
        if (!string.Equals(actual, catalog, StringComparison.Ordinal))
            throw new InvalidOperationException("The resolved database does not match the confirmed target; nothing was written.");
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
