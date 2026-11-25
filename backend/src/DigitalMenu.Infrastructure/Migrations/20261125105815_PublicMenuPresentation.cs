using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PublicMenuPresentation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BrandLabel",
                table: "RestaurantSettings",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaglineAr",
                table: "RestaurantSettings",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TaglineEn",
                table: "RestaurantSettings",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Theme",
                table: "RestaurantSettings",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "classic");

            migrationBuilder.AddColumn<bool>(
                name: "IsFeatured",
                table: "MenuItems",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings",
                sql: "[Theme] IN ('classic','cafe')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Settings_Theme",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "BrandLabel",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "TaglineAr",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "TaglineEn",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "Theme",
                table: "RestaurantSettings");

            migrationBuilder.DropColumn(
                name: "IsFeatured",
                table: "MenuItems");
        }
    }
}
