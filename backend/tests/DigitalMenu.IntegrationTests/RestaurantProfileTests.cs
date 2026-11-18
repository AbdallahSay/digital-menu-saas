using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DigitalMenu.Api.Media;
using DigitalMenu.Api.Profile;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

public sealed class RestaurantProfileTests
{
    private const string Route = RestaurantProfile.Route;
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private sealed class Storage : IImageStorage
    {
        public ConcurrentDictionary<string, NormalizedImage> Objects { get; } = new();
        public Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
        {
            Assert.True(Objects.TryAdd(key, image));
            return Task.CompletedTask;
        }
        public Task RemoveAsync(string key, CancellationToken ct)
        {
            Objects.TryRemove(key, out _);
            return Task.CompletedTask;
        }
    }

    private static async Task<(Fixture Fixture, Storage Storage)> Setup()
    {
        var storage = new Storage();
        var f = await Fixture.Create(s => s.AddSingleton<IImageStorage>(storage));
        await f.A.Csrf();
        await f.B.Csrf();
        return (f, storage);
    }

    private static async Task<HttpResponseMessage> Raw(Browser browser, HttpMethod method, string path, string? json,
        string contentType = "application/json", IDictionary<string, string>? headers = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (browser.Cookies.Count > 0) request.Headers.Add("Cookie", string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value)));
        if (browser.Token is not null) request.Headers.Add("X-XSRF-TOKEN", browser.Token);
        foreach (var header in headers ?? new Dictionary<string, string>()) request.Headers.Add(header.Key, header.Value);
        if (json is not null) request.Content = new StringContent(json, Encoding.UTF8, contentType);
        return await browser.Client.SendAsync(request);
    }
    private static async Task<RestaurantProfileResponse> Read(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(expected == response.StatusCode, $"{(int)response.StatusCode}: {body}");
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        foreach (var secret in new[] { "restaurantId", "userId", "objectKey", ".webp", "Status", "ownerEmail" })
            Assert.DoesNotContain(secret, body, StringComparison.Ordinal);
        return JsonSerializer.Deserialize<RestaurantProfileResponse>(body, Web)!;
    }
    private static async Task<RestaurantProfileResponse> Get(Browser browser) => await Read(await browser.Send(HttpMethod.Get, Route));
    private static Task<HttpResponseMessage> Patch(Browser browser, object body, IDictionary<string, string>? headers = null, string? query = null)
        => Raw(browser, HttpMethod.Patch, Route + query, JsonSerializer.Serialize(body, Web), headers: headers);

    private static async Task<(long A, long B)> Versions(Fixture f)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        return ((await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion,
            (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantB)).PublishedMenuVersion);
    }
    private static async Task<(Restaurant Restaurant, RestaurantSettings Settings)> Row(Fixture f, Guid id)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        return (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == id),
            await db.Set<RestaurantSettings>().AsNoTracking().SingleAsync(s => s.RestaurantId == id));
    }
    private static byte[] Png(int width = 40, int height = 20)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.Teal);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 90);
        return data.ToArray();
    }
    private static async Task<HttpResponseMessage> Upload(Browser browser, string slot, byte[]? bytes = null, string mime = "image/png", bool extra = false)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Route + "/" + slot);
        if (browser.Cookies.Count > 0) request.Headers.Add("Cookie", string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value)));
        if (browser.Token is not null) request.Headers.Add("X-XSRF-TOKEN", browser.Token);
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes ?? Png());
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(file, "file", "../../logo.png");
        if (extra) form.Add(new StringContent("https://127.0.0.1/private"), "url");
        request.Content = form;
        return await browser.Client.SendAsync(request);
    }

    [SqlServerFact]
    public async Task Get_returns_only_own_allowlisted_profile_and_requires_authenticated_owner()
    {
        var (f, _) = await Setup();
        await using var cleanup = f;
        var guest = new Browser(f.Auth.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Get, Route)).StatusCode);
        var response = await f.A.Send(HttpMethod.Get, Route);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(new[] { "address", "defaultLocale", "description", "hasCover", "hasLogo", "isPublished", "name", "phone",
            "primaryColor", "publicCode", "publishAddress", "publishPhone", "rowVersion", "slug", "themeKey" },
            JsonSerializer.Deserialize<JsonElement>(body).EnumerateObject().Select(p => p.Name).Order());
        var a = await Read(response);
        Assert.Equal("a", a.Slug);
        Assert.Equal("grill", a.ThemeKey);
        Assert.Equal("ar", a.DefaultLocale);
        Assert.Null(a.Description);
        var b = await Get(f.B);
        Assert.Equal("b", b.Slug);
        Assert.Equal("Protected B settings", b.Description);
        Assert.DoesNotContain("Protected B", body, StringComparison.Ordinal);
        Assert.Equal((1, 1), await Versions(f)); // Reads never write.
    }

    [SqlServerFact]
    public async Task Patch_applies_merge_semantics_and_bumps_menu_version_only_for_public_visible_changes()
    {
        var (f, _) = await Setup();
        await using var cleanup = f;
        var current = await Get(f.A);

        current = await Read(await Patch(f.A, new { name = "  مطعم ألف  ", primaryColor = "#abcdef", themeKey = "cafe", rowVersion = current.RowVersion }));
        Assert.Equal("مطعم ألف", current.Name);
        Assert.Equal("#ABCDEF", current.PrimaryColor);
        Assert.Equal("cafe", current.ThemeKey);
        Assert.Equal((2, 1), await Versions(f));

        // Private phone edit while unpublished: rowversion moves, public version does not.
        var before = current.RowVersion;
        current = await Read(await Patch(f.A, new { phone = "+20 (10) 123-4567", rowVersion = current.RowVersion }));
        Assert.Equal("+20 (10) 123-4567", current.Phone);
        Assert.False(current.PublishPhone);
        Assert.NotEqual(before, current.RowVersion);
        Assert.Equal((2, 1), await Versions(f));

        current = await Read(await Patch(f.A, new { publishPhone = true, rowVersion = current.RowVersion }));
        Assert.True(current.PublishPhone);
        Assert.Equal((3, 1), await Versions(f));
        current = await Read(await Patch(f.A, new { phone = "0100 000 0000", rowVersion = current.RowVersion }));
        Assert.Equal((4, 1), await Versions(f));

        current = await Read(await Patch(f.A, new { description = "Line 1\r\nLine 2", address = "Cairo", publishAddress = true, defaultLocale = "en", rowVersion = current.RowVersion }));
        Assert.Equal("Line 1\r\nLine 2", current.Description);
        Assert.True(current.PublishAddress);
        Assert.Equal("en", current.DefaultLocale);
        Assert.Equal((5, 1), await Versions(f));

        // Identical payload: no write, same rowversion, no version bump.
        var same = await Read(await Patch(f.A, new { name = "مطعم ألف", themeKey = "cafe", rowVersion = current.RowVersion }));
        Assert.Equal(current, same);
        Assert.Equal((5, 1), await Versions(f));

        // Null clears optional fields (flags must be cleared together).
        current = await Read(await Patch(f.A, new { description = (string?)null, phone = (string?)null, publishPhone = false, rowVersion = current.RowVersion }));
        Assert.Null(current.Description);
        Assert.Null(current.Phone);
        Assert.Equal((6, 1), await Versions(f));

        var (restaurant, settings) = await Row(f, f.RestaurantA);
        Assert.Equal("مطعم ألف", restaurant.Name);
        Assert.Equal("a", restaurant.Slug);
        Assert.Equal(RestaurantSettings.PublishAddress, settings.PublishedContactDetailsFlags);
        Assert.Equal("Protected B settings", (await Row(f, f.RestaurantB)).Settings.Description);
    }

    [SqlServerFact]
    public async Task Patch_rejects_invalid_unknown_stale_and_unsafe_requests_without_writing()
    {
        var (f, _) = await Setup();
        await using var cleanup = f;
        var current = await Get(f.A);
        var rv = current.RowVersion;
        var invalid = new object[]
        {
            new { themeKey = "bistro", rowVersion = rv }, new { primaryColor = "red", rowVersion = rv },
            new { primaryColor = "#12345", rowVersion = rv }, new { defaultLocale = "fr", rowVersion = rv },
            new { name = "   ", rowVersion = rv }, new { name = (string?)null, rowVersion = rv }, new { name = new string('n', 151), rowVersion = rv },
            new { name = "bad\u0001name", rowVersion = rv }, new { description = new string('d', 2001), rowVersion = rv },
            new { phone = "call me", rowVersion = rv }, new { phone = "+1", rowVersion = rv }, new { publishPhone = true, rowVersion = rv },
            new { publishAddress = true, rowVersion = rv }, new { publishPhone = "yes", rowVersion = rv },
            new { restaurantId = f.RestaurantB, rowVersion = rv }, new { slug = "x", rowVersion = rv }, new { isPublished = true, rowVersion = rv },
            new { logoObjectKey = f.RestaurantB + "/x.webp", rowVersion = rv }, new { name = "x" },
            new { name = "x", rowVersion = "not-base64" }, new { name = "x", rowVersion = Convert.ToBase64String(new byte[4]) }
        };
        foreach (var body in invalid)
            Assert.Equal(HttpStatusCode.BadRequest, (await Patch(f.A, body)).StatusCode);
        foreach (var json in new[] { "[]", "{", "{\"name\":\"x\",\"name\":\"y\",\"rowVersion\":\"" + rv + "\"}", "{\"name\":\"\\uD800\",\"rowVersion\":\"" + rv + "\"}" })
            Assert.Equal(HttpStatusCode.BadRequest, (await Raw(f.A, HttpMethod.Patch, Route, json)).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType,
            (await Raw(f.A, HttpMethod.Patch, Route, "name=x", "application/x-www-form-urlencoded")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Raw(f.A, HttpMethod.Patch, Route, "{\"themeKey\":\"cafe\",\"rowVersion\":\"" + rv + "\"}", "application/merge-patch+json")).StatusCode);
        // Old token is now stale.
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Patch(f.A, new { name = "Stale", rowVersion = rv })).StatusCode);
        var token = f.A.Token;
        f.A.Token = null;
        Assert.Equal(HttpStatusCode.BadRequest, (await Patch(f.A, new { name = "No CSRF", rowVersion = rv })).StatusCode);
        f.A.Token = token;
        var guest = new Browser(f.Auth.Factory);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Patch(guest, new { name = "Guest", rowVersion = rv })).StatusCode);

        var (restaurant, settings) = await Row(f, f.RestaurantA);
        Assert.Equal("cafe", settings.ThemeKey);
        Assert.NotEqual("Stale", restaurant.Name);
        Assert.False(restaurant.IsPublished);
        Assert.Null(settings.LogoObjectKey);
        Assert.Equal((2, 1), await Versions(f));
    }

    [SqlServerFact]
    public async Task Cross_tenant_A_B_forged_scope_and_foreign_tokens_never_touch_the_other_restaurant()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var a = await Get(f.A);
        var b = await Get(f.B);
        var forged = new Dictionary<string, string> { ["X-Restaurant-Id"] = f.RestaurantB.ToString(), ["X-Tenant-Id"] = f.RestaurantB.ToString() };
        // Forged headers/query cannot redirect scope: owner A's write lands on A only.
        a = await Read(await Patch(f.A, new { name = "A renamed", rowVersion = a.RowVersion }, forged, "?restaurantId=" + f.RestaurantB));
        Assert.Equal("a", a.Slug);
        // A presenting B's rowversion is compared to A's own row only: 412, B untouched.
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Patch(f.A, new { name = "Hijack", rowVersion = b.RowVersion })).StatusCode);
        // A's cookie with B's CSRF token is rejected.
        var token = f.A.Token;
        f.A.Token = f.B.Token;
        Assert.Equal(HttpStatusCode.BadRequest, (await Patch(f.A, new { name = "Hijack", rowVersion = a.RowVersion })).StatusCode);
        f.A.Token = token;
        Assert.Equal(HttpStatusCode.OK, (await Upload(f.A, "logo")).StatusCode);
        Assert.StartsWith(f.RestaurantA.ToString("D") + "/", Assert.Single(storage.Objects).Key);

        var bAfter = await Get(f.B);
        Assert.Equal(b, bAfter);
        Assert.False(bAfter.HasLogo);
        Assert.Equal(b.Name, (await Row(f, f.RestaurantB)).Restaurant.Name);
        Assert.Equal("A renamed", (await Row(f, f.RestaurantA)).Restaurant.Name);
        Assert.Equal(1, (await Versions(f)).B);
        Assert.Null((await Row(f, f.RestaurantB)).Settings.LogoObjectKey);
        // B deleting a logo it does not have is 404 and cannot remove A's.
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Delete, Route + "/logo")).StatusCode);
        Assert.Single(storage.Objects);
        Assert.True((await Get(f.A)).HasLogo);

        // Suspended tenant owner is denied (existing F03/F05 contract: cookie rejected as 401); the other tenant keeps working.
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantB)).Status = "Suspended";
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.B.Send(HttpMethod.Get, Route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Patch(f.B, new { name = "Suspended write", rowVersion = bAfter.RowVersion })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Get, Route)).StatusCode);
    }

    [SqlServerFact]
    public async Task Logo_and_cover_reuse_F08_pipeline_replace_immutably_and_bump_menu_version()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var before = await Get(f.A);
        foreach (var slot in new[] { "logo", "cover" })
        {
            var start = (await Versions(f)).A;
            var first = await Read(await Upload(f.A, slot, Png(2000, 1000)));
            Assert.True(slot == "logo" ? first.HasLogo : first.HasCover);
            var firstKey = slot == "logo" ? (await Row(f, f.RestaurantA)).Settings.LogoObjectKey! : (await Row(f, f.RestaurantA)).Settings.CoverObjectKey!;
            Assert.Matches("^" + f.RestaurantA.ToString("D") + "/[0-9a-f]{32}\\.webp$", firstKey);
            Assert.DoesNotContain("logo.png", firstKey);
            using (var main = SKBitmap.Decode(storage.Objects[firstKey].Main)) Assert.Equal(1600, main.Width);
            Assert.Equal(start + 1, (await Versions(f)).A);

            await Read(await Upload(f.A, slot));
            var secondKey = slot == "logo" ? (await Row(f, f.RestaurantA)).Settings.LogoObjectKey! : (await Row(f, f.RestaurantA)).Settings.CoverObjectKey!;
            Assert.NotEqual(firstKey, secondKey);
            Assert.False(storage.Objects.ContainsKey(firstKey)); // Replaced object cleaned up after commit.
            Assert.Equal(start + 2, (await Versions(f)).A);

            var removed = await Read(await f.A.Send(HttpMethod.Delete, Route + "/" + slot));
            Assert.False(slot == "logo" ? removed.HasLogo : removed.HasCover);
            Assert.False(storage.Objects.ContainsKey(secondKey));
            Assert.Equal(start + 3, (await Versions(f)).A);
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Route + "/" + slot)).StatusCode);
        }
        // Settings rowversion moved: a PATCH with the pre-upload token is stale.
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Patch(f.A, new { name = "Stale", rowVersion = before.RowVersion })).StatusCode);

        var svg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Upload(f.A, "logo", svg, "image/svg+xml")).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Upload(f.A, "logo", Png(), "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(f.A, "logo", extra: true)).StatusCode);
        var token = f.A.Token;
        f.A.Token = null;
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(f.A, "cover")).StatusCode);
        f.A.Token = token;
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(new Browser(f.Auth.Factory), "logo")).StatusCode);
        Assert.Empty(storage.Objects);
        Assert.Null((await Row(f, f.RestaurantA)).Settings.LogoObjectKey);
        Assert.Equal(1, (await Versions(f)).B);
    }

    [SqlServerFact]
    public async Task Owner_data_session_cannot_publish_or_rewind_menu_version_and_foreign_settings_stay_hidden()
    {
        var (f, _) = await Setup();
        await using var cleanup = f;
        foreach (var mutate in new Action<Restaurant>[] { r => r.IsPublished = true, r => r.PublishedMenuVersion = 0 })
            await f.Run(f.A, async (services, _) =>
            {
                var session = services.GetRequiredService<ITenantDataSession>();
                var restaurant = await session.EditAsync<Restaurant>(f.RestaurantA);
                mutate(restaurant);
                var error = await Assert.ThrowsAsync<TenantBoundaryException>(() => session.CommitAsync());
                Assert.Equal(TenantFailure.NotFound, error.Failure);
            });
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            var error = await Assert.ThrowsAsync<TenantBoundaryException>(() => session.EditAsync<RestaurantSettings>(f.RestaurantB));
            Assert.Equal(TenantFailure.NotFound, error.Failure);
        });
        var (restaurant, _) = await Row(f, f.RestaurantA);
        Assert.False(restaurant.IsPublished);
        Assert.Equal((1, 1), await Versions(f));
    }
}
