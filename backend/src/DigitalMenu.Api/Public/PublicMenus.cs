using System.Threading.RateLimiting;
using DigitalMenu.Application;

namespace DigitalMenu.Api.Public;

public sealed class PublicMenuMetadata;
public static class PublicMenus
{
    public static void AddPublicMenus(this IServiceCollection services)
    {
        services.AddScoped<IPublicMenuReader, DigitalMenu.Infrastructure.Persistence.PublicMenuReader>();
        services.AddRateLimiter(o => o.AddPolicy("public-menu", context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
            { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })));
    }
    public static void MapPublicMenus(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/public").AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());
        group.MapGet("/menus/{publicCode}", (string publicCode, string? lang, IPublicMenuReader reader, CancellationToken ct) => Get(publicCode, false, lang, reader, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
        group.MapGet("/restaurants/by-slug/{slug}", (string slug, string? lang, IPublicMenuReader reader, CancellationToken ct) => Get(slug, true, lang, reader, ct))
            .Produces<PublicMenu>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503);
    }
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
