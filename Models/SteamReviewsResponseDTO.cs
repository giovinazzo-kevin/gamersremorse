using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamReviewsResponseDTO
{
    [JsonPropertyName("success")]
    public int Success { get; set; }
    [JsonPropertyName("cursor")]
    public string Cursor { get; set; } = string.Empty;
    [JsonPropertyName("reviews")]
    public SteamReviewDTO[] Reviews { get; set; } = [];
    [JsonPropertyName("query_summary")]
    public SteamQuerySummaryDTO? QuerySummary { get; set; }
}

public record SteamQuerySummaryDTO
{
    [JsonPropertyName("num_reviews")]
    public int NumReviews { get; set; }
    [JsonPropertyName("review_score")]
    public int ReviewScore { get; set; }
    [JsonPropertyName("review_score_desc")]
    public string ReviewScoreDesc { get; set; } = string.Empty;
    [JsonPropertyName("total_positive")]
    public int TotalPositive { get; set; }
    [JsonPropertyName("total_negative")]
    public int TotalNegative { get; set; }
    [JsonPropertyName("total_reviews")]
    public int TotalReviews { get; set; }
}
