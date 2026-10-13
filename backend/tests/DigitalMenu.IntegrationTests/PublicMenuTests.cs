using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Api.Platform;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
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
    private sealed class Fixture : IAsyncDisposable
    {
        public AuthFixture Auth { get; private set; } = null!;
        public Counter Queries { get; } = new();
        public Restaurant A { get; } = new() { Name = "مطعم A", Slug = "public-a", PublicCode = new string('a', 20), IsPublished = true };
        public Restaurant B { get; } = new() { Name = "Restaurant B", Slug = "public-b", PublicCode = new string('b', 20), IsPublished = true };
        public Category CategoryA { get; } = new() { NameAr = "طعام", NameEn = "Food", IsPublished = true };
        public Category CategoryB { get; } = new() { NameAr = "قسم B", IsPublished = true };
        public MenuItem ItemA { get; } = new() { NameAr = "قهوة", NameEn = "Coffee", DescriptionAr = "وصف", DescriptionEn = " ", Price = 12.50m, IsPublished = true };
        public Guid Owner { get; private set; }
        public static async Task<Fixture> Create()
        {
            var f = new Fixture();
            f.Auth = await AuthFixture.Create(empty: true, configure: s => s.AddDbContext<MenuDbContext>(o => o.AddInterceptors(f.Queries)));
            using var scope = f.Auth.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
            var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "public-owner-private@example.test", UserName = "public-owner-private@example.test" };
            Assert.True((await users.CreateAsync(user, f.Auth.Password)).Succeeded);
            f.Owner = user.Id;
            f.CategoryA.RestaurantId = f.ItemA.RestaurantId = f.A.Id;
            f.CategoryB.RestaurantId = f.B.Id;
            f.ItemA.CategoryId = f.CategoryA.Id;
            db.AddRange(f.A, f.B, f.CategoryA, f.CategoryB, f.ItemA,
                new RestaurantUser { RestaurantId = f.A.Id, UserId = user.Id },
                new RestaurantSettings { RestaurantId = f.A.Id, PrimaryColor = "#123456", ContactPhoneOptional = "private-phone", AddressOptional = "private-address", PublishedContactDetailsFlags = 3, LogoObjectKey = f.A.Id + "/private.webp" },
                new MenuItemImage { RestaurantId = f.A.Id, MenuItemId = f.ItemA.Id, ObjectKey = f.A.Id + "/private-image.webp", Width = 20, Height = 10 });
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
    }
    private static string Code(Restaurant r, string? lang = null) => "/api/v1/public/menus/" + r.PublicCode + (lang is null ? "" : "?lang=" + lang);
    private static string Slug(Restaurant r) => "/api/v1/public/restaurants/by-slug/" + r.Slug;
    private static async Task<PublicMenu> Menu(HttpClient client, string route)
    {
        var response = await client.GetAsync(route);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        return (await response.Content.ReadFromJsonAsync<PublicMenu>())!;
    }

    [SqlServerFact]
    public async Task Code_and_slug_return_public_allowlists_locale_fallback_and_no_media_or_private_data()
    {
        await using var f = await Fixture.Create();
        using var client = f.Client;
        var arabic = await Menu(client, Code(f.A));
        Assert.Equal(3, f.Queries.Count);
        Assert.Equal("ar", arabic.Language);
        Assert.Equal("#123456", arabic.Restaurant.PrimaryColor);
        Assert.Equal("قهوة", Assert.Single(Assert.Single(arabic.Categories).Items).Name);
        var english = await Menu(client, Code(f.A, "en"));
        Assert.Equal("Food", Assert.Single(english.Categories).Name);
        Assert.Equal("Coffee", Assert.Single(Assert.Single(english.Categories).Items).Name);
        Assert.Equal("وصف", Assert.Single(Assert.Single(english.Categories).Items).Description);
        var slug = await Menu(client, Slug(f.A));
        Assert.Equal(arabic.Restaurant, slug.Restaurant);
        var body = await (await client.GetAsync(Code(f.A))).Content.ReadAsStringAsync();
        foreach (var forbidden in new[] { "private", f.A.Id.ToString(), f.B.Id.ToString(), f.Owner.ToString(), "restaurantId", "userId", "objectKey", "rowVersion", "isPublished", "isAvailable", "imageUrl", "logoUrl", "token", "email", "status" })
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
        Assert.Equal(3, f.Queries.Count); // No Identity/security-stamp/membership queries.
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
    public async Task Large_menu_has_three_queries_and_parallel_A_B_requests_do_not_mix_results()
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
        Assert.Equal(3, f.Queries.Count);
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
        Assert.Equal(63, f.Queries.Count);
        output.WriteLine($"Local TestServer + LocalDB, 20 parallel A/B GETs, A=200 items/B=empty, 3 SELECT/request: p50={elapsed[9]:F1}ms p95={elapsed[18]:F1}ms max={elapsed[19]:F1}ms, zero errors. No shared cache; not production evidence.");
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
