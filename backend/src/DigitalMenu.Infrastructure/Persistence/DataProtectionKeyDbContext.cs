using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace DigitalMenu.Infrastructure.Persistence;

/// <summary>
/// Dedicated, minimal context for the optional Database data-protection key ring. It has no tenant filters,
/// no Identity and no dependency on the request or authentication pipeline. Its own migration history table keeps
/// it independent of the application migrations.
/// </summary>
public sealed class DataProtectionKeyDbContext(DbContextOptions<DataProtectionKeyDbContext> options)
    : DbContext(options), IDataProtectionKeyContext
{
    public const string HistoryTable = "__EFMigrationsHistory_DataProtection";
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
}

public sealed class DataProtectionKeyDbContextFactory : IDesignTimeDbContextFactory<DataProtectionKeyDbContext>
{
    public DataProtectionKeyDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<DataProtectionKeyDbContext>()
            .UseSqlServer(Environment.GetEnvironmentVariable("F02_SQL_CONNECTION") ?? "Server=.;Database=DesignTimeOnly;Trusted_Connection=True;",
                o => o.MigrationsHistoryTable(DataProtectionKeyDbContext.HistoryTable)).Options);
}
