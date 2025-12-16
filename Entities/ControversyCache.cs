using System.ComponentModel.DataAnnotations;

namespace gamersremorse.Entities;

public class ControversyCache
{
    [Key]
    public required string Query { get; set; }
    public string? Overview { get; set; }
    public DateTime CachedAt { get; set; }
}
