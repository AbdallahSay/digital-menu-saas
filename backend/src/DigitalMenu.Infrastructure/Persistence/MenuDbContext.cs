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
    // Null is the existing privileged Identity/platform path. Owner sessions bind a private context.
    internal Guid? ScopedRestaurantId { get; private set; }
    internal void DenyTenantAccess() => ScopedRestaurantId = Guid.Empty;
    internal void RestrictToTenant(Guid restaurantId)
    {
        if (restaurantId == Guid.Empty || (ScopedRestaurantId is not null && ScopedRestaurantId != Guid.Empty && ScopedRestaurantId != restaurantId))
            throw new DigitalMenu.Application.TenantBoundaryException(DigitalMenu.Application.TenantFailure.Forbidden);
        ScopedRestaurantId = restaurantId;
    }
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(MenuDbContext).Assembly);
        builder.Entity<Restaurant>().HasQueryFilter(r => ScopedRestaurantId == null || r.Id == ScopedRestaurantId);
        builder.Entity<Category>().HasQueryFilter(r => ScopedRestaurantId == null || r.RestaurantId == ScopedRestaurantId);
        builder.Entity<MenuItem>().HasQueryFilter(r => ScopedRestaurantId == null || r.RestaurantId == ScopedRestaurantId);
        builder.Entity<MenuItemImage>().HasQueryFilter(r => ScopedRestaurantId == null || r.RestaurantId == ScopedRestaurantId);
        builder.Entity<RestaurantSettings>().HasQueryFilter(r => ScopedRestaurantId == null || r.RestaurantId == ScopedRestaurantId);
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
