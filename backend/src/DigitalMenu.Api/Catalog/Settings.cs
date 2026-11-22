using System.Text.Json.Serialization;
using DigitalMenu.Application;
using DigitalMenu.Domain;

namespace DigitalMenu.Api.Catalog;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record UpdateSettingsRequest(string? PrimaryColor, string? RowVersion);
public sealed record SettingsResponse(string Name, string Slug, string PublicCode, string PrimaryColor,
    bool HasLogo, string RowVersion);

/// <summary>
/// Owner restaurant settings (Screen 5/6 backing contract): reads the tenant's
/// identity, permanent public code and brand color; updates the brand color
/// under the same rowVersion optimistic-concurrency contract as the catalog.
/// Logo upload/read-back intentionally lands with the media delivery phase;
/// HasLogo only reports whether one is stored.
/// </summary>
public static class Settings
{
    private sealed record RestaurantIdentity(string Name, string Slug, string PublicCode);
    private sealed record SettingsRow(string PrimaryColor, bool HasLogo, string RowVersion);

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
                s => true, s => new SettingsRow(s.PrimaryColor, s.LogoObjectKey != null, Convert.ToBase64String(s.RowVersion)), 1, ct);
            if (restaurants.Count == 0 || settings.Count == 0)
                throw new TenantBoundaryException(TenantFailure.NotFound);
            return Results.Ok(new SettingsResponse(restaurants[0].Name, restaurants[0].Slug,
                restaurants[0].PublicCode, settings[0].PrimaryColor, settings[0].HasLogo, settings[0].RowVersion));
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
            await session.CommitAsync(ct);
            var restaurants = await session.ReadAsync<Restaurant, RestaurantIdentity>(
                r => true, r => new RestaurantIdentity(r.Name, r.Slug, r.PublicCode), 1, ct);
            return Results.Ok(new SettingsResponse(restaurants[0].Name, restaurants[0].Slug,
                restaurants[0].PublicCode, settings.PrimaryColor, settings.LogoObjectKey != null,
                Convert.ToBase64String(settings.RowVersion)));
        });
    }
}
