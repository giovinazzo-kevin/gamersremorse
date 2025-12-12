using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Metadatas",
                columns: table => new
                {
                    AppId = table.Column<uint>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UpdatedOn = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Metadatas", x => x.AppId);
                });

            migrationBuilder.CreateTable(
                name: "SteamAppInfos",
                columns: table => new
                {
                    AppId = table.Column<uint>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SteamAppInfos", x => x.AppId);
                });

            migrationBuilder.CreateTable(
                name: "SteamReviews",
                columns: table => new
                {
                    AuthorId = table.Column<long>(type: "INTEGER", nullable: false),
                    AppId = table.Column<uint>(type: "INTEGER", nullable: false),
                    Verdict = table.Column<int>(type: "INTEGER", nullable: false),
                    TimePlayedAtReview = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    TimePlayedInTotal = table.Column<TimeSpan>(type: "TEXT", nullable: false),
                    PostedOn = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    EditedOn = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SteamReviews", x => new { x.AuthorId, x.AppId });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Metadatas");

            migrationBuilder.DropTable(
                name: "SteamAppInfos");

            migrationBuilder.DropTable(
                name: "SteamReviews");
        }
    }
}
