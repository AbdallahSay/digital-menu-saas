using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Anonymous read-only projection. Never resolves identity or uses owner/preview data.
//
// Read path: one live indexed probe (restaurant + settings join, visibility
// filtered) per request, then a cache keyed by (restaurant, language,
// PublishedMenuVersion). The version is bumped transactionally on every projected
// change, so a same-version request is provably identical and skips the content
// queries; the 60s TTL is only a backstop. A miss loads the projection with plain
// READ COMMITTED statements (READ_COMMITTED_SNAPSHOT at the database makes them
// row-versioned; no locks are held across the roundtrips) and re-probes the
// version afterwards: a match proves a consistent snapshot, a flip retries once,
// and a second flip fails closed with the existing 503 contract.
public sealed class PublicMenuReader(MenuDbContext db, PublicMenuProjectionCache cache) : IPublicMenuReader
{
    public const int MaxCategories = 100;
    public const int MaxItems = 1000;

    private sealed record Probe(Guid Id, string Name, string Slug, string PublicCode, long PublishedMenuVersion,
        string Color, string? Logo, string Theme, string? BrandLabel, string? TaglineAr, string? TaglineEn);

    public async Task<PublicMenu?> ReadAsync(string identifier, bool bySlug, string language, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(db.Database.GetConnectionString())) throw new PublicMenuUnavailableException();
        try
        {
            for (var attempt = 0; ; attempt++)
            {
                var probe = await ProbeAsync(identifier, bySlug, ct);
                if (probe is null) return null;
                if (cache.TryGet(probe.Id, language, probe.PublishedMenuVersion, out var cached)) return cached!;
                var menu = await LoadAsync(probe, language, ct);
                var confirm = await ProbeAsync(identifier, bySlug, ct);
                if (confirm is null) return null; // Unpublished or suspended mid-read.
                if (confirm.PublishedMenuVersion == probe.PublishedMenuVersion)
                {
                    // UTF-16 chars + envelope overhead: weight the byte-budgeted
                    // cache entry by its serialized size; oversized menus are
                    // served but not cached.
                    var estimatedBytes = System.Text.Json.JsonSerializer.Serialize(menu).Length * 2L + 1024;
                    cache.Set(probe.Id, language, probe.PublishedMenuVersion, menu, estimatedBytes);
                    return menu;
                }
                if (attempt == 1) throw new PublicMenuUnavailableException(); // Flipped twice mid-read.
            }
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }

    /// <summary>The single live query every request pays: indexed lookup, never cached.</summary>
    private async Task<Probe?> ProbeAsync(string identifier, bool bySlug, CancellationToken ct) =>
        await (from r in db.Set<Restaurant>().AsNoTracking()
               join s in db.Set<RestaurantSettings>().AsNoTracking() on r.Id equals s.RestaurantId into settings
               from s in settings.DefaultIfEmpty()
               where r.Status == "Active" && r.IsPublished && (bySlug ? r.Slug == identifier : r.PublicCode == identifier)
               select new Probe(r.Id, r.Name, r.Slug, r.PublicCode, r.PublishedMenuVersion,
                   s == null ? "#0F766E" : s.PrimaryColor, s == null ? null : s.LogoObjectKey,
                   s == null ? "classic" : s.Theme, s == null ? null : s.BrandLabel,
                   s == null ? null : s.TaglineAr, s == null ? null : s.TaglineEn))
            .SingleOrDefaultAsync(ct);

    private async Task<PublicMenu> LoadAsync(Probe probe, string language, CancellationToken ct)
    {
        // Scope freezes from the public resolver, never a client RestaurantId or cookie.
        db.RestrictToTenant(probe.Id);
        var categories = await db.Set<Category>().AsNoTracking()
            .Where(c => c.RestaurantId == probe.Id && !c.IsDeleted && c.IsPublished)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new { c.Id, c.NameAr, c.NameEn }).Take(MaxCategories + 1).ToListAsync(ct);
        if (categories.Count > MaxCategories) throw new PublicMenuUnavailableException();
        var items = await (from i in db.Set<MenuItem>().AsNoTracking()
                           join c in db.Set<Category>().AsNoTracking() on new { i.RestaurantId, Id = i.CategoryId } equals new { c.RestaurantId, c.Id }
                           where i.RestaurantId == probe.Id && c.RestaurantId == probe.Id &&
                               !c.IsDeleted && c.IsPublished && !i.IsDeleted && i.IsPublished && i.IsAvailable
                           orderby i.SortOrder, i.Id
                           select new { i.Id, i.CategoryId, i.NameAr, i.NameEn, i.DescriptionAr, i.DescriptionEn, i.Price, i.IsFeatured })
            .Take(MaxItems + 1).ToListAsync(ct);
        if (items.Count > MaxItems) throw new PublicMenuUnavailableException();
        // First image per item by gallery order, one query for the whole page.
        var itemIds = items.Select(i => i.Id).ToArray();
        var images = await db.Set<MenuItemImage>().AsNoTracking()
            .Where(img => img.RestaurantId == probe.Id && itemIds.Contains(img.MenuItemId))
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
                    Localize(i.DescriptionAr ?? "", i.DescriptionEn, language), i.Price, image, i.IsFeatured);
            }).ToArray());
        return new PublicMenu(new(probe.Name, probe.Slug, probe.Color, "EGP",
            probe.Logo is null ? null : $"/api/v1/public/media/logo/{probe.PublicCode}",
            probe.Theme, probe.BrandLabel, language == "en" && !string.IsNullOrWhiteSpace(probe.TaglineEn) ? probe.TaglineEn : probe.TaglineAr), language,
            probe.PublishedMenuVersion, categories.Select(c => new PublicCategory(c.Id, Localize(c.NameAr, c.NameEn, language),
                grouped.GetValueOrDefault(c.Id) ?? Array.Empty<PublicItem>())).ToArray());
    }

    /// <summary>Builds the public item-image URL from the image's own random id - never the restaurant Guid or object key.</summary>
    private static string ItemMediaUrl(Guid imageId, string variant) =>
        $"/api/v1/public/media/items/{imageId:D}/{variant}";
    private static string Localize(string arabic, string? english, string language) =>
        language == "en" && !string.IsNullOrWhiteSpace(english) ? english : arabic;
}
