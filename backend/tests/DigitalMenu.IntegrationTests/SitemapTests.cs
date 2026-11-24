using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using DigitalMenu.Application;
using DigitalMenu.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore.Diagnostics;
using static DigitalMenu.IntegrationTests.AuthenticationTests;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DigitalMenu.IntegrationTests;

// Sitemap listing at the reader level against real SQL Server (isolated database per run).
// The HTTP route is a thin wrapper: page validation (400) and failure mapping (503).
public sealed class SitemapTests
{
    private static Restaurant R(string slug, bool indexable, bool published = true, string status = "Active") => new()
    {
        Name = "n-" + slug, Slug = slug, PublicCode = Guid.NewGuid().ToString("N")[..20],
        IsIndexable = indexable, IsPublished = published, Status = status,
    };

    [SqlServerFact]
    public async Task Only_opted_in_published_active_tenants_are_listed_and_default_is_off()
    {
        var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION"));
        if (connection.DataSource != "(localdb)\\DigitalMenuF02" && connection.DataSource != "localhost,1433")
            throw new InvalidOperationException("Only dedicated F02 LocalDB or localhost disposable CI SQL Server is allowed.");
        connection.InitialCatalog = "DigitalMenu_F02_Test_" + Guid.NewGuid().ToString("N");
        SqlTestStorage.Configure(connection);
        var options = new DbContextOptionsBuilder<MenuDbContext>().UseSqlServer(connection.ConnectionString).Options;
        await using var db = new MenuDbContext(options);
        try
        {
            await db.Database.MigrateAsync();
            // A row inserted without naming the column gets the database default: off.
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO Restaurants (Id,Name,Slug,PublicCode,Status,IsPublished,PublishedMenuVersion,CreatedAtUtc,UpdatedAtUtc) VALUES (NEWID(),N'legacy','legacy','00000000000000000001','Active',1,1,SYSUTCDATETIME(),SYSUTCDATETIME())");
            Assert.False(await db.Set<Restaurant>().Where(r => r.Slug == "legacy").Select(r => r.IsIndexable).SingleAsync());

            db.AddRange(R("b-listed", true), R("a-listed", true), R("unpublished", true, published: false),
                R("suspended", true, status: "Suspended"), R("not-opted-in", false), R("demo", true));
            await db.SaveChangesAsync();

            var reader = new SitemapReader(db);
            var page = await reader.ReadAsync(1, CancellationToken.None);
            // 'demo' is opted in, published and active but reserved: /r/demo is the static page.
            Assert.Equal(["a-listed", "b-listed"], page.Entries.Select(e => e.Slug).ToArray());
            Assert.False(page.HasMore);
            Assert.All(page.Entries, e => Assert.True(e.LastModifiedUtc > DateTime.UtcNow.AddMinutes(-5)));

            // Unpublishing or suspending removes a listed tenant at once.
            await db.Database.ExecuteSqlRawAsync("UPDATE Restaurants SET IsPublished=0 WHERE Slug='a-listed'");
            await db.Database.ExecuteSqlRawAsync("UPDATE Restaurants SET Status='Suspended' WHERE Slug='b-listed'");
            Assert.Empty((await reader.ReadAsync(1, CancellationToken.None)).Entries);

            await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => reader.ReadAsync(0, CancellationToken.None));
            await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => reader.ReadAsync(SitemapReader.MaxPage + 1, CancellationToken.None));
        }
        finally
        {
            await db.Database.EnsureDeletedAsync();
        }
    }

    [SqlServerFact]
    public async Task Paging_is_bounded_ordered_and_reports_more()
    {
        var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION"));
        if (connection.DataSource != "(localdb)\\DigitalMenuF02" && connection.DataSource != "localhost,1433")
            throw new InvalidOperationException("Only dedicated F02 LocalDB or localhost disposable CI SQL Server is allowed.");
        connection.InitialCatalog = "DigitalMenu_F02_Test_" + Guid.NewGuid().ToString("N");
        SqlTestStorage.Configure(connection);
        var options = new DbContextOptionsBuilder<MenuDbContext>().UseSqlServer(connection.ConnectionString).Options;
        await using var db = new MenuDbContext(options);
        try
        {
            await db.Database.MigrateAsync();
            db.AddRange(Enumerable.Range(0, SitemapReader.PageSize + 5).Select(i => R("t" + i.ToString("D5"), true)));
            await db.SaveChangesAsync();
            var reader = new SitemapReader(db);
            var first = await reader.ReadAsync(1, CancellationToken.None);
            Assert.Equal(SitemapReader.PageSize, first.Entries.Count);
            Assert.True(first.HasMore);
            Assert.Equal("t00000", first.Entries[0].Slug);
            var second = await reader.ReadAsync(2, CancellationToken.None);
            Assert.Equal(5, second.Entries.Count);
            Assert.False(second.HasMore);
            Assert.Equal("t" + SitemapReader.PageSize.ToString("D5"), second.Entries[0].Slug);
            // Terminal overflow with a small supported cap: the last page is Truncated, never HasMore.
            var capped = new SitemapReader(db, maxPage: 1);
            var lastPage = await capped.ReadAsync(1, CancellationToken.None);
            Assert.True(lastPage.Truncated);
            Assert.False(lastPage.HasMore);
            await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => capped.ReadAsync(2, CancellationToken.None));
            Assert.False(first.Truncated);
        }
        finally
        {
            await db.Database.EnsureDeletedAsync();
        }
    }

    private sealed class Failer : DbCommandInterceptor
    {
        public volatile bool Fail;
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData data,
            InterceptionResult<DbDataReader> result, CancellationToken ct = default)
            => Fail ? throw new InvalidOperationException("simulated sql outage") : ValueTask.FromResult(result);
    }

    [SqlServerFact]
    public async Task Http_endpoint_lists_only_slug_and_time_validates_pages_and_maps_failure_to_503()
    {
        var failer = new Failer();
        await using var auth = await AuthFixture.Create(empty: true, configure: s => s.AddDbContext<MenuDbContext>(o => o.AddInterceptors(failer)));
        using (var scope = auth.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            db.AddRange(R("listed-one", true), R("hidden-one", false));
            await db.SaveChangesAsync();
        }
        using var client = auth.Factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        var ok = await client.GetAsync("/api/v1/public/sitemap");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.False(ok.Headers.Contains("Set-Cookie"));
        var body = await ok.Content.ReadAsStringAsync();
        var json = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(body);
        Assert.Equal(["entries", "hasMore", "page", "pageSize", "truncated"], json.EnumerateObject().Select(p => p.Name).Order().ToArray());
        var entry = Assert.Single(json.GetProperty("entries").EnumerateArray());
        Assert.Equal(["lastModifiedUtc", "slug"], entry.EnumerateObject().Select(p => p.Name).Order().ToArray());
        Assert.Equal("listed-one", entry.GetProperty("slug").GetString());
        foreach (var forbidden in new[] { "hidden-one", "n-listed-one", "publicCode", "rowVersion", "restaurantId" })
            Assert.DoesNotContain(forbidden, body, StringComparison.OrdinalIgnoreCase);
        foreach (var bad in new[] { "0", "-1", "100001", "abc" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/public/sitemap?page=" + bad)).StatusCode);
        failer.Fail = true;
        var down = await client.GetAsync("/api/v1/public/sitemap");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, down.StatusCode);
        Assert.DoesNotContain("simulated", await down.Content.ReadAsStringAsync());
    }
}
