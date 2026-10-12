using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Tenancy;

public sealed class TenantContext(IAuthenticatedActor identity, MenuDbContext db) : ITenantContext
{
    public async Task<TenantScope> RequireAsync(CancellationToken cancellationToken = default)
    {
        var actor = await identity.GetAsync(cancellationToken) ?? throw new TenantBoundaryException(TenantFailure.Unauthenticated);
        return await ValidateAsync(db, actor, null, cancellationToken);
    }

    internal async Task<TenantScope> ValidateCurrentAsync(MenuDbContext transactionalDb, TenantScope expected, CancellationToken ct)
    {
        var actor = await identity.GetAsync(ct) ?? throw new TenantBoundaryException(TenantFailure.Unauthenticated);
        if (actor.UserId != expected.UserId) throw new TenantBoundaryException(TenantFailure.Forbidden);
        return await ValidateAsync(transactionalDb, actor, expected.RestaurantId, ct);
    }

    private static async Task<TenantScope> ValidateAsync(MenuDbContext context, AuthenticatedActor actor, Guid? expected, CancellationToken ct)
    {
        var user = await context.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == actor.UserId, ct);
        if (user is null || string.IsNullOrEmpty(user.PasswordHash) || user.TwoFactorEnabled ||
            user.SecurityStamp != actor.SecurityStamp || (user.LockoutEnabled && user.LockoutEnd > DateTimeOffset.UtcNow))
            throw new TenantBoundaryException(TenantFailure.Forbidden);
        // Count memberships BEFORE applying restaurant visibility. Never choose an arbitrary tenant.
        var memberships = await context.Set<RestaurantUser>().AsNoTracking()
            .Where(m => m.UserId == actor.UserId && m.IsActive && m.Role == "Owner")
            .Select(m => m.RestaurantId).Take(2).ToListAsync(ct);
        if (memberships.Count != 1 || (expected is not null && memberships[0] != expected))
            throw new TenantBoundaryException(TenantFailure.Forbidden);
        var id = memberships[0];
        if (!await context.Set<Restaurant>().AsNoTracking().AnyAsync(r => r.Id == id && r.Status == "Active", ct))
            throw new TenantBoundaryException(TenantFailure.Forbidden);
        return new TenantScope(actor.UserId, id);
    }
}
