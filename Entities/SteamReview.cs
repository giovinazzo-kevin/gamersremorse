using Microsoft.EntityFrameworkCore;

namespace gamersremorse.Entities;

[PrimaryKey(nameof(AuthorId), nameof(AppId))]
public class SteamReview
{
    public SteamId AuthorId { get; set; }
    public AppId AppId { get; set; }

    public Score Verdict { get; set; } // -1 or 1 since it's Steam
    public Amount GamesOwned { get; set; }
    public int ReviewLength { get; set; }


    public PlayTime TimePlayedAtReview { get; set; }
    public PlayTime TimePlayedInTotal { get; set; }

    public EventDate LastPlayed { get; set; }
    public EventDate PostedOn { get; set; }
    public EventDate EditedOn { get; set; }
}
