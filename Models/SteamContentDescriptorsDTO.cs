using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamContentDescriptorsDTO
{
    [JsonPropertyName("ids")]
    public int[] Ids { get; set; } = [];
    [JsonPropertyName("notes")]
    public string Notes { get; set; } = string.Empty;
}
