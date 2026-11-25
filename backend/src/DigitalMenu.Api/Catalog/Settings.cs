using System.Text.Json.Serialization;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Api.Media;

namespace DigitalMenu.Api.Catalog;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateSettingsRequest(string? PrimaryColor, string? RowVersion, string? Theme = null,
    string? BrandLabel = null, string? TaglineAr = null, string? TaglineEn = null);
public sealed record SettingsResponse(string Name, string Slug, string PublicCode, string PrimaryColor,
    bool HasLogo, string? LogoUrl, string RowVersion, string Theme = "classic", string? BrandLabel = null,
    string? TaglineAr = null, string? TaglineEn = null);

/// <summary>
/// Owner restaurant settings (Screen 5/6 backing contract): reads the tenant's
/// identity, permanent public code, brand color and logo; updates the brand
/// color under the same rowVersion optimistic-concurrency contract as the
/// catalog. Logo upload/read/delete lands with the media delivery phase.
/// </summary>
public static class Settings
{
    private sealed record RestaurantIdentity(string Name, string Slug, string PublicCode);
    private sealed record SettingsRow(string PrimaryColor, bool HasLogo, string RowVersion, string Theme,
        string? BrandLabel, string? TaglineAr, string? TaglineEn);
    /// <summary>Admin read URL for the stored logo; null when none is stored.</summary>
    private static string? LogoUrl(bool hasLogo) => hasLogo ? "/api/v1/admin/settings/logo" : null;

    private static byte[] Version(string? value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value ?? "");
            if (bytes.Length == 8) return bytes;
        }
        catch (FormatException) { }
        throw new TenantBoundaryException(TenantFailure.InvalidRequest);
    }

    /// <summary>Accepts #rgb or #rrggbb and normalizes to lowercase #rrggbb; anything else is invalid.</summary>
    private static string NormalizeColor(string? value)
    {
        var text = value?.Trim() ?? "";
        if (text.Length == 4 && text[0] == '#')
            text = string.Concat("#", text[1], text[1], text[2], text[2], text[3], text[3]);
        if (text.Length != 7 || text[0] != '#' || !text.Skip(1).All(char.IsAsciiHexDigit))
            throw new TenantBoundaryException(TenantFailure.InvalidRequest);
        return text.ToLowerInvariant();
    }

    public static void MapSettings(this WebApplication app)
    {
        var group = app.MapGroup("/api/v1/admin/settings").RequireAuthorization("TenantOwner");
        group.MapGet("", async (ITenantDataSession session, CancellationToken ct) =>
        {
            var restaurants = await session.ReadAsync<Restaurant, RestaurantIdentity>(
                r => true, r => new RestaurantIdentity(r.Name, r.Slug, r.PublicCode), 1, ct);
            var settings = await session.ReadAsync<RestaurantSettings, SettingsRow>(
                s => true, s => new SettingsRow(s.PrimaryColor, s.LogoObjectKey != null, Convert.ToBase64String(s.RowVersion),
                    s.Theme, s.BrandLabel, s.TaglineAr, s.TaglineEn), 1, ct);
            if (restaurants.Count == 0 || settings.Count == 0)
                throw new TenantBoundaryException(TenantFailure.NotFound);
            return Results.Ok(new SettingsResponse(restaurants[0].Name, restaurants[0].Slug,
                restaurants[0].PublicCode, settings[0].PrimaryColor, settings[0].HasLogo,
                LogoUrl(settings[0].HasLogo), settings[0].RowVersion, settings[0].Theme, settings[0].BrandLabel,
                settings[0].TaglineAr, settings[0].TaglineEn));
        });
        group.MapPut("", async (UpdateSettingsRequest request, ITenantContext tenants,
            ITenantDataSession session, CancellationToken ct) =>
        {
            var scope = await tenants.RequireAsync(ct);
            var settings = await session.EditAsync<RestaurantSettings>(scope.RestaurantId, Version(request.RowVersion), ct);
            var normalized = NormalizeColor(request.PrimaryColor);
            // A same-color save (any casing) changes nothing: no modification,
            // no rowVersion rotation, no publication-version churn.
            if (!string.Equals(settings.PrimaryColor, normalized, StringComparison.OrdinalIgnoreCase))
                settings.PrimaryColor = normalized;
            // Presentation fields: null means unchanged (old clients), empty text clears, values are validated.
            if (request.Theme is not null)
            {
                if (request.Theme is not ("classic" or "cafe")) throw new TenantBoundaryException(TenantFailure.InvalidRequest);
                if (settings.Theme != request.Theme) settings.Theme = request.Theme;
            }
            static string? Clean(string? text, int max)
            {
                var value = text?.Trim();
                if (value is not null && (value.Length > max || value.Any(char.IsControl))) throw new TenantBoundaryException(TenantFailure.InvalidRequest);
                return string.IsNullOrEmpty(value) ? null : value;
            }
            if (request.BrandLabel is not null && Clean(request.BrandLabel, 40) != settings.BrandLabel) settings.BrandLabel = Clean(request.BrandLabel, 40);
            if (request.TaglineAr is not null && Clean(request.TaglineAr, 120) != settings.TaglineAr) settings.TaglineAr = Clean(request.TaglineAr, 120);
            if (request.TaglineEn is not null && Clean(request.TaglineEn, 120) != settings.TaglineEn) settings.TaglineEn = Clean(request.TaglineEn, 120);
            await session.CommitAsync(ct);
            var restaurants = await session.ReadAsync<Restaurant, RestaurantIdentity>(
                r => true, r => new RestaurantIdentity(r.Name, r.Slug, r.PublicCode), 1, ct);
            return Results.Ok(new SettingsResponse(restaurants[0].Name, restaurants[0].Slug,
                restaurants[0].PublicCode, settings.PrimaryColor, settings.LogoObjectKey != null,
                LogoUrl(settings.LogoObjectKey != null), Convert.ToBase64String(settings.RowVersion), settings.Theme,
                settings.BrandLabel, settings.TaglineAr, settings.TaglineEn));
        });

        // Logo upload/read-back (media delivery phase). Same normalization and
        // limits as item images; the logo projects into the public menu, so
        // committing a change bumps the published menu version (CommitAsync).
        group.MapPost("/logo", async (HttpContext context, ITenantContext tenants,
            ITenantDataSession session, ImageNormalizer normalizer, IImageStorage storage,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var scope = await tenants.RequireAsync(ct);
            if (!context.Request.HasFormContentType || !context.Request.ContentType!.StartsWith("multipart/form-data", StringComparison.OrdinalIgnoreCase))
                throw new MediaException(415);
            if (context.Request.ContentLength > MediaEndpoints.BodyLimit) throw new MediaException(413);
            context.Request.Body = new UploadReadStream(context.Request.Body, MediaEndpoints.BodyLimit);
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
            var settings = await session.EditAsync<RestaurantSettings>(scope.RestaurantId, ct);
            var previous = settings.LogoObjectKey;
            var key = scope.RestaurantId.ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
            var logger = loggers.CreateLogger("RestaurantLogo");
            try { await storage.PutAsync(key, normalized, ct); }
            catch (IOException) { throw new MediaException(503); }
            catch (UnauthorizedAccessException) { throw new MediaException(503); }
            settings.LogoObjectKey = key;
            try { await session.CommitAsync(ct); }
            catch
            {
                // Commit outcome may be ambiguous after connection loss. Never
                // delete a possibly committed object; clean up only when the
                // stored key definitely does not reference it.
                try
                {
                    var stored = await session.ReadAsync<RestaurantSettings, string?>(s => true, s => s.LogoObjectKey, 1, CancellationToken.None);
                    if (stored.Count > 0 && stored[0] != key)
                        await MediaEndpoints.CleanupObject(storage, key, logger);
                }
                catch (Exception) { logger.LogWarning("Private media requires metadata reconciliation."); }
                throw;
            }
            if (previous is not null) await MediaEndpoints.CleanupObject(storage, previous, logger);
            var restaurants = await session.ReadAsync<Restaurant, RestaurantIdentity>(
                r => true, r => new RestaurantIdentity(r.Name, r.Slug, r.PublicCode), 1, ct);
            return Results.Ok(new SettingsResponse(restaurants[0].Name, restaurants[0].Slug,
                restaurants[0].PublicCode, settings.PrimaryColor, true, LogoUrl(true),
                Convert.ToBase64String(settings.RowVersion)));
        }).RequireRateLimiting("media-upload").WithMetadata(new MediaUploadMetadata());

        group.MapGet("/logo", async (HttpContext context, ITenantDataSession session,
            IImageStorage storage, CancellationToken ct) =>
        {
            if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding"))
                throw new MediaException(400);
            var keys = await session.ReadAsync<RestaurantSettings, string?>(s => true, s => s.LogoObjectKey, 1, ct);
            if (keys.Count == 0 || keys[0] is null) throw new TenantBoundaryException(TenantFailure.NotFound);
            var bytes = await storage.GetAsync(keys[0]!, "main", ct);
            if (bytes is null) throw new MediaException(404);
            // The admin logo URL is stable across replacement and deletion, so
            // it must never be cached: every read revalidates against origin.
            context.Response.Headers.CacheControl = "private, no-cache";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(bytes, "image/webp");
        });

        group.MapDelete("/logo", async (HttpContext context, ITenantContext tenants,
            ITenantDataSession session, IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) =>
        {
            if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding"))
                throw new MediaException(400);
            var scope = await tenants.RequireAsync(ct);
            var settings = await session.EditAsync<RestaurantSettings>(scope.RestaurantId, ct);
            if (settings.LogoObjectKey is null) throw new TenantBoundaryException(TenantFailure.NotFound);
            var key = settings.LogoObjectKey;
            settings.LogoObjectKey = null;
            await session.CommitAsync(ct);
            await MediaEndpoints.CleanupObject(storage, key, loggers.CreateLogger("RestaurantLogo"));
            return Results.NoContent();
        });
    }
}
