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

public sealed class SettingsTests
{
    private const string Route = "/api/v1/admin/settings";
    private static string PublicMenu(string slug) => "/api/v1/public/restaurants/by-slug/" + slug;

    private static async Task<System.Text.Json.JsonElement> Public(HttpClient client, string slug)
    {
        var response = await client.GetAsync(PublicMenu(slug));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(
            await response.Content.ReadAsStringAsync());
    }

    /// <summary>
    /// The shared security fixture seeds restaurants unpublished, and the
    /// public menu requires IsPublished; publish both LOCALLY for the
    /// public-projection tests without touching the shared fixture.
    /// </summary>
    private static async Task PublishBoth(Fixture f)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        foreach (var restaurant in await db.Set<Restaurant>().ToListAsync()) restaurant.IsPublished = true;
        await db.SaveChangesAsync();
    }

    private static string Color(System.Text.Json.JsonElement menu) =>
        menu.GetProperty("restaurant").GetProperty("primaryColor").GetString()!;
    private static long Version(System.Text.Json.JsonElement menu) =>
        menu.GetProperty("publishedMenuVersion").GetInt64();

    [SqlServerFact]
    public async Task Get_returns_own_settings_with_the_exact_contract_shape()
    {
        await using var f = await Fixture.Create();
        var guest = new Browser(f.Auth.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Get, Route)).StatusCode);
        var response = await f.A.Send(HttpMethod.Get, Route);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var body = await response.Content.ReadAsStringAsync();
        var json = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(body);
        Assert.Equal(new[] { "brandLabel", "hasHero", "hasLogo", "heroUrl", "logoUrl", "name", "primaryColor", "publicCode", "rowVersion", "slug", "taglineAr", "taglineEn", "theme" },
            json.EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal("a", json.GetProperty("slug").GetString());
        Assert.Equal("#0F766E", json.GetProperty("primaryColor").GetString());
        Assert.False(json.GetProperty("hasLogo").GetBoolean());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, json.GetProperty("logoUrl").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("publicCode").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("rowVersion").GetString()));
    }

    [SqlServerFact]
    public async Task Put_updates_the_color_normalized_and_rotates_the_row_version()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf(); // Login rotates the antiforgery token; refresh it before mutating.
        var current = await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        var updated = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#D97", current!.RowVersion));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var body = (await updated.Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#dd9977", body.PrimaryColor);
        Assert.NotEqual(current.RowVersion, body.RowVersion);
        var reread = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#dd9977", reread.PrimaryColor);
        Assert.Equal(body.RowVersion, reread.RowVersion);
    }

    [SqlServerFact]
    public async Task Put_changes_the_public_projection_and_bumps_only_the_own_menu_version()
    {
        await using var f = await Fixture.Create();
        await PublishBoth(f);
        await f.A.Csrf();
        using var publicClient = f.Auth.Factory.CreateClient();
        var aBefore = await Public(publicClient, "a");
        var bBefore = await Public(publicClient, "b");
        var current = await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        var updated = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", current!.RowVersion));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var aAfter = await Public(publicClient, "a");
        var bAfter = await Public(publicClient, "b");
        Assert.Equal("#0f766e", Color(aBefore).ToLowerInvariant());
        Assert.Equal("#334155", Color(aAfter));
        Assert.Equal(Version(aBefore) + 1, Version(aAfter));
        Assert.Equal(Color(bBefore), Color(bAfter));
        Assert.Equal(Version(bBefore), Version(bAfter));
    }

    [SqlServerFact]
    public async Task Put_rejects_malformed_and_missing_colors_without_touching_state_or_version()
    {
        await using var f = await Fixture.Create();
        await PublishBoth(f);
        await f.A.Csrf();
        using var publicClient = f.Auth.Factory.CreateClient();
        var versionBefore = Version(await Public(publicClient, "a"));
        var current = await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        foreach (var color in new[] { "red", "#12345", "#gggggg", "#1234567", "" })
            Assert.Equal(HttpStatusCode.BadRequest,
                (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest(color, current!.RowVersion))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest(null, current!.RowVersion))).StatusCode);
        var reread = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#0F766E", reread.PrimaryColor);
        Assert.Equal(versionBefore, Version(await Public(publicClient, "a")));
    }

    [SqlServerFact]
    public async Task Put_rejects_invalid_missing_and_foreign_row_versions_and_a_stale_one_changes_nothing()
    {
        await using var f = await Fixture.Create();
        await PublishBoth(f);
        await f.A.Csrf();
        await f.B.Csrf();
        using var publicClient = f.Auth.Factory.CreateClient();
        var versionBefore = Version(await Public(publicClient, "a"));
        // Malformed and missing row versions are invalid requests, never 404/412.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", "not-base64!!"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", null))).StatusCode);
        // A foreign (other-tenant) row version is well-formed but mismatched: this
        // endpoint has no resource id, so the mismatch surfaces as stale, not 404.
        var bSettings = await (await f.B.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        Assert.Equal(HttpStatusCode.PreconditionFailed,
            (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", bSettings!.RowVersion))).StatusCode);
        // A stale own row version: 412, problem+json, and neither color nor version moves.
        var stale = System.Convert.ToBase64String(new byte[8]);
        var response = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", stale));
        Assert.Equal(HttpStatusCode.PreconditionFailed, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var reread = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#0F766E", reread.PrimaryColor);
        Assert.Equal(versionBefore, Version(await Public(publicClient, "a")));
    }

    [SqlServerFact]
    public async Task Put_with_the_same_color_in_any_casing_commits_without_version_churn()
    {
        await using var f = await Fixture.Create();
        await PublishBoth(f);
        await f.A.Csrf();
        using var publicClient = f.Auth.Factory.CreateClient();
        var versionBefore = Version(await Public(publicClient, "a"));
        var current = await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        // The seeded default is uppercase "#0F766E"; sending the lowercase
        // equivalent must not count as a change either.
        var same = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#0f766e", current!.RowVersion));
        Assert.Equal(HttpStatusCode.OK, same.StatusCode);
        var reread = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#0F766E", reread.PrimaryColor);
        Assert.Equal(current.RowVersion, reread.RowVersion);
        Assert.Equal(versionBefore, Version(await Public(publicClient, "a")));
    }

    [SqlServerFact]
    public async Task Tenants_cannot_see_or_move_each_others_brand_color_in_either_direction()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        await f.B.Csrf();
        // B moves first; A is untouched.
        var bSettings = await (await f.B.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>();
        Assert.Equal("b", bSettings!.Slug);
        Assert.Equal(HttpStatusCode.OK,
            (await f.B.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#334155", bSettings.RowVersion))).StatusCode);
        var aAfterB = (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#0F766E", aAfterB.PrimaryColor);
        // Then A moves; B's new color is untouched.
        Assert.Equal(HttpStatusCode.OK,
            (await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest("#059669", aAfterB.RowVersion))).StatusCode);
        var bAfterA = (await (await f.B.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("#334155", bAfterA.PrimaryColor);
    }
}
