namespace DigitalMenu.Application;

public sealed record PublicRestaurant(string Name, string Slug, string PrimaryColor, string Currency, string? LogoUrl);
public sealed record PublicItemImage(string Url, string ThumbnailUrl, string Alt, int Width, int Height);
public sealed record PublicItem(Guid Id, string Name, string Description, decimal Price, PublicItemImage? Image);
public sealed record PublicCategory(Guid Id, string Name, IReadOnlyList<PublicItem> Items);
public sealed record PublicMenu(PublicRestaurant Restaurant, string Language, long PublishedMenuVersion, IReadOnlyList<PublicCategory> Categories);
public interface IPublicMenuReader
{
    Task<PublicMenu?> ReadAsync(string identifier, bool bySlug, string language, CancellationToken ct);
}
public sealed class PublicMenuUnavailableException : Exception
{
    public PublicMenuUnavailableException() : base("Public menu unavailable.") { }
}

// Sitemap listing. Exposes slug and last-modified only, for owner-opted-in, published, active tenants.
public sealed record SitemapEntry(string Slug, DateTime LastModifiedUtc);
public sealed record SitemapPage(int Page, int PageSize, bool HasMore, IReadOnlyList<SitemapEntry> Entries);
public interface ISitemapReader
{
    Task<SitemapPage> ReadAsync(int page, CancellationToken ct);
}
