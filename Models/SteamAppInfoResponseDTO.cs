using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamAppInfoResponseDTO
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }
    [JsonPropertyName("data")]
    public SteamAppInfoDTO Data { get; set; } = null!;
}
