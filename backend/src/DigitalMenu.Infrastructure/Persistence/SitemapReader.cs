using DigitalMenu.Application;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Cross-tenant by design and deliberately narrow: only opted-in, published, active tenants, and
// only slug plus last-modified. It uses the public (unscoped) context, same as PublicMenuReader,
// and projects no other column.
public sealed class SitemapReader(MenuDbContext db) : ISitemapReader
{
    public const int PageSize = 1000;
    // Each page is one small sitemap document (1,000 URLs, far under the 50,000-URL protocol limit
    // per file); the SSR index lists every page, so no tenant becomes unreachable. MaxPage only
    // bounds Skip() arithmetic (100,000 pages = 100 million tenants).
    public const int MaxPage = 100_000;
    // Paths the frontend resolves to static pages before the tenant route, so a tenant with such a
    // slug is never the page served there and must not be listed.
    public static readonly string[] ReservedSlugs = ["demo"];

    public async Task<SitemapPage> ReadAsync(int page, CancellationToken ct)
    {
        if (page < 1 || page > MaxPage) throw new ArgumentOutOfRangeException(nameof(page));
        var rows = await db.Set<DigitalMenu.Domain.Restaurant>().AsNoTracking()
            .Where(r => r.IsIndexable && r.IsPublished && r.Status == "Active" && !ReservedSlugs.Contains(r.Slug))
            .OrderBy(r => r.Slug)
            .Skip((page - 1) * PageSize).Take(PageSize + 1)
            .Select(r => new SitemapEntry(r.Slug, r.UpdatedAtUtc))
            .ToListAsync(ct);
        return new SitemapPage(page, PageSize, rows.Count > PageSize, rows.Take(PageSize).ToList());
    }
}
