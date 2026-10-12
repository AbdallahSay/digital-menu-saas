using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

public sealed class ItemTests(Xunit.Abstractions.ITestOutputHelper output)
{
    private const string Route = "/api/v1/admin/items";
    private static CreateItemRequest Request(Guid parent, decimal price = 12.50m, int order = 0) =>
        new(parent, " قهوة ", " Coffee ", " وصف ", " description ", price, "EGP", order, false, true);
    private static UpdateItemRequest Update(ItemResponse i, Guid? category = null, string? version = null,
        bool published = true, bool available = false) => new(category ?? i.CategoryId, "طعام", "Food", null, null,
            23.75m, "EGP", 2, published, available, version ?? i.RowVersion);
    private static async Task<ItemResponse> Add(Browser browser, CreateItemRequest request)
    {
        var response = await browser.Send(HttpMethod.Post, Route, request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var item = (await response.Content.ReadFromJsonAsync<ItemResponse>())!;
        Assert.Equal(Route + "/" + item.Id, response.Headers.Location!.ToString());
        var fetched = await browser.Send(HttpMethod.Get, response.Headers.Location.ToString());
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        Assert.Equal(item, await fetched.Content.ReadFromJsonAsync<ItemResponse>());
        Assert.Equal("no-store", fetched.Headers.CacheControl!.ToString());
        var payload = await (await browser.Send(HttpMethod.Get, response.Headers.Location.ToString())).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(new[] { "categoryId", "currencyCode", "descriptionAr", "descriptionEn", "id", "isAvailable", "isPublished", "nameAr", "nameEn", "price", "rowVersion", "sortOrder" },
            payload.EnumerateObject().Select(p => p.Name).Order());
        return item;
    }
    private static async Task<ItemResponse> Put(Browser browser, ItemResponse item, UpdateItemRequest request)
    {
        var response = await browser.Send(HttpMethod.Put, Route + "/" + item.Id, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ItemResponse>())!;
    }

    [SqlServerFact]
    public async Task Crud_publication_availability_soft_delete_and_version_audit_are_atomic()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var item = await Add(f.A, Request(f.CategoryA.Id));
        Assert.Equal("قهوة", item.NameAr);
        Assert.Equal("Coffee", item.NameEn);
        Assert.Equal("description", item.DescriptionEn);
        var changed = await Put(f.A, item, Update(item));
        Assert.True(changed.IsPublished);
        Assert.False(changed.IsAvailable);
        Assert.Null(changed.DescriptionAr);
        Assert.NotEqual(item.RowVersion, changed.RowVersion);
        var hidden = await Put(f.A, changed, Update(changed, published: false, available: true));
        Assert.False(hidden.IsPublished);
        Assert.True(hidden.IsAvailable);
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route + "/" + item.Id, new DeleteItemRequest(hidden.RowVersion))).StatusCode);
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Put, HttpMethod.Delete })
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(method, Route + "/" + item.Id,
                method == HttpMethod.Put ? Update(hidden) : method == HttpMethod.Delete ? new DeleteItemRequest(hidden.RowVersion) : null)).StatusCode);
        var list = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.DoesNotContain(list.Items, i => i.Id == item.Id);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.True((await db.Set<MenuItem>().SingleAsync(i => i.Id == item.Id)).IsDeleted);
        Assert.Equal(5, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantB)).PublishedMenuVersion);
        Assert.Equal(4, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted" && a.RestaurantId == f.RestaurantA));
    }

    [SqlServerFact]
    public async Task Listing_searches_bilingual_text_filters_category_and_paginates_after_sorting()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var late = await Add(f.A, Request(f.CategoryA.Id, order: 8));
        var first = await Add(f.A, Request(f.CategoryA.Id, order: 1) with { NameAr = "شاي", NameEn = null, DescriptionEn = "mint 100% [fresh]" });
        var secondParent = new Category { RestaurantId = f.RestaurantA, NameAr = "other" };
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        db.Add(secondParent);
        await db.SaveChangesAsync();
        var moved = await Put(f.A, late, Update(late, secondParent.Id));
        foreach (var term in new[] { "شاي", "mint", "100%", "[fresh]" })
        {
            var page = (await (await f.A.Send(HttpMethod.Get, Route + "?search=" + Uri.EscapeDataString(term))).Content.ReadFromJsonAsync<ItemPageResponse>())!;
            Assert.Equal(first.Id, Assert.Single(page.Items).Id);
        }
        var english = (await (await f.A.Send(HttpMethod.Get, Route + "?search=Food")).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.Equal(moved.Id, Assert.Single(english.Items).Id);
        var filtered = (await (await f.A.Send(HttpMethod.Get, Route + "?categoryId=" + secondParent.Id)).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.Equal(moved.Id, Assert.Single(filtered.Items).Id);
        var paged = (await (await f.A.Send(HttpMethod.Get, Route + "?page=2&pageSize=1")).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.Equal(first.Id, Assert.Single(paged.Items).Id);
        Assert.Empty((await (await f.A.Send(HttpMethod.Get, Route + "?page=100")).Content.ReadFromJsonAsync<ItemPageResponse>())!.Items);
    }

    [SqlServerFact]
    public async Task Prices_text_and_query_bounds_are_validated_without_silent_rounding()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        await Add(f.A, Request(f.CategoryA.Id, 0));
        await Add(f.A, Request(f.CategoryA.Id, 9999999999999999.99m) with
        { NameAr = new string('ع', 150), NameEn = new string('E', 150), DescriptionAr = new string('ع', 2000), DescriptionEn = new string('ع', 2000) });
        foreach (var request in new[] { Request(f.CategoryA.Id, -0.01m), Request(f.CategoryA.Id, 0.001m), Request(f.CategoryA.Id, 10000000000000000m),
            Request(f.CategoryA.Id) with { Price = null }, Request(f.CategoryA.Id) with { CurrencyCode = "USD" },
            Request(f.CategoryA.Id) with { CurrencyCode = null }, Request(f.CategoryA.Id) with { NameAr = " " },
            Request(f.CategoryA.Id) with { NameAr = new string('a', 151) }, Request(f.CategoryA.Id) with { NameEn = new string('a', 151) },
            Request(f.CategoryA.Id) with { DescriptionAr = new string('a', 2001) }, Request(f.CategoryA.Id) with { DescriptionEn = "\0bad" },
            Request(f.CategoryA.Id) with { SortOrder = -1 }, Request(f.CategoryA.Id) with { IsAvailable = null }, Request(f.CategoryA.Id) with { IsPublished = null } })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Post, Route, request)).StatusCode);
        foreach (var query in new[] { "page=0", "page=100001", "pageSize=101", "pageSize=-1", "categoryId=invalid", "search=" + new string('x', 151) })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Get, Route + "?" + query)).StatusCode);
        var own = await Add(f.A, Request(f.CategoryA.Id));
        Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route + "/" + own.Id, Update(own) with { Price = -1 })).StatusCode);
        foreach (var version in new[] { "bad", "", Convert.ToBase64String(new byte[7]) })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route + "/" + own.Id, Update(own, version: version))).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Delete, Route + "/" + own.Id, new DeleteItemRequest(version))).StatusCode);
        }
    }

    [SqlServerFact]
    public async Task Foreign_missing_item_and_parent_references_have_generic_404_and_B_is_unchanged()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var own = await Add(f.A, Request(f.CategoryA.Id));
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Put, HttpMethod.Delete })
        {
            var problems = new List<string>();
            foreach (var id in new[] { f.ItemB.Id, Guid.NewGuid() })
            {
                var result = await f.A.Send(method, Route + "/" + id, method == HttpMethod.Put ? Update(own) : method == HttpMethod.Delete ? new DeleteItemRequest(own.RowVersion) : null);
                Assert.Equal(HttpStatusCode.NotFound, result.StatusCode);
                Assert.True(result.Headers.CacheControl!.NoStore);
                var json = await result.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
                problems.Add(json.GetProperty("title").GetString()!);
                Assert.DoesNotContain(id.ToString(), json.ToString());
                Assert.DoesNotContain("Protected B", json.ToString());
            }
            Assert.All(problems, title => Assert.Equal("Resource not found.", title));
        }
        foreach (var parent in new[] { f.CategoryB.Id, Guid.NewGuid(), Guid.Empty })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Post, Route, Request(parent))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Put, Route + "/" + own.Id, Update(own, parent))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Get, Route + "?categoryId=" + parent)).StatusCode);
        }
        f.A.Client.DefaultRequestHeaders.Add("X-Tenant-Id", f.RestaurantB.ToString());
        f.A.Client.DefaultRequestHeaders.Add("X-Role", "PlatformAdmin");
        var list = (await (await f.A.Send(HttpMethod.Get, Route + "?restaurantId=" + f.RestaurantB)).Content.ReadFromJsonAsync<ItemPageResponse>())!;
        Assert.DoesNotContain(list.Items, i => i.Id == f.ItemB.Id);
        Assert.Equal(HttpStatusCode.OK, (await f.B.Send(HttpMethod.Get, Route + "/" + f.ItemB.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.B.Send(HttpMethod.Get, Route + "/" + own.Id)).StatusCode);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal("Protected B item", (await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemB.Id)).NameAr);
        Assert.Equal(2, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
    }

    [SqlServerFact]
    public async Task Unknown_ids_roles_tenant_and_server_fields_are_rejected_for_every_write()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var own = await Add(f.A, Request(f.CategoryA.Id));
        foreach (var field in new[] { "id", "restaurantId", "role", "isDeleted", "createdAtUtc", "objectKey" })
            foreach (var method in new[] { HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
            {
                var body = new Dictionary<string, object?> { [field] = f.RestaurantB, ["rowVersion"] = own.RowVersion };
                if (method != HttpMethod.Delete)
                {
                    body.Remove("rowVersion");
                    body["categoryId"] = f.CategoryA.Id;
                    body["nameAr"] = "attack";
                    body["price"] = 1;
                    body["currencyCode"] = "EGP";
                    body["sortOrder"] = 0;
                    body["isPublished"] = true;
                    body["isAvailable"] = true;
                    if (method == HttpMethod.Put) body["rowVersion"] = own.RowVersion;
                }
                Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(method, method == HttpMethod.Post ? Route : Route + "/" + own.Id, body)).StatusCode);
            }
    }

    [SqlServerFact]
    public async Task Anonymous_csrf_platform_and_suspended_owner_requests_fail_closed()
    {
        await using var f = await Fixture.Create();
        var guest = new Browser(f.Auth.Factory);
        foreach (var method in new[] { HttpMethod.Get, HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
            Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(method, method == HttpMethod.Get || method == HttpMethod.Post ? Route : Route + "/" + f.ItemA.Id, Request(f.CategoryA.Id))).StatusCode);
        foreach (var token in new string?[] { null, "forged", f.A.Token })
        {
            f.A.Token = token;
            foreach (var method in new[] { HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete })
                Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(method, method == HttpMethod.Post ? Route : Route + "/" + f.ItemA.Id, Request(f.CategoryA.Id))).StatusCode);
        }
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var roles = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.RoleManager<Microsoft.AspNetCore.Identity.IdentityRole<Guid>>>();
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
        await roles.CreateAsync(new("PlatformAdmin"));
        var admin = new ApplicationUser { UserName = "f07-admin@example.test", Email = "f07-admin@example.test" };
        Assert.True((await users.CreateAsync(admin, f.Auth.Password)).Succeeded);
        Assert.True((await users.AddToRoleAsync(admin, "PlatformAdmin")).Succeeded);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.NoContent, (await guest.Login(f.Auth.Password, admin.Email)).StatusCode);
        await guest.Csrf();
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Send(HttpMethod.Get, Route + "/" + f.ItemA.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.Send(HttpMethod.Post, Route, Request(f.CategoryA.Id))).StatusCode);
        await f.A.Csrf();
        (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).Status = "Suspended";
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Post, Route, Request(f.CategoryA.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Get, Route + "/" + f.ItemA.Id)).StatusCode);
    }

    [SqlServerFact]
    public async Task Deleted_categories_and_parent_deletion_between_staging_and_commit_roll_back()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var parent = new Category { RestaurantId = f.RestaurantA, NameAr = "empty" };
        db.Add(parent);
        await db.SaveChangesAsync();
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            await session.StageAsync(new MenuItem { RestaurantId = f.RestaurantA, CategoryId = parent.Id, NameAr = "staged" }, true);
            parent.IsDeleted = true;
            await db.SaveChangesAsync();
            Assert.Equal(TenantFailure.NotFound, (await Assert.ThrowsAsync<TenantBoundaryException>(() => session.CommitAsync())).Failure);
        });
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Post, Route, Request(parent.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Get, Route + "?categoryId=" + parent.Id)).StatusCode);
        Assert.False(await db.Set<MenuItem>().AnyAsync(i => i.CategoryId == parent.Id));
        Assert.Equal(1, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.False(await db.Set<AuditEntry>().AnyAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Stale_and_concurrent_updates_roll_back_menu_version_and_audit()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var item = await Add(f.A, Request(f.CategoryA.Id));
        var current = await Put(f.A, item, Update(item));
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await f.A.Send(HttpMethod.Put, Route + "/" + item.Id, Update(item))).StatusCode);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await f.A.Send(HttpMethod.Delete, Route + "/" + item.Id, new DeleteItemRequest(item.RowVersion))).StatusCode);
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<MenuItem>(item.Id)).NameAr = "loser";
            await Put(f.A, current, Update(current) with { NameAr = "winner" });
            Assert.Equal(TenantFailure.Concurrency, (await Assert.ThrowsAsync<TenantBoundaryException>(() => session.CommitAsync())).Failure);
        });
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal("winner", (await db.Set<MenuItem>().SingleAsync(i => i.Id == item.Id)).NameAr);
        Assert.Equal(4, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(3, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Newly_created_items_block_category_deletion_until_item_is_soft_deleted()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var result = await f.A.Send(HttpMethod.Post, "/api/v1/admin/categories", new CreateCategoryRequest("طعام", null, 0, false));
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        var category = (await result.Content.ReadFromJsonAsync<CategoryResponse>())!;
        var item = await Add(f.A, Request(category.Id) with { IsAvailable = false });
        Assert.Equal(HttpStatusCode.Conflict, (await f.A.Send(HttpMethod.Delete, "/api/v1/admin/categories/" + category.Id,
            new DeleteCategoryRequest(category.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, Route + "/" + item.Id, new DeleteItemRequest(item.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.A.Send(HttpMethod.Delete, "/api/v1/admin/categories/" + category.Id,
            new DeleteCategoryRequest(category.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.A.Send(HttpMethod.Post, Route, Request(category.Id))).StatusCode);
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(5, (await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA)).PublishedMenuVersion);
        Assert.Equal(4, await db.Set<AuditEntry>().CountAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Revocation_during_pending_item_write_rolls_back_and_inactive_memberships_are_denied()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var restaurant = await db.Set<Restaurant>().SingleAsync(r => r.Id == f.RestaurantA);
        await f.Run(f.A, async (services, _) =>
        {
            var session = services.GetRequiredService<ITenantDataSession>();
            (await session.EditAsync<MenuItem>(f.ItemA.Id)).Price = 999;
            restaurant.Status = "Suspended";
            await db.SaveChangesAsync();
            Assert.Equal(TenantFailure.Forbidden, (await Assert.ThrowsAsync<TenantBoundaryException>(() => session.CommitAsync())).Failure);
        });
        restaurant.Status = "Active";
        (await db.Set<RestaurantUser>().SingleAsync(m => m.UserId == f.OwnerA)).IsActive = false;
        await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.A.Send(HttpMethod.Post, Route, Request(f.CategoryA.Id))).StatusCode);
        Assert.Equal(1, (await db.Set<MenuItem>().SingleAsync(i => i.Id == f.ItemA.Id)).Price);
        Assert.Equal(1, restaurant.PublishedMenuVersion);
        Assert.False(await db.Set<AuditEntry>().AnyAsync(a => a.Action == "TenantWriteCommitted"));
    }

    [SqlServerFact]
    public async Task Parallel_bounded_item_reads_never_mix_tenants()
    {
        await using var f = await Fixture.Create();
        var timer = System.Diagnostics.Stopwatch.StartNew();
        await Task.WhenAll(Enumerable.Range(0, 20).Select(async i =>
        {
            var source = i % 2 == 0 ? f.A : f.B;
            var browser = new Browser(f.Auth.Factory);
            foreach (var cookie in source.Cookies) browser.Cookies[cookie.Key] = cookie.Value;
            var response = await browser.Send(HttpMethod.Get, Route + "?pageSize=1");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(i % 2 == 0 ? f.ItemA.Id : f.ItemB.Id, Assert.Single((await response.Content.ReadFromJsonAsync<ItemPageResponse>())!.Items).Id);
        }));
        output.WriteLine($"20 concurrent bounded item GETs, A/B, local TestServer + LocalDB: {timer.Elapsed.TotalMilliseconds:F1}ms total, zero errors. Not a production benchmark.");
    }
}
