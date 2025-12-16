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
    LanguageStats LanguageStats,
    EditHeatmap EditHeatmap
);

// Heatmap of when reviews were posted vs when they were edited
// Key format: "postedMonth|editedMonth" -> {positive, negative}
public record struct EditHeatmap(
    string[] Months,  // sorted list of all months
    Dictionary<string, EditCell> Cells  // "2023-01|2024-06" -> counts
);

public record struct EditCell(int Positive, int Negative);

public record struct LanguageStats(
    Dictionary<string, int> ProfanityByMonth,
    Dictionary<string, int> InsultsByMonth,
    Dictionary<string, int> SlursByMonth,
    Dictionary<string, int> BanterByMonth,
    Dictionary<string, int> ComplaintsByMonth
);