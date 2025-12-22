using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace gamersremorse.Migrations
{
    /// <inheritdoc />
    public partial class AddCurve : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<float[]>(
                name: "Curve",
                table: "Fingerprints",
                type: "real[]",
                nullable: false,
                defaultValue: new float[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Curve",
                table: "Fingerprints");
        }
    }
}
