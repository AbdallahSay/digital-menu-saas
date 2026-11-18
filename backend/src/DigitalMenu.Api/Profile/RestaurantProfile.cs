using System.Text.Json;
using System.Text.RegularExpressions;
using DigitalMenu.Api.Media;
using DigitalMenu.Application;
using DigitalMenu.Domain;

namespace DigitalMenu.Api.Profile;

// Owner view only. Never includes RestaurantId, user IDs, Status internals or media object keys.
public sealed record RestaurantProfileResponse(string Name, string Slug, string PublicCode, bool IsPublished,
    string? Description, string? Phone, string? Address, bool PublishPhone, bool PublishAddress,
    string DefaultLocale, string PrimaryColor, string ThemeKey, bool HasLogo, bool HasCover, string RowVersion);

public static partial class RestaurantProfile
{
    public const string Route = "/api/v1/admin/restaurant";
    public static readonly string[] Themes = ["grill", "cafe"];
    private static readonly string[] Fields = ["name", "description", "phone", "address", "publishPhone", "publishAddress",
        "defaultLocale", "primaryColor", "themeKey", "rowVersion"];

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex ColorPattern();
    // Display-only business phone: optional leading +, digits, spaces, parentheses and hyphens.
    [GeneratedRegex(@"^\+?[0-9 ()\-]{3,32}$")]
    private static partial Regex PhonePattern();

    private static TenantBoundaryException Invalid() => new(TenantFailure.InvalidRequest);

    private static RestaurantProfileResponse Response(Restaurant r, RestaurantSettings s) => new(r.Name, r.Slug, r.PublicCode,
        r.IsPublished, s.Description, s.ContactPhoneOptional, s.AddressOptional,
        (s.PublishedContactDetailsFlags & RestaurantSettings.PublishPhone) != 0,
        (s.PublishedContactDetailsFlags & RestaurantSettings.PublishAddress) != 0,
        s.DefaultLocale, s.PrimaryColor, s.ThemeKey, s.LogoObjectKey is not null, s.CoverObjectKey is not null,
        Convert.ToBase64String(s.RowVersion));

    private static async Task<(Restaurant Restaurant, RestaurantSettings Settings)> Load(ITenantContext tenants,
        ITenantDataSession session, byte[]? expected, CancellationToken ct)
    {
        // Scope comes only from the validated membership; no client-supplied restaurant identifier exists.
        var id = (await tenants.RequireAsync(ct)).RestaurantId;
        var restaurant = await session.EditAsync<Restaurant>(id, ct);
        var settings = expected is null ? await session.EditAsync<RestaurantSettings>(id, ct)
            : await session.EditAsync<RestaurantSettings>(id, expected, ct);
        return (restaurant, settings);
    }

    private static byte[] Version(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String && value.GetString() is { Length: 12 } text)
        {
            try { var bytes = Convert.FromBase64String(text); if (bytes.Length == 8) return bytes; }
            catch (FormatException) { }
        }
        throw Invalid();
    }
    private static string? Text(JsonElement value, int max, bool required, bool multiline)
    {
        if (value.ValueKind == JsonValueKind.Null && !required) return null;
        if (value.ValueKind != JsonValueKind.String) throw Invalid();
        string text;
        try { text = value.GetString()!.Trim(); }
        catch (InvalidOperationException) { throw Invalid(); } // Invalid UTF-16 such as a lone surrogate escape.
        if (text.Length > max || text.Any(c => char.IsControl(c) && !(multiline && c is '\r' or '\n' or '\t')))
            throw Invalid();
        if (text.Length == 0) { if (required) throw Invalid(); return null; }
        return text;
    }
    private static bool Flag(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => throw Invalid()
    };
    private static string Choice(JsonElement value, IReadOnlyCollection<string> allowed) =>
        value.ValueKind == JsonValueKind.String && value.GetString() is { } text && allowed.Contains(text) ? text : throw Invalid();

    // Merge-patch semantics: absent = unchanged; null clears an optional field. Unknown/duplicate fields are rejected.
    private static bool IsJson(HttpContext context)
    {
        var type = context.Request.ContentType?.Split(';')[0].Trim();
        return string.Equals(type, "application/json", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(type, "application/merge-patch+json", StringComparison.OrdinalIgnoreCase);
    }
    private static async Task<Dictionary<string, JsonElement>> ReadPatch(HttpContext context, CancellationToken ct)
    {
        JsonDocument document;
        try { document = await JsonDocument.ParseAsync(context.Request.Body, new JsonDocumentOptions { MaxDepth = 4 }, ct); }
        catch (JsonException) { throw Invalid(); }
        catch (BadHttpRequestException ex) when (ex.StatusCode == 413) { throw new MediaException(413); }
        catch (BadHttpRequestException) { throw Invalid(); }
        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Object) throw Invalid();
            var values = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                var name = Fields.SingleOrDefault(f => string.Equals(f, property.Name, StringComparison.OrdinalIgnoreCase));
                if (name is null || !values.TryAdd(name, property.Value.Clone())) throw Invalid();
            }
            if (!values.ContainsKey("rowVersion")) throw Invalid();
            return values;
        }
    }

    public static void MapRestaurantProfile(this WebApplication app)
    {
        var group = app.MapGroup(Route).RequireAuthorization("TenantOwner");
        group.MapGet("", async (ITenantContext tenants, ITenantDataSession session, CancellationToken ct) =>
        {
            var (restaurant, settings) = await Load(tenants, session, null, ct);
            return Results.Ok(Response(restaurant, settings));
        });
        group.MapPatch("", async (HttpContext context, ITenantContext tenants, ITenantDataSession session, CancellationToken ct) =>
        {
            if (!IsJson(context)) return Results.Problem(statusCode: 415, title: "Unsupported media type.");
            var patch = await ReadPatch(context, ct);
            var (restaurant, settings) = await Load(tenants, session, Version(patch["rowVersion"]), ct);
            // Validate everything before mutating tracked entities.
            var name = patch.TryGetValue("name", out var v) ? Text(v, 150, true, false)! : restaurant.Name;
            var description = patch.TryGetValue("description", out v) ? Text(v, 2000, false, true) : settings.Description;
            var phone = patch.TryGetValue("phone", out v) ? Text(v, 32, false, false) : settings.ContactPhoneOptional;
            var address = patch.TryGetValue("address", out v) ? Text(v, 500, false, true) : settings.AddressOptional;
            var publishPhone = patch.TryGetValue("publishPhone", out v) ? Flag(v) : (settings.PublishedContactDetailsFlags & RestaurantSettings.PublishPhone) != 0;
            var publishAddress = patch.TryGetValue("publishAddress", out v) ? Flag(v) : (settings.PublishedContactDetailsFlags & RestaurantSettings.PublishAddress) != 0;
            var locale = patch.TryGetValue("defaultLocale", out v) ? Choice(v, ["ar", "en"]) : settings.DefaultLocale;
            var theme = patch.TryGetValue("themeKey", out v) ? Choice(v, Themes) : settings.ThemeKey;
            var color = settings.PrimaryColor;
            if (patch.TryGetValue("primaryColor", out v))
                color = v.ValueKind == JsonValueKind.String && ColorPattern().IsMatch(v.GetString()!) ? v.GetString()!.ToUpperInvariant() : throw Invalid();
            if ((phone is not null && (!PhonePattern().IsMatch(phone) || phone.Count(char.IsAsciiDigit) < 3)) ||
                (publishPhone && phone is null) || (publishAddress && address is null))
                throw Invalid();
            var flags = (publishPhone ? RestaurantSettings.PublishPhone : 0) | (publishAddress ? RestaurantSettings.PublishAddress : 0);
            var changed = name != restaurant.Name || description != settings.Description || phone != settings.ContactPhoneOptional ||
                address != settings.AddressOptional || flags != settings.PublishedContactDetailsFlags || locale != settings.DefaultLocale ||
                theme != settings.ThemeKey || color != settings.PrimaryColor;
            if (!changed) return Results.Ok(Response(restaurant, settings));
            if (name != restaurant.Name) { restaurant.Name = name; restaurant.UpdatedAtUtc = DateTime.UtcNow; }
            settings.Description = description;
            settings.ContactPhoneOptional = phone;
            settings.AddressOptional = address;
            settings.PublishedContactDetailsFlags = flags;
            settings.DefaultLocale = locale;
            settings.ThemeKey = theme;
            settings.PrimaryColor = color;
            // Always rewrite the settings row: its rowversion is the single client precondition, including name-only edits.
            await session.StageAsync(settings, false, ct);
            await session.CommitAsync(ct);
            return Results.Ok(Response(restaurant, settings));
        });
        foreach (var slot in new[] { "logo", "cover" })
        {
            group.MapPost("/" + slot, (HttpContext context, ITenantContext tenants, ITenantDataSession session, ImageNormalizer normalizer,
                IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) => Upload(slot, context, tenants, session, normalizer, storage, loggers, ct))
                .RequireRateLimiting("media-upload").WithMetadata(new MediaUploadMetadata());
            group.MapDelete("/" + slot, (HttpContext context, ITenantContext tenants, ITenantDataSession session,
                IImageStorage storage, ILoggerFactory loggers, CancellationToken ct) => Remove(slot, context, tenants, session, storage, loggers, ct));
        }
    }

    private static string? Key(RestaurantSettings s, string slot) => slot == "logo" ? s.LogoObjectKey : s.CoverObjectKey;
    private static void SetKey(RestaurantSettings s, string slot, string? key)
    {
        if (slot == "logo") s.LogoObjectKey = key; else s.CoverObjectKey = key;
    }

    private static async Task<IResult> Upload(string slot, HttpContext context, ITenantContext tenants, ITenantDataSession session,
        ImageNormalizer normalizer, IImageStorage storage, ILoggerFactory loggers, CancellationToken ct)
    {
        // Ownership/scope is resolved before the body is parsed or any blob is written.
        var (restaurant, settings) = await Load(tenants, session, null, ct);
        var normalized = await MediaEndpoints.ReadNormalizedAsync(context, normalizer, ct);
        var previous = Key(settings, slot);
        // Immutable, server-generated, tenant-prefixed key; replacement always uses a new object.
        var key = restaurant.Id.ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
        var logger = loggers.CreateLogger("RestaurantMedia");
        try { await storage.PutAsync(key, normalized, ct); }
        catch (IOException) { throw new MediaException(503); }
        catch (UnauthorizedAccessException) { throw new MediaException(503); }
        try
        {
            SetKey(settings, slot, key);
            await session.StageAsync(settings, false, ct);
            await session.CommitAsync(ct);
        }
        catch
        {
            // Never delete an object whose metadata may have committed (ambiguous connection loss).
            try
            {
                var stored = await session.ReadAsync<RestaurantSettings, string?>(s => true,
                    s => slot == "logo" ? s.LogoObjectKey : s.CoverObjectKey, 1, CancellationToken.None);
                if (stored.Count == 1 && stored[0] != key) await MediaEndpoints.Cleanup(storage, key, logger);
            }
            catch (Exception) { logger.LogWarning("Private media requires metadata reconciliation."); }
            throw;
        }
        if (previous is not null) await MediaEndpoints.Cleanup(storage, previous, logger);
        return Results.Ok(Response(restaurant, settings));
    }

    private static async Task<IResult> Remove(string slot, HttpContext context, ITenantContext tenants, ITenantDataSession session,
        IImageStorage storage, ILoggerFactory loggers, CancellationToken ct)
    {
        if (context.Request.ContentLength > 0 || context.Request.Headers.ContainsKey("Transfer-Encoding")) throw new MediaException(400);
        var (restaurant, settings) = await Load(tenants, session, null, ct);
        var previous = Key(settings, slot) ?? throw new TenantBoundaryException(TenantFailure.NotFound);
        SetKey(settings, slot, null);
        await session.StageAsync(settings, false, ct);
        await session.CommitAsync(ct);
        await MediaEndpoints.Cleanup(storage, previous, loggers.CreateLogger("RestaurantMedia"));
        return Results.Ok(Response(restaurant, settings));
    }
}
