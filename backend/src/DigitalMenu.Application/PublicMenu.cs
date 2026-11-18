using System.Security.Cryptography;
using System.Text;

namespace DigitalMenu.Application;

// Public image reference. URLs are opaque server routes; storage object keys never leave the server.
public sealed record PublicImage(string Url, int Width, int Height, string ThumbnailUrl, int ThumbnailWidth, int ThumbnailHeight, string Alt);
public sealed record PublicRestaurant(string Name, string Slug, string PrimaryColor, string Currency, string ThemeKey, PublicImage? Logo, PublicImage? Cover);
public sealed record PublicItem(Guid Id, string Name, string Description, decimal Price, PublicImage? PrimaryImage, IReadOnlyList<PublicImage> Gallery);
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

public enum PublicImageVariant { Main, Thumbnail }
public enum BrandingImageKind { Logo, Cover }

// Resolves a currently-public image to its private object key. Returns null for anything not publicly visible now.
public interface IPublicMediaResolver
{
    Task<string?> ResolveItemImageAsync(Guid imageId, CancellationToken ct);
    Task<string?> ResolveBrandingImageAsync(string publicCode, BrandingImageKind kind, string token, CancellationToken ct);
}

public static class PublicMedia
{
    public const int MainMaxSide = 1600;
    public const int ThumbnailMaxSide = 480;
    public const int MaxImagesPerItem = 8;
    // Shared caches revalidate within ten minutes so unpublish/delete reaches CDNs promptly; browsers keep immutable copies.
    public const string CacheControl = "public, max-age=31536000, s-maxage=600, immutable";

    // Canonical server-generated key: {restaurantId:D}/{randomGuid:N}.webp, bound to the owning tenant.
    public static bool IsCanonicalKey(string? key, Guid restaurantId)
    {
        if (key is null || key.Length != 74 || restaurantId == Guid.Empty) return false;
        var prefix = restaurantId.ToString("D") + "/";
        if (!key.StartsWith(prefix, StringComparison.Ordinal) || !key.EndsWith(".webp", StringComparison.Ordinal)) return false;
        var random = key.AsSpan(37, 32);
        return Guid.TryParseExact(random, "N", out var id) && id != Guid.Empty && random.SequenceEqual(id.ToString("N"));
    }

    // Opaque, non-reversible, content-stable token: changes whenever the (immutable) object key changes.
    public static string BrandingToken(string key) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)))[..32];

    public static bool IsToken(string token) =>
        token.Length == 32 && token.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');

    // Mirrors ImageNormalizer scaling. Thumbnail is derived from main dimensions (may differ by 1px from the encoded file).
    public static (int Width, int Height) Thumbnail(int width, int height)
    {
        var scale = Math.Min(1d, (double)ThumbnailMaxSide / Math.Max(width, height));
        return (Math.Max(1, (int)Math.Round(width * scale)), Math.Max(1, (int)Math.Round(height * scale)));
    }

    public static string FileName(PublicImageVariant variant) => variant == PublicImageVariant.Main ? "main.webp" : "thumb.webp";

    public static PublicImage ItemImage(Guid imageId, int width, int height, string alt) =>
        Create("/api/v1/public/media/items/" + imageId.ToString("N") + "/", width, height, alt);

    public static PublicImage BrandingImage(string publicCode, BrandingImageKind kind, string key, int width, int height, string alt) =>
        Create("/api/v1/public/media/restaurants/" + publicCode + "/" + (kind == BrandingImageKind.Logo ? "logo" : "cover") + "/" + BrandingToken(key) + "/",
            width, height, alt);

    private static PublicImage Create(string prefix, int width, int height, string alt)
    {
        var thumb = Thumbnail(width, height);
        return new(prefix + FileName(PublicImageVariant.Main), width, height, prefix + FileName(PublicImageVariant.Thumbnail), thumb.Width, thumb.Height, alt);
    }
}
