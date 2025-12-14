using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Runtime.CompilerServices;

namespace gamersremorse.Services;

public record SteamReviewRepository(IOptions<SteamReviewRepository.Configuration> Options, SteamScraper Scraper, IDbContextFactory<AppDbContext> DbContextFactory)
{
    public enum Status
    {
        Uncached,
        Stale,
        Fresh,
    }

    public class Configuration
    {
        public int FreshnessDays { get; set; } = 21;
        public bool AllowLazyRefresh { get; set; } = true;
        public bool AllowLazyRefreshIfStale { get; set; } = true;
        public int LazyRefreshMinItems { get; set; } = 5000;
        public int LazyRefreshMaxItems { get; set; } = 20000;
        public double LazyRefreshTargetPercent { get; set; } = 0.10; // 10%
        public int LazyRefreshBatchSize = 100;
    }

    // top steam languages by review volume
    private static readonly string[] Languages = [
        "english", "schinese", "russian", "spanish", "portuguese",
        "german", "french", "japanese", "korean", "turkish"
    ];

    public async Task<Status> GetStatus(AppId appId, CancellationToken cancellationToken = default)
    {
        var now = EventDate.UtcNow;
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var meta = await db.Metadatas.SingleOrDefaultAsync(x => x.AppId == appId, cancellationToken);
        return meta switch {
            null => Status.Uncached,
            { UpdatedOn: var when } when (now - when).TotalDays > Options.Value.FreshnessDays => Status.Stale,
            _ => Status.Fresh
        };
    }

    public async Task<SteamAppInfo> GetInfo(AppId appId, CancellationToken cancellationToken = default)
    {
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var info = await db.SteamAppInfos.SingleOrDefaultAsync(x => x.AppId == appId, cancellationToken)
            ?? await Scraper.FetchAppInfo(appId, cancellationToken)
            ?? new SteamAppInfo() { AppId = appId, Name = "Unknown Game", IsFree = false };
        db.Upsert(info);
        await db.SaveChangesAsync(cancellationToken);
        return info;
    }

    public async IAsyncEnumerable<SteamReview> CacheAll(AppId appId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var seen = new HashSet<(AppId, SteamId)>();
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var meta = await db.Metadatas.SingleOrDefaultAsync(x => x.AppId == appId, cancellationToken) 
            ?? new Metadata() { AppId = appId };

        // get total review count and calculate target
        var (totalPositive, totalNegative) = await Scraper.FetchTotalReviewCount(appId, cancellationToken);
        var totalReviews = totalPositive + totalNegative;
        var targetCount = (int)(totalReviews * Options.Value.LazyRefreshTargetPercent);
        targetCount = Math.Clamp(targetCount, Options.Value.LazyRefreshMinItems, Options.Value.LazyRefreshMaxItems);

        var batch = new List<SteamReview>();
        var count = 0;

        // scale number of language cursors based on game size
        var numLanguages = totalReviews switch
        {
            > 500000 => 10,
            > 100000 => 5,
            > 10000 => 3,
            _ => 1
        };

        var enumerators = Languages
            .Take(numLanguages)
            .Select(lang => Scraper.FetchReviews(appId, "all", "all", null, lang, cancellationToken).GetAsyncEnumerator(cancellationToken))
            .ToArray();
        var alive = Enumerable.Range(0, enumerators.Length).ToHashSet();
        var currentIdx = -1;

        try
        {
            while (alive.Count > 0 && count < targetCount)
            {
                // round robin across language cursors
                var found = false;
                for (var attempts = 0; attempts < enumerators.Length; attempts++)
                {
                    currentIdx = (currentIdx + 1) % enumerators.Length;
                    if (alive.Contains(currentIdx))
                    {
                        found = true;
                        break;
                    }
                }
                if (!found) break;

                // pull up to 100 reviews from current cursor before rotating
                for (var pull = 0; pull < 100 && count < targetCount; pull++)
                {
                    if (!await enumerators[currentIdx].MoveNextAsync())
                    {
                        alive.Remove(currentIdx);
                        break;
                    }

                    var review = enumerators[currentIdx].Current;

                    if (!seen.Add((review.AppId, review.AuthorId)))
                        continue;

                    batch.Add(review);
                    yield return review;
                    count++;

                    if (batch.Count >= Options.Value.LazyRefreshBatchSize)
                    {
                        db.ChangeTracker.Clear();
                        db.UpsertRange(batch);
                        db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
                        await db.SaveChangesAsync(cancellationToken);
                        batch.Clear();
                    }
                }
            }
        }
        finally
        {
            foreach (var e in enumerators)
                await e.DisposeAsync();
        }

        if (batch.Count > 0)
        {
            db.ChangeTracker.Clear();
            db.UpsertRange(batch);
            db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<(IAsyncEnumerable<SteamReview> Reviews, bool IsStreaming)> GetAll(AppId appId, CancellationToken cancellationToken = default)
    {
        var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var status = await GetStatus(appId, cancellationToken);
        if (status != Status.Fresh && !Options.Value.AllowLazyRefresh)
        {
            db.Dispose();
            return (AsyncEnumerable.Empty<SteamReview>(), false);
        }
        var acceptable = status == Status.Fresh || status == Status.Stale && !Options.Value.AllowLazyRefreshIfStale;
        if (acceptable)
            return (StreamFromDb(db, appId, cancellationToken), false);
        db.Dispose();
        return (CacheAll(appId, cancellationToken), true);
    }

    private async IAsyncEnumerable<SteamReview> StreamFromDb(AppDbContext db, AppId appId, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var review in db.SteamReviews.Where(x => x.AppId == appId).AsAsyncEnumerable().WithCancellation(cancellationToken))
                yield return review;
        }
        finally
        {
            db.Dispose();
        }
    }
}
