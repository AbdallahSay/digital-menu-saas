using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DigitalMenu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLeadNoticeFingerprint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "NoticeVersion",
                table: "Leads",
                type: "nvarchar(48)",
                maxLength: 48,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(40)",
                oldMaxLength: 40);

            migrationBuilder.AddColumn<string>(
                name: "NoticeFingerprint",
                table: "Leads",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NoticeFingerprint",
                table: "Leads");

            migrationBuilder.AlterColumn<string>(
                name: "NoticeVersion",
                table: "Leads",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(48)",
                oldMaxLength: 48);
        }
    }
}
