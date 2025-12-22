using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class MoveSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Snapshot",
                table: "Fingerprints");

            migrationBuilder.AddColumn<byte[]>(
                name: "Snapshot",
                table: "Metadatas",
                type: "bytea",
                nullable: false,
                defaultValue: new byte[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Snapshot",
                table: "Metadatas");

            migrationBuilder.AddColumn<byte[]>(
                name: "Snapshot",
                table: "Fingerprints",
                type: "bytea",
                nullable: false,
                defaultValue: new byte[0]);
        }
    }
}
