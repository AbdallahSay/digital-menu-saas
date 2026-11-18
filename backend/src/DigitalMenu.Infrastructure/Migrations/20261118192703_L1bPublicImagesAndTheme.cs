using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class L1bPublicImagesAndTheme : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CoverHeight",
                table: "RestaurantSettings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CoverWidth",
                table: "RestaurantSettings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LogoHeight",
                table: "RestaurantSettings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LogoWidth",
                table: "RestaurantSettings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThemeKey",
                table: "RestaurantSettings",
                type: "varchar(16)",
                unicode: false,
                maxLength: 16,
                nullable: false,
                defaultValue: "teal");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Settings_CoverSize",
                table: "RestaurantSettings",
                sql: "([CoverWidth] IS NULL AND [CoverHeight] IS NULL) OR ([CoverWidth] IS NOT NULL AND [CoverHeight] IS NOT NULL AND [CoverWidth] BETWEEN 1 AND 6000 AND [CoverHeight] BETWEEN 1 AND 6000)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Settings_LogoSize",
                table: "RestaurantSettings",
                sql: "([LogoWidth] IS NULL AND [LogoHeight] IS NULL) OR ([LogoWidth] IS NOT NULL AND [LogoHeight] IS NOT NULL AND [LogoWidth] BETWEEN 1 AND 6000 AND [LogoHeight] BETWEEN 1 AND 6000)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings",
                sql: "[ThemeKey] IN ('teal','amber','burgundy')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Settings_CoverSize",
                table: "RestaurantSettings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Settings_LogoSize",
                table: "RestaurantSettings");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "CoverHeight",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "CoverWidth",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "LogoHeight",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "LogoWidth",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "ThemeKey",
                table: "RestaurantSettings");
        }
    }
}
