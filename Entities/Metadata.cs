using Microsoft.EntityFrameworkCore;

namespace gamersremorse.Entities;

[PrimaryKey(nameof(AppId))]
public record Metadata
{
    public AppId AppId { get; set; }
    public EventDate UpdatedOn { get; set; }
    public Amount TotalPositive { get; set; } 
    public Amount TotalNegative { get; set; }
    public Amount TargetSampleCount { get; set; }
}
