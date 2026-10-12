using DigitalMenu.Domain;
using DigitalMenu.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace DigitalMenu.IntegrationTests;

public sealed class SqlServerFactAttribute : FactAttribute
{
    public SqlServerFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("F02_SQL_CONNECTION") is null)
            Skip = "Set F02_SQL_CONNECTION to a dedicated local/disposable SQL Server; F02 CI requires this suite.";
    }
}

public sealed class PersistenceTests
{
    [SqlServerFact]
    public async Task Migrations_and_relational_constraints_are_enforced_by_sql_server()
    {
        var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION"));
        // Never use the supplied database name. Every run owns a new isolated database.
        if (connection.DataSource != "(localdb)\\DigitalMenuF02" && connection.DataSource != "localhost,1433")
            throw new InvalidOperationException("Only dedicated F02 LocalDB or localhost disposable CI SQL Server is allowed.");
        connection.InitialCatalog = "DigitalMenu_F02_Test_" + Guid.NewGuid().ToString("N");
        SqlTestStorage.Configure(connection);
        var options = new DbContextOptionsBuilder<MenuDbContext>().UseSqlServer(connection.ConnectionString).Options;
        await using var db = new MenuDbContext(options);
        try
        {
            await db.Database.MigrateAsync();
            Assert.Single(await db.Database.GetAppliedMigrationsAsync());
            Assert.False(db.Database.HasPendingModelChanges());
            await db.Database.MigrateAsync(); // repeat migration is idempotent
            var fixture = TwoRestaurantFixture.Create();
            db.AddRange(fixture.A, fixture.B, fixture.CategoryA, fixture.CategoryB, fixture.ItemA);
            await db.SaveChangesAsync();
            Assert.Equal(2, await db.Set<Restaurant>().CountAsync());
            Assert.Equal(8, fixture.ItemA.RowVersion.Length);

            async Task Reject(FormattableString sql, int number)
            {
                var error = await Assert.ThrowsAsync<SqlException>(() => db.Database.ExecuteSqlInterpolatedAsync(sql));
                Assert.Equal(number, error.Number);
            }

            // Raw SQL intentionally bypasses all EF validation/change tracking.
            await Reject($"INSERT INTO MenuItems (Id,RestaurantId,CategoryId,NameAr,Price,SortOrder,IsPublished,IsAvailable,IsDeleted,CreatedAtUtc,UpdatedAtUtc) VALUES ({Guid.NewGuid()},{fixture.A.Id},{fixture.CategoryB.Id},N'foreign',1,0,0,1,0,SYSUTCDATETIME(),SYSUTCDATETIME())", 547);
            await Reject($"UPDATE MenuItems SET CategoryId={fixture.CategoryB.Id} WHERE Id={fixture.ItemA.Id}", 547);
            await Reject($"INSERT INTO MenuItemImages (Id,RestaurantId,MenuItemId,ObjectKey,SortOrder,Width,Height,ContentType,CreatedAtUtc) VALUES ({Guid.NewGuid()},{fixture.B.Id},{fixture.ItemA.Id},{fixture.B.Id.ToString() + "/test.webp"},0,100,100,'image/webp',SYSUTCDATETIME())", 547);
            await Reject($"UPDATE MenuItems SET Price=-1 WHERE Id={fixture.ItemA.Id}", 547);
            await Reject($"DELETE FROM Categories WHERE Id={fixture.CategoryA.Id}", 547);
            await Reject($"DELETE FROM Restaurants WHERE Id={fixture.A.Id}", 547);
            await Reject($"UPDATE Restaurants SET Slug={fixture.A.Slug} WHERE Id={fixture.B.Id}", 2601);
            await Reject($"UPDATE Restaurants SET PublicCode={fixture.A.PublicCode} WHERE Id={fixture.B.Id}", 2601);
            await Reject($"UPDATE Restaurants SET PublicCode='new-code' WHERE Id={fixture.B.Id}", 51000);
            await Reject($"UPDATE Categories SET RestaurantId={fixture.A.Id} WHERE Id={fixture.CategoryB.Id}", 51000);

            db.Add(new RestaurantSettings { RestaurantId = fixture.A.Id });
            db.Add(new ApplicationUser { Id = Guid.NewGuid(), UserName = "fixture-only" });
            await db.SaveChangesAsync();
            var user = await db.Users.SingleAsync();
            db.Add(new RestaurantUser { RestaurantId = fixture.A.Id, UserId = user.Id });
            db.Add(new MenuItemImage { RestaurantId = fixture.A.Id, MenuItemId = fixture.ItemA.Id, ObjectKey = fixture.A.Id + "/valid.webp", Width = 100, Height = 100 });
            db.Add(new AuditEntry { RestaurantId = fixture.A.Id, ActorUserId = user.Id, Action = "Fixture", ResourceType = "Restaurant" });
            await db.SaveChangesAsync();
            await Reject($"UPDATE RestaurantSettings SET DefaultLocale='xx' WHERE RestaurantId={fixture.A.Id}", 547);
            await Reject($"UPDATE MenuItemImages SET Width=0 WHERE RestaurantId={fixture.A.Id}", 547);
            await Reject($"UPDATE MenuItemImages SET ObjectKey={fixture.A.Id + "/changed.webp"} WHERE RestaurantId={fixture.A.Id}", 51000);
            await Reject($"UPDATE RestaurantUsers SET UserId={Guid.NewGuid()} WHERE RestaurantId={fixture.A.Id}", 547);

            await using var stale = new MenuDbContext(options);
            var staleItem = await stale.Set<MenuItem>().SingleAsync();
            fixture.ItemA.Price = 50;
            await db.SaveChangesAsync();
            staleItem.Price = 60;
            await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => stale.SaveChangesAsync());
            Assert.Equal(1, await db.Set<MenuItem>().CountAsync());
            // Rollback/reapply only inside this run's disposable database.
            var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            await migrator.MigrateAsync("0");
            Assert.Empty(await db.Database.GetAppliedMigrationsAsync());
            var script = migrator.GenerateScript(options: Microsoft.EntityFrameworkCore.Migrations.MigrationsSqlGenerationOptions.Idempotent);
            for (var run = 0; run < 2; run++)
            {
                foreach (var batch in System.Text.RegularExpressions.Regex.Split(script, @"^GO\s*$", System.Text.RegularExpressions.RegexOptions.Multiline))
                    if (!string.IsNullOrWhiteSpace(batch))
                        await db.Database.ExecuteSqlRawAsync(batch);
            }
            Assert.Single(await db.Database.GetAppliedMigrationsAsync());
            Assert.Empty(await db.Set<Restaurant>().AsNoTracking().ToListAsync());
        }
        finally
        {
            // Only the randomly named database created by this run is removed.
            await db.Database.EnsureDeletedAsync();
        }
    }
}

public sealed record TwoRestaurantFixture(Restaurant A, Restaurant B, Category CategoryA, Category CategoryB, MenuItem ItemA)
{
    public static TwoRestaurantFixture Create()
    {
        var a = new Restaurant { Name = "مطعم ألف", Slug = "fixture-a", PublicCode = "fixture-a-code" };
        var b = new Restaurant { Name = "مطعم باء", Slug = "fixture-b", PublicCode = "fixture-b-code" };
        var ca = new Category { RestaurantId = a.Id, NameAr = "مشروبات" };
        var cb = new Category { RestaurantId = b.Id, NameAr = "مشروبات" };
        return new(a, b, ca, cb, new MenuItem { RestaurantId = a.Id, CategoryId = ca.Id, NameAr = "قهوة", Price = 0 });
    }
}
