using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.Extensions.Options;

namespace DigitalMenu.Api.Owner;

/// <summary>Trusted configuration only (<c>PublicSite:Origin</c>); never derived from Host or forwarded headers.</summary>
public sealed class PublicSiteOptions
{
    public string? Origin { get; set; }

    /// <summary>Bare HTTPS origin, or explicit HTTP loopback for local work; anything else is treated as unconfigured.</summary>
    public string? Validated()
    {
        if (!Uri.TryCreate(Origin, UriKind.Absolute, out var uri) || uri.UserInfo.Length > 0 || uri.AbsolutePath != "/" ||
            uri.Query.Length > 0 || uri.Fragment.Length > 0 || Origin!.Length > 100 ||
            !(uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback)))
            return null;
        return uri.GetLeftPart(UriPartial.Authority);
    }
}

public sealed record QrResponse(string PublicUrl, string CanonicalUrl, bool IsPublished, string SvgUrl, string PngUrl);
public sealed record CategoryCounts(int Total, int Published);
public sealed record ItemCounts(int Total, int Published, int Unavailable);
public sealed record SummaryResponse(string Name, string Slug, bool IsPublished, string? PublicUrl, string? CanonicalUrl,
    CategoryCounts Categories, ItemCounts Items);
internal sealed record RestaurantLink(string Name, string Slug, string PublicCode, bool IsPublished);

public static class OwnerUtilities
{
    public const int PngScale = 16;

    public static IServiceCollection AddOwnerUtilities(this IServiceCollection services, IConfiguration configuration) =>
        services.Configure<PublicSiteOptions>(configuration.GetSection("PublicSite"));

    private static async Task<RestaurantLink> Restaurant(ITenantDataSession session, CancellationToken ct) =>
        (await session.ReadAsync<Restaurant, RestaurantLink>(_ => true,
            r => new RestaurantLink(r.Name, r.Slug, r.PublicCode, r.IsPublished), 1, ct)).SingleOrDefault()
        ?? throw new TenantBoundaryException(TenantFailure.NotFound);

    private static string PublicUrl(string origin, RestaurantLink r) => origin + "/m/" + Uri.EscapeDataString(r.PublicCode);
    private static string CanonicalUrl(string origin, RestaurantLink r) => origin + "/r/" + Uri.EscapeDataString(r.Slug);
    private static IResult Unconfigured() => Results.Problem(statusCode: 503, title: "Public site origin is not configured.");

    public static void MapOwnerUtilities(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin").RequireAuthorization("TenantOwner");

        group.MapGet("/qr", async (ITenantDataSession session, IOptionsSnapshot<PublicSiteOptions> site, CancellationToken ct) =>
        {
            if (site.Value.Validated() is not { } origin) return Unconfigured();
            var restaurant = await Restaurant(session, ct);
            return Results.Ok(new QrResponse(PublicUrl(origin, restaurant), CanonicalUrl(origin, restaurant),
                restaurant.IsPublished, "/api/v1/admin/qr/svg", "/api/v1/admin/qr/png"));
        }).Produces<QrResponse>().ProducesProblem(401).ProducesProblem(403).ProducesProblem(503);

        // The QR always encodes the permanent /m/{publicCode} alias, so renaming the slug never breaks print.
        group.MapGet("/qr/{format}", async (string format, ITenantDataSession session, IOptionsSnapshot<PublicSiteOptions> site,
            HttpContext context, CancellationToken ct) =>
        {
            if (format is not ("svg" or "png")) return Results.Problem(statusCode: 404, title: "Resource not found.");
            if (site.Value.Validated() is not { } origin) return Unconfigured();
            var restaurant = await Restaurant(session, ct);
            var code = QrCode.EncodeText(PublicUrl(origin, restaurant));
            // Slug is constrained to [a-z0-9-] by provisioning and a SQL check constraint.
            context.Response.Headers.ContentDisposition = $"attachment; filename=\"{restaurant.Slug}-qr.{format}\"";
            return format == "svg"
                ? Results.Text(code.ToSvg(), "image/svg+xml", System.Text.Encoding.UTF8)
                : Results.Bytes(code.ToPng(PngScale), "image/png");
        }).Produces(200, contentType: "image/svg+xml").Produces(200, contentType: "image/png")
          .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(503);

        group.MapGet("/summary", async (ITenantDataSession session, IOptionsSnapshot<PublicSiteOptions> site, CancellationToken ct) =>
        {
            var restaurant = await Restaurant(session, ct);
            var origin = site.Value.Validated();
            var categories = new CategoryCounts(
                await session.CountAsync<Category>(c => !c.IsDeleted, ct),
                await session.CountAsync<Category>(c => !c.IsDeleted && c.IsPublished, ct));
            var items = new ItemCounts(
                await session.CountAsync<MenuItem>(i => !i.IsDeleted, ct),
                await session.CountAsync<MenuItem>(i => !i.IsDeleted && i.IsPublished, ct),
                await session.CountAsync<MenuItem>(i => !i.IsDeleted && !i.IsAvailable, ct));
            return Results.Ok(new SummaryResponse(restaurant.Name, restaurant.Slug, restaurant.IsPublished,
                origin is null ? null : PublicUrl(origin, restaurant), origin is null ? null : CanonicalUrl(origin, restaurant),
                categories, items));
        }).Produces<SummaryResponse>().ProducesProblem(401).ProducesProblem(403);
    }
}
