using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace gamersremorse.Entities;

[PrimaryKey(nameof(AuthorId), nameof(AppId))]
public class SteamReview
{
    public SteamId AuthorId { get; set; }
    public AppId AppId { get; set; }

    public Score Verdict { get; set; } // -1 or 1 since it's Steam
    public Amount GamesOwned { get; set; }
    public int ReviewLength { get; set; }

    // language signals
    public byte ProfanityCount { get; set; }  // fuck, shit, etc
    public byte InsultCount { get; set; }     // trash, garbage, idiot
    public byte SlurCount { get; set; }       // racial/homophobic/ableist
    public byte BanterCount { get; set; }     // git gud, skill issue, cope
    public byte ComplaintCount { get; set; }  // predatory, cashgrab, p2w
    [NotMapped]
    public string? Text { get; set; }

    public PlayTime TimePlayedAtReview { get; set; }
    public PlayTime TimePlayedInTotal { get; set; }

    public EventDate LastPlayed { get; set; }
    public EventDate PostedOn { get; set; }
    public EventDate EditedOn { get; set; }
}
