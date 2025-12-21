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
    
    // Sampling progress
    public Amount SampledPositive { get; set; }
    public Amount SampledNegative { get; set; }
    public bool PositiveExhausted { get; set; }
    public bool NegativeExhausted { get; set; }
    public bool IsStreaming { get; set; }
}
