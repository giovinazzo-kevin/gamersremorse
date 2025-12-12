using gamersremorse.Entities;
using gamersremorse.Models;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using System.Runtime.CompilerServices;

namespace gamersremorse.Services;

public record SteamScraper(IOptions<SteamScraper.Configuration> Options, IHttpClientFactory HttpClientFactory) : IDisposable
{
    public readonly HttpClient HttpClient = HttpClientFactory.CreateClient(nameof(SteamScraper)); 

    public class Configuration
    {
        public string Filter { get; set; } = "recent";
        public string PurchaseType { get; set; } = "all";
        public string ReviewType { get; set; } = "all";
        public string Language { get; set; } = "all";
        public bool FilterOffTopicActivity { get; set; } = false;
        public long MaxDayRange { get; set; } = 9223372036854775807;
        public int RateLimitMs { get; set; } = 500;
    }
    
    public async Task<SteamAppInfo?> FetchAppInfo(AppId appId, CancellationToken cancellationToken = default)
    {
        const string URL = "https://store.steampowered.com/api/appdetails";
        var query = QueryHelpers.AddQueryString(URL, "appids", appId.ToString());
        var res = await HttpClient.GetFromJsonAsync<SteamAppIdsDTO>(query, cancellationToken);
        return res!.MapToDomain();
    }

    public async IAsyncEnumerable<SteamReview> FetchReviews(AppId appId, [EnumeratorCancellation] CancellationToken stoppingToken = default)
    {
        const string URL = "https://store.steampowered.com/appreviews/";

        var query = $"{URL}/{appId}";
        query = QueryHelpers.AddQueryString(query, "day_range", Options.Value.MaxDayRange.ToString());
        query = QueryHelpers.AddQueryString(query, "filter", Options.Value.Filter);
        query = QueryHelpers.AddQueryString(query, "filter_offtopic_activity", Options.Value.FilterOffTopicActivity ? "1" : "0");
        query = QueryHelpers.AddQueryString(query, "purchase_type", Options.Value.PurchaseType);
        query = QueryHelpers.AddQueryString(query, "review_type", Options.Value.ReviewType);
        query = QueryHelpers.AddQueryString(query, "json", "1");

        var (cursor, nextCursor) = ("", "*");
        while (true) {
            cursor = nextCursor;
            var then = EventDate.UtcNow;
            var paginated = QueryHelpers.AddQueryString(query, "cursor", cursor);
            var res = await HttpClient.GetFromJsonAsync<SteamReviewsResponseDTO>(paginated, stoppingToken);
            if (res is not { Success: 1 })
                yield break;
            nextCursor = res.Cursor;
            if (cursor == nextCursor)
                yield break;
            foreach (var review in res.Reviews)
                yield return review.MapToDomain(appId);
            var cooldown = (int)(Options.Value.RateLimitMs - (EventDate.UtcNow - then).TotalMilliseconds);
            if (cooldown > 0)
                await Task.Delay(cooldown, stoppingToken);
        }
    }

    public void Dispose()
    {
        GC.SuppressFinalize(this);
        HttpClient.Dispose();
    }
}
