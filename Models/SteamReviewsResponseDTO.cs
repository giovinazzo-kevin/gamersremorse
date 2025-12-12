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
}
