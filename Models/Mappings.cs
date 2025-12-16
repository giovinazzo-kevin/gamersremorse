using gamersremorse.Entities;
using gamersremorse.Services;

namespace gamersremorse.Models;

public static class Mappings
{
    public static SteamAppInfo? MapToDomain(this SteamAppIdsDTO dto) => dto
        .Where(kv => kv.Value.Success)
        .Select(kv => new SteamAppInfo {
            AppId = kv.Key,
            Name = kv.Value.Data.Name,
            IsFree = kv.Value.Data.IsFree,
            Flags = kv.Value.Data.Flags
        })
        .SingleOrDefault();
    public static SteamReview MapToDomain(this SteamReviewDTO dto, AppId appId)
    {
        var (profanity, insults, slurs, banter, complaints) = TextAnalyzer.AnalyzeCapped(dto.Review ?? "");
        return new SteamReview {
            AppId = appId,
            AuthorId = dto.Author.SteamId,
            PostedOn = DateTimeOffset.FromUnixTimeSeconds(dto.CreatedAt),
            EditedOn = DateTimeOffset.FromUnixTimeSeconds(dto.UpdatedAt),
            LastPlayed = DateTimeOffset.FromUnixTimeSeconds(dto.Author.LastPlayed),
            TimePlayedAtReview = TimeSpan.FromMinutes(dto.Author.PlaytimeAtReview),
            TimePlayedInTotal = TimeSpan.FromMinutes(dto.Author.PlaytimeForever),
            GamesOwned = dto.Author.NumGamesOwned,
            Verdict = dto.VotedUp ? 1 : -1,
            ReviewLength = dto.Review?.Length ?? 0,
            ProfanityCount = profanity,
            InsultCount = insults,
            SlurCount = slurs,
            BanterCount = banter,
            ComplaintCount = complaints
        };
    }
}
