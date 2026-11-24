using DigitalMenu.Domain;
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
            // The last allowed page is reachable and empty, not an error; later tenants are never cut off.
            var last = await reader.ReadAsync(SitemapReader.MaxPage, CancellationToken.None);
            Assert.Empty(last.Entries);
            Assert.False(last.HasMore);
        }
        finally
        {
            await db.Database.EnsureDeletedAsync();
        }
    }
}
