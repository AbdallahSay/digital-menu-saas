using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantThemeKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ThemeKey",
                table: "RestaurantSettings",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "grill");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings",
                sql: "[ThemeKey] IN ('grill','cafe')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "ThemeKey",
                table: "RestaurantSettings");
        }
    }
}
