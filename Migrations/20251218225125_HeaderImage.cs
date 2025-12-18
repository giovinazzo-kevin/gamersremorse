using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class HeaderImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HeaderImage",
                table: "SteamAppInfos",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HeaderImage",
                table: "SteamAppInfos");
        }
    }
}
