using gamersremorse.Models;
namespace gamersremorse.Models;

public record struct AnalysisSnapshot(
    HistogramBucket[] Buckets,
    int[] AnomalyIndices,
    VelocityBucket[] VelocityBuckets,
    double PositiveMedian,
    double NegativeMedian,
    int TotalPositive,
    int TotalNegative
);