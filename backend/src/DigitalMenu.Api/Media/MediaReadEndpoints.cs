using DigitalMenu.Api.Public;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.Api.Media;

/// <summary>
/// Image read-back (media delivery phase). Public URLs carry only opaque,
/// random object ids - never the internal restaurant Guid, which the public
/// projection contract forbids leaking. The anonymous endpoints serve an
/// object only while its owning restaurant is Active and published -
/// id unguessability is never the authorization barrier. Keys are
/// server-random and immutable (create-new), so successful public responses
/// are immutable-cacheable; admin reads stay private. Every response is
/// normalized webp with nosniff; failures go through MediaProblemHandler.
/// </summary>
public static class MediaReadEndpoints
{
    public static void MapMenuMediaReads(this WebApplication app)
    {
        // Public item images, addressed by the image's own random id. A known
        // id serves only while the image would appear in the public menu: the
        // item is published, not deleted and available (a sold-out item leaves
        // the menu, so its images stop serving too), its category is published
        // and not deleted, and the restaurant is Active and published. Every
        // join carries the tenant id so a cross-tenant MenuItemId can never
        // validate an image. Random ids are unguessability, never the
        // authorization barrier.
        app.MapGet("/api/v1/public/media/items/{imageId:guid}/{variant}",
            async (Guid imageId, string variant, HttpContext context,
                MenuDbContext db, IImageStorage storage, CancellationToken ct) =>
            {
                if (variant is not ("main" or "thumbnail")) throw new MediaException(400);
                var key = await db.Set<MenuItemImage>().AsNoTracking()
                    .Where(img => img.Id == imageId)
                    .Join(db.Set<MenuItem>().AsNoTracking().Where(i => i.IsPublished && !i.IsDeleted && i.IsAvailable),
                        img => new { img.RestaurantId, Id = img.MenuItemId }, i => new { i.RestaurantId, i.Id },
                        (img, i) => new { img.RestaurantId, img.ObjectKey, i.CategoryId })
                    .Join(db.Set<Category>().AsNoTracking().Where(c => c.IsPublished && !c.IsDeleted),
                        x => new { x.RestaurantId, Id = x.CategoryId }, c => new { c.RestaurantId, c.Id },
                        (x, c) => new { x.RestaurantId, x.ObjectKey })
                    .Join(db.Set<Restaurant>().AsNoTracking().Where(r => r.Status == "Active" && r.IsPublished),
                        x => x.RestaurantId, r => r.Id, (x, r) => x.ObjectKey)
                    .SingleOrDefaultAsync(ct);
                if (key is null) throw new MediaException(404);
                var bytes = await storage.GetAsync(key, variant, ct);
                if (bytes is null) throw new MediaException(404);
                // Keys are create-new and immutable, so content under an id never
                // changes; the accepted stale window for hidden/suspended content
                // already cached by a client is one hour. The origin refuses all
                // fresh requests immediately (see the visibility matrix above).
                context.Response.Headers.CacheControl = "public, max-age=3600, immutable";
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return Results.File(bytes, "image/webp");
            })
            .AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());

        // Public restaurant logo, addressed by the already-public code.
        app.MapGet("/api/v1/public/media/logo/{publicCode}",
            async (string publicCode, HttpContext context,
                MenuDbContext db, IImageStorage storage, CancellationToken ct) =>
            {
                if (publicCode.Length != 20 || !publicCode.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f'))
                    throw new MediaException(400);
                var key = await db.Set<Restaurant>().AsNoTracking()
                    .Where(r => r.PublicCode == publicCode && r.Status == "Active" && r.IsPublished)
                    .Join(db.Set<RestaurantSettings>().AsNoTracking(),
                        r => r.Id, s => s.RestaurantId, (r, s) => s.LogoObjectKey)
                    .SingleOrDefaultAsync(ct);
                if (key is null) throw new MediaException(404);
                var bytes = await storage.GetAsync(key, "main", ct);
                if (bytes is null) throw new MediaException(404);
                // The logo is replaceable under this stable URL, so it is NOT
                // immutable-cacheable; the accepted stale window after a logo
                // change is five minutes.
                context.Response.Headers.CacheControl = "public, max-age=300";
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return Results.File(bytes, "image/webp");
            })
            .AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());

        // Public restaurant hero image, addressed by the already-public code.
        app.MapGet("/api/v1/public/media/hero/{publicCode}",
            async (string publicCode, HttpContext context,
                MenuDbContext db, IImageStorage storage, CancellationToken ct) =>
            {
                if (publicCode.Length != 20 || !publicCode.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f'))
                    throw new MediaException(400);
                var key = await db.Set<Restaurant>().AsNoTracking()
                    .Where(r => r.PublicCode == publicCode && r.Status == "Active" && r.IsPublished)
                    .Join(db.Set<RestaurantSettings>().AsNoTracking(),
                        r => r.Id, s => s.RestaurantId, (r, s) => s.CoverObjectKey)
                    .SingleOrDefaultAsync(ct);
                if (key is null) throw new MediaException(404);
                var bytes = await storage.GetAsync(key, "main", ct);
                if (bytes is null) throw new MediaException(404);
                // The hero image is replaceable under this stable URL, so it is NOT
                // immutable-cacheable; the accepted stale window after a logo
                // change is five minutes.
                context.Response.Headers.CacheControl = "public, max-age=300";
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return Results.File(bytes, "image/webp");
            })
            .AllowAnonymous().RequireRateLimiting("public-menu").WithMetadata(new PublicMenuMetadata());

        // Authenticated owner read for catalog thumbnails of unpublished items.
        app.MapGet("/api/v1/admin/media/items/{imageId:guid}/{variant}",
            async (Guid imageId, string variant, HttpContext context,
                ITenantDataSession session, IImageStorage storage, CancellationToken ct) =>
            {
                if (variant is not ("main" or "thumbnail")) throw new MediaException(400);
                var keys = await session.ReadAsync<MenuItemImage, string>(i => i.Id == imageId, i => i.ObjectKey, 1, ct);
                if (keys.Count == 0) throw new TenantBoundaryException(TenantFailure.NotFound);
                var bytes = await storage.GetAsync(keys[0], variant, ct);
                if (bytes is null) throw new MediaException(404);
                context.Response.Headers.CacheControl = "private, max-age=86400, immutable";
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return Results.File(bytes, "image/webp");
            })
            .RequireAuthorization("TenantOwner");
    }
}
