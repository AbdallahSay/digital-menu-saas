using System.Threading.RateLimiting;
using DigitalMenu.Api.Media;
using DigitalMenu.Application;
using Microsoft.Net.Http.Headers;

namespace DigitalMenu.Api.Public;

public sealed class PublicMenuMetadata;
public static class PublicMenus
{
    public static void AddPublicMenus(this IServiceCollection services)
    {
        services.AddScoped<IPublicMenuReader, DigitalMenu.Infrastructure.Persistence.PublicMenuReader>();
        services.AddScoped<IPublicMediaResolver, DigitalMenu.Infrastructure.Persistence.PublicMediaResolver>();
        services.AddRateLimiter(o => o.AddPolicy("public-menu", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
        // A menu page fetches many thumbnails; separate, larger budget so images cannot starve menu reads (and vice versa).
        services.AddRateLimiter(o => o.AddPolicy("public-media", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
    }
    public static void MapPublicMenus(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/public").AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());
        group.MapGet("/menus/{publicCode}", (string publicCode, string? lang, IPublicMenuReader reader, CancellationToken ct) => Get(publicCode, false, lang, reader, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
        group.MapGet("/restaurants/by-slug/{slug}", (string slug, string? lang, IPublicMenuReader reader, CancellationToken ct) => Get(slug, true, lang, reader, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
    }
    private static readonly string[] ReadMethods = ["GET", "HEAD"];
    public static void MapPublicMedia(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/public/media").AllowAnonymous().RequireRateLimiting("public-media").WithMetadata(new PublicMenuMetadata());
        group.MapMethods("/items/{imageId}/{file}", ReadMethods, async (string imageId, string file, HttpContext context,
            IPublicMediaResolver resolver, IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) =>
        {
            if (imageId.Length != 32 || !Guid.TryParseExact(imageId, "N", out var id) || imageId != id.ToString("N") || Variant(file) is not { } variant)
                return Invalid();
            return await Serve(context, () => resolver.ResolveItemImageAsync(id, ct), variant, imageId, storage, loggers, ct);
        }).Produces(200, contentType: "image/webp").ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
        group.MapMethods("/restaurants/{publicCode}/{kind}/{token}/{file}", ReadMethods, async (string publicCode, string kind, string token, string file,
            HttpContext context, IPublicMediaResolver resolver, IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) =>
        {
            BrandingImageKind? brand = kind switch { "logo" => BrandingImageKind.Logo, "cover" => BrandingImageKind.Cover, _ => null };
            if (!ValidCode(publicCode) || brand is null || !PublicMedia.IsToken(token) || Variant(file) is not { } variant) return Invalid();
            return await Serve(context, () => resolver.ResolveBrandingImageAsync(publicCode, brand.Value, token, ct), variant, kind[0] + token, storage, loggers, ct);
        }).Produces(200, contentType: "image/webp").ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
    }
    private static PublicImageVariant? Variant(string file) => file switch
    {
        "main.webp" => PublicImageVariant.Main,
        "thumb.webp" => PublicImageVariant.Thumbnail,
        _ => null
    };
    private static IResult Invalid() => Results.Problem(statusCode: 400, title: "Invalid image request.");
    private static IResult NotFound() => Results.Problem(statusCode: 404, title: "Image not found.");
    private static async Task<IResult> Serve(HttpContext context, Func<Task<string?>> resolve, PublicImageVariant variant, string tag,
        IImageStorage storage, ILoggerFactory loggers, CancellationToken ct)
    {
        string? key;
        try { key = await resolve(); }
        catch (PublicMenuUnavailableException) { return Results.Problem(statusCode: 503, title: "Image temporarily unavailable."); }
        // Unknown, foreign, unpublished, unavailable, deleted and replaced images are indistinguishable 404s (no-store).
        if (key is null) return NotFound();
        var stream = await storage.OpenReadAsync(key, variant, ct);
        if (stream is null)
        {
            loggers.CreateLogger("PublicMedia").LogWarning("Public media object missing; metadata reconciliation required.");
            return NotFound();
        }
        // Object keys are immutable, so a URL's bytes never change: strong ETag + long-lived immutable caching.
        context.Response.Headers.CacheControl = PublicMedia.CacheControl;
        context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-site";
        return Results.Stream(stream, "image/webp", entityTag: new EntityTagHeaderValue("\"" + tag + (variant == PublicImageVariant.Main ? "m" : "t") + "\""));
    }
    private static bool ValidCode(string code) => code.Length == 20 && code.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');
    private static async Task<IResult> Get(string identifier, bool slug, string? language, IPublicMenuReader reader, CancellationToken ct)
    {
        var locale = language ?? "ar";
        var valid = slug ? identifier.Length is >= 1 and <= 100 && identifier.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-') &&
            identifier[0] != '-' && identifier[^1] != '-' && !identifier.Contains("--", StringComparison.Ordinal)
            : identifier.Length == 20 && identifier.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');
        if (!valid || locale is not ("ar" or "en")) return Results.Problem(statusCode: 400, title: "Invalid public menu request.");
        try
        {
            var menu = await reader.ReadAsync(identifier, slug, locale, ct);
            return menu is null ? Results.Problem(statusCode: 404, title: "Menu not found.") : Results.Ok(menu);
        }
        catch (PublicMenuUnavailableException) { return Results.Problem(statusCode: 503, title: "Menu temporarily unavailable."); }
    }
}
