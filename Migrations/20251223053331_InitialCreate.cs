using System;
using System.Collections;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:vector", ",,");

            migrationBuilder.CreateTable(
                name: "ControversyCaches",
                columns: table => new
                {
                    Query = table.Column<string>(type: "text", nullable: false),
                    Overview = table.Column<string>(type: "text", nullable: true),
                    CachedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ControversyCaches", x => x.Query);
                });

            migrationBuilder.CreateTable(
                name: "Fingerprints",
                columns: table => new
                {
                    AppId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PosMedian = table.Column<TimeSpan>(type: "interval", nullable: false),
                    NegMedian = table.Column<TimeSpan>(type: "interval", nullable: false),
                    SteamPositive = table.Column<int>(type: "integer", nullable: false),
                    SteamNegative = table.Column<int>(type: "integer", nullable: false),
                    ThumbnailPng = table.Column<byte[]>(type: "bytea", nullable: false),
                    Curve = table.Column<float[]>(type: "real[]", nullable: false),
                    ShapeMask = table.Column<BitArray>(type: "bit(24000)", nullable: false),
                    UpdatedOn = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Fingerprints", x => x.AppId);
                });

            migrationBuilder.CreateTable(
                name: "Metadatas",
                columns: table => new
                {
                    AppId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UpdatedOn = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TotalPositive = table.Column<int>(type: "integer", nullable: false),
                    TotalNegative = table.Column<int>(type: "integer", nullable: false),
                    TargetSampleCount = table.Column<int>(type: "integer", nullable: false),
                    SampledPositive = table.Column<int>(type: "integer", nullable: false),
                    SampledNegative = table.Column<int>(type: "integer", nullable: false),
                    PositiveExhausted = table.Column<bool>(type: "boolean", nullable: false),
                    NegativeExhausted = table.Column<bool>(type: "boolean", nullable: false),
                    IsStreaming = table.Column<bool>(type: "boolean", nullable: false),
                    Snapshot = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Metadatas", x => x.AppId);
                });

            migrationBuilder.CreateTable(
                name: "SteamAppInfos",
                columns: table => new
                {
                    AppId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    IsFree = table.Column<bool>(type: "boolean", nullable: false),
                    HeaderImage = table.Column<string>(type: "text", nullable: false),
                    Flags = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SteamAppInfos", x => x.AppId);
                });

            migrationBuilder.CreateTable(
                name: "SteamReviews",
                columns: table => new
                {
                    AuthorId = table.Column<long>(type: "bigint", nullable: false),
                    AppId = table.Column<long>(type: "bigint", nullable: false),
                    Verdict = table.Column<int>(type: "integer", nullable: false),
                    GamesOwned = table.Column<int>(type: "integer", nullable: false),
                    ReviewLength = table.Column<int>(type: "integer", nullable: false),
                    ProfanityCount = table.Column<byte>(type: "smallint", nullable: false),
                    InsultCount = table.Column<byte>(type: "smallint", nullable: false),
                    SlurCount = table.Column<byte>(type: "smallint", nullable: false),
                    BanterCount = table.Column<byte>(type: "smallint", nullable: false),
                    ComplaintCount = table.Column<byte>(type: "smallint", nullable: false),
                    TimePlayedAtReview = table.Column<TimeSpan>(type: "interval", nullable: false),
                    TimePlayedInTotal = table.Column<TimeSpan>(type: "interval", nullable: false),
                    LastPlayed = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PostedOn = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EditedOn = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
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
                name: "ControversyCaches");

            migrationBuilder.DropTable(
                name: "Fingerprints");

            migrationBuilder.DropTable(
                name: "Metadatas");

            migrationBuilder.DropTable(
                name: "SteamAppInfos");

            migrationBuilder.DropTable(
                name: "SteamReviews");
        }
    }
}
