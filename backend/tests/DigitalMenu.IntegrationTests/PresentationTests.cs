using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalMenu.Api.Catalog;
using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using Fixture = DigitalMenu.IntegrationTests.TenantSecurityTests.Fixture;

namespace DigitalMenu.IntegrationTests;

/// <summary>Presentation fields (theme, brand label, taglines, featured) and the hero route guards.</summary>
public sealed class PresentationTests
{
    private const string Route = "/api/v1/admin/settings";
    private static string PublicMenu(string slug) => "/api/v1/public/restaurants/by-slug/" + slug;

    private static async Task PublishAll(Fixture f)
    {
        using var scope = f.Auth.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        foreach (var restaurant in await db.Set<Restaurant>().ToListAsync()) restaurant.IsPublished = true;
        await db.SaveChangesAsync();
    }

    private static async Task<JsonElement> Public(HttpClient client, string slug)
    {
        var response = await client.GetAsync(PublicMenu(slug));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
    }

    private static async Task<SettingsResponse> Current(Fixture f) =>
        (await (await f.A.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;

    [SqlServerFact]
    public async Task Defaults_are_classic_with_no_texts_and_no_hero()
    {
        await using var f = await Fixture.Create();
        var s = await Current(f);
        Assert.Equal("classic", s.Theme);
        Assert.Null(s.BrandLabel);
        Assert.Null(s.TaglineAr);
        Assert.Null(s.TaglineEn);
        Assert.False(s.HasHero);
        Assert.Null(s.HeroUrl);
    }

    [SqlServerFact]
    public async Task Put_sets_presentation_fields_and_projects_them_to_the_public_menu_with_a_version_bump()
    {
        await using var f = await Fixture.Create();
        await PublishAll(f);
        await f.A.Csrf();
        using var client = f.Auth.Factory.CreateClient();
        var before = await Public(client, "a");
        var current = await Current(f);
        var response = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest(current.PrimaryColor, current.RowVersion,
            "cafe", "THE ROOM", "نص عربي", "English text"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var after = await Public(client, "a");
        var restaurant = after.GetProperty("restaurant");
        Assert.Equal("cafe", restaurant.GetProperty("theme").GetString());
        Assert.Equal("THE ROOM", restaurant.GetProperty("brandLabel").GetString());
        Assert.Equal("نص عربي", restaurant.GetProperty("tagline").GetString());
        Assert.Equal(before.GetProperty("publishedMenuVersion").GetInt64() + 1,
            after.GetProperty("publishedMenuVersion").GetInt64());
        var other = await Public(client, "b");
        Assert.Equal("classic", other.GetProperty("restaurant").GetProperty("theme").GetString());
    }

    [SqlServerFact]
    public async Task Put_without_presentation_fields_leaves_them_unchanged_and_empty_clears()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var s1 = await Current(f);
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s1.PrimaryColor, s1.RowVersion, "cafe", "LABEL", "ar", "en"))).StatusCode);
        var s2 = await Current(f);
        // Old client: color only.
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest("#334155", s2.RowVersion))).StatusCode);
        var s3 = await Current(f);
        Assert.Equal("cafe", s3.Theme);
        Assert.Equal("LABEL", s3.BrandLabel);
        Assert.Equal("ar", s3.TaglineAr);
        // Empty string clears.
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s3.PrimaryColor, s3.RowVersion, null, "", "", ""))).StatusCode);
        var s4 = await Current(f);
        Assert.Null(s4.BrandLabel);
        Assert.Null(s4.TaglineAr);
        Assert.Null(s4.TaglineEn);
        Assert.Equal("cafe", s4.Theme);
    }

    [SqlServerFact]
    public async Task Put_rejects_an_unknown_theme_overlong_text_and_a_stale_row_version()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var s = await Current(f);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, "neon"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, null, new string('x', 41)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, null, null, new string('x', 121)))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, "cafe"))).StatusCode);
        var stale = await f.A.Send(HttpMethod.Put, Route, new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, "classic"));
        Assert.NotEqual(HttpStatusCode.OK, stale.StatusCode);
        Assert.Equal("cafe", (await Current(f)).Theme);
    }

    [SqlServerFact]
    public async Task Another_tenant_sees_nothing_of_the_first_tenants_presentation()
    {
        await using var f = await Fixture.Create();
        await f.A.Csrf();
        var s = await Current(f);
        Assert.Equal(HttpStatusCode.OK, (await f.A.Send(HttpMethod.Put, Route,
            new UpdateSettingsRequest(s.PrimaryColor, s.RowVersion, "cafe", "A-ONLY"))).StatusCode);
        var b = (await (await f.B.Send(HttpMethod.Get, Route)).Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("classic", b.Theme);
        Assert.Null(b.BrandLabel);
    }

    [SqlServerFact]
    public async Task Hero_routes_require_a_login_and_the_public_hero_is_404_without_an_upload()
    {
        await using var f = await Fixture.Create(publicCodeA: "0123456789abcdef0123");
        await PublishAll(f);
        var guest = new Browser(f.Auth.Factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Get, Route + "/hero")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.Send(HttpMethod.Delete, Route + "/hero")).StatusCode);
        var s = await Current(f);
        using var client = f.Auth.Factory.CreateClient();
        var response = await client.GetAsync("/api/v1/public/media/hero/" + s.PublicCode);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var menu = await Public(client, "a");
        Assert.Equal(JsonValueKind.Null, menu.GetProperty("restaurant").GetProperty("heroUrl").ValueKind);
    }
}
