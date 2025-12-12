using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public DbSet<Metadata> Metadatas { get; protected set; } = null!;
    public DbSet<SteamAppInfo> SteamAppInfos { get; protected set; } = null!;
    public DbSet<SteamReview> SteamReviews { get; protected set; } = null!;
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseSqlite("Filename=GamersRemorse.db");
    }
}