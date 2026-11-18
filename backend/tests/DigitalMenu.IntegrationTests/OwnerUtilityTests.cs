using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Api.Owner;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

public sealed class OwnerUtilityTests(Xunit.Abstractions.ITestOutputHelper output)
{
    private const string Origin = "http://localhost:4000"; // appsettings.Development.json
    private static string V(byte[] version) => Convert.ToBase64String(version);

    private static async Task<(long Version, int Audits)> State(Fixture f, Guid restaurant)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        return ((await db.Set<Restaurant>().SingleAsync(r => r.Id == restaurant)).PublishedMenuVersion,
            await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }
    private static void Spoof(Browser browser, Guid foreign)
    {
        browser.Client.DefaultRequestHeaders.Add("X-Restaurant-Id", foreign.ToString());
        browser.Client.DefaultRequestHeaders.Add("X-Role", "PlatformAdmin");
    }

    [SqlServerFact]
    public async Task Qr_returns_server_scoped_permanent_alias_and_downloadable_svg_png()
    {
        await using var f = await Fixture.Create();
        Spoof(f.A, f.RestaurantB);
        var before = await State(f, f.RestaurantA);
        var response = await f.A.Send(HttpMethod.Get, "/api/v1/admin/qr?restaurantId=" + f.RestaurantB);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var body = await response.Content.ReadAsStringAsync();
        var json = JsonSerializer.Deserialize<JsonElement>(body);
        Assert.Equal(new[] { "canonicalUrl", "isPublished", "pngUrl", "publicUrl", "svgUrl" }, json.EnumerateObject().Select(p => p.Name).Order());
        var qr = JsonSerializer.Deserialize<QrResponse>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(Origin + "/m/code-a", qr.PublicUrl);
        Assert.Equal(Origin + "/r/a", qr.CanonicalUrl);
        Assert.False(qr.IsPublished);
        Assert.DoesNotContain(f.RestaurantA.ToString(), body);
        Assert.DoesNotContain(f.OwnerA.ToString(), body);
        Assert.DoesNotContain("code-b", body);

        var expected = QrCode.EncodeText(qr.PublicUrl);
        Assert.Equal(qr.PublicUrl, QrCodeTests.Decode(expected));
        var svg = await f.A.Send(HttpMethod.Get, qr.SvgUrl);
        Assert.Equal(HttpStatusCode.OK, svg.StatusCode);
        Assert.Equal("image/svg+xml", svg.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment; filename=\"a-qr.svg\"", svg.Content.Headers.ContentDisposition!.ToString());
        Assert.Equal("nosniff", Assert.Single(svg.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("default-src 'none'; frame-ancestors 'none'", Assert.Single(svg.Headers.GetValues("Content-Security-Policy")));
        Assert.True(svg.Headers.CacheControl!.NoStore);
        Assert.Equal(expected.ToSvg(), await svg.Content.ReadAsStringAsync());
        var png = await f.A.Send(HttpMethod.Get, qr.PngUrl);
        Assert.Equal(HttpStatusCode.OK, png.StatusCode);
        Assert.Equal("image/png", png.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment; filename=\"a-qr.png\"", png.Content.Headers.ContentDisposition!.ToString());
        Assert.Equal(expected.ToPng(OwnerUtilities.PngScale), await png.Content.ReadAsByteArrayAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Get, "/api/v1/admin/qr/gif")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Get, "/api/v1/admin/qr/..%2Fsvg")).StatusCode);

        // Tenant B sees only its own alias; reads never change versions or audit.
        var b = (await (await f.B.Send(HttpMethod.Get, "/api/v1/admin/qr")).Content.ReadFromJsonAsync<QrResponse>())!;
        Assert.Equal(Origin + "/m/code-b", b.PublicUrl);
        Assert.Equal(before, await State(f, f.RestaurantA));
    }

    [SqlServerFact]
    public async Task Qr_and_summary_deny_guests_insecure_transport_and_suspended_tenants()
    {
        await using var f = await Fixture.Create();
        var guest = new Browser(f.Auth.Factory);
        foreach (var path in new[] { "/api/v1/admin/qr", "/api/v1/admin/qr/svg", "/api/v1/admin/qr/png", "/api/v1/admin/summary" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Get, path)).StatusCode);
            using var insecure = new HttpRequestMessage(HttpMethod.Get, "http://localhost" + path);
            insecure.Headers.Add("Cookie", string.Join("; ", f.A.Cookies.Select(c => c.Key + "=" + c.Value)));
            Assert.NotEqual(HttpStatusCode.OK, (await f.A.Client.SendAsync(insecure)).StatusCode);
        }
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).Status = "Suspended";
            await db.SaveChangesAsync();
        }
        // Same behavior as existing catalog endpoints: a suspended tenant's session is rejected.
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Get, "/api/v1/admin/qr/png")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Get, "/api/v1/admin/summary")).StatusCode);
    }

    [SqlServerFact]
    public async Task Missing_or_untrusted_public_origin_fails_closed_for_qr_but_not_summary()
    {
        foreach (var origin in new string?[] { null, "http://evil.example", "https://menu.example/path", "https://user:pw@menu.example", "javascript:alert(1)" })
        {
            await using var f = await Fixture.Create(s => s.PostConfigure<PublicSiteOptions>(o => o.Origin = origin));
            foreach (var path in new[] { "/api/v1/admin/qr", "/api/v1/admin/qr/svg", "/api/v1/admin/qr/png" })
            {
                var response = await f.A.Send(HttpMethod.Get, path);
                Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
                Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
                Assert.DoesNotContain("evil", await response.Content.ReadAsStringAsync());
            }
            var summary = (await (await f.A.Send(HttpMethod.Get, "/api/v1/admin/summary")).Content.ReadFromJsonAsync<SummaryResponse>())!;
            Assert.Null(summary.PublicUrl);
            Assert.Null(summary.CanonicalUrl);
        }
        await using var https = await Fixture.Create(s => s.PostConfigure<PublicSiteOptions>(o => o.Origin = "https://Menu.Example.com/"));
        var qr = (await (await https.A.Send(HttpMethod.Get, "/api/v1/admin/qr")).Content.ReadFromJsonAsync<QrResponse>())!;
        Assert.Equal("https://menu.example.com/m/code-a", qr.PublicUrl);
    }

    [SqlServerFact]
    public async Task Summary_counts_only_own_live_rows_and_is_read_only()
    {
        await using var f = await Fixture.Create();
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var published = new Category { RestaurantId = f.RestaurantA, NameAr = "p", IsPublished = true };
            var deleted = new Category { RestaurantId = f.RestaurantA, NameAr = "d", IsPublished = true, IsDeleted = true };
            db.AddRange(published, deleted,
                new MenuItem { RestaurantId = f.RestaurantA, CategoryId = published.Id, NameAr = "1", IsPublished = true },
                new MenuItem { RestaurantId = f.RestaurantA, CategoryId = published.Id, NameAr = "2", IsPublished = true, IsAvailable = false },
                new MenuItem { RestaurantId = f.RestaurantA, CategoryId = published.Id, NameAr = "3", IsPublished = true, IsDeleted = true, IsAvailable = false },
                new Category { RestaurantId = f.RestaurantB, NameAr = "Protected B extra", IsPublished = true },
                new MenuItem { RestaurantId = f.RestaurantB, CategoryId = f.CategoryB.Id, NameAr = "Protected B extra", IsPublished = true, IsAvailable = false });
            (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).IsPublished = true;
            await db.SaveChangesAsync();
        }
        var before = await State(f, f.RestaurantA);
        Spoof(f.A, f.RestaurantB);
        var response = await f.A.Send(HttpMethod.Get, "/api/v1/admin/summary?restaurantId=" + f.RestaurantB);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Protected B", body);
        Assert.DoesNotContain(f.RestaurantA.ToString(), body);
        Assert.DoesNotContain(f.OwnerA.ToString(), body);
        var json = JsonSerializer.Deserialize<JsonElement>(body);
        Assert.Equal(new[] { "canonicalUrl", "categories", "isPublished", "items", "name", "publicUrl", "slug" },
            json.EnumerateObject().Select(p => p.Name).Order());
        var summary = JsonSerializer.Deserialize<SummaryResponse>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        // Fixture A category and item are drafts; soft-deleted rows and B rows are excluded.
        Assert.Equal(new SummaryResponse("Restaurant A", "a", true, Origin + "/m/code-a", Origin + "/r/a",
            new CategoryCounts(2, 1), new ItemCounts(3, 2, 1)), summary);
        var b = (await (await f.B.Send(HttpMethod.Get, "/api/v1/admin/summary")).Content.ReadFromJsonAsync<SummaryResponse>())!;
        Assert.Equal(new CategoryCounts(2, 1), b.Categories);
        Assert.Equal(new ItemCounts(2, 1, 1), b.Items);
        Assert.Equal(before, await State(f, f.RestaurantA));
    }

    [SqlServerFact]
    public async Task Category_reorder_is_atomic_rowversion_checked_and_tenant_scoped()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var created = new List<CategoryResponse>();
        for (var i = 0; i < 3; i++)
        {
            var r = await f.A.Send(HttpMethod.Post, "/api/v1/admin/categories", new { nameAr = "c" + i, sortOrder = i, isPublished = true });
            created.Add((await r.Content.ReadFromJsonAsync<CategoryResponse>())!);
        }
        var before = await State(f, f.RestaurantA);
        const string route = "/api/v1/admin/categories/reorder";
        var request = new ReorderRequest(created.Select((c, i) => new ReorderEntry(c.Id, 10 - i, c.RowVersion)).ToArray());
        var response = await f.A.Send(HttpMethod.Post, route, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var result = (await response.Content.ReadFromJsonAsync<ReorderResponse>())!;
        Assert.Equal(created.Select(c => c.Id), result.Items.Select(i => i.Id));
        Assert.Equal(new[] { 10, 9, 8 }, result.Items.Select(i => i.SortOrder));
        Assert.All(result.Items.Zip(created), p => Assert.NotEqual(p.Second.RowVersion, p.First.RowVersion));
        var after = await State(f, f.RestaurantA);
        Assert.Equal((before.Version + 1, before.Audits + 1), after); // One menu-version bump and one audit for the batch.
        var page = (await (await f.A.Send(HttpMethod.Get, "/api/v1/admin/categories")).Content.ReadFromJsonAsync<CategoryPageResponse>())!;
        Assert.Equal(new[] { f.CategoryA.Id, created[2].Id, created[1].Id, created[0].Id }, page.Items.Select(c => c.Id));

        // Stale rowVersion (the pre-reorder one) rejects the whole batch with 412 and changes nothing.
        var stale = new ReorderRequest([new ReorderEntry(created[0].Id, 0, result.Items[0].RowVersion), new ReorderEntry(created[1].Id, 0, created[1].RowVersion)]);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await f.A.Send(HttpMethod.Post, route, stale)).StatusCode);
        // Foreign, missing and deleted IDs are an indistinguishable 404, decided before the version check.
        var deleted = await f.A.Send(HttpMethod.Post, "/api/v1/admin/categories", new { nameAr = "gone", sortOrder = 0, isPublished = false });
        var gone = (await deleted.Content.ReadFromJsonAsync<CategoryResponse>())!;
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, "/api/v1/admin/categories/" + gone.Id, new DeleteCategoryRequest(gone.RowVersion))).StatusCode);
        Spoof(f.A, f.RestaurantB);
        var mid = await State(f, f.RestaurantA);
        foreach (var foreign in new[] { (f.CategoryB.Id, V(f.CategoryB.RowVersion)), (Guid.NewGuid(), result.Items[0].RowVersion), (gone.Id, gone.RowVersion) })
        {
            var mixed = new ReorderRequest([new ReorderEntry(created[0].Id, 0, created[0].RowVersion), new ReorderEntry(foreign.Item1, 0, foreign.Item2)]);
            var denied = await f.A.Send(HttpMethod.Post, route + "?restaurantId=" + f.RestaurantB, mixed);
            Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            var text = await denied.Content.ReadAsStringAsync();
            Assert.DoesNotContain(foreign.Item1.ToString(), text);
            Assert.DoesNotContain("Protected B", text);
        }
        Assert.Equal(mid, await State(f, f.RestaurantA));
        Assert.Equal(1, (await State(f, f.RestaurantB)).Version);
        var current = (await (await f.A.Send(HttpMethod.Get, "/api/v1/admin/categories")).Content.ReadFromJsonAsync<CategoryPageResponse>())!;
        Assert.Equal(page.Items.Select(c => (c.Id, c.SortOrder)), current.Items.Select(c => (c.Id, c.SortOrder)));
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(f.CategoryB.SortOrder, (await db.Set<Category>().SingleAsync(c => c.Id == f.CategoryB.Id)).SortOrder);
        Assert.True(await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantAccessDenied") >= 3);
    }

    [SqlServerFact]
    public async Task Reorder_rejects_malformed_batches_and_requires_csrf()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var v = V(f.CategoryA.RowVersion);
        const string route = "/api/v1/admin/categories/reorder";
        var entry = new { id = f.CategoryA.Id, sortOrder = 1, rowVersion = v };
        var token = f.A.Token;
        f.A.Token = null;
        Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Post, route, new { items = new[] { entry } })).StatusCode);
        f.A.Token = token;
        Assert.Equal(HttpStatusCode.Unauthorized, (await new Browser(f.Auth.Factory).Send(HttpMethod.Get, "/api/v1/admin/summary")).StatusCode);
        var invalid = new object[]
        {
            new { }, new { items = Array.Empty<object>() }, new { items = (object?)null },
            new { items = new[] { entry, entry } },
            new { items = new[] { new { id = f.CategoryA.Id, sortOrder = -1, rowVersion = v } } },
            new { items = new[] { new { id = Guid.Empty, sortOrder = 1, rowVersion = v } } },
            new { items = new object[] { new { id = f.CategoryA.Id, rowVersion = v } } },
            new { items = new[] { new { id = f.CategoryA.Id, sortOrder = 1, rowVersion = "bad" } } },
            new { items = new[] { new { id = f.CategoryA.Id, sortOrder = 1, rowVersion = "AAAAAAAAAAAAAAAA" } } },
            new { items = new[] { entry }, restaurantId = f.RestaurantB },
            new { items = new object[] { new { id = f.CategoryA.Id, sortOrder = 1, rowVersion = v, restaurantId = f.RestaurantB } } },
            new { items = Enumerable.Range(0, 101).Select(_ => new { id = Guid.NewGuid(), sortOrder = 1, rowVersion = v }).ToArray() }
        };
        var before = await State(f, f.RestaurantA);
        foreach (var body in invalid)
        {
            var response = await f.A.Send(HttpMethod.Post, route, body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.Equal(before, await State(f, f.RestaurantA));
    }

    [SqlServerFact]
    public async Task Item_reorder_handles_a_full_batch_atomically_with_one_version_bump()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var items = new List<MenuItem>();
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            for (var i = 0; i < 99; i++)
                items.Add(new MenuItem { RestaurantId = f.RestaurantA, CategoryId = f.CategoryA.Id, NameAr = "i" + i, Price = i, SortOrder = i });
            db.AddRange(items);
            await db.SaveChangesAsync();
        }
        items.Insert(0, f.ItemA);
        var before = await State(f, f.RestaurantA);
        var request = new ReorderRequest(items.Select((x, i) => new ReorderEntry(x.Id, items.Count - i, V(x.RowVersion))).ToArray());
        Assert.True(JsonSerializer.SerializeToUtf8Bytes(request).Length < ReorderMetadata.BodyLimit);
        var clock = Stopwatch.StartNew();
        var response = await f.A.Send(HttpMethod.Post, "/api/v1/admin/items/reorder", request);
        clock.Stop();
        output.WriteLine($"100-item reorder: {clock.ElapsedMilliseconds} ms (local disposable SQL; not a production benchmark)");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<ReorderResponse>())!;
        Assert.Equal(100, result.Items.Count);
        Assert.Equal((before.Version + 1, before.Audits + 1), await State(f, f.RestaurantA));
        clock.Restart();
        var again = await f.A.Send(HttpMethod.Post, "/api/v1/admin/items/reorder",
            new ReorderRequest(result.Items.Select(x => new ReorderEntry(x.Id, x.SortOrder, x.RowVersion)).ToArray()));
        output.WriteLine($"100-item reorder (warm): {clock.ElapsedMilliseconds} ms");
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal((before.Version + 2, before.Audits + 2), await State(f, f.RestaurantA));
        var page = (await (await f.A.Send(HttpMethod.Get, "/api/v1/admin/items?pageSize=100")).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.Equal(items.Select(x => x.Id).Reverse(), page.Items.Select(x => x.Id));
        // A foreign item anywhere in the batch rejects all of it.
        var mixed = new ReorderRequest(result.Items.Take(5).Select(x => new ReorderEntry(x.Id, 0, x.RowVersion))
            .Append(new ReorderEntry(f.ItemB.Id, 0, V(f.ItemB.RowVersion))).ToArray());
        await f.B.Csrf();
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Post, "/api/v1/admin/items/reorder", mixed)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Post, "/api/v1/admin/items/reorder", mixed)).StatusCode);
        var unchanged = (await (await f.A.Send(HttpMethod.Get, "/api/v1/admin/items?pageSize=100")).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.Equal(page.Items.Select(x => (x.Id, x.SortOrder, x.RowVersion)), unchanged.Items.Select(x => (x.Id, x.SortOrder, x.RowVersion)));
    }
}
