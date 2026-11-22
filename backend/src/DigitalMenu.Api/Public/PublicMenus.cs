using System.Threading.RateLimiting;
using DigitalMenu.Application;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.Net.Http.Headers;

namespace DigitalMenu.Api.Public;

public sealed class PublicMenuMetadata;
public static class PublicMenus
{
    public static void AddPublicMenus(this IServiceCollection services)
    {
        services.AddScoped<IPublicMenuReader, PublicMenuReader>();
        // Dedicated byte-budgeted projection cache (see PublicMenuProjectionCache).
        services.AddSingleton<PublicMenuProjectionCache>();
        services.AddRateLimiter(o => o.AddPolicy("public-menu", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
    }
    public static void MapPublicMenus(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/public").AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());
        group.MapGet("/menus/{publicCode}", (string publicCode, string? lang, IPublicMenuReader reader, HttpContext http, CancellationToken ct) => Get(publicCode, false, lang, reader, http, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
        group.MapGet("/restaurants/by-slug/{slug}", (string slug, string? lang, IPublicMenuReader reader, HttpContext http, CancellationToken ct) => Get(slug, true, lang, reader, http, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
    }
    private static async Task<IResult> Get(string identifier, bool slug, string? language, IPublicMenuReader reader, HttpContext http, CancellationToken ct)
    {
        var locale = language ?? "ar";
        var valid = slug ? identifier.Length is >= 1 and <= 100 && identifier.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-') &&
            identifier[0] != '-' && identifier[^1] != '-' && !identifier.Contains("--", StringComparison.Ordinal)
            : identifier.Length == 20 && identifier.All(c => char.IsAsciiDigit(c) || c is >= 'a' and <= 'f');
        if (!valid || locale is not ("ar" or "en")) return Results.Problem(statusCode: 400, title: "Invalid public menu request.");
        try
        {
            var menu = await reader.ReadAsync(identifier, slug, locale, ct);
            if (menu is null) return Results.Problem(statusCode: 404, title: "Menu not found.");
            // The version is the invalidation key, so a strong ETag derived from
            // it revalidates against live state: a stale client copy can never
            // match. no-cache = store allowed, revalidate every time (304 saves
            // the body). 404/503 keep the middleware's no-store.
            var etag = new EntityTagHeaderValue("\"" + menu.PublishedMenuVersion + ":" + locale + "\"");
            http.Response.Headers.CacheControl = "no-cache";
            http.Response.Headers.ETag = etag.ToString();
            // Typed parsing: If-None-Match may carry a comma-separated list, weak
            // tags (W/...), or *. GET revalidation uses the weak comparison.
            var matches = http.Request.GetTypedHeaders().IfNoneMatch?.Any(candidate =>
                candidate.Equals(EntityTagHeaderValue.Any) || candidate.Compare(etag, useStrongComparison: false)) == true;
            if (matches) return Results.StatusCode(304);
            return Results.Ok(menu);
        }
        catch (PublicMenuUnavailableException) { return Results.Problem(statusCode: 503, title: "Menu temporarily unavailable."); }
    }
}
