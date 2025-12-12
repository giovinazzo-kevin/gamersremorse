using Microsoft.EntityFrameworkCore;

namespace gamersremorse.Entities;

[PrimaryKey(nameof(AppId))]
public record Metadata
{
    public AppId AppId { get; set; }
    public EventDate UpdatedOn { get; set; }
}
