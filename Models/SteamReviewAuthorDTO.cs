using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamReviewAuthorDTO
{
    [JsonPropertyName("steamid")]
    public SteamId SteamId { get; set; }
    [JsonPropertyName("playtime_forever")]
    public int PlaytimeForever { get; set; }
    [JsonPropertyName("playtime_last_two_weeks")]
    public int PlaytimeLastTwoWeeks { get; set; }
    [JsonPropertyName("playtime_at_review")]
    public int PlaytimeAtReview { get; set; }
    [JsonPropertyName("last_played")]
    public int LastPlayed { get; set; }
    [JsonPropertyName("num_games_owned")]
    public int NumGamesOwned { get; set; }
    [JsonPropertyName("num_reviews")]
    public int NumReviews { get; set; }

}
