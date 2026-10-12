using Microsoft.Data.SqlClient;

namespace DigitalMenu.IntegrationTests;

// Optional local test-only drive selection; each fixture still owns a unique disposable database.
internal static class SqlTestStorage
{
    public static void Configure(SqlConnectionStringBuilder connection)
    {
        var directory = Environment.GetEnvironmentVariable("F02_SQL_DATA_DIRECTORY");
        if (directory is null) return;
        if (connection.DataSource != "(localdb)\\DigitalMenuF02" || !Path.IsPathFullyQualified(directory))
            throw new InvalidOperationException("A fully qualified directory and dedicated LocalDB instance are required.");
        Directory.CreateDirectory(directory);
        connection.AttachDBFilename = Path.Combine(Path.GetFullPath(directory), connection.InitialCatalog + ".mdf");
    }
}
