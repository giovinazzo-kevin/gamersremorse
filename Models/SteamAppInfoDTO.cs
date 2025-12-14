using gamersremorse.Entities;
using System.Text.Json.Serialization;

namespace gamersremorse.Models;

public record SteamAppInfoDTO
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    [JsonPropertyName("is_free")]
    public bool IsFree { get; set; }
    [JsonPropertyName("content_descriptors")]
    public SteamContentDescriptorsDTO ContentDescriptors { get; set; } = null!;
    [JsonPropertyName("categories")]
    public SteamCategoryDTO[]? Categories { get; set; }

    [JsonIgnore]
    public GameFlags Flags
    {
        get
        {
            var flags = GameFlags.None;
            var cats = Categories ?? [];
            var descs = ContentDescriptors?.Ids ?? [];
            
            if (cats.Any(c => c.Id == 2)) flags |= GameFlags.SinglePlayer;
            if (cats.Any(c => c.Id == 1)) flags |= GameFlags.MultiPlayer;
            if (cats.Any(c => c.Id == 62)) flags |= GameFlags.FamilyShare;
            if (descs.Any(d => d is 1 or 3 or 4)) flags |= GameFlags.SexualContent;
            
            return flags;
        }
    }
}
