using Microsoft.EntityFrameworkCore;
using Pgvector;
using System.ComponentModel.DataAnnotations.Schema;

namespace gamersremorse.Entities;

[PrimaryKey(nameof(AppId))]
public record Fingerprint
{
    public AppId AppId { get; set; }

    // Sort metrics (indexed)
    public PlayTime PosMedian { get; set; }
    public PlayTime NegMedian { get; set; }
    public Amount SteamPositive { get; set; }
    public Amount SteamNegative { get; set; }

    // Thumbnail mask for client rendering
    public byte[] ThumbnailPng { get; set; } = [];

    // Vector for similarity (pgvector)
    public Vector Shape { get; set; } = null!;

    // Full snapshot for client
    public byte[] Snapshot { get; set; } = [];

    public EventDate UpdatedOn { get; set; }
}