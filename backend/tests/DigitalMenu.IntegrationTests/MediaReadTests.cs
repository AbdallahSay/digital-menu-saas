using System.Net;
using System.Net.Http.Headers;
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
/// Media read-back (media delivery phase). Public URLs carry only opaque ids -
/// the image's own random Guid or the already-public restaurant code - and a
/// known id serves only while the image would appear in the public menu (item
/// published, not deleted, available; category published, not deleted;
/// restaurant Active and published). Admin reads stay tenant-scoped.
/// </summary>
public sealed class MediaReadTests
{
    private sealed class Storage : IImageStorage
    {
        private readonly Dictionary<string, byte[]> objects = new();
        public void Put(string key, byte[] main, byte[] thumbnail)
        {
            objects[key + ":main"] = main;
            objects[key + ":thumbnail"] = thumbnail;
        }
        public byte[] Stored(string key, string variant) => objects[key + ":" + variant];
        public Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
        {
            Put(key, image.Main, image.Thumbnail);
            return Task.CompletedTask;
        }
        public Task<byte[]?> GetAsync(string key, string variant, CancellationToken ct) =>
            Task.FromResult(objects.TryGetValue(key + ":" + variant, out var bytes) ? bytes : null);
        public Task RemoveAsync(string key, CancellationToken ct) => Task.CompletedTask;
    }

    private static async Task<(Fixture Fixture, Storage Storage)> Setup()
    {
        var storage = new Storage();
        // The shared fixture's default seed uses non-hex codes; opt into a
        // valid 20-hex code AT CREATION (PublicCode is immutable after save -
        // TR_Restaurants_ImmutablePublicCode) without touching shared defaults.
        var f = await Fixture.Create(s => s.AddSingleton<IImageStorage>(storage), publicCodeA: Code);
        return (f, storage);
    }
    private static HttpClient Guest(Fixture f) =>
        f.Auth.Factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
    private const string Code = "aaaaaaaaaaaaaaaaaaaa";
    private static async Task SetVisibility(Fixture f, bool restaurantPublished = true, string status = "Active",
        bool categoryPublished = true, bool categoryDeleted = false,
        bool itemPublished = true, bool itemDeleted = false, bool itemAvailable = true)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA);
        restaurant.IsPublished = restaurantPublished;
        restaurant.Status = status;
        var category = await db.Set<Category>().SingleAsync(c => c.Id == f.CategoryA.Id);
        category.IsPublished = categoryPublished;
        category.IsDeleted = categoryDeleted;
        var item = await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemA.Id);
        item.IsPublished = itemPublished;
        item.IsDeleted = itemDeleted;
        item.IsAvailable = itemAvailable;
        await db.SaveChangesAsync();
    }
    private static string ItemRoute(Guid image, string variant) => $"/api/v1/public/media/items/{image}/{variant}";
    private static async Task<HttpResponseMessage> Send(Browser browser, HttpMethod method, string path, HttpContent? content = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Cookie", string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value)));
        if (browser.Token is not null) request.Headers.Add("X-XSRF-TOKEN", browser.Token);
        request.Content = content;
        return await browser.Client.SendAsync(request);
    }
    private static byte[] Picture(SKColor color)
    {
        using var bitmap = new SKBitmap(24, 24);
        bitmap.Erase(color);
        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Png, 90).ToArray();
    }

    [SqlServerFact]
    public async Task Public_item_images_follow_menu_visibility_with_opaque_addressing()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        var main = new byte[] { 1, 2, 3 };
        var thumbnail = new byte[] { 4, 5 };
        storage.Put(f.ImageA.ObjectKey, main, thumbnail);
        using var guest = Guest(f);
        // Hidden by default: the id exists but every parent is unpublished.
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(ItemRoute(f.ImageA.Id, "main"))).StatusCode);
        await SetVisibility(f);
        var response = await guest.GetAsync(ItemRoute(f.ImageA.Id, "main"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/webp", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(main, await response.Content.ReadAsByteArrayAsync());
        // Create-new immutable ids: content never changes under an id; the
        // accepted stale window for already-cached hidden content is one hour.
        Assert.Equal("public, max-age=3600, immutable", response.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", string.Join(",", response.Headers.GetValues("X-Content-Type-Options")));
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.Equal(thumbnail, await (await guest.GetAsync(ItemRoute(f.ImageA.Id, "thumbnail"))).Content.ReadAsByteArrayAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.GetAsync(ItemRoute(f.ImageA.Id, "original"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(ItemRoute(Guid.NewGuid(), "main"))).StatusCode);
        // Stored row without bytes fails closed, never throws.
        var orphan = new MenuItemImage { RestaurantId = f.RestaurantA, MenuItemId = f.ItemA.Id, ObjectKey = f.RestaurantA + "/missing.webp", Width = 1, Height = 1 };
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            db.Add(orphan);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(ItemRoute(orphan.Id, "main"))).StatusCode);
        // Every visibility transition cuts off an already-known id immediately.
        foreach (var transition in new (bool itemPublished, bool itemAvailable, bool categoryPublished, bool itemDeleted, bool categoryDeleted, bool restaurantPublished, string status)[]
        {
            (false, true, true, false, false, true, "Active"),   // item unpublished
            (true, false, true, false, false, true, "Active"),   // item sold out
            (true, true, false, false, false, true, "Active"),   // category unpublished
            (true, true, true, true, false, true, "Active"),     // item deleted
            (true, true, true, false, true, true, "Active"),     // category deleted
            (true, true, true, false, false, false, "Active"),   // restaurant unpublished
            (true, true, true, false, false, true, "Suspended"), // restaurant suspended
        })
        {
            await SetVisibility(f, transition.restaurantPublished, transition.status, transition.categoryPublished,
                transition.categoryDeleted, transition.itemPublished, transition.itemDeleted, transition.itemAvailable);
            Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync(ItemRoute(f.ImageA.Id, "main"))).StatusCode);
            await SetVisibility(f);
            Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(ItemRoute(f.ImageA.Id, "main"))).StatusCode);
        }
        // Cookie-bearing image GETs stay anonymous: no Identity work, no Set-Cookie.
        using var authed = new HttpRequestMessage(HttpMethod.Get, ItemRoute(f.ImageA.Id, "main"));
        authed.Headers.Add("Cookie", string.Join("; ", f.A.Cookies.Select(c => c.Key + "=" + c.Value)));
        var withCookies = await guest.SendAsync(authed);
        Assert.Equal(HttpStatusCode.OK, withCookies.StatusCode);
        Assert.False(withCookies.Headers.Contains("Set-Cookie"));
    }

    [SqlServerFact]
    public async Task Public_logo_serves_by_public_code_with_short_cache_and_never_while_hidden()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        var logo = new byte[] { 9, 9, 9 };
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            (await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == f.RestaurantA)).LogoObjectKey = f.ImageA.ObjectKey;
            await db.SaveChangesAsync();
        }
        storage.Put(f.ImageA.ObjectKey, logo, logo);
        using var guest = Guest(f);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.GetAsync("/api/v1/public/media/logo/short")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.GetAsync("/api/v1/public/media/logo/" + new string('A', 20))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/v1/public/media/logo/" + new string('e', 20))).StatusCode);
        // Unpublished: 404 even with a valid code and stored logo.
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/v1/public/media/logo/" + Code)).StatusCode);
        await SetVisibility(f);
        var response = await guest.GetAsync("/api/v1/public/media/logo/" + Code);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(logo, await response.Content.ReadAsByteArrayAsync());
        // The logo is replaceable under this stable URL: accepted stale window is five minutes.
        Assert.Equal("public, max-age=300", response.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", string.Join(",", response.Headers.GetValues("X-Content-Type-Options")));
    }

    [SqlServerFact]
    public async Task Admin_media_read_requires_the_owning_tenant_session()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        storage.Put(f.ImageA.ObjectKey, new byte[] { 7 }, new byte[] { 8 });
        storage.Put(f.ImageB.ObjectKey, new byte[] { 6 }, new byte[] { 6 });
        using var guest = Guest(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.GetAsync($"/api/v1/admin/media/items/{f.ImageA.Id}/main")).StatusCode);
        var response = await Send(f.A, HttpMethod.Get, $"/api/v1/admin/media/items/{f.ImageA.Id}/main");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new byte[] { 7 }, await response.Content.ReadAsByteArrayAsync());
        // Item image ids are create-new and immutable: content under an id never changes.
        // Compared as a directive set: the client-side header type may reorder the serialization.
        var itemCache = response.Headers.CacheControl!;
        Assert.True(itemCache.Private);
        Assert.False(itemCache.Public);
        Assert.False(itemCache.NoCache);
        Assert.Equal(TimeSpan.FromSeconds(86400), itemCache.MaxAge);
        Assert.Equal("immutable", Assert.Single(itemCache.Extensions).Name);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(f.A, HttpMethod.Get, $"/api/v1/admin/media/items/{f.ImageB.Id}/main")).StatusCode);
    }

    [SqlServerFact]
    public async Task Logo_upload_delete_cycle_projects_to_settings_public_logo_and_publication_version()
    {
        var (f, storage) = await Setup();
        await using var _ = f;
        // Refresh antiforgery after the fixture's login before any mutation.
        await f.A.Csrf();
        await SetVisibility(f);
        using var guest = Guest(f);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var versionBefore = (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion;
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/v1/public/media/logo/" + Code)).StatusCode);
        // Upload through the real normalizer; the settings contract flips to hasLogo with the admin read URL.
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Picture(SKColors.Teal));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "logo.png");
        var upload = await Send(f.A, HttpMethod.Post, "/api/v1/admin/settings/logo", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var settings = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(await upload.Content.ReadAsStringAsync());
        Assert.True(settings.GetProperty("hasLogo").GetBoolean());
        Assert.Equal("/api/v1/admin/settings/logo", settings.GetProperty("logoUrl").GetString());
        var keyA = (await db.Set<RestaurantSettings>().AsNoTracking().SingleAsync(s => s.RestaurantId == f.RestaurantA)).LogoObjectKey;
        Assert.NotNull(keyA);
        Assert.Equal(versionBefore + 1, (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        // The stable admin URL revalidates every read and serves the current object.
        var adminLogo = await Send(f.A, HttpMethod.Get, "/api/v1/admin/settings/logo");
        Assert.Equal(HttpStatusCode.OK, adminLogo.StatusCode);
        var logoCache = adminLogo.Headers.CacheControl!;
        Assert.True(logoCache.Private);
        Assert.True(logoCache.NoCache);
        Assert.False(logoCache.Public);
        Assert.Null(logoCache.MaxAge);
        Assert.Equal(storage.Stored(keyA!, "main"), await adminLogo.Content.ReadAsByteArrayAsync());
        var publicLogo = await guest.GetAsync("/api/v1/public/media/logo/" + Code);
        Assert.Equal(HttpStatusCode.OK, publicLogo.StatusCode);
        Assert.Equal("image/webp", publicLogo.Content.Headers.ContentType!.MediaType);
        Assert.Equal(storage.Stored(keyA!, "main"), await publicLogo.Content.ReadAsByteArrayAsync());
        // The public menu projects the opaque logo URL under the same code.
        var menu = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(
            await (await guest.GetAsync("/api/v1/public/menus/" + Code)).Content.ReadAsStringAsync());
        Assert.Equal("/api/v1/public/media/logo/" + Code, menu.GetProperty("restaurant").GetProperty("logoUrl").GetString());
        // Replacement: a new object key under the same stable URLs, served fresh everywhere.
        var form2 = new MultipartFormDataContent();
        var file2 = new ByteArrayContent(Picture(SKColors.Orange));
        file2.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form2.Add(file2, "file", "logo.png");
        Assert.Equal(HttpStatusCode.OK, (await Send(f.A, HttpMethod.Post, "/api/v1/admin/settings/logo", form2)).StatusCode);
        var keyB = (await db.Set<RestaurantSettings>().AsNoTracking().SingleAsync(s => s.RestaurantId == f.RestaurantA)).LogoObjectKey;
        Assert.NotNull(keyB);
        Assert.NotEqual(keyA, keyB);
        Assert.Equal(storage.Stored(keyB!, "main"), await (await Send(f.A, HttpMethod.Get, "/api/v1/admin/settings/logo")).Content.ReadAsByteArrayAsync());
        Assert.Equal(storage.Stored(keyB!, "main"), await (await guest.GetAsync("/api/v1/public/media/logo/" + Code)).Content.ReadAsByteArrayAsync());
        Assert.Equal(versionBefore + 2, (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        // Delete: settings flip back, both reads fail closed, the version bumps again.
        Assert.Equal(HttpStatusCode.NoContent, (await Send(f.A, HttpMethod.Delete, "/api/v1/admin/settings/logo")).StatusCode);
        Assert.Equal(versionBefore + 3, (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync("/api/v1/public/media/logo/" + Code)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(f.A, HttpMethod.Get, "/api/v1/admin/settings/logo")).StatusCode);
        Assert.Null((await db.Set<RestaurantSettings>().AsNoTracking().SingleAsync(s => s.RestaurantId == f.RestaurantA)).LogoObjectKey);
    }
}
