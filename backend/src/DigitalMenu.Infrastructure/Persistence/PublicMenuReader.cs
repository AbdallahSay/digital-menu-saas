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
                                    select new { r.Id, r.Name, r.Slug, r.PublicCode, r.PublishedMenuVersion, Color = s == null ? "#0F766E" : s.PrimaryColor,
                                        Logo = s == null ? null : s.LogoObjectKey }).SingleOrDefaultAsync(ct);
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
            // First image per item by gallery order, one query for the whole page.
            var itemIds = items.Select(i => i.Id).ToArray();
            var images = await db.Set<MenuItemImage>().AsNoTracking()
                .Where(img => img.RestaurantId == restaurant.Id && itemIds.Contains(img.MenuItemId))
                .OrderBy(img => img.SortOrder).ThenBy(img => img.Id)
                .Select(img => new { img.Id, img.MenuItemId, img.ObjectKey, img.AltAr, img.AltEn, img.Width, img.Height })
                .ToListAsync(ct);
            var firstImages = images.GroupBy(img => img.MenuItemId)
                .ToDictionary(g => g.Key, g => g.First());
            var grouped = items.GroupBy(i => i.CategoryId).ToDictionary(g => g.Key,
                g => (IReadOnlyList<PublicItem>)g.Select(i =>
                {
                    var image = firstImages.GetValueOrDefault(i.Id) is { } found && found.ObjectKey.Length > 0
                        ? new PublicItemImage(ItemMediaUrl(found.Id, "main"), ItemMediaUrl(found.Id, "thumbnail"),
                            Localize(found.AltAr ?? "", found.AltEn, language), found.Width, found.Height)
                        : null;
                    return new PublicItem(i.Id, Localize(i.NameAr, i.NameEn, language),
                        Localize(i.DescriptionAr ?? "", i.DescriptionEn, language), i.Price, image);
                }).ToArray());
            var result = new PublicMenu(new(restaurant.Name, restaurant.Slug, restaurant.Color, "EGP",
                restaurant.Logo is null ? null : $"/api/v1/public/media/logo/{restaurant.PublicCode}"), language,
                restaurant.PublishedMenuVersion, categories.Select(c => new PublicCategory(c.Id, Localize(c.NameAr, c.NameEn, language),
                    grouped.GetValueOrDefault(c.Id) ?? Array.Empty<PublicItem>())).ToArray());
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }
    /// <summary>Builds the public item-image URL from the image's own random id - never the restaurant Guid or object key.</summary>
    private static string ItemMediaUrl(Guid imageId, string variant) =>
        $"/api/v1/public/media/items/{imageId:D}/{variant}";
    private static string Localize(string arabic, string? english, string language) =>
        language == "en" && !string.IsNullOrWhiteSpace(english) ? english : arabic;
}
