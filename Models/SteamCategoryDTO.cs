using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamCategoryDTO
{
    [JsonPropertyName("id")]
    public int Id { get; set; }
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
}