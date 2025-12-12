using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamAppInfoDTO
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
}
