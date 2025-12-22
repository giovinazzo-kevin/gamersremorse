using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

public class AppDbContext : DbContext
{
    public DbSet<Metadata> Metadatas { get; protected set; } = null!;
    public DbSet<SteamAppInfo> SteamAppInfos { get; protected set; } = null!;
    public DbSet<SteamReview> SteamReviews { get; protected set; } = null!;
    public DbSet<ControversyCache> ControversyCaches { get; protected set; } = null!;
    public DbSet<Fingerprint> Fingerprints { get; protected set; } = null!;

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseNpgsql(
            "Host=localhost;Port=5432;Database=gamersremorse;Username=postgres;Password=password",
            o => o.UseVector()
        );
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<Fingerprint>()
            .Property(f => f.Shape)
            .HasColumnType("vector(12000)");
    }
}