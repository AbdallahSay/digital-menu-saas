using System.Security.Claims;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DigitalMenu.Api.Auth;

// Global role eligibility only. No tenant selection or resource authorization (F05).
public sealed class MenuClaimsPrincipalFactory(UserManager<ApplicationUser> users,
    RoleManager<IdentityRole<Guid>> roles, IOptions<IdentityOptions> options, MenuDbContext db)
    : UserClaimsPrincipalFactory<ApplicationUser, IdentityRole<Guid>>(users, roles, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        var roleType = Options.ClaimsIdentity.RoleClaimType;
        // Owner is derived exclusively from current membership, not a stale Identity role.
        foreach (var role in identity.FindAll(roleType).Where(c => c.Value == "Owner").ToArray())
            identity.RemoveClaim(role);
        var owner = await (from membership in db.Set<RestaurantUser>().AsNoTracking()
                           join restaurant in db.Set<Restaurant>().AsNoTracking() on membership.RestaurantId equals restaurant.Id
                           where membership.UserId == user.Id && membership.IsActive && membership.Role == "Owner" && restaurant.Status == "Active"
                           select membership).AnyAsync();
        if (owner) identity.AddClaim(new Claim(roleType, "Owner"));
        return identity;
    }
}
