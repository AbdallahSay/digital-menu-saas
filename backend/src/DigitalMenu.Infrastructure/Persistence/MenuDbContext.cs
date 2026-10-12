using DigitalMenu.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace DigitalMenu.Infrastructure.Persistence;

// Identity persistence only; F03 supplies authentication and session behavior.
public sealed class ApplicationUser : IdentityUser<Guid>;

public sealed class MenuDbContext(DbContextOptions<MenuDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(MenuDbContext).Assembly);
        // Explicit cleanup is required, including Identity and audit references.
        foreach (var fk in builder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
            fk.DeleteBehavior = DeleteBehavior.NoAction;
    }
}

public sealed class MenuDbContextFactory : IDesignTimeDbContextFactory<MenuDbContext>
{
    public MenuDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<MenuDbContext>()
        .UseSqlServer(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION")
            ?? "Server=(localdb)\\MSSQLLocalDB;Database=DigitalMenu_F02_Design;Integrated Security=true;Encrypt=false")
        .Options);
}
