using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Api.Platform;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;

namespace DigitalMenu.IntegrationTests;

public sealed class PublicMenuTests(Xunit.Abstractions.ITestOutputHelper output)
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
    // Deterministic mid-read races: flips the version (or visibility) on a
    // separate connection exactly when a fresh load attempt starts its content
    // queries. The categories query opens the content phase of every attempt.
    // One instance is shared by every scope of its fixture (Bind once, counter
    // persists across requests), and it connects with the fixture's original
    // connection string: an already-open connection strips credentials when
    // Persist Security Info=false, which CI (SQL auth) relies on.
    private sealed class MidReadFlipper(int maxFlips, bool unpublish) : DbCommandInterceptor
    {
        private string? connectionString;
        private Guid restaurantId;
        private int flips;
        public readonly List<string> Seen = new();
        public int Flips => flips;
        public bool Bound => connectionString is not null;
        public void Bind(string connection, Guid restaurant)
        { connectionString = connection; restaurantId = restaurant; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data,
            InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            lock (Seen) Seen.Add((command.CommandText.StartsWith("SELECT TOP(2) [r]") || command.CommandText.Contains("FROM [Categories]") ? "[tx=" + (command.Transaction?.IsolationLevel.ToString() ?? "none") + ",conn=" + command.Connection?.State + "] " : "") + command.CommandText.Replace("\n", " ").Substring(0, Math.Min(90, command.CommandText.Length)));
            if (connectionString is not null && flips < maxFlips &&
                command.CommandText.Contains("FROM [Categories]", StringComparison.Ordinal))
            {
                flips++;
                using var connection = new SqlConnection(connectionString);
                connection.Open();
                using var flip = connection.CreateCommand();
                flip.CommandText = unpublish
                    ? "UPDATE Restaurants SET IsPublished = 0 WHERE Id = @id"
                    : "UPDATE Restaurants SET PublishedMenuVersion = PublishedMenuVersion + 1 WHERE Id = @id; " +
                        "UPDATE MenuItems SET NameAr = N'flipped-" + flips + "' WHERE RestaurantId = @id";
                flip.Parameters.Add(new SqlParameter("@id", restaurantId));
                var affected = flip.ExecuteNonQuery();
                lock (Seen) Seen.Add("[FLIP affected=" + affected + " db=" + connection.Database + " id=" + restaurantId + " tx=" + (System.Transactions.Transaction.Current is null ? "noscope" : "AMBIENT") + "]");
            }
            return ValueTask.FromResult(result);
        }
    }
    private sealed class Fixture : IAsyncDisposable
    {
        public AuthFixture Auth { get; private set; } = null!;
        public Counter Queries { get; } = new();
        public Restaurant A { get; } = new() { Name = "مطعم A", Slug = "public-a", PublicCode = new string('a', 20), IsPublished = true };
        public Restaurant B { get; } = new() { Name = "Restaurant B", Slug = "public-b", PublicCode = new string('b', 20), IsPublished = true };
        public Category CategoryA { get; } = new() { NameAr = "طعام", NameEn = "Food", IsPublished = true };
        public Category CategoryB { get; } = new() { NameAr = "قسم B", IsPublished = true };
        public MenuItem ItemA { get; } = new() { NameAr = "قهوة", NameEn = "Coffee", DescriptionAr = "وصف", DescriptionEn = " ", Price = 12.50m, IsPublished = true };
        public MenuItemImage ImageA { get; } = new() { AltAr = "صورة قهوة", AltEn = "Coffee photo", Width = 20, Height = 10 };
        public Guid Owner { get; private set; }
        public static async Task<Fixture> Create(MidReadFlipper? flipper = null)
        {
            var f = new Fixture();
            f.Auth = await AuthFixture.Create(empty: true, configure: s => s.AddDbContext<MenuDbContext>(o =>
            {
                o.AddInterceptors(f.Queries);
                if (flipper is not null) o.AddInterceptors(flipper); // same instance in every scope
            }));
            flipper?.Bind(f.Auth.Connection, f.A.Id);
            using var scope = f.Auth.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
            var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "public-owner-private@example.test", UserName = "public-owner-private@example.test" };
            Assert.True((await users.CreateAsync(user, f.Auth.Password)).Succeeded);
            f.Owner = user.Id;
            f.CategoryA.RestaurantId = f.ItemA.RestaurantId = f.ImageA.RestaurantId = f.A.Id;
            f.CategoryB.RestaurantId = f.B.Id;
            f.ItemA.CategoryId = f.CategoryA.Id;
            f.ImageA.MenuItemId = f.ItemA.Id;
            f.ImageA.ObjectKey = f.A.Id + "/private-image.webp";
            db.AddRange(f.A, f.B, f.CategoryA, f.CategoryB, f.ItemA, f.ImageA,
                new RestaurantUser { RestaurantId = f.A.Id, UserId = user.Id },
                new RestaurantSettings { RestaurantId = f.A.Id, PrimaryColor = "#123456", ContactPhoneOptional = "private-phone", AddressOptional = "private-address", PublishedContactDetailsFlags = 3, LogoObjectKey = f.A.Id + "/private.webp" });
            await db.SaveChangesAsync();
            f.Queries.Reset();
            return f;
        }
        public HttpClient Client => Auth.Factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        public async Task<Browser> Login()
        {
            var browser = new Browser(Auth.Factory);
            await browser.Csrf();
            Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(Auth.Password, "public-owner-private@example.test")).StatusCode);
            await browser.Csrf();
            return browser;
        }
        public async ValueTask DisposeAsync() => await Auth.DisposeAsync();
        // Runs an action inside a request-like scope authenticated as the owner.
        public async Task Run(Browser browser, Func<IServiceProvider, DefaultHttpContext, Task> action)
        {
            using var scope = Auth.Factory.Services.CreateScope();
            var http = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
            http.Request.Scheme = "https";
            http.Request.Host = new HostString("localhost");
            http.Response.Body = new MemoryStream();
            http.Request.Headers.Cookie = string.Join("; ", browser.Cookies.Select(c => c.Key + "=" + c.Value));
            var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
            var previous = accessor.HttpContext;
            accessor.HttpContext = http;
            try { await action(scope.ServiceProvider, http); }
            finally { accessor.HttpContext = previous; }
        }
    }
    private static string Code(Restaurant r, string? lang = null) => "/api/v1/public/menus/" + r.PublicCode + (lang is null ? "" : "?lang=" + lang);
    private static string Slug(Restaurant r) => "/api/v1/public/restaurants/by-slug/" + r.Slug;
    private static async Task<PublicMenu> Menu(HttpClient client, string route)
    {
        var response = await client.GetAsync(route);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Version-keyed revalidation contract: stored copies must revalidate.
        Assert.True(response.Headers.CacheControl!.NoCache);
        Assert.False(response.Headers.CacheControl!.NoStore);
        Assert.NotNull(response.Headers.ETag);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        return (await response.Content.ReadFromJsonAsync<PublicMenu>())!;
    }

    [SqlServerFact]
    public async Task Code_and_slug_return_public_allowlists_with_opaque_media_urls_and_no_private_data()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var arabic = await Menu(client, Code(f.A));
        Assert.Equal(5, f.Queries.Count); // Miss: live probe, 3 content queries, confirm probe.
        Assert.Equal("ar", arabic.Language);
        Assert.Equal("#123456", arabic.Restaurant.PrimaryColor);
        // Media projects only through opaque public URLs: the image's own random
        // id and the already-public code - never the restaurant Guid or object key.
        Assert.Equal("/api/v1/public/media/logo/" + f.A.PublicCode, arabic.Restaurant.LogoUrl);
        var item = Assert.Single(Assert.Single(arabic.Categories).Items);
        Assert.Equal("قهوة", item.Name);
        Assert.NotNull(item.Image);
        var image = item.Image!;
        Assert.Equal("/api/v1/public/media/items/" + f.ImageA.Id + "/main", image.Url);
        Assert.Equal("/api/v1/public/media/items/" + f.ImageA.Id + "/thumbnail", image.ThumbnailUrl);
        Assert.Equal("صورة قهوة", image.Alt);
        Assert.Equal(20, image.Width);
        Assert.Equal(10, image.Height);
        var english = await Menu(client, Code(f.A, "en"));
        Assert.Equal("Food", Assert.Single(english.Categories).Name);
        var englishItem = Assert.Single(Assert.Single(english.Categories).Items);
        Assert.Equal("Coffee", englishItem.Name);
        Assert.Equal("وصف", englishItem.Description);
        Assert.NotNull(englishItem.Image);
        Assert.Equal("Coffee photo", englishItem.Image!.Alt);
        var slug = await Menu(client, Slug(f.A));
        Assert.Equal(arabic.Restaurant, slug.Restaurant);
        var body = await (await client.GetAsync(Code(f.A))).Content.ReadAsStringAsync();
        // The seeded object keys literally contain "private" and the restaurant
        // Guid: any leak of a key or id into the payload fails this.
        foreach (var forbidden in new[] { "private", f.A.Id.ToString(), f.B.Id.ToString(), f.Owner.ToString(), "restaurantId", "userId", "objectKey", "rowVersion", "isPublished", "isAvailable", "token", "email", "status" })
            Assert.DoesNotContain(forbidden, body, StringComparison.OrdinalIgnoreCase);
        var json = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(body);
        Assert.Equal(new[] { "categories", "language", "publishedMenuVersion", "restaurant" }, json.EnumerateObject().Select(p => p.Name).Order());
    }

    [SqlServerFact]
    public async Task Visibility_matrix_excludes_all_hidden_categories_and_items_and_keeps_empty_menu()
    {
        await using var f = await Fixture.Create();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var hidden = new Category { RestaurantId = f.A.Id, NameAr = "hidden-category" };
        var deleted = new Category { RestaurantId = f.A.Id, NameAr = "deleted-category", IsPublished = true, IsDeleted = true };
        var empty = new Category { RestaurantId = f.A.Id, NameAr = "empty", IsPublished = true, SortOrder = 3 };
        db.AddRange(hidden, deleted, empty);
        foreach (var category in new[] { hidden, deleted })
            db.Add(new MenuItem { RestaurantId = f.A.Id, CategoryId = category.Id, NameAr = "secret-parent", IsPublished = true });
        db.AddRange(new MenuItem { RestaurantId = f.A.Id, CategoryId = f.CategoryA.Id, NameAr = "draft" },
            new MenuItem { RestaurantId = f.A.Id, CategoryId = f.CategoryA.Id, NameAr = "unavailable", IsPublished = true, IsAvailable = false },
            new MenuItem { RestaurantId = f.A.Id, CategoryId = f.CategoryA.Id, NameAr = "deleted", IsPublished = true, IsDeleted = true });
        await db.SaveChangesAsync();
        using var client = f.Client;
        var menu = await Menu(client, Code(f.A));
        Assert.Equal(new[] { f.CategoryA.Id, empty.Id }, menu.Categories.Select(c => c.Id));
        Assert.Equal(f.ItemA.Id, Assert.Single(menu.Categories[0].Items).Id);
        Assert.Empty(menu.Categories[1].Items);
        Assert.Empty(Assert.Single((await Menu(client, Code(f.B))).Categories).Items);
        (await db.Set<Category>().SingleAsync(c => c.Id == f.CategoryB.Id)).IsPublished = false;
        // Direct DbContext writes bypass CommitAsync, so mirror its contract:
        // every projected change bumps the version transactionally.
        (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.B.Id)).PublishedMenuVersion++;
        await db.SaveChangesAsync();
        Assert.Empty((await Menu(client, Code(f.B))).Categories);
    }

    [SqlServerFact]
    public async Task Missing_suspended_and_unpublished_tenants_share_generic_404_and_input_is_bounded()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.A.Id);
        foreach (var state in new[] { "missing", "unpublished", "suspended" })
        {
            restaurant.IsPublished = state != "unpublished";
            restaurant.Status = state == "suspended" ? "Suspended" : "Active";
            await db.SaveChangesAsync();
            foreach (var route in state == "missing" ? new[] { "/api/v1/public/menus/" + new string('c', 20), "/api/v1/public/restaurants/by-slug/unknown" } : new[] { Code(f.A), Slug(f.A) })
            {
                var response = await client.GetAsync(route);
                Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
                var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
                Assert.Equal("Menu not found.", problem.GetProperty("title").GetString());
                Assert.True(response.Headers.CacheControl!.NoStore);
                Assert.DoesNotContain(f.A.Name, problem.ToString());
            }
        }
        foreach (var route in new[] { Code(f.B, "fr"), Code(f.B, ""), "/api/v1/public/menus/short", "/api/v1/public/menus/" + new string('A', 20),
            "/api/v1/public/restaurants/by-slug/-bad", "/api/v1/public/restaurants/by-slug/a--b", "/api/v1/public/restaurants/by-slug/" + new string('x', 101) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(route)).StatusCode);
    }

    [SqlServerFact]
    public async Task Cookies_forged_scope_and_expired_sessions_never_change_public_data_or_query_count()
    {
        await using var f = await Fixture.Create();
        var owner = await f.Login();
        f.Auth.Clock.Advance(TimeSpan.FromMinutes(31));
        using var request = new HttpRequestMessage(HttpMethod.Get, Code(f.B, "en") + "&restaurantId=" + f.A.Id);
        request.Headers.Add("Cookie", string.Join("; ", owner.Cookies.Select(c => c.Key + "=" + c.Value)));
        request.Headers.Add("Authorization", "Bearer forged");
        request.Headers.Add("X-Restaurant-Id", f.A.Id.ToString());
        request.Headers.Add("X-Role", "PlatformAdmin");
        f.Queries.Reset();
        var response = await owner.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.Equal(5, f.Queries.Count); // Cold-cache miss; no Identity/security-stamp/membership queries.
        var menu = (await response.Content.ReadFromJsonAsync<PublicMenu>())!;
        Assert.Equal(f.B.Name, menu.Restaurant.Name);
        Assert.Equal(f.CategoryB.Id, Assert.Single(menu.Categories).Id);
        Assert.Empty(menu.Categories[0].Items);
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.Send(HttpMethod.Get, "/me")).StatusCode);
    }

    [SqlServerFact]
    public async Task Fresh_reads_reflect_owner_item_category_edits_and_platform_brand_status_changes()
    {
        await using var f = await Fixture.Create();
        var owner = await f.Login();
        using var client = f.Client;
        var before = await Menu(client, Code(f.A));
        var changed = await owner.Send(HttpMethod.Put, "/api/v1/admin/items/" + f.ItemA.Id,
            new UpdateItemRequest(f.CategoryA.Id, "new-name", null, "new-description", null, 99, "EGP", 1, true, false, Convert.ToBase64String(f.ItemA.RowVersion)));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var item = (await changed.Content.ReadFromJsonAsync<ItemResponse>())!;
        var after = await Menu(client, Code(f.A));
        Assert.Equal(before.PublishedMenuVersion + 1, after.PublishedMenuVersion);
        Assert.Empty(Assert.Single(after.Categories).Items);
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Put, "/api/v1/admin/items/" + f.ItemA.Id,
            new UpdateItemRequest(f.CategoryA.Id, "new-name", null, "new-description", null, 99, "EGP", 1, true, true, item.RowVersion))).StatusCode);
        Assert.Equal(99, Assert.Single(Assert.Single((await Menu(client, Slug(f.A))).Categories).Items).Price);
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Put, "/api/v1/admin/categories/" + f.CategoryA.Id,
            new UpdateCategoryRequest("طعام", null, 0, false, Convert.ToBase64String(f.CategoryA.RowVersion)))).StatusCode);
        Assert.Empty((await Menu(client, Code(f.A))).Categories);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.A.Id);
        restaurant.Name = "Rebranded";
        restaurant.PublishedMenuVersion++;
        (await db.Set<RestaurantSettings>().SingleAsync(s => s.RestaurantId == f.A.Id)).PrimaryColor = "#ABCDEF";
        await db.SaveChangesAsync();
        var rebranded = await Menu(client, Code(f.A));
        Assert.Equal("Rebranded", rebranded.Restaurant.Name);
        Assert.Equal("#ABCDEF", rebranded.Restaurant.PrimaryColor);
        var roles = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.RoleManager<Microsoft.AspNetCore.Identity.IdentityRole<Guid>>>();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        Assert.True((await roles.CreateAsync(new("PlatformAdmin"))).Succeeded);
        var adminUser = new ApplicationUser { Id = Guid.NewGuid(), Email = "f09-admin@example.test", UserName = "f09-admin@example.test" };
        Assert.True((await users.CreateAsync(adminUser, f.Auth.Password)).Succeeded);
        Assert.True((await users.AddToRoleAsync(adminUser, "PlatformAdmin")).Succeeded);
        var admin = new Browser(f.Auth.Factory);
        await admin.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Login(f.Auth.Password, adminUser.Email)).StatusCode);
        await admin.Csrf();
        var platformRoute = "/api/v1/platform/restaurants/" + restaurant.Id;
        var publication = await admin.Send(HttpMethod.Patch, platformRoute + "/publication",
            new RestaurantPublicationRequest(false, Convert.ToBase64String(restaurant.RowVersion)));
        Assert.Equal(HttpStatusCode.OK, publication.StatusCode);
        var current = (await publication.Content.ReadFromJsonAsync<RestaurantResponse>())!;
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Code(f.A))).StatusCode);
        var published = await admin.Send(HttpMethod.Patch, platformRoute + "/publication", new RestaurantPublicationRequest(true, current.RowVersion));
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        current = (await published.Content.ReadFromJsonAsync<RestaurantResponse>())!;
        Assert.Equal(current.PublishedMenuVersion, (await Menu(client, Slug(f.A))).PublishedMenuVersion);
        var suspended = await admin.Send(HttpMethod.Patch, platformRoute + "/status", new RestaurantStatusRequest("Suspended", current.RowVersion));
        Assert.Equal(HttpStatusCode.OK, suspended.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Slug(f.A))).StatusCode);
    }

    [SqlServerFact]
    public async Task Large_menu_has_four_queries_and_parallel_A_B_requests_do_not_mix_results()
    {
        await using var f = await Fixture.Create();
        using (var scope = f.Auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            db.AddRange(Enumerable.Range(0, 199).Select(i => new MenuItem
            {
                RestaurantId = f.A.Id,
                CategoryId = f.CategoryA.Id,
                NameAr = "item-" + i,
                SortOrder = i + 1,
                IsPublished = true
            }));
            await db.SaveChangesAsync();
        }
        using var client = f.Client;
        f.Queries.Reset();
        Assert.Equal(200, Assert.Single((await Menu(client, Code(f.A))).Categories).Items.Count);
        Assert.Equal(5, f.Queries.Count); // Miss: live probe, 3 content queries, confirm probe.
        await Menu(client, Code(f.B, "en")); // Warm the B/en entry so the parallel phase is all hits.
        f.Queries.Reset();
        var elapsed = await Task.WhenAll(Enumerable.Range(0, 20).Select(async i =>
        {
            using var browser = f.Client;
            var timer = System.Diagnostics.Stopwatch.StartNew();
            var menu = await Menu(browser, i % 2 == 0 ? Code(f.A) : Code(f.B, "en"));
            Assert.Equal(i % 2 == 0 ? f.A.Name : f.B.Name, menu.Restaurant.Name);
            Assert.Equal(i % 2 == 0 ? 200 : 0, Assert.Single(menu.Categories).Items.Count);
            return timer.Elapsed.TotalMilliseconds;
        }));
        Array.Sort(elapsed);
        Assert.Equal(20, f.Queries.Count); // One live probe per cached request, zero content queries.
        output.WriteLine($"Local TestServer + LocalDB, 20 parallel A/B GETs, A=200 items/B=empty, 1 probe/request on cache hit: p50={elapsed[9]:F1}ms p95={elapsed[18]:F1}ms max={elapsed[19]:F1}ms, zero errors. Version-keyed cache; not production evidence.");
    }

    [SqlServerFact]
    public async Task Capacity_limits_fail_safely_without_truncating_the_menu()
    {
        await using var f = await Fixture.Create();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        db.AddRange(Enumerable.Range(0, 1000).Select(i => new MenuItem { RestaurantId = f.A.Id, CategoryId = f.CategoryA.Id, NameAr = "item", IsPublished = true }));
        db.AddRange(Enumerable.Range(0, 100).Select(i => new Category { RestaurantId = f.B.Id, NameAr = "category", IsPublished = true }));
        await db.SaveChangesAsync();
        using var client = f.Client;
        foreach (var restaurant in new[] { f.A, f.B })
        {
            var response = await client.GetAsync(Code(restaurant));
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain(restaurant.Name, body);
            Assert.True(response.Headers.CacheControl!.NoStore);
        }
    }

    [SqlServerFact]
    public async Task Cached_repeat_reads_pay_only_the_live_probe_until_the_version_moves()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var first = await Menu(client, Code(f.A));
        f.Queries.Reset();
        var second = await Menu(client, Code(f.A));
        Assert.Equal(1, f.Queries.Count); // Live probe only; content comes from the version-keyed entry.
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(first), System.Text.Json.JsonSerializer.Serialize(second));
        // The slug route shares the same (restaurant, language, version) entry.
        var viaSlug = await Menu(client, Slug(f.A));
        Assert.Equal(2, f.Queries.Count);
        Assert.Equal(first.Restaurant, viaSlug.Restaurant);
        // A real owner edit bumps the version transactionally: the next read re-reads content.
        var owner = await f.Login();
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Put, "/api/v1/admin/items/" + f.ItemA.Id,
            new UpdateItemRequest(f.CategoryA.Id, "new-name", null, null, null, 12.50m, "EGP", 1, true, true, Convert.ToBase64String(f.ItemA.RowVersion)))).StatusCode);
        f.Queries.Reset();
        var after = await Menu(client, Code(f.A));
        Assert.Equal(5, f.Queries.Count);
        Assert.Equal(first.PublishedMenuVersion + 1, after.PublishedMenuVersion);
        Assert.Equal("new-name", Assert.Single(Assert.Single(after.Categories).Items).Name);
    }

    [SqlServerFact]
    public async Task ETag_revalidates_against_the_live_version_and_returns_304_until_it_moves()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var response = await client.GetAsync(Code(f.A));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoCache);
        Assert.False(response.Headers.CacheControl!.NoStore);
        Assert.NotNull(response.Headers.ETag);
        var etag = response.Headers.ETag!.ToString();
        Assert.Equal("\"" + 1 + ":ar\"", etag);
        using var revalidate = new HttpRequestMessage(HttpMethod.Get, Code(f.A));
        revalidate.Headers.TryAddWithoutValidation("If-None-Match", etag);
        var notModified = await client.SendAsync(revalidate);
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Equal(etag, notModified.Headers.ETag?.ToString());
        Assert.Empty(await notModified.Content.ReadAsStringAsync());
        // Typed If-None-Match semantics: comma-separated lists, weak tags and *
        // match the current validator; a non-matching tag gets a fresh 200.
        async Task<HttpStatusCode> Revalidate(string header)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Code(f.A));
            request.Headers.TryAddWithoutValidation("If-None-Match", header);
            return (await client.SendAsync(request)).StatusCode;
        }
        Assert.Equal(HttpStatusCode.NotModified, await Revalidate("\"999:ar\", " + etag));
        Assert.Equal(HttpStatusCode.NotModified, await Revalidate("W/" + etag));
        Assert.Equal(HttpStatusCode.NotModified, await Revalidate("*"));
        Assert.Equal(HttpStatusCode.OK, await Revalidate("\"999:ar\""));
        // A version-moving owner edit makes the same validator stale: fresh 200.
        var owner = await f.Login();
        Assert.Equal(HttpStatusCode.OK, (await owner.Send(HttpMethod.Put, "/api/v1/admin/items/" + f.ItemA.Id,
            new UpdateItemRequest(f.CategoryA.Id, "new-name", null, null, null, 12.50m, "EGP", 1, true, true, Convert.ToBase64String(f.ItemA.RowVersion)))).StatusCode);
        using var again = new HttpRequestMessage(HttpMethod.Get, Code(f.A));
        again.Headers.TryAddWithoutValidation("If-None-Match", etag);
        var fresh = await client.SendAsync(again);
        Assert.Equal(HttpStatusCode.OK, fresh.StatusCode);
        Assert.NotEqual(etag, fresh.Headers.ETag?.ToString());
    }

    [SqlServerFact]
    public async Task A_name_edit_through_the_tenant_session_bumps_the_publication_version()
    {
        await using var f = await Fixture.Create();
        var owner = await f.Login();
        using var client = f.Client;
        var before = await Menu(client, Code(f.A));
        await f.Run(owner, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<Restaurant>(f.A.Id)).Name = "Renamed";
            await session.CommitAsync();
        });
        var after = await Menu(client, Code(f.A));
        Assert.Equal(before.PublishedMenuVersion + 1, after.PublishedMenuVersion);
        Assert.Equal("Renamed", after.Restaurant.Name);
    }

    [SqlServerFact]
    public async Task DIAG_flipper_probe()
    {
        var flipper = new MidReadFlipper(maxFlips: 1, unpublish: false);
        await using var f = await Fixture.Create(flipper);
        using var client = f.Client;
        var response = await client.GetAsync(Code(f.A));
        string seen; lock (flipper.Seen) seen = string.Join(" || ", flipper.Seen);
        var body = await response.Content.ReadAsStringAsync();
        long dbVersion; string dbName;
        await using (var direct = new SqlConnection(f.Auth.Connection))
        {
            await direct.OpenAsync();
            await using var q = direct.CreateCommand();
            q.CommandText = "SELECT PublishedMenuVersion FROM Restaurants WHERE Id = @id";
            q.Parameters.Add(new SqlParameter("@id", f.A.Id));
            dbVersion = Convert.ToInt64(await q.ExecuteScalarAsync());
            q.CommandText = "SELECT NameAr FROM MenuItems WHERE RestaurantId = @id";
            dbName = Convert.ToString(await q.ExecuteScalarAsync()) ?? ""; dbName += " diagdb=" + direct.Database;
        }
        throw new Xunit.Sdk.XunitException("DIAG dbVersion=" + dbVersion + " dbItem=" + dbName + " body=" + body.Substring(0, Math.Min(400, body.Length)) + " status=" + (int)response.StatusCode + " bound=" + flipper.Bound + " flips=" + flipper.Flips + " seen=" + seen);
    }

    [SqlServerFact]
    public async Task A_version_flip_during_a_cold_load_retries_and_serves_the_new_consistent_projection()
    {
        await using var f = await Fixture.Create(new MidReadFlipper(maxFlips: 1, unpublish: false));
        using var client = f.Client;
        var menu = await Menu(client, Code(f.A));
        Assert.Equal(2, menu.PublishedMenuVersion);
        Assert.Equal("flipped-1", Assert.Single(Assert.Single(menu.Categories).Items).Name);
    }

    [SqlServerFact]
    public async Task Two_version_flips_during_a_cold_load_fail_closed_with_503()
    {
        await using var f = await Fixture.Create(new MidReadFlipper(maxFlips: 2, unpublish: false));
        using var client = f.Client;
        var response = await client.GetAsync(Code(f.A));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [SqlServerFact]
    public async Task Unpublish_during_a_cold_load_returns_404_and_caches_nothing()
    {
        await using var f = await Fixture.Create(new MidReadFlipper(maxFlips: 1, unpublish: true));
        using var client = f.Client;
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Code(f.A))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Code(f.A))).StatusCode);
        // While unpublished, change item data directly WITHOUT bumping the version
        // (test-only bypass), then republish out of band. The live probe must serve
        // a fresh read; a leaked mid-flight cache entry would serve the old name.
        await using (var direct = new SqlConnection(f.Auth.Connection))
        {
            await direct.OpenAsync();
            await using var change = direct.CreateCommand();
            change.CommandText = "UPDATE MenuItems SET NameAr = N'renamed-offline' WHERE RestaurantId = @id; " +
                "UPDATE Restaurants SET IsPublished = 1 WHERE Id = @id";
            change.Parameters.Add(new SqlParameter("@id", f.A.Id));
            await change.ExecuteNonQueryAsync();
        }
        var menu = await Menu(client, Code(f.A));
        Assert.Equal(1, menu.PublishedMenuVersion); // No version bump happened.
        Assert.Equal("renamed-offline", Assert.Single(Assert.Single(menu.Categories).Items).Name);
    }

    [Fact]
    public async Task Missing_database_configuration_returns_generic_503_without_authentication()
    {
        await using var factory = new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:MenuDatabase", ""));
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.GetAsync("/api/v1/public/menus/" + new string('a', 20));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Menu temporarily unavailable.", body);
        Assert.DoesNotContain("ConnectionStrings", body);
    }
}
