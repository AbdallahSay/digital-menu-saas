using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Api.Media;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

/// <summary>
/// Hero image lifecycle and featured-item projection against a real SQL Server.
/// These facts skip without SQL Server (SqlServerFact) and have NOT been executed
/// as of authoring: they are evidence only once a run reports them as passed.
/// </summary>
public sealed class HeroFeaturedTests
{
    private const string Settings = "/api/v1/admin/settings";
    private const string Hero = Settings + "/hero";
    private static string PublicMenu(string slug) => "/api/v1/public/restaurants/by-slug/" + slug;

    private sealed class Storage : IImageStorage
    {
        public ConcurrentDictionary<string, NormalizedImage> Objects { get; } = new();
        public bool FailPut { get; set; }
        public Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
        {
            if (FailPut) throw new IOException("Test-only storage failure");
            Objects[key] = image;
            return Task.CompletedTask;
        }
        public Task<byte[]?> GetAsync(string key, string variant, CancellationToken ct) =>
            Task.FromResult(Objects.TryGetValue(key, out var image) ? (variant == "thumbnail" ? image.Thumbnail : image.Main) : null);
        public Task RemoveAsync(string key, CancellationToken ct)
        {
            Objects.TryRemove(key, out _);
            return Task.CompletedTask;
        }
    }

    private static async Task<(Fixture F, Storage S)> Setup()
    {
        var storage = new Storage();
        var f = await Fixture.Create(s => s.AddSingleton<IImageStorage>(storage));
        await f.A.Csrf();
        await f.B.Csrf();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        foreach (var r in await db.Set<Restaurant>().ToListAsync()) r.IsPublished = true;
        foreach (var c in await db.Set<Category>().ToListAsync()) c.IsPublished = true;
        await db.SaveChangesAsync();
        return (f, storage);
    }

    private static byte[] Picture()
    {
        using var bitmap = new SKBitmap(40, 20);
        bitmap.Erase(SKColors.Teal);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 90);
        return data.ToArray();
    }

    private static async Task<HttpResponseMessage> Upload(Browser browser, byte[]? bytes = null, string mime = "image/png")
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Hero);
        if (browser.Cookies.Count > 0) request.Headers.Add("Cookie", string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value)));
        if (browser.Token is not null) request.Headers.Add("X-XSRF-TOKEN", browser.Token);
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes ?? Picture());
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(file, "file", "hero.png");
        request.Content = form;
        return await browser.Client.SendAsync(request);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
    }

    private static async Task<JsonElement> PublicOf(Fixture f, string slug)
    {
        using var client = f.Auth.Factory.CreateClient();
        return await Json(await client.GetAsync(PublicMenu(slug)));
    }

    private static async Task<SettingsResponse> Current(Browser b) =>
        (await (await b.Send(HttpMethod.Get, Settings)).Content.ReadFromJsonAsync<SettingsResponse>())!;

    [SqlServerFact]
    public async Task Hero_upload_replace_and_delete_keep_storage_settings_and_public_menu_consistent()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        var before = (await PublicOf(f, "a")).GetProperty("publishedMenuVersion").GetInt64();

        var first = await Upload(f.A);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var body = await first.Content.ReadAsStringAsync();
        Assert.DoesNotContain("objectKey", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("coverObjectKey", body, StringComparison.OrdinalIgnoreCase);
        var settings = await Current(f.A);
        Assert.True(settings.HasHero);
        Assert.Equal(Hero, settings.HeroUrl);
        Assert.Single(storage.Objects);
        var firstKey = storage.Objects.Keys.Single();

        var admin = await f.A.Send(HttpMethod.Get, Hero);
        Assert.Equal(HttpStatusCode.OK, admin.StatusCode);
        Assert.Equal("image/webp", admin.Content.Headers.ContentType!.MediaType);
        Assert.Contains("no-cache", admin.Headers.CacheControl!.ToString());

        var publicMenu = await PublicOf(f, "a");
        Assert.Equal(JsonValueKind.String, publicMenu.GetProperty("restaurant").GetProperty("heroUrl").ValueKind);
        Assert.True(publicMenu.GetProperty("publishedMenuVersion").GetInt64() > before);
        using var client = f.Auth.Factory.CreateClient();
        var pub = await client.GetAsync("/api/v1/public/media/hero/" + settings.PublicCode);
        Assert.Equal(HttpStatusCode.OK, pub.StatusCode);

        // Replace: the previous object is removed, exactly one object remains.
        Assert.Equal(HttpStatusCode.OK, (await Upload(f.A)).StatusCode);
        Assert.Single(storage.Objects);
        Assert.DoesNotContain(firstKey, storage.Objects.Keys);

        // Delete: row cleared, object removed, public hero gone, second delete is 404.
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Hero)).StatusCode);
        Assert.Empty(storage.Objects);
        Assert.False((await Current(f.A)).HasHero);
        Assert.Equal(JsonValueKind.Null,
            (await PublicOf(f, "a")).GetProperty("restaurant").GetProperty("heroUrl").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/api/v1/public/media/hero/" + settings.PublicCode)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Hero)).StatusCode);
    }

    [SqlServerFact]
    public async Task Hero_is_tenant_isolated_and_invalid_or_failed_uploads_change_nothing()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        Assert.Equal(HttpStatusCode.OK, (await Upload(f.A)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Get, Hero)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Delete, Hero)).StatusCode);
        Assert.False((await Current(f.B)).HasHero);
        Assert.True((await Current(f.A)).HasHero);

        var keyBefore = storage.Objects.Keys.Single();
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Upload(f.A, "<svg/>"u8.ToArray(), "image/svg+xml")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(f.A, new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 0 })).StatusCode);
        storage.FailPut = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Upload(f.A)).StatusCode);
        storage.FailPut = false;
        Assert.Equal(keyBefore, storage.Objects.Keys.Single());
        Assert.True((await Current(f.A)).HasHero);
    }

    [SqlServerFact]
    public async Task Featured_defaults_false_projects_to_the_public_menu_and_each_change_bumps_the_version()
    {
        var (f, _) = await Setup();
        await using var _ = f;
        var item = (await (await f.A.Send(HttpMethod.Post, "/api/v1/admin/items",
            new CreateItemRequest(f.CategoryA.Id, "قهوة", null, null, null, 30m, "EGP", 1, true, true))).Content
            .ReadFromJsonAsync<ItemResponse>())!;
        Assert.False(item.IsFeatured);
        var menu0 = await PublicOf(f, "a");
        var v0 = menu0.GetProperty("publishedMenuVersion").GetInt64();
        Assert.False(FeaturedOf(menu0, "قهوة"));

        var on = await f.A.Send(HttpMethod.Put, "/api/v1/admin/items/" + item.Id,
            new UpdateItemRequest(item.CategoryId, "قهوة", null, null, null, 30m, "EGP", 1, true, true, item.RowVersion, true));
        Assert.Equal(HttpStatusCode.OK, on.StatusCode);
        var updated = (await on.Content.ReadFromJsonAsync<ItemResponse>())!;
        Assert.True(updated.IsFeatured);
        var menu1 = await PublicOf(f, "a");
        Assert.True(FeaturedOf(menu1, "قهوة"));
        Assert.True(menu1.GetProperty("publishedMenuVersion").GetInt64() > v0);

        // Omitting isFeatured on update (old client) leaves it unchanged.
        var keep = await f.A.Send(HttpMethod.Put, "/api/v1/admin/items/" + item.Id,
            new UpdateItemRequest(item.CategoryId, "قهوة", null, null, null, 31m, "EGP", 1, true, true, updated.RowVersion));
        Assert.Equal(HttpStatusCode.OK, keep.StatusCode);
        Assert.True((await keep.Content.ReadFromJsonAsync<ItemResponse>())!.IsFeatured);
        Assert.True(FeaturedOf(await PublicOf(f, "a"), "قهوة"));

        // The other tenant's menu never shows it.
        Assert.False(FeaturedOf(await PublicOf(f, "b"), "قهوة"));
    }

    private static bool FeaturedOf(JsonElement menu, string name) =>
        menu.GetProperty("categories").EnumerateArray()
            .SelectMany(c => c.GetProperty("items").EnumerateArray())
            .Any(i => i.GetProperty("name").GetString() == name && i.GetProperty("featured").GetBoolean());
}
