using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class Profamity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte>(
                name: "InsultCount",
                table: "SteamReviews",
                type: "INTEGER",
                nullable: false,
                defaultValue: (byte)0);

            migrationBuilder.AddColumn<byte>(
                name: "ProfanityCount",
                table: "SteamReviews",
                type: "INTEGER",
                nullable: false,
                defaultValue: (byte)0);

            migrationBuilder.AddColumn<byte>(
                name: "SlurCount",
                table: "SteamReviews",
                type: "INTEGER",
                nullable: false,
                defaultValue: (byte)0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InsultCount",
                table: "SteamReviews");

            migrationBuilder.DropColumn(
                name: "ProfanityCount",
                table: "SteamReviews");

            migrationBuilder.DropColumn(
                name: "SlurCount",
                table: "SteamReviews");
        }
    }
}
