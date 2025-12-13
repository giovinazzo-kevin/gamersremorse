using gamersremorse.Models;
namespace gamersremorse.Models;

public record struct AnalysisSnapshot(
    HistogramBucket[] BucketsByReviewTime,
    HistogramBucket[] BucketsByTotalTime,
    VelocityBucket[] VelocityBuckets,
    int[] AnomalyIndices,
    double PositiveMedianReview,
    double NegativeMedianReview,
    double PositiveMedianTotal,
    double NegativeMedianTotal,
    int TotalPositive,
    int TotalNegative
);