using Microsoft.EntityFrameworkCore;
namespace gamersremorse.Entities;

[PrimaryKey(nameof(AppId))]
public record SteamAppInfo
{
    public AppId AppId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsFree { get; set; }
    public string HeaderImage { get; set; } = string.Empty;
    public GameFlags Flags { get; set; }
}
