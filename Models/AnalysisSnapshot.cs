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
    Dictionary<string, int> ProfanityByMonth,
    Dictionary<string, int> InsultsByMonth,
    Dictionary<string, int> SlursByMonth,
    Dictionary<string, int> BanterByMonth,
    Dictionary<string, int> ComplaintsByMonth
);