using System.Data;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Anonymous read-only projection. Never resolves identity or uses owner/preview data.
public sealed class PublicMenuReader(MenuDbContext db) : IPublicMenuReader
{
    public const int MaxCategories = 100;
    public const int MaxItems = 1000;
    public async Task<PublicMenu?> ReadAsync(string identifier, bool bySlug, string language, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(db.Database.GetConnectionString())) throw new PublicMenuUnavailableException();
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
            var restaurant = await (from r in db.Set<Restaurant>().AsNoTracking()
                                    join s in db.Set<RestaurantSettings>().AsNoTracking() on r.Id equals s.RestaurantId into settings
                                    from s in settings.DefaultIfEmpty()
                                    where r.Status == "Active" && r.IsPublished && (bySlug ? r.Slug == identifier : r.PublicCode == identifier)
                                    select new
                                    {
                                        r.Id, r.Name, r.Slug, r.PublicCode, r.PublishedMenuVersion,
                                        Color = s == null ? "#0F766E" : s.PrimaryColor,
                                        Theme = s == null ? ThemeKeys.Default : s.ThemeKey,
                                        LogoKey = s == null ? null : s.LogoObjectKey, LogoWidth = s == null ? null : s.LogoWidth, LogoHeight = s == null ? null : s.LogoHeight,
                                        CoverKey = s == null ? null : s.CoverObjectKey, CoverWidth = s == null ? null : s.CoverWidth, CoverHeight = s == null ? null : s.CoverHeight
                                    }).SingleOrDefaultAsync(ct);
            if (restaurant is null) return null;
            // Scope freezes from the public resolver, never a client RestaurantId or cookie.
            db.RestrictToTenant(restaurant.Id);
            var categories = await db.Set<Category>().AsNoTracking()
                .Where(c => c.RestaurantId == restaurant.Id && !c.IsDeleted && c.IsPublished)
                .OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
                .Select(c => new { c.Id, c.NameAr, c.NameEn }).Take(MaxCategories + 1).ToListAsync(ct);
            if (categories.Count > MaxCategories) throw new PublicMenuUnavailableException();
            var items = await (from i in db.Set<MenuItem>().AsNoTracking()
                               join c in db.Set<Category>().AsNoTracking() on new { i.RestaurantId, Id = i.CategoryId } equals new { c.RestaurantId, c.Id }
                               where i.RestaurantId == restaurant.Id && c.RestaurantId == restaurant.Id &&
                                   !c.IsDeleted && c.IsPublished && !i.IsDeleted && i.IsPublished && i.IsAvailable
                               orderby i.SortOrder, i.Id
                               select new { i.Id, i.CategoryId, i.NameAr, i.NameEn, i.DescriptionAr, i.DescriptionEn, i.Price })
                .Take(MaxItems + 1).ToListAsync(ct);
            if (items.Count > MaxItems) throw new PublicMenuUnavailableException();
            // Images only for the exact visible item set (same visibility predicates, composite tenant joins), bounded per item in SQL.
            var images = items.Count == 0 ? [] : await (from i in db.Set<MenuItem>().AsNoTracking()
                                join c in db.Set<Category>().AsNoTracking() on new { i.RestaurantId, Id = i.CategoryId } equals new { c.RestaurantId, c.Id }
                                where i.RestaurantId == restaurant.Id && c.RestaurantId == restaurant.Id &&
                                    !c.IsDeleted && c.IsPublished && !i.IsDeleted && i.IsPublished && i.IsAvailable
                                from img in db.Set<MenuItemImage>().AsNoTracking()
                                    .Where(img => img.RestaurantId == i.RestaurantId && img.MenuItemId == i.Id && img.ContentType == "image/webp")
                                    .OrderBy(img => img.SortOrder).ThenBy(img => img.CreatedAtUtc).ThenBy(img => img.Id)
                                    .Take(PublicMedia.MaxImagesPerItem)
                                select new { img.Id, img.MenuItemId, img.ObjectKey, img.AltAr, img.AltEn, img.SortOrder, img.CreatedAtUtc, img.Width, img.Height })
                .Take(PublicMedia.MaxImagesPerItem * MaxItems).ToListAsync(ct);
            // ObjectKey is read only to reject legacy/non-canonical keys the delivery endpoint would refuse; it is never serialized.
            var gallery = images.Where(img => PublicMedia.IsCanonicalKey(img.ObjectKey, restaurant.Id)).GroupBy(img => img.MenuItemId).ToDictionary(g => g.Key,
                g => g.OrderBy(img => img.SortOrder).ThenBy(img => img.CreatedAtUtc).ThenBy(img => img.Id).ToArray());
            var grouped = items.GroupBy(i => i.CategoryId).ToDictionary(g => g.Key,
                g => (IReadOnlyList<PublicItem>)g.Select(i =>
                {
                    var name = Localize(i.NameAr, i.NameEn, language);
                    // Missing alt text falls back to the visible item name, never to internal metadata.
                    var pictures = (gallery.GetValueOrDefault(i.Id) ?? []).Select(img =>
                        PublicMedia.ItemImage(img.Id, img.Width, img.Height, LocalizeOptional(img.AltAr, img.AltEn, language) ?? name)).ToArray();
                    return new PublicItem(i.Id, name, Localize(i.DescriptionAr ?? "", i.DescriptionEn, language), i.Price,
                        pictures.FirstOrDefault(), pictures.Skip(1).ToArray());
                }).ToArray());
            var brand = new PublicRestaurant(restaurant.Name, restaurant.Slug, restaurant.Color, "EGP",
                ThemeKeys.All.Contains(restaurant.Theme) ? restaurant.Theme : ThemeKeys.Default,
                Branding(restaurant.Id, restaurant.PublicCode, BrandingImageKind.Logo, restaurant.LogoKey, restaurant.LogoWidth, restaurant.LogoHeight, restaurant.Name),
                // Cover is decorative; empty alt keeps screen readers from repeating the restaurant name.
                Branding(restaurant.Id, restaurant.PublicCode, BrandingImageKind.Cover, restaurant.CoverKey, restaurant.CoverWidth, restaurant.CoverHeight, ""));
            var result = new PublicMenu(brand, language,
                restaurant.PublishedMenuVersion, categories.Select(c => new PublicCategory(c.Id, Localize(c.NameAr, c.NameEn, language),
                    grouped.GetValueOrDefault(c.Id) ?? Array.Empty<PublicItem>())).ToArray());
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }
    // Only canonical tenant-owned keys with stored dimensions are exposed; legacy/foreign keys are silently omitted.
    private static PublicImage? Branding(Guid restaurantId, string publicCode, BrandingImageKind kind, string? key, int? width, int? height, string alt) =>
        PublicMedia.IsCanonicalKey(key, restaurantId) && width is > 0 and <= 6000 && height is > 0 and <= 6000
            ? PublicMedia.BrandingImage(publicCode, kind, key!, width.Value, height.Value, alt) : null;
    private static string? LocalizeOptional(string? arabic, string? english, string language)
    {
        var value = language == "en" && !string.IsNullOrWhiteSpace(english) ? english : arabic;
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
    private static string Localize(string arabic, string? english, string language) =>
        language == "en" && !string.IsNullOrWhiteSpace(english) ? english : arabic;
}
