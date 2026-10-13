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
                                    select new { r.Id, r.Name, r.Slug, r.PublishedMenuVersion, Color = s == null ? "#0F766E" : s.PrimaryColor }).SingleOrDefaultAsync(ct);
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
            var grouped = items.GroupBy(i => i.CategoryId).ToDictionary(g => g.Key,
                g => (IReadOnlyList<PublicItem>)g.Select(i => new PublicItem(i.Id, Localize(i.NameAr, i.NameEn, language),
                    Localize(i.DescriptionAr ?? "", i.DescriptionEn, language), i.Price)).ToArray());
            var result = new PublicMenu(new(restaurant.Name, restaurant.Slug, restaurant.Color, "EGP"), language,
                restaurant.PublishedMenuVersion, categories.Select(c => new PublicCategory(c.Id, Localize(c.NameAr, c.NameEn, language),
                    grouped.GetValueOrDefault(c.Id) ?? Array.Empty<PublicItem>())).ToArray());
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (SqlException ex) when (ex.Number == 1205) { throw new PublicMenuUnavailableException(); }
    }
    private static string Localize(string arabic, string? english, string language) =>
        language == "en" && !string.IsNullOrWhiteSpace(english) ? english : arabic;
}
