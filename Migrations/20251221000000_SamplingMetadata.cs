using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class SamplingMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SampledPositive",
                table: "Metadatas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SampledNegative",
                table: "Metadatas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "PositiveExhausted",
                table: "Metadatas",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "NegativeExhausted",
                table: "Metadatas",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsStreaming",
                table: "Metadatas",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SampledPositive",
                table: "Metadatas");

            migrationBuilder.DropColumn(
                name: "SampledNegative",
                table: "Metadatas");

            migrationBuilder.DropColumn(
                name: "PositiveExhausted",
                table: "Metadatas");

            migrationBuilder.DropColumn(
                name: "NegativeExhausted",
                table: "Metadatas");

            migrationBuilder.DropColumn(
                name: "IsStreaming",
                table: "Metadatas");
        }
    }
}
