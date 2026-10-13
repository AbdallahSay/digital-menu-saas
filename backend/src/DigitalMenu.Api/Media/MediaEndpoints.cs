using System.Threading.RateLimiting;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.AspNetCore.Http.Features;

namespace DigitalMenu.Api.Media;

public sealed class MediaUploadMetadata;
public sealed record ImageResponse(Guid Id, Guid MenuItemId, int Width, int Height, string ContentType, int SortOrder);
public static class MediaEndpoints
{
    public const long BodyLimit = ImageNormalizer.MaxBytes + 65536;
    public static void AddMenuMedia(this IServiceCollection services, IHostEnvironment environment, IConfiguration configuration)
    {
        services.AddSingleton<ImageNormalizer>();
        services.AddSingleton<IImageStorage>(s =>
        {
            if (!environment.IsDevelopment() || configuration["Media:LocalRoot"] is not { Length: > 0 } root) return new UnavailableImageStorage();
            var full = Path.GetFullPath(root);
            foreach (var protectedRoot in new[] { environment.ContentRootPath, AppContext.BaseDirectory })
                if (full.StartsWith(Path.GetFullPath(protectedRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(full, Path.GetFullPath(protectedRoot).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Media root must be outside application directories.");
            return new LocalImageStorage(root, s.GetRequiredService<ILogger<LocalImageStorage>>());
        });
        services.Configure<FormOptions>(o =>
        {
            o.MultipartBodyLengthLimit = BodyLimit;
            o.MultipartBoundaryLengthLimit = 128;
            o.ValueLengthLimit = 128;
            o.ValueCountLimit = 8;
        });
        services.AddRateLimiter(o =>
        {
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.GetEndpoint()?.Metadata.GetMetadata<MediaUploadMetadata>() is not null
                    ? RateLimitPartition.GetConcurrencyLimiter("media", _ => new ConcurrencyLimiterOptions { PermitLimit = 2, QueueLimit = 0 })
                    : RateLimitPartition.GetNoLimiter("other"));
            o.AddPolicy("media-upload", context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "anonymous", _ => new FixedWindowRateLimiterOptions
                { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
    }
    private static async Task<MenuItem> Item(ITenantDataSession session, Guid id, CancellationToken ct)
    {
        var item = await session.EditAsync<MenuItem>(id, ct);
        if (item.IsDeleted) throw new TenantBoundaryException(TenantFailure.NotFound);
        return item;
    }
    private static async Task Cleanup(IImageStorage storage, string key, ILogger logger)
    {
        try { await storage.RemoveAsync(key, CancellationToken.None); }
        catch (Exception) { logger.LogWarning("Private media cleanup pending."); }
    }
    public static void MapMenuMedia(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin/items/{id:guid}/images").RequireAuthorization("TenantOwner");
        group.MapPost("", async (Guid id, HttpContext context, ITenantDataSession session, ITenantContext tenants,
            ImageNormalizer normalizer, IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var item = await Item(session, id, ct);
            if (!context.Request.HasFormContentType || !context.Request.ContentType!.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase))
                throw new MediaException(415);
            if (context.Request.ContentLength > BodyLimit) throw new MediaException(413);
            context.Request.Body = new UploadReadStream(context.Request.Body, BodyLimit);
            IFormCollection form;
            try { form = await context.Request.ReadFormAsync(ct); }
            catch (InvalidDataException) { throw new MediaException(400); }
            if (form.Count != 0 || form.Files.Count != 1 || form.Files[0].Name != "file") throw new MediaException(400);
            var file = form.Files[0];
            if (file.Length > ImageNormalizer.MaxBytes) throw new MediaException(413);
            await using var input = file.OpenReadStream();
            using var bytes = new MemoryStream();
            var buffer = new byte[65536];
            int count;
            while ((count = await input.ReadAsync(buffer, ct)) > 0)
            {
                if (bytes.Length + count > ImageNormalizer.MaxBytes) throw new MediaException(413);
                await bytes.WriteAsync(buffer.AsMemory(0, count), ct);
            }
            var normalized = normalizer.Normalize(bytes.ToArray(), file.ContentType);
            var scope = await tenants.RequireAsync(ct);
            var image = new MenuItemImage
            {
                RestaurantId = scope.RestaurantId,
                MenuItemId = item.Id,
                ObjectKey = scope.RestaurantId.ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp",
                Width = normalized.Width,
                Height = normalized.Height,
                ContentType = "image/webp"
            };
            var logger = loggers.CreateLogger("MenuMedia");
            try { await storage.PutAsync(image.ObjectKey, normalized, ct); }
            catch (IOException) { throw new MediaException(503); }
            catch (UnauthorizedAccessException) { throw new MediaException(503); }
            try
            {
                await session.StageAsync(image, true, ct);
                item.UpdatedAtUtc = DateTime.UtcNow; // Serialize gallery operations with item edits/deletion.
                await session.CommitAsync(ct);
            }
            catch
            {
                // Commit outcome may be ambiguous after connection loss. Never delete a possibly committed object.
                try
                {
                    if ((await session.ReadAsync<MenuItemImage, Guid>(i => i.Id == image.Id, i => i.Id, 1, CancellationToken.None)).Count == 0)
                        await Cleanup(storage, image.ObjectKey, logger);
                }
                catch (Exception) { logger.LogWarning("Private media requires metadata reconciliation."); }
                throw;
            }
            return Results.Json(new ImageResponse(image.Id, item.Id, image.Width, image.Height, image.ContentType, image.SortOrder), statusCode: 201);
        }).RequireRateLimiting("media-upload").WithMetadata(new MediaUploadMetadata());
        group.MapDelete("/{imageId:guid}", async (Guid id, Guid imageId, HttpContext context, ITenantDataSession session,
            IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var item = await Item(session, id, ct);
            var image = await session.EditAsync<MenuItemImage>(imageId, ct);
            if (image.MenuItemId != item.Id) throw new TenantBoundaryException(TenantFailure.NotFound);
            if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding")) throw new MediaException(400);
            var key = image.ObjectKey;
            await session.DeleteAsync<MenuItemImage>(imageId, ct);
            item.UpdatedAtUtc = DateTime.UtcNow;
            await session.CommitAsync(ct);
            await Cleanup(storage, key, loggers.CreateLogger("MenuMedia"));
            return Results.NoContent();
        });
    }
}
