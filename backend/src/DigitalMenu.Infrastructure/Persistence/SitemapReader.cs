using DigitalMenu.Application;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Cross-tenant by design and deliberately narrow: only opted-in, published, active tenants, and
// only slug plus last-modified. It uses the public (unscoped) context, same as PublicMenuReader,
// and projects no other column.
public sealed class SitemapReader(MenuDbContext db) : ISitemapReader
{
    public const int PageSize = 1000;
    public const int MaxPage = 50; // hard cap: 50,000 URLs, the sitemap protocol limit per file

    public async Task<SitemapPage> ReadAsync(int page, CancellationToken ct)
    {
        if (page < 1 || page > MaxPage) throw new ArgumentOutOfRangeException(nameof(page));
        var rows = await db.Set<DigitalMenu.Domain.Restaurant>().AsNoTracking()
            .Where(r => r.IsIndexable && r.IsPublished && r.Status == "Active")
            .OrderBy(r => r.Slug)
            .Skip((page - 1) * PageSize).Take(PageSize + 1)
            .Select(r => new SitemapEntry(r.Slug, r.UpdatedAtUtc))
            .ToListAsync(ct);
        return new SitemapPage(page, PageSize, rows.Count > PageSize, rows.Take(PageSize).ToList());
    }
}
