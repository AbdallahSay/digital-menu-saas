using DigitalMenu.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    // Database-level throughput change, no model diff: readers get row-versioned
    // committed reads instead of held shared locks, removing the ordinary
    // repeatable-read shared-lock hot path where anonymous menu reads stall the
    // owner's tenant writes. Schema locks and write/write conflicts still block;
    // RCSI does not change those.
    //
    // Safety contract:
    // - Up() skips when the setting is already ON (Azure SQL databases default it
    //   ON), so a repeat or pre-enabled rollout touches nothing.
    // - The enable uses WITH NO_WAIT (LOCK_TIMEOUT does not apply to ALTER
    //   DATABASE): if any other connection holds the database, the ALTER fails
    //   immediately with an actionable quiesce-the-old-instances error instead
    //   of blocking a rollout indefinitely. No ROLLBACK/termination of other
    //   sessions anywhere.
    // - Down() is deliberately one-way: Azure SQL defaults RCSI ON, so Down cannot
    //   know the pre-migration state and must not force OFF. Reverting is an
    //   operational decision in a maintenance window.
    // Written by hand (no SDK on the authoring machine); CI validates it.
    [DbContext(typeof(MenuDbContext))]
    [Migration("20261122000000_ReadCommittedSnapshot")]
    public partial class ReadCommittedSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()) = 0
                BEGIN
                    BEGIN TRY
                        ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH NO_WAIT;
                    END TRY
                    BEGIN CATCH
                        DECLARE @detail nvarchar(2048) = N'READ_COMMITTED_SNAPSHOT enable failed immediately (NO_WAIT): the database has other connections. Quiesced migration step - drain or stop old app instances, then re-run migrations. Original SQL error ' + CAST(ERROR_NUMBER() AS nvarchar(10)) + N': ' + ERROR_MESSAGE();
                        THROW 51002, @detail, 1;
                    END CATCH;
                END;
                """, suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // One-way: see the class comment. No SQL on purpose.
        }
    }
}
