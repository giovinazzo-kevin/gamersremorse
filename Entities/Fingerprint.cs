using Microsoft.EntityFrameworkCore;
using Pgvector;
using System.Collections;
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
    // 96 floats: [certPos x 24, certNeg x 24, uncPos x 24, uncNeg x 24]
    public float[] Curve { get; set; } = [];
    // Mask for XOR similarity search
    [Column(TypeName ="bit(24000)")]
    public BitArray ShapeMask { get; set; } = new BitArray(24000);
    public EventDate UpdatedOn { get; set; }
}