namespace gamersremorse.Models;

public record struct AnalysisSnapshot(
    HistogramBucket[] BucketsByReviewTime,
    HistogramBucket[] BucketsByTotalTime,
    VelocityBucket[] VelocityBuckets,
    int[] AnomalyIndices,
    int TotalPositive,
    int TotalNegative,
    int GameTotalPositive,
    int GameTotalNegative,
    int TargetSampleCount,
    LanguageStats LanguageStats
);

public record struct LanguageStats(
    Dictionary<string, int> Profanity,
    Dictionary<string, int> Insults,
    Dictionary<string, int> Slurs
);