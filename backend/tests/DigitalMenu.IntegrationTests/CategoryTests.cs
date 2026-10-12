using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

public sealed class CategoryTests(Xunit.Abstractions.ITestOutputHelper output)
{
    private const string Route = "/api/v1/admin/categories";
    private static object Create(int sort = 0, bool published = false) => new { nameAr = " مشروبات ", nameEn = " Drinks ", sortOrder = sort, isPublished = published };
    private static async Task<CategoryResponse> Add(Browser browser, int sort = 0)
    {
        var response = await browser.Send(HttpMethod.Post, Route, Create(sort));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var category = (await response.Content.ReadFromJsonAsync<CategoryResponse>())!;
        Assert.EndsWith(category.Id.ToString(), response.Headers.Location!.ToString());
        var fetched = await browser.Send(HttpMethod.Get, response.Headers.Location.ToString());
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        Assert.Equal(category, await fetched.Content.ReadFromJsonAsync<CategoryResponse>());
        return category;
    }

    [SqlServerFact]
    public async Task Detail_get_returns_current_own_dto_without_changing_menu_version()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var category = await Add(f.A);
        var update = await f.A.Send(HttpMethod.Put, Route + "/" + category.Id,
            new UpdateCategoryRequest("طعام", "Food", 2, true, category.RowVersion));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var current = (await update.Content.ReadFromJsonAsync<CategoryResponse>())!;
        f.A.Token = null; // Safe GET needs the authenticated cookie, not a CSRF token.
        var fetched = await f.A.Send(HttpMethod.Get, Route + "/" + category.Id);
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        var body = await fetched.Content.ReadAsStringAsync();
        Assert.Equal(current, System.Text.Json.JsonSerializer.Deserialize<CategoryResponse>(body, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)));
        Assert.NotEqual(category.RowVersion, current.RowVersion);
        Assert.Equal("no-store", fetched.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", Assert.Single(fetched.Headers.GetValues("X-Content-Type-Options")));
        var json = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(body);
        Assert.Equal(new[] { "id", "isPublished", "nameAr", "nameEn", "rowVersion", "sortOrder" },
            json.EnumerateObject().Select(p => p.Name).Order());
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(3, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(2, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Detail_get_requires_cookie_and_hides_foreign_missing_and_deleted_categories()
    {
        await using var f = await Fixture.Create();
        var guest = new Browser(f.Auth.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Get, Route + "/" + f.CategoryA.Id)).StatusCode);
        using var insecure = new HttpRequestMessage(HttpMethod.Get, "http://localhost" + Route + "/" + f.CategoryA.Id);
        insecure.Headers.Add("Cookie", string.Join("; ", f.A.Cookies.Select(c => c.Key + "=" + c.Value)));
        Assert.Equal(HttpStatusCode.Forbidden, (await f.A.Client.SendAsync(insecure)).StatusCode);
        await f.A.Csrf();
        var deleted = await Add(f.A);
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route + "/" + deleted.Id,
            new DeleteCategoryRequest(deleted.RowVersion))).StatusCode);
        f.A.Client.DefaultRequestHeaders.Add("X-Restaurant-Id", f.RestaurantB.ToString());
        f.A.Client.DefaultRequestHeaders.Add("X-Role", "PlatformAdmin");
        string? title = null;
        foreach (var id in new[] { f.CategoryB.Id, Guid.NewGuid(), deleted.Id })
        {
            var response = await f.A.Send(HttpMethod.Get, Route + "/" + id + "?restaurantId=" + f.RestaurantB);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.True(response.Headers.CacheControl!.NoStore);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
            var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            title ??= json.GetProperty("title").GetString();
            Assert.Equal("Resource not found.", title);
            Assert.Equal(title, json.GetProperty("title").GetString());
            Assert.Equal(404, json.GetProperty("status").GetInt32());
            var body = json.ToString();
            Assert.DoesNotContain("Protected B", body);
            Assert.DoesNotContain(id.ToString(), body);
            Assert.DoesNotContain("restaurantId", body, StringComparison.OrdinalIgnoreCase);
        }
        Assert.Equal(HttpStatusCode.OK, (await f.B.Send(HttpMethod.Get, Route + "/" + f.CategoryB.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Get, Route + "/" + f.CategoryA.Id)).StatusCode);
    }

    [SqlServerFact]
    public async Task Crud_sorting_pagination_visibility_soft_delete_and_versions_are_atomic()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var later = await Add(f.A, 9);
        var first = await Add(f.A, 0);
        var list = await f.A.Send(HttpMethod.Get, Route + "?pageSize=1&page=3");
        Assert.Equal("no-store", list.Headers.CacheControl!.ToString());
        Assert.Equal(later.Id, Assert.Single((await list.Content.ReadFromJsonAsync<CategoryPageResponse>())!.Items).Id);
        var update = await f.A.Send(HttpMethod.Put, Route + "/" + first.Id,
            new UpdateCategoryRequest("طعام", null, 2, true, first.RowVersion));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var current = (await update.Content.ReadFromJsonAsync<CategoryResponse>())!;
        Assert.True(current.IsPublished);
        Assert.Null(current.NameEn);
        Assert.NotEqual(first.RowVersion, current.RowVersion);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await f.A.Send(HttpMethod.Put, Route + "/" + first.Id,
            new UpdateCategoryRequest("stale", null, 0, false, first.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await f.A.Send(HttpMethod.Delete, Route + "/" + first.Id, new DeleteCategoryRequest(first.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route + "/" + first.Id, new DeleteCategoryRequest(current.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Delete, Route + "/" + first.Id, new DeleteCategoryRequest(current.RowVersion))).StatusCode);
        var page = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<CategoryPageResponse>())!;
        Assert.DoesNotContain(page.Items, c => c.Id == first.Id);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.True((await db.Set<Category>().SingleAsync(c => c.Id == first.Id)).IsDeleted);
        Assert.Equal(5, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantB)).PublishedMenuVersion);
        Assert.Equal(4, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Deletion_blocks_all_non_deleted_items_including_hidden_unavailable_items()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        Assert.Equal(HttpStatusCode.Conflict, (await f.A.Send(HttpMethod.Delete, Route + "/" + f.CategoryA.Id,
            new DeleteCategoryRequest(Convert.ToBase64String(f.CategoryA.RowVersion)))).StatusCode);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.False((await db.Set<Category>().SingleAsync(c => c.Id == f.CategoryA.Id)).IsDeleted);
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        (await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemA.Id)).IsDeleted = true;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route + "/" + f.CategoryA.Id,
            new DeleteCategoryRequest(Convert.ToBase64String(f.CategoryA.RowVersion)))).StatusCode);
    }

    [SqlServerFact]
    public async Task Foreign_and_missing_ids_are_indistinguishable_and_forged_fields_are_rejected()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        await f.B.Csrf();
        foreach (var method in new[] { HttpMethod.Put, HttpMethod.Delete })
        {
            object body = method == HttpMethod.Put ? new UpdateCategoryRequest("attack", null, 0, true, Convert.ToBase64String(f.CategoryB.RowVersion)) : new DeleteCategoryRequest(Convert.ToBase64String(f.CategoryB.RowVersion));
            var foreign = await f.A.Send(method, Route + "/" + f.CategoryB.Id, body);
            var missing = await f.A.Send(method, Route + "/" + Guid.NewGuid(), body);
            Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
            Assert.Equal(foreign.StatusCode, missing.StatusCode);
            var a = await foreign.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            var b = await missing.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal(a.GetProperty("title").GetString(), b.GetProperty("title").GetString());
            Assert.DoesNotContain("Protected B", a.ToString());
        }
        foreach (var field in new[] { "restaurantId", "role", "id", "isDeleted", "createdAtUtc" })
        {
            var body = new Dictionary<string, object?> { ["nameAr"] = "x", ["sortOrder"] = 0, ["isPublished"] = true, [field] = f.RestaurantB.ToString() };
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Post, Route, body)).StatusCode);
        }
        f.A.Client.DefaultRequestHeaders.Add("X-Restaurant-Id", f.RestaurantB.ToString());
        f.A.Client.DefaultRequestHeaders.Add("X-Role", "PlatformAdmin");
        var page = (await (await f.A.Send(HttpMethod.Get, Route + "?restaurantId=" + f.RestaurantB)).Content.ReadFromJsonAsync<CategoryPageResponse>())!;
        Assert.Equal(f.CategoryA.Id, Assert.Single(page.Items).Id);
        Assert.Equal(f.CategoryB.Id, Assert.Single((await (await f.B.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<CategoryPageResponse>())!.Items).Id);
    }

    [SqlServerFact]
    public async Task Commit_rechecks_linked_items_and_concurrent_category_updates_roll_back_versions()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var category = await Add(f.A);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<DigitalMenu.Application.ITenantDataSession>();
            (await session.EditAsync<Category>(category.Id)).IsDeleted = true;
            db.Add(new MenuItem { RestaurantId = f.RestaurantA, CategoryId = category.Id, NameAr = "late item", IsAvailable = false });
            await db.SaveChangesAsync();
            var failure = await Assert.ThrowsAsync<DigitalMenu.Application.TenantBoundaryException>(() => session.CommitAsync());
            Assert.Equal(DigitalMenu.Application.TenantFailure.Conflict, failure.Failure);
        });
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<DigitalMenu.Application.ITenantDataSession>();
            (await session.EditAsync<Category>(category.Id)).NameAr = "loser";
            var winner = await f.A.Send(HttpMethod.Put, Route + "/" + category.Id,
                new UpdateCategoryRequest("winner", null, 0, true, category.RowVersion));
            Assert.Equal(HttpStatusCode.OK, winner.StatusCode);
            var failure = await Assert.ThrowsAsync<DigitalMenu.Application.TenantBoundaryException>(() => session.CommitAsync());
            Assert.Equal(DigitalMenu.Application.TenantFailure.Concurrency, failure.Failure);
        });
        Assert.Equal("winner", (await db.Set<Category>().AsNoTracking().SingleAsync(c => c.Id == category.Id)).NameAr);
        Assert.Equal(3, (await db.Set<Restaurant>().AsNoTracking().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
    }

    [SqlServerFact]
    public async Task Concurrent_bounded_lists_keep_sort_order_and_tenant_isolation()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        await Add(f.A, 5);
        await Add(f.A, 1);
        var timer = System.Diagnostics.Stopwatch.StartNew();
        await Task.WhenAll(Enumerable.Range(0, 20).Select(async i =>
        {
            var browser = new Browser(f.Auth.Factory);
            foreach (var cookie in (i % 2 == 0 ? f.A : f.B).Cookies) browser.Cookies[cookie.Key] = cookie.Value;
            var response = await browser.Send(HttpMethod.Get, Route + "?pageSize=2");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var page = (await response.Content.ReadFromJsonAsync<CategoryPageResponse>())!;
            Assert.InRange(page.Items.Count, 1, 2);
            Assert.Equal(page.Items.OrderBy(c => c.SortOrder).ThenBy(c => c.Id).Select(c => c.Id), page.Items.Select(c => c.Id));
            if (i % 2 == 0) Assert.DoesNotContain(page.Items, c => c.Id == f.CategoryB.Id);
            else Assert.Equal(f.CategoryB.Id, Assert.Single(page.Items).Id);
        }));
        output.WriteLine($"Local TestServer + SQL Server LocalDB: 20 concurrent bounded category GETs, two tenants, {timer.Elapsed.TotalMilliseconds:F1}ms total, zero errors. Not a production benchmark.");
    }

    [SqlServerFact]
    public async Task Validation_requires_bounded_names_explicit_fields_and_valid_rowversion()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        foreach (var body in new object[] { new { nameAr = "x" }, new CreateCategoryRequest(" ", null, 0, false),
            new CreateCategoryRequest(new string('x', 121), null, 0, false), new CreateCategoryRequest("x", new string('y', 121), 0, false),
            new CreateCategoryRequest("x\n", null, 0, false), new CreateCategoryRequest("x", null, -1, false) })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Post, Route, body)).StatusCode);
        foreach (var query in new[] { "page=0", "pageSize=101", "page=100001", "pageSize=-1" })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Get, Route + "?" + query)).StatusCode);
        foreach (var version in new[] { "bad", "", Convert.ToBase64String(new byte[7]) })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route + "/" + f.CategoryA.Id,
                new UpdateCategoryRequest("x", null, 0, false, version))).StatusCode);
    }

    [SqlServerFact]
    public async Task Inactive_locked_and_expired_owner_sessions_cannot_reach_category_mutations()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var membership = await db.Set<RestaurantUser>().SingleAsync(m => m.UserId == f.OwnerA);
        membership.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Delete, Route + "/" + f.CategoryA.Id,
            new DeleteCategoryRequest(Convert.ToBase64String(f.CategoryA.RowVersion)))).StatusCode);
        membership.IsActive = true;
        await db.SaveChangesAsync();
        var browser = new Browser(f.Auth.Factory);
        await browser.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await browser.Login(f.Auth.Password)).StatusCode);
        await browser.Csrf();
        var user = await db.Users.SingleAsync(u => u.Id == f.OwnerA);
        user.LockoutEnd = DateTimeOffset.MaxValue;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.Send(HttpMethod.Put, Route + "/" + f.CategoryA.Id,
            new UpdateCategoryRequest("denied", null, 0, false, Convert.ToBase64String(f.CategoryA.RowVersion)))).StatusCode);
        user.LockoutEnd = null;
        await db.SaveChangesAsync();
        f.Auth.Clock.Advance(TimeSpan.FromMinutes(31));
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.B.Send(HttpMethod.Post, Route, Create())).StatusCode);
        Assert.Equal("A category", (await db.Set<Category>().AsNoTracking().SingleAsync(c => c.Id == f.CategoryA.Id)).NameAr);
    }

    [SqlServerFact]
    public async Task Cookie_csrf_suspension_and_platform_role_fail_closed()
    {
        await using var f = await Fixture.Create();
        var guest = new Browser(f.Auth.Factory);
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
            Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(method, method == HttpMethod.Put || method == HttpMethod.Delete ? Route + "/" + f.CategoryA.Id : Route, Create())).StatusCode);
        foreach (var token in new string?[] { null, "forged", f.A.Token })
        {
            f.A.Token = token;
            foreach (var method in new[] { HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
                Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(method, method == HttpMethod.Post ? Route : Route + "/" + f.CategoryA.Id, Create())).StatusCode);
        }
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.RoleManager<Microsoft.AspNetCore.Identity.IdentityRole<Guid>>>();
        await roles.CreateAsync(new("PlatformAdmin"));
        var admin = new ApplicationUser { Email = "admin6@example.test", UserName = "admin6@example.test" };
        Assert.True((await users.CreateAsync(admin, f.Auth.Password)).Succeeded);
        await users.AddToRoleAsync(admin, "PlatformAdmin");
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Login(f.Auth.Password, admin.Email)).StatusCode);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Send(HttpMethod.Get, Route)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Send(HttpMethod.Post, Route, Create())).StatusCode);
        await f.A.Csrf();
        (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).Status = "Suspended";
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Post, Route, Create())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Get, Route)).StatusCode);
    }
}
