using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class GamesOwnedAndLastPlayed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "GamesOwned",
                table: "SteamReviews",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastPlayed",
                table: "SteamReviews",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GamesOwned",
                table: "SteamReviews");

            migrationBuilder.DropColumn(
                name: "LastPlayed",
                table: "SteamReviews");
        }
    }
}
