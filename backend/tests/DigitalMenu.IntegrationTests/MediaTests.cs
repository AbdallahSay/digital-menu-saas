using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using DigitalMenu.Api.Media;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

public sealed class MediaTests
{
    private sealed class BodyFeature : IHttpMaxRequestBodySizeFeature
    {
        public bool IsReadOnly => false;
        public long? MaxRequestBodySize { get; set; }
    }
    private sealed class CaptureLimits : IStartupFilter
    {
        public ConcurrentDictionary<string, long> Limits { get; } = new();
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, continuation) =>
            {
                var feature = new BodyFeature();
                context.Features.Set<IHttpMaxRequestBodySizeFeature>(feature);
                await continuation(context);
                Limits[context.Request.Path.ToString()] = feature.MaxRequestBodySize ?? -1;
            });
            next(app);
        };
    }
    private static string Route(Guid item) => $"/api/v1/admin/items/{item}/images";
    private sealed class Storage : IImageStorage
    {
        public ConcurrentDictionary<string, NormalizedImage> Objects { get; } = new();
        public Func<Task>? AfterPut { get; set; }
        public bool FailPut { get; set; }
        public bool FailRemove { get; set; }
        public int Removals { get; private set; }
        public async Task PutAsync(string key, NormalizedImage image, CancellationToken ct)
        {
            if (FailPut) throw new IOException("Test-only storage failure");
            Assert.True(Objects.TryAdd(key, image));
            if (AfterPut is not null) await AfterPut();
        }
        public Task RemoveAsync(string key, CancellationToken ct)
        {
            Removals++;
            if (FailRemove) throw new IOException("Test-only cleanup failure");
            Objects.TryRemove(key, out _);
            return Task.CompletedTask;
        }
    }
    private static async Task<(Fixture Fixture, Storage Storage)> Setup()
    {
        var storage = new Storage();
        var f = await Fixture.Create(s => s.AddSingleton<IImageStorage>(storage));
        await f.A.Csrf();
        return (f, storage);
    }
    private static byte[] Picture(SKEncodedImageFormat format = SKEncodedImageFormat.Png, int width = 20, int height = 10)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.Teal);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }
    private static async Task<HttpResponseMessage> Upload(Browser browser, Guid item, byte[]? bytes = null, string mime = "image/png", string? extra = null, string filename = "../../arbitrary.png")
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Route(item));
        if (browser.Cookies.Count > 0) request.Headers.Add("Cookie", string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value)));
        if (browser.Token is not null) request.Headers.Add("X-XSRF-TOKEN", browser.Token);
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes ?? Picture());
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(file, "file", filename);
        if (extra is not null) form.Add(new StringContent("https://127.0.0.1/private"), extra);
        request.Content = form;
        return await browser.Client.SendAsync(request);
    }
    private static async Task<ImageResponse> Add(Browser browser, Guid item, byte[]? bytes = null, string mime = "image/png")
    {
        var result = await Upload(browser, item, bytes, mime);
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        Assert.True(result.Headers.CacheControl!.NoStore);
        var body = await result.Content.ReadAsStringAsync();
        Assert.DoesNotContain("objectKey", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("restaurantId", body, StringComparison.OrdinalIgnoreCase);
        return System.Text.Json.JsonSerializer.Deserialize<ImageResponse>(body, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
    }

    [SqlServerFact]
    public async Task Valid_jpeg_png_webp_uploads_are_normalized_with_private_keys_and_atomic_delete()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        foreach (var (format, mime) in new[] { (SKEncodedImageFormat.Jpeg, "image/jpeg"), (SKEncodedImageFormat.Png, "image/png"), (SKEncodedImageFormat.Webp, "image/webp") })
        {
            var image = await Add(f.A, f.ItemA.Id, Picture(format, 1800, 900), mime);
            Assert.Equal(1600, image.Width);
            Assert.Equal(800, image.Height);
            Assert.Equal("image/webp", image.ContentType);
            Assert.Equal(f.ItemA.Id, image.MenuItemId);
            var pair = Assert.Single(storage.Objects);
            Assert.StartsWith(f.RestaurantA.ToString("D") + "/", pair.Key);
            Assert.DoesNotContain("arbitrary", pair.Key);
            using var main = SKBitmap.Decode(pair.Value.Main);
            using var thumb = SKBitmap.Decode(pair.Value.Thumbnail);
            Assert.Equal(1600, main.Width);
            Assert.Equal(480, thumb.Width);
            Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + image.Id)).StatusCode);
            Assert.Empty(storage.Objects);
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + image.Id)).StatusCode);
        }
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(7, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantB)).PublishedMenuVersion);
        Assert.Equal(6, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Mime_spoof_svg_corruption_empty_oversize_and_bombs_are_rejected_without_storage()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var png = Picture();
        var bomb = png.ToArray();
        BinaryPrimitives.WriteInt32BigEndian(bomb.AsSpan(16, 4), 6001);
        FixPngHeaderCrc(bomb);
        foreach (var (bytes, mime, status) in new[]
        {
            (png, "image/jpeg", HttpStatusCode.UnsupportedMediaType),
            ("<svg/>"u8.ToArray(), "image/svg+xml", HttpStatusCode.UnsupportedMediaType),
            (new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 0 }, "image/png", HttpStatusCode.BadRequest),
            (Picture(SKEncodedImageFormat.Jpeg)[..40], "image/jpeg", HttpStatusCode.BadRequest),
            (Array.Empty<byte>(), "image/png", HttpStatusCode.BadRequest),
            (new byte[ImageNormalizer.MaxBytes + 1], "image/png", HttpStatusCode.RequestEntityTooLarge),
            (bomb, "image/png", HttpStatusCode.BadRequest)
        })
            Assert.Equal(status, (await Upload(f.A, f.ItemA.Id, bytes, mime)).StatusCode);
        Assert.Empty(storage.Objects);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.False(await db.Set<AuditEntry>().AnyAsync(a => a.Action == "TenantWriteCommitted"));
    }
    private static void FixPngHeaderCrc(byte[] png)
    {
        uint crc = uint.MaxValue;
        foreach (var b in png.AsSpan(12, 17))
        {
            crc ^= b;
            for (var bit = 0; bit < 8; bit++) crc = (crc >> 1) ^ ((crc & 1) != 0 ? 0xedb88320u : 0);
        }
        BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(29, 4), ~crc);
    }

    [SqlServerFact]
    public async Task Foreign_missing_deleted_items_and_wrong_image_parent_have_same_404()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var own = await Add(f.A, f.ItemA.Id);
        foreach (var id in new[] { f.ItemB.Id, Guid.NewGuid() })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await Upload(f.A, id)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Route(id) + "/" + own.Id)).StatusCode);
        }
        foreach (var image in new[] { f.ImageB.Id, Guid.NewGuid() })
        {
            var result = await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + image);
            Assert.Equal(HttpStatusCode.NotFound, result.StatusCode);
            var body = await result.Content.ReadAsStringAsync();
            Assert.Contains("Resource not found.", body);
            Assert.DoesNotContain(image.ToString(), body);
        }
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var other = new MenuItem { RestaurantId = f.RestaurantA, CategoryId = f.CategoryA.Id, NameAr = "other" };
        db.Add(other);
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Route(other.Id) + "/" + own.Id)).StatusCode);
        (await db.Set<MenuItem>().SingleAsync(i => i.Id == other.Id)).IsDeleted = true;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await Upload(f.A, other.Id)).StatusCode);
        Assert.Single(storage.Objects);
        Assert.Equal(0, storage.Removals);
    }

    [SqlServerFact]
    public async Task Csrf_scope_spoofing_unknown_form_fields_and_upload_rate_are_enforced()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var token = f.A.Token;
        foreach (var invalid in new string?[] { null, "forged" })
        {
            f.A.Token = invalid;
            Assert.Equal(HttpStatusCode.BadRequest, (await Upload(f.A, f.ItemA.Id)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + f.ImageA.Id)).StatusCode);
        }
        f.A.Token = token;
        f.A.Client.DefaultRequestHeaders.Add("X-Restaurant-Id", f.RestaurantB.ToString());
        foreach (var field in new[] { "restaurantId", "role", "objectKey", "url", "sortOrder" })
            Assert.Equal(HttpStatusCode.BadRequest, (await Upload(f.A, f.ItemA.Id, extra: field)).StatusCode);
        Assert.Empty(storage.Objects);
        HttpResponseMessage? last = null;
        for (var i = 0; i < 5; i++) last = await Upload(f.A, f.ItemA.Id);
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        Assert.All(storage.Objects.Keys, key => Assert.StartsWith(f.RestaurantA.ToString("D") + "/", key));
    }

    [SqlServerFact]
    public async Task Unauthorized_suspended_and_expired_sessions_cannot_upload_or_delete()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var guest = new Browser(f.Auth.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(guest, f.ItemA.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + f.ImageA.Id)).StatusCode);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var roles = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.RoleManager<Microsoft.AspNetCore.Identity.IdentityRole<Guid>>>();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        await roles.CreateAsync(new("PlatformAdmin"));
        var admin = new ApplicationUser { UserName = "f08-admin@example.test", Email = "f08-admin@example.test" };
        Assert.True((await users.CreateAsync(admin, f.Auth.Password)).Succeeded);
        await users.AddToRoleAsync(admin, "PlatformAdmin");
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Login(f.Auth.Password, admin.Email)).StatusCode);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(guest, f.ItemA.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + f.ImageA.Id)).StatusCode);
        (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).Status = "Suspended";
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(f.A, f.ItemA.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + f.ImageA.Id)).StatusCode);
        f.Auth.Clock.Advance(TimeSpan.FromMinutes(31));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(f.B, f.ItemB.Id)).StatusCode);
        Assert.Empty(storage.Objects);
    }

    [SqlServerFact]
    public async Task Concurrent_item_change_cleans_uncommitted_storage_and_failed_cleanup_keeps_private_orphan()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        storage.AfterPut = async () =>
        {
            var item = await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemA.Id);
            item.Price += 1;
            await db.SaveChangesAsync();
        };
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Upload(f.A, f.ItemA.Id)).StatusCode);
        Assert.Empty(storage.Objects);
        storage.FailRemove = true;
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await Upload(f.A, f.ItemA.Id)).StatusCode);
        Assert.Single(storage.Objects);
        Assert.Equal(2, storage.Removals);
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.False(await db.Set<AuditEntry>().AnyAsync(a => a.Action == "TenantWriteCommitted"));
        Assert.Equal(2, await db.Set<MenuItemImage>().CountAsync());
    }

    [SqlServerFact]
    public async Task Simultaneous_uploads_serialize_item_metadata_and_cleanup_the_losing_object()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        var arrived = 0;
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        storage.AfterPut = async () =>
        {
            if (Interlocked.Increment(ref arrived) == 2) gate.SetResult();
            await gate.Task.WaitAsync(TimeSpan.FromSeconds(15));
        };
        var responses = await Task.WhenAll(Upload(f.A, f.ItemA.Id), Upload(f.A, f.ItemA.Id));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.Conflict);
        Assert.Single(storage.Objects);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(2, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(1, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Multipart_above_32KiB_uses_its_own_bounded_policy_and_json_keeps_32KiB()
    {
        var storage = new Storage();
        var limits = new CaptureLimits();
        await using var f = await Fixture.Create(s =>
        {
            s.AddSingleton<IImageStorage>(storage);
            s.AddSingleton<IStartupFilter>(limits);
        });
        await f.A.Csrf();
        using var bitmap = new SKBitmap(200, 200);
        var random = new Random(42);
        bitmap.Pixels = Enumerable.Range(0, 40000).Select(_ => new SKColor((byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256))).ToArray();
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        Assert.True(data.Size > 32768);
        await Add(f.A, f.ItemA.Id, data.ToArray());
        Assert.Equal(MediaEndpoints.BodyLimit, limits.Limits[Route(f.ItemA.Id)]);
        var itemRoute = "/api/v1/admin/items/" + f.ItemA.Id;
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Get, itemRoute)).StatusCode);
        Assert.Equal(32768, limits.Limits[itemRoute]);
    }

    [SqlServerFact]
    public async Task Local_storage_and_sql_metadata_agree_after_upload_and_delete()
    {
        var root = Path.Combine(Path.GetTempPath(), "F08_SQL_" + Guid.NewGuid().ToString("N"));
        var storage = new LocalImageStorage(root, NullLogger<LocalImageStorage>.Instance);
        await using var f = await Fixture.Create(s => s.AddSingleton<IImageStorage>(storage));
        await f.A.Csrf();
        var image = await Add(f.A, f.ItemA.Id);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var key = (await db.Set<MenuItemImage>().SingleAsync(i => i.Id == image.Id)).ObjectKey;
        var bundle = Path.Combine(root, key.Split('/')[0], key.Split('/')[1][..32]);
        Assert.True(File.Exists(Path.Combine(bundle, "main.webp")));
        Assert.True(File.Exists(Path.Combine(bundle, "thumbnail.webp")));
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + image.Id)).StatusCode);
        Assert.False(Directory.Exists(bundle));
        Assert.False(await db.Set<MenuItemImage>().AsNoTracking().AnyAsync(i => i.Id == image.Id));
        Directory.Delete(Path.Combine(root, key.Split('/')[0]), false);
        Directory.Delete(root, false);
    }

    [SqlServerFact]
    public async Task Parallel_A_B_uploads_have_independent_storage_and_audit_scope()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        await f.B.Csrf();
        var responses = await Task.WhenAll(Upload(f.A, f.ItemA.Id), Upload(f.B, f.ItemB.Id));
        var images = new ImageResponse[2];
        for (var i = 0; i < 2; i++)
        {
            // Serializable range locks may legitimately deadlock even across tenants.
            // Verify the public 409/retry contract; never bypass or weaken isolation.
            Assert.True(responses[i].StatusCode is HttpStatusCode.Created or HttpStatusCode.Conflict);
            images[i] = responses[i].StatusCode == HttpStatusCode.Conflict
                ? await Add(i == 0 ? f.A : f.B, i == 0 ? f.ItemA.Id : f.ItemB.Id)
                : (await responses[i].Content.ReadFromJsonAsync<ImageResponse>())!;
        }
        Assert.Equal(2, storage.Objects.Count);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        foreach (var (image, tenant) in new[] { (images[0], f.RestaurantA), (images[1], f.RestaurantB) })
        {
            var metadata = await db.Set<MenuItemImage>().SingleAsync(i => i.Id == image.Id);
            Assert.Equal(tenant, metadata.RestaurantId);
            Assert.StartsWith(tenant.ToString("D") + "/", metadata.ObjectKey);
            Assert.True(storage.Objects.ContainsKey(metadata.ObjectKey));
            Assert.Equal(2, (await db.Set<Restaurant>().SingleAsync(r => r.Id == tenant)).PublishedMenuVersion);
            Assert.Equal(1, await db.Set<AuditEntry>().CountAsync(a => a.RestaurantId == tenant && a.Action == "TenantWriteCommitted"));
        }
    }

    [SqlServerFact]
    public async Task Storage_failure_never_commits_metadata_and_delete_cleanup_failure_is_safe()
    {
        var (f, storage) = await Setup();
        await using var cleanup = f;
        storage.FailPut = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Upload(f.A, f.ItemA.Id)).StatusCode);
        storage.FailPut = false;
        var image = await Add(f.A, f.ItemA.Id);
        storage.FailRemove = true;
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route(f.ItemA.Id) + "/" + image.Id)).StatusCode);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.False(await db.Set<MenuItemImage>().AnyAsync(i => i.Id == image.Id));
        Assert.Equal(3, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(2, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
        Assert.Single(storage.Objects); // Private and inaccessible; deletion can be retried safely.
    }

    [Fact]
    public void Truncated_containers_crc_corruption_and_pixel_bombs_fail_before_allocation()
    {
        using var body = new UploadReadStream(new MemoryStream(new byte[100]), 50);
        Assert.Equal(413, Assert.Throws<MediaException>(() => body.Read(new byte[100], 0, 100)).Status);
        var normalizer = new ImageNormalizer();
        var png = Picture();
        Assert.Equal(400, Assert.Throws<MediaException>(() => normalizer.Normalize(png[..^12], "image/png")).Status);
        var corrupt = png.ToArray();
        corrupt[32] ^= 1;
        Assert.Equal(400, Assert.Throws<MediaException>(() => normalizer.Normalize(corrupt, "image/png")).Status);
        var bomb = png.ToArray();
        BinaryPrimitives.WriteInt32BigEndian(bomb.AsSpan(16, 4), 5000);
        BinaryPrimitives.WriteInt32BigEndian(bomb.AsSpan(20, 4), 5000);
        FixPngHeaderCrc(bomb);
        Assert.Equal(400, Assert.Throws<MediaException>(() => normalizer.Normalize(bomb, "image/png")).Status);
        Assert.Equal(400, Assert.Throws<MediaException>(() => normalizer.Normalize(Picture(SKEncodedImageFormat.Webp)[..^1], "image/webp")).Status);
        Assert.Equal(400, Assert.Throws<MediaException>(() => normalizer.Normalize(Picture(SKEncodedImageFormat.Jpeg)[..^2], "image/jpeg")).Status);
    }

    [Fact]
    public async Task Local_storage_is_immutable_traversal_safe_and_retries_only_marked_cleanup()
    {
        var root = Path.Combine(Path.GetTempPath(), "F08_Test_" + Guid.NewGuid().ToString("N"));
        var storage = new LocalImageStorage(root, NullLogger<LocalImageStorage>.Instance);
        var key = Guid.NewGuid().ToString("D") + "/" + Guid.NewGuid().ToString("N") + ".webp";
        var image = new ImageNormalizer().Normalize(Picture(), "image/png");
        foreach (var forged in new[] { "../escape.webp", "/absolute.webp", key.Replace('/', '\\'), key + "/..", key.Replace(".webp", "%2ewebp") })
            await Assert.ThrowsAsync<MediaException>(() => storage.PutAsync(forged, image, default));
        await storage.PutAsync(key, image, default);
        await Assert.ThrowsAsync<IOException>(() => storage.PutAsync(key, image, default));
        var bundle = Path.Combine(root, key.Split('/')[0], key.Split('/')[1][..32]);
        var thumbnail = Path.Combine(bundle, "thumbnail.webp");
        File.Delete(thumbnail);
        Directory.CreateDirectory(thumbnail); // Deterministic cross-platform delete failure.
        await Assert.ThrowsAnyAsync<Exception>(() => storage.RemoveAsync(key, default));
        Assert.True(File.Exists(Path.Combine(bundle, "delete.pending")));
        Directory.Delete(thumbnail, false);
        var next = key.Split('/')[0] + "/" + Guid.NewGuid().ToString("N") + ".webp";
        await storage.PutAsync(next, image, default);
        Assert.False(Directory.Exists(bundle));
        await storage.RemoveAsync(next, default);
        Directory.Delete(Path.Combine(root, key.Split('/')[0]), false);
        Directory.Delete(root, false);
    }

    [Fact]
    public void Jpeg_exif_orientation_is_applied_and_metadata_is_removed()
    {
        var jpeg = Picture(SKEncodedImageFormat.Jpeg, 20, 10);
        byte[] exif = [69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
        var withExif = new List<byte> { 255, 216, 255, 225, 0, (byte)(exif.Length + 2) };
        withExif.AddRange(exif);
        withExif.AddRange(jpeg.Skip(2));
        var result = new ImageNormalizer().Normalize(withExif.ToArray(), "image/jpeg");
        Assert.Equal(10, result.Width);
        Assert.Equal(20, result.Height);
        Assert.DoesNotContain("EXIF", System.Text.Encoding.ASCII.GetString(result.Main), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("EXIF", System.Text.Encoding.ASCII.GetString(result.Thumbnail), StringComparison.OrdinalIgnoreCase);
    }
}
