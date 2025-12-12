using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamReviewDTO
{
    [JsonPropertyName("recommendationid")]
    public ReviewId RecommendationId { get; set; }
    [JsonPropertyName("author")]
    public SteamReviewAuthorDTO Author { get; set; } = null!;
    [JsonPropertyName("voted_up")]
    public bool VotedUp { get; set; }
    [JsonPropertyName("timestamp_created")]
    public int CreatedAt { get; set; }
    [JsonPropertyName("timestamp_updated")]
    public int UpdatedAt { get; set; }
    [JsonPropertyName("language")]
    public string Language { get; set; } = null!;
    [JsonPropertyName("review")]
    public string Review { get; set; } = null!;
}
