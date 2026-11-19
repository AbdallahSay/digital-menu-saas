using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlatformAuditAndPlanLabels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PaidUntilUtc",
                table: "Restaurants",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlanName",
                table: "Restaurants",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MetadataJson",
                table: "AuditEntries",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Restaurant_PlanName",
                table: "Restaurants",
                sql: "[PlanName] IS NULL OR LEN([PlanName]) > 0");

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_Action_TimestampUtc",
                table: "AuditEntries",
                columns: new[] { "Action", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_TimestampUtc",
                table: "AuditEntries",
                column: "TimestampUtc");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AuditEntry_Metadata",
                table: "AuditEntries",
                sql: "[MetadataJson] IS NULL OR ISJSON([MetadataJson]) = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Restaurant_PlanName",
                table: "Restaurants");

            migrationBuilder.DropIndex(
                name: "IX_AuditEntries_Action_TimestampUtc",
                table: "AuditEntries");

            migrationBuilder.DropIndex(
                name: "IX_AuditEntries_TimestampUtc",
                table: "AuditEntries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AuditEntry_Metadata",
                table: "AuditEntries");

            migrationBuilder.DropColumn(
                name: "PaidUntilUtc",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "PlanName",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "MetadataJson",
                table: "AuditEntries");
        }
    }
}
