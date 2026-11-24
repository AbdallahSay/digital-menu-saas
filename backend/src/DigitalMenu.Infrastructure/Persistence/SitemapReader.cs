using DigitalMenu.Application;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Infrastructure.Persistence;

// Cross-tenant by design and deliberately narrow: only opted-in, published, active tenants, and
// only slug plus last-modified. It uses the public (unscoped) context, same as PublicMenuReader,
// and projects no other column.
public sealed class SitemapReader(MenuDbContext db, int maxPage = SitemapReader.MaxPage) : ISitemapReader
{
    public const int PageSize = 1000;
    // Supported-cap policy: at most MaxPage x PageSize = 100 million listed tenants. The cap only
    // bounds Skip() arithmetic. Past it, tenants are not enumerable: the last page reports
    // Truncated = true and HasMore = false instead of advertising a page that is rejected. No
    // sitemap index or cursor exists yet; that is unimplemented, not promised.
    public const int MaxPage = 100_000;
    // Paths the frontend resolves to static pages before the tenant route, so a tenant with such a
    // slug is never the page served there and must not be listed.
    public static readonly string[] ReservedSlugs = ["demo"];

    public async Task<SitemapPage> ReadAsync(int page, CancellationToken ct)
    {
        if (page < 1 || page > maxPage) throw new ArgumentOutOfRangeException(nameof(page));
        var rows = await db.Set<DigitalMenu.Domain.Restaurant>().AsNoTracking()
            .Where(r => r.IsIndexable && r.IsPublished && r.Status == "Active" && !ReservedSlugs.Contains(r.Slug))
            .OrderBy(r => r.Slug)
            .Skip((page - 1) * PageSize).Take(PageSize + 1)
            .Select(r => new SitemapEntry(r.Slug, r.UpdatedAtUtc))
            .ToListAsync(ct);
        var more = rows.Count > PageSize;
        var atCap = page == maxPage;
        return new SitemapPage(page, PageSize, more && !atCap, more && atCap, rows.Take(PageSize).ToList());
    }
}
