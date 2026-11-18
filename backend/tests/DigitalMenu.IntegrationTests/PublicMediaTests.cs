using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalMenu.Api.Media;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class PublicMediaTests
{
    private sealed class Counter : DbCommandInterceptor
    {
        private int count;
        public int Count => count;
        public void Reset() => Interlocked.Exchange(ref count, 0);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data,
            InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        { Interlocked.Increment(ref count); return ValueTask.FromResult(result); }
    }

    private static string Key(Guid restaurant) => restaurant.ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
    private static NormalizedImage Blob(byte marker) => new([82, 73, 70, 70, marker, 1], [82, 73, 70, 70, marker, 2], 1600, 900);

    private sealed class Fixture : IAsyncDisposable
    {
        public AuthFixture Auth { get; private set; } = null!;
        public MediaTests.Storage Storage { get; } = new();
        public Counter Queries { get; } = new();
        public Restaurant A { get; } = new() { Name = "مطعم الصور", Slug = "media-a", PublicCode = new string('a', 20), IsPublished = true };
        public Restaurant B { get; } = new() { Name = "Restaurant B", Slug = "media-b", PublicCode = new string('b', 20), IsPublished = true };
        public Category CategoryA { get; } = new() { NameAr = "مشروبات", NameEn = "Drinks", IsPublished = true };
        public Category CategoryB { get; } = new() { NameAr = "قسم B", IsPublished = true };
        public MenuItem ItemA { get; } = new() { NameAr = "قهوة", NameEn = "Coffee", Price = 10, IsPublished = true };
        public MenuItem DraftA { get; } = new() { NameAr = "مسودة سرية", Price = 10, SortOrder = 1 };
        public MenuItem ItemB { get; } = new() { NameAr = "B item", Price = 10, IsPublished = true };
        public MenuItemImage Primary { get; private set; } = null!;
        public MenuItemImage Second { get; private set; } = null!;
        public MenuItemImage Third { get; private set; } = null!;
        public MenuItemImage Draft { get; private set; } = null!;
        public MenuItemImage Foreign { get; private set; } = null!;
        public RestaurantSettings SettingsA { get; private set; } = null!;
        public bool RealStorage { get; init; } = true;
        public static async Task<Fixture> Create(bool storage = true)
        {
            var f = new Fixture { RealStorage = storage };
            f.Auth = await AuthFixture.Create(empty: true, configure: s =>
            {
                s.AddDbContext<MenuDbContext>(o => o.AddInterceptors(f.Queries));
                if (storage) s.AddSingleton<IImageStorage>(f.Storage);
            });
            f.CategoryA.RestaurantId = f.ItemA.RestaurantId = f.DraftA.RestaurantId = f.A.Id;
            f.CategoryB.RestaurantId = f.ItemB.RestaurantId = f.B.Id;
            f.ItemA.CategoryId = f.DraftA.CategoryId = f.CategoryA.Id;
            f.ItemB.CategoryId = f.CategoryB.Id;
            var created = DateTime.UtcNow;
            // SortOrder ties resolve by upload time, so Primary (sort 0, oldest) wins over Second (sort 0, newer).
            f.Primary = new() { RestaurantId = f.A.Id, MenuItemId = f.ItemA.Id, ObjectKey = Key(f.A.Id), Width = 1600, Height = 900, AltAr = "فنجان", AltEn = "Cup", CreatedAtUtc = created };
            f.Second = new() { RestaurantId = f.A.Id, MenuItemId = f.ItemA.Id, ObjectKey = Key(f.A.Id), Width = 900, Height = 1600, AltAr = "حبوب", CreatedAtUtc = created.AddSeconds(1) };
            f.Third = new() { RestaurantId = f.A.Id, MenuItemId = f.ItemA.Id, ObjectKey = Key(f.A.Id), Width = 300, Height = 200, SortOrder = 5, CreatedAtUtc = created.AddSeconds(-5) };
            f.Draft = new() { RestaurantId = f.A.Id, MenuItemId = f.DraftA.Id, ObjectKey = Key(f.A.Id), Width = 20, Height = 10 };
            f.Foreign = new() { RestaurantId = f.B.Id, MenuItemId = f.ItemB.Id, ObjectKey = Key(f.B.Id), Width = 20, Height = 10 };
            f.SettingsA = new()
            {
                RestaurantId = f.A.Id, PrimaryColor = "#123456", ThemeKey = "amber",
                LogoObjectKey = Key(f.A.Id), LogoWidth = 400, LogoHeight = 400,
                CoverObjectKey = Key(f.A.Id), CoverWidth = 1600, CoverHeight = 600
            };
            using var scope = f.Auth.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            db.AddRange(f.A, f.B, f.CategoryA, f.CategoryB, f.ItemA, f.DraftA, f.ItemB, f.Primary, f.Second, f.Third, f.Draft, f.Foreign, f.SettingsA);
            await db.SaveChangesAsync();
            byte marker = 1;
            foreach (var key in new[] { f.Primary.ObjectKey, f.Second.ObjectKey, f.Third.ObjectKey, f.Draft.ObjectKey, f.Foreign.ObjectKey, f.SettingsA.LogoObjectKey, f.SettingsA.CoverObjectKey })
                f.Storage.Objects[key!] = Blob(marker++);
            f.Queries.Reset();
            return f;
        }
        public HttpClient Client => Auth.Factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        public MenuDbContext Db(IServiceScope scope) => scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        public async ValueTask DisposeAsync() => await Auth.DisposeAsync();
    }

    private static string Item(MenuItemImage image, string file = "main.webp") => "/api/v1/public/media/items/" + image.Id.ToString("N") + "/" + file;
    private static async Task<(PublicMenu Menu, string Body)> Menu(HttpClient client, Restaurant restaurant, string lang = "ar")
    {
        var response = await client.GetAsync("/api/v1/public/menus/" + restaurant.PublicCode + "?lang=" + lang);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        return (JsonSerializer.Deserialize<PublicMenu>(body, JsonSerializerOptions.Web)!, body);
    }
    private static async Task AssertGeneric404(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.Null(response.Headers.ETag);
        Assert.Equal("Image not found.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }

    [SqlServerFact]
    public async Task Menu_dto_exposes_ordered_primary_and_gallery_images_branding_and_theme_without_keys_or_hidden_images()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var (arabic, body) = await Menu(client, f.A);
        Assert.Equal(4, f.Queries.Count); // restaurant, categories, items, images
        var item = Assert.Single(Assert.Single(arabic.Categories).Items);
        Assert.Equal(f.ItemA.Id, item.Id);
        Assert.Equal(new PublicImage(Item(f.Primary), 1600, 900, Item(f.Primary, "thumb.webp"), 480, 270, "فنجان"), item.PrimaryImage);
        Assert.Equal(new[] { f.Second.Id, f.Third.Id }, item.Gallery.Select(g => Guid.ParseExact(g.Url.Split('/')[6], "N")));
        Assert.Equal((900, 1600, 270, 480), (item.Gallery[0].Width, item.Gallery[0].Height, item.Gallery[0].ThumbnailWidth, item.Gallery[0].ThumbnailHeight));
        Assert.Equal((300, 200, 300, 200), (item.Gallery[1].Width, item.Gallery[1].Height, item.Gallery[1].ThumbnailWidth, item.Gallery[1].ThumbnailHeight)); // never upscaled
        Assert.Equal("حبوب", item.Gallery[0].Alt);
        Assert.Equal("قهوة", item.Gallery[1].Alt); // falls back to visible item name
        var english = Assert.Single(Assert.Single((await Menu(client, f.A, "en")).Menu.Categories).Items);
        Assert.Equal(new[] { "Cup", "حبوب", "Coffee" }, new[] { english.PrimaryImage!.Alt, english.Gallery[0].Alt, english.Gallery[1].Alt });

        Assert.Equal("amber", arabic.Restaurant.ThemeKey);
        var logo = arabic.Restaurant.Logo!;
        Assert.Matches("^/api/v1/public/media/restaurants/a{20}/logo/[0-9a-f]{32}/main\\.webp$", logo.Url);
        Assert.Equal((400, 400, f.A.Name), (logo.Width, logo.Height, logo.Alt));
        Assert.Equal((1600, 600, 480, 180, ""), (arabic.Restaurant.Cover!.Width, arabic.Restaurant.Cover.Height,
            arabic.Restaurant.Cover.ThumbnailWidth, arabic.Restaurant.Cover.ThumbnailHeight, arabic.Restaurant.Cover.Alt));

        foreach (var forbidden in new[] { f.A.Id.ToString(), f.B.Id.ToString(), f.Draft.Id.ToString("N"), f.Foreign.Id.ToString("N"), "مسودة",
            "objectKey", "restaurantId", "logoWidth", "createdAt", "sortOrder", "contentType" })
            Assert.DoesNotContain(forbidden, body, StringComparison.OrdinalIgnoreCase);
        foreach (var key in new[] { f.Primary.ObjectKey, f.SettingsA.LogoObjectKey!, f.SettingsA.CoverObjectKey! })
        {
            Assert.DoesNotContain(key, body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(key[37..69], body, StringComparison.OrdinalIgnoreCase); // random key segment
        }
        var json = JsonSerializer.Deserialize<JsonElement>(body);
        Assert.Equal(new[] { "cover", "currency", "logo", "name", "primaryColor", "slug", "themeKey" },
            json.GetProperty("restaurant").EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal(new[] { "alt", "height", "thumbnailHeight", "thumbnailUrl", "thumbnailWidth", "url", "width" },
            json.GetProperty("restaurant").GetProperty("logo").EnumerateObject().Select(p => p.Name).Order());

        // Tenant B: no settings row -> default theme, no branding; its own image only.
        var (b, bodyB) = await Menu(client, f.B);
        Assert.Equal(("teal", null, null), (b.Restaurant.ThemeKey, b.Restaurant.Logo, b.Restaurant.Cover));
        Assert.Equal(Item(f.Foreign), Assert.Single(Assert.Single(b.Categories).Items).PrimaryImage!.Url);
        Assert.DoesNotContain(f.Primary.Id.ToString("N"), bodyB);
    }

    [SqlServerFact]
    public async Task Gallery_is_bounded_per_item_and_legacy_or_dimensionless_branding_is_omitted()
    {
        await using var f = await Fixture.Create();
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = f.Db(scope);
            db.AddRange(Enumerable.Range(0, 12).Select(i => new MenuItemImage
            { RestaurantId = f.A.Id, MenuItemId = f.ItemA.Id, ObjectKey = Key(f.A.Id), Width = 10, Height = 10, SortOrder = 10 + i }));
            var settings = await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == f.A.Id);
            settings.LogoObjectKey = f.A.Id + "/legacy-logo.webp"; // non-canonical
            settings.CoverWidth = settings.CoverHeight = null;      // no dimensions => cannot reserve layout
            await db.SaveChangesAsync();
        }
        using var client = f.Client;
        var menu = (await Menu(client, f.A)).Menu;
        var item = Assert.Single(Assert.Single(menu.Categories).Items);
        Assert.Equal(PublicMedia.MaxImagesPerItem - 1, item.Gallery.Count);
        Assert.Equal(Item(f.Primary), item.PrimaryImage!.Url);
        Assert.Null(menu.Restaurant.Logo);
        Assert.Null(menu.Restaurant.Cover);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/public/media/restaurants/" + f.A.PublicCode + "/logo/" +
            PublicMedia.BrandingToken(f.A.Id + "/legacy-logo.webp") + "/main.webp")).StatusCode);
    }

    [SqlServerFact]
    public async Task Visible_image_variants_stream_with_immutable_cache_headers_etag_and_head()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        foreach (var (file, bytes) in new[] { ("main.webp", f.Storage.Objects[f.Primary.ObjectKey].Main), ("thumb.webp", f.Storage.Objects[f.Primary.ObjectKey].Thumbnail) })
        {
            f.Queries.Reset();
            var response = await client.GetAsync(Item(f.Primary, file));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(1, f.Queries.Count);
            Assert.Equal("image/webp", response.Content.Headers.ContentType!.MediaType);
            Assert.Equal(bytes, await response.Content.ReadAsByteArrayAsync());
            Assert.Equal(PublicMedia.CacheControl, response.Headers.CacheControl!.ToString());
            Assert.True(response.Headers.CacheControl.Public);
            Assert.Equal(TimeSpan.FromDays(365), response.Headers.CacheControl.MaxAge);
            Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.Equal("same-site", response.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
            Assert.False(response.Headers.Contains("Set-Cookie"));
            var etag = response.Headers.ETag!;
            Assert.False(etag.IsWeak);
            Assert.DoesNotContain(f.Primary.ObjectKey[37..69], etag.Tag);
            using var conditional = new HttpRequestMessage(HttpMethod.Get, Item(f.Primary, file));
            conditional.Headers.IfNoneMatch.Add(etag);
            var revalidated = await client.SendAsync(conditional);
            Assert.Equal(HttpStatusCode.NotModified, revalidated.StatusCode);
            Assert.Equal(PublicMedia.CacheControl, revalidated.Headers.CacheControl!.ToString());
            Assert.Empty(await revalidated.Content.ReadAsByteArrayAsync());
            var head = await client.SendAsync(new HttpRequestMessage(HttpMethod.Head, Item(f.Primary, file)));
            Assert.Equal(HttpStatusCode.OK, head.StatusCode);
            Assert.Empty(await head.Content.ReadAsByteArrayAsync());
        }
        Assert.NotEqual((await client.GetAsync(Item(f.Primary))).Headers.ETag, (await client.GetAsync(Item(f.Primary, "thumb.webp"))).Headers.ETag);
        // No write route exists; unsafe methods fall through to deny-by-default and never stream bytes.
        var post = await client.PostAsync(Item(f.Primary), null);
        Assert.False(post.IsSuccessStatusCode);
        Assert.NotEqual("image/webp", post.Content.Headers.ContentType?.MediaType);
    }

    [SqlServerFact]
    public async Task Hidden_deleted_foreign_and_unknown_images_share_generic_no_store_404_and_input_is_bounded()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        // Draft item image exists in storage and metadata, but is never served.
        await AssertGeneric404(await client.GetAsync(Item(f.Draft)));
        await AssertGeneric404(await client.GetAsync("/api/v1/public/media/items/" + Guid.NewGuid().ToString("N") + "/main.webp"));
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = f.Db(scope);
        var item = await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemA.Id);
        var category = await db.Set<Category>().SingleAsync(c => c.Id == f.CategoryA.Id);
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.A.Id);
        var states = new (string Name, Action Hide, Action Show)[]
        {
            ("item-unpublished", () => item.IsPublished = false, () => item.IsPublished = true),
            ("item-unavailable", () => item.IsAvailable = false, () => item.IsAvailable = true),
            ("item-deleted", () => item.IsDeleted = true, () => item.IsDeleted = false),
            ("category-unpublished", () => category.IsPublished = false, () => category.IsPublished = true),
            ("category-deleted", () => category.IsDeleted = true, () => category.IsDeleted = false),
            ("restaurant-unpublished", () => restaurant.IsPublished = false, () => restaurant.IsPublished = true),
            ("restaurant-suspended", () => restaurant.Status = "Suspended", () => restaurant.Status = "Active"),
        };
        foreach (var state in states)
        {
            state.Hide();
            await db.SaveChangesAsync();
            await AssertGeneric404(await client.GetAsync(Item(f.Primary)));
            await AssertGeneric404(await client.GetAsync(Item(f.Primary, "thumb.webp")));
            state.Show();
            await db.SaveChangesAsync();
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Item(f.Primary))).StatusCode);
        }
        // B's image remains B's: visible on its own, unaffected by A hiding; deleting metadata stops delivery though blob remains.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Item(f.Foreign))).StatusCode);
        db.Remove(await db.Set<MenuItemImage>().SingleAsync(i => i.Id == f.Second.Id));
        await db.SaveChangesAsync();
        Assert.True(f.Storage.Objects.ContainsKey(f.Second.ObjectKey));
        await AssertGeneric404(await client.GetAsync(Item(f.Second)));
        // Metadata present but blob missing: 404 (reconciliation warning), not 500.
        f.Storage.Objects.TryRemove(f.Third.ObjectKey, out _);
        await AssertGeneric404(await client.GetAsync(Item(f.Third)));

        var id = f.Primary.Id.ToString("N");
        foreach (var route in new[] { id.ToUpperInvariant() + "/main.webp", f.Primary.Id.ToString("D") + "/main.webp", id + "/original.webp",
            id + "/main.png", id + "/MAIN.webp", id + "/..%2Fmain.webp", id[..31] + "/main.webp", id + "0/main.webp" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/public/media/items/" + route)).StatusCode);
        var brand = "/api/v1/public/media/restaurants/";
        var token = PublicMedia.BrandingToken(f.SettingsA.LogoObjectKey!);
        foreach (var route in new[] { "AAAAAAAAAAAAAAAAAAAA/logo/" + token + "/main.webp", f.A.PublicCode + "/favicon/" + token + "/main.webp",
            f.A.PublicCode + "/logo/" + token.ToUpperInvariant() + "/main.webp", f.A.PublicCode + "/logo/" + token[..31] + "/main.webp",
            f.A.PublicCode + "/logo/" + token + "/x.webp" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(brand + route)).StatusCode);
    }

    [SqlServerFact]
    public async Task Branding_images_serve_only_current_token_for_owning_published_restaurant()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var menu = (await Menu(client, f.A)).Menu;
        var logo = await client.GetAsync(menu.Restaurant.Logo!.Url);
        Assert.Equal(HttpStatusCode.OK, logo.StatusCode);
        Assert.Equal(f.Storage.Objects[f.SettingsA.LogoObjectKey!].Main, await logo.Content.ReadAsByteArrayAsync());
        Assert.Equal(PublicMedia.CacheControl, logo.Headers.CacheControl!.ToString());
        Assert.Equal(f.Storage.Objects[f.SettingsA.CoverObjectKey!].Thumbnail,
            await (await client.GetAsync(menu.Restaurant.Cover!.ThumbnailUrl)).Content.ReadAsByteArrayAsync());
        // Swapping kind, or presenting A's token under B's public code, is a 404.
        await AssertGeneric404(await client.GetAsync(menu.Restaurant.Logo.Url.Replace("/logo/", "/cover/")));
        await AssertGeneric404(await client.GetAsync(menu.Restaurant.Logo.Url.Replace(f.A.PublicCode, f.B.PublicCode)));
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = f.Db(scope);
        var settings = await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == f.A.Id);
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.A.Id);
        restaurant.IsPublished = false;
        await db.SaveChangesAsync();
        await AssertGeneric404(await client.GetAsync(menu.Restaurant.Logo.Url));
        restaurant.IsPublished = true;
        // Replacement produces a new immutable URL; the old one stops resolving at the origin.
        var replacement = Key(f.A.Id);
        f.Storage.Objects[replacement] = Blob(99);
        settings.LogoObjectKey = replacement;
        await db.SaveChangesAsync();
        await AssertGeneric404(await client.GetAsync(menu.Restaurant.Logo.Url));
        var fresh = (await Menu(client, f.A)).Menu.Restaurant.Logo!;
        Assert.NotEqual(menu.Restaurant.Logo.Url, fresh.Url);
        Assert.Equal(f.Storage.Objects[replacement].Main, await (await client.GetAsync(fresh.Url)).Content.ReadAsByteArrayAsync());
    }

    [SqlServerFact]
    public async Task Cookies_and_forged_tenant_headers_do_not_change_delivery_or_trigger_identity_queries()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        using var request = new HttpRequestMessage(HttpMethod.Get, Item(f.Draft) + "?restaurantId=" + f.A.Id + "&preview=true");
        request.Headers.Add("Cookie", ".AspNetCore.Identity.Application=forged");
        request.Headers.Add("Authorization", "Bearer forged");
        request.Headers.Add("X-Restaurant-Id", f.A.Id.ToString());
        request.Headers.Add("X-Role", "PlatformAdmin");
        f.Queries.Reset();
        await AssertGeneric404(await client.SendAsync(request));
        Assert.Equal(1, f.Queries.Count);
    }

    [SqlServerFact]
    public async Task Default_development_storage_without_local_root_fails_closed_503()
    {
        await using var f = await Fixture.Create(storage: false);
        using var client = f.Client;
        var response = await client.GetAsync(Item(f.Primary));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.DoesNotContain(f.Primary.ObjectKey, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Local_storage_reads_both_variants_and_never_serves_pending_deleted_or_linked_objects()
    {
        var root = Path.Combine(Path.GetTempPath(), "dm-l1b-" + Guid.NewGuid().ToString("N"));
        try
        {
            var storage = new LocalImageStorage(root, NullLogger<LocalImageStorage>.Instance);
            var tenant = Guid.NewGuid();
            var key = Key(tenant);
            var blob = Blob(7);
            await storage.PutAsync(key, blob, CancellationToken.None);
            await using (var main = (await storage.OpenReadAsync(key, PublicImageVariant.Main, CancellationToken.None))!)
            using (var copy = new MemoryStream()) { await main.CopyToAsync(copy); Assert.Equal(blob.Main, copy.ToArray()); }
            await using (var thumb = (await storage.OpenReadAsync(key, PublicImageVariant.Thumbnail, CancellationToken.None))!)
            using (var copy = new MemoryStream()) { await thumb.CopyToAsync(copy); Assert.Equal(blob.Thumbnail, copy.ToArray()); }
            Assert.Null(await storage.OpenReadAsync(Key(tenant), PublicImageVariant.Main, CancellationToken.None));
            var bundle = Path.Combine(root, tenant.ToString("D"), key[37..69]);
            await File.WriteAllTextAsync(Path.Combine(bundle, "delete.pending"), "");
            Assert.Null(await storage.OpenReadAsync(key, PublicImageVariant.Main, CancellationToken.None));
            File.Delete(Path.Combine(bundle, "delete.pending"));
            var outside = Path.Combine(root, "outside.webp");
            await File.WriteAllBytesAsync(outside, [1, 2, 3]);
            File.Delete(Path.Combine(bundle, "thumbnail.webp"));
            File.CreateSymbolicLink(Path.Combine(bundle, "thumbnail.webp"), outside);
            await Assert.ThrowsAsync<IOException>(() => storage.OpenReadAsync(key, PublicImageVariant.Thumbnail, CancellationToken.None));
            foreach (var bad in new[] { "../" + key, key.ToUpperInvariant(), tenant + "/../x.webp", tenant.ToString("D") + "/" + key[37..69] + ".png" })
                Assert.Equal(400, (await Assert.ThrowsAsync<MediaException>(() => storage.OpenReadAsync(bad, PublicImageVariant.Main, CancellationToken.None))).Status);
            File.Delete(Path.Combine(bundle, "thumbnail.webp"));
            await storage.RemoveAsync(key, CancellationToken.None);
            Assert.Null(await storage.OpenReadAsync(key, PublicImageVariant.Main, CancellationToken.None));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public void Canonical_key_and_token_helpers_reject_foreign_or_malformed_values()
    {
        var tenant = Guid.NewGuid();
        var key = Key(tenant);
        Assert.True(PublicMedia.IsCanonicalKey(key, tenant));
        foreach (var bad in new[] { null, "", Key(Guid.NewGuid()), key.ToUpperInvariant(), key.Replace(".webp", ".png"), tenant + "/" + Guid.Empty.ToString("N") + ".webp",
            tenant + "/../" + Guid.NewGuid().ToString("N")[3..] + ".webp", tenant + "/" + Guid.NewGuid().ToString("D")[..32] + ".webp" })
            Assert.False(PublicMedia.IsCanonicalKey(bad, tenant));
        Assert.False(PublicMedia.IsCanonicalKey(key, Guid.Empty));
        var token = PublicMedia.BrandingToken(key);
        Assert.True(PublicMedia.IsToken(token));
        Assert.DoesNotContain(key[37..69], token);
        Assert.NotEqual(token, PublicMedia.BrandingToken(Key(tenant)));
        Assert.Equal((480, 270), PublicMedia.Thumbnail(1600, 900));
        Assert.Equal((100, 50), PublicMedia.Thumbnail(100, 50));
    }
}
