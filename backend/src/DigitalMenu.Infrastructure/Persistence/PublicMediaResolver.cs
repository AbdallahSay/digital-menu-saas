using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Anonymous, read-only. Re-checks the full public visibility chain on every request; the object key never leaves the server.
public sealed class PublicMediaResolver(MenuDbContext db) : IPublicMediaResolver
{
    public async Task<string?> ResolveItemImageAsync(Guid imageId, CancellationToken ct)
    {
        EnsureConfigured();
        try
        {
            var match = await (from img in db.Set<MenuItemImage>().AsNoTracking()
                               join i in db.Set<MenuItem>().AsNoTracking() on new { img.RestaurantId, Id = img.MenuItemId } equals new { i.RestaurantId, i.Id }
                               join c in db.Set<Category>().AsNoTracking() on new { i.RestaurantId, Id = i.CategoryId } equals new { c.RestaurantId, c.Id }
                               join r in db.Set<Restaurant>().AsNoTracking() on c.RestaurantId equals r.Id
                               where img.Id == imageId && img.ContentType == "image/webp" &&
                                   r.Status == "Active" && r.IsPublished &&
                                   !c.IsDeleted && c.IsPublished && !i.IsDeleted && i.IsPublished && i.IsAvailable
                               select new { img.RestaurantId, img.ObjectKey }).SingleOrDefaultAsync(ct);
            return match is not null && PublicMedia.IsCanonicalKey(match.ObjectKey, match.RestaurantId) ? match.ObjectKey : null;
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }

    public async Task<string?> ResolveBrandingImageAsync(string publicCode, BrandingImageKind kind, string token, CancellationToken ct)
    {
        EnsureConfigured();
        try
        {
            var match = await (from r in db.Set<Restaurant>().AsNoTracking()
                               join s in db.Set<RestaurantSettings>().AsNoTracking() on r.Id equals s.RestaurantId
                               where r.PublicCode == publicCode && r.Status == "Active" && r.IsPublished
                               select new
                               {
                                   r.Id,
                                   Key = kind == BrandingImageKind.Logo ? s.LogoObjectKey : s.CoverObjectKey,
                                   Width = kind == BrandingImageKind.Logo ? s.LogoWidth : s.CoverWidth,
                                   Height = kind == BrandingImageKind.Logo ? s.LogoHeight : s.CoverHeight
                               }).SingleOrDefaultAsync(ct);
            // Same eligibility as the menu DTO; stale tokens (replaced logo/cover) are 404, never the new image.
            return match is { Width: not null, Height: not null } && PublicMedia.IsCanonicalKey(match.Key, match.Id) &&
                string.Equals(PublicMedia.BrandingToken(match.Key!), token, StringComparison.Ordinal) ? match.Key : null;
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(db.Database.GetConnectionString())) throw new PublicMenuUnavailableException();
    }
}
