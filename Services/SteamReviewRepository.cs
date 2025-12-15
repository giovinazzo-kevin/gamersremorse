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
        public int LazyRefreshMaxItems { get; set; } = 50000;
        public double LazyRefreshTargetPercent { get; set; } = 0.25; // 25%
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
        
        if (meta is null)
            return Status.Uncached;
        
        // Check freshness by date
        if ((now - meta.UpdatedOn).TotalDays > Options.Value.FreshnessDays)
            return Status.Stale;
        
        // Check if we have enough cached reviews to meet target
        var cachedCount = await db.SteamReviews.CountAsync(x => x.AppId == appId, cancellationToken);
        var totalReviews = meta.TotalPositive + meta.TotalNegative;
        var targetCount = (int)(totalReviews * Options.Value.LazyRefreshTargetPercent);
        targetCount = Math.Clamp(targetCount, Options.Value.LazyRefreshMinItems, Options.Value.LazyRefreshMaxItems);
        
        // Stale if we have less than 90% of target (allow some margin)
        if (cachedCount < targetCount * 0.9)
            return Status.Stale;
        
        return Status.Fresh;
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

    public async Task<Metadata> GetMetadata(AppId appId, CancellationToken ct = default)
    {
        using var db = await DbContextFactory.CreateDbContextAsync(ct);
        var meta = await db.Metadatas.SingleOrDefaultAsync(x => x.AppId == appId, ct);

        var (totalPos, totalNeg) = await Scraper.FetchTotalReviewCount(appId, ct);
        var totalReviews = totalPos + totalNeg;
        var targetCount = (int)(totalReviews * Options.Value.LazyRefreshTargetPercent);
        targetCount = Math.Clamp(targetCount, Options.Value.LazyRefreshMinItems, Options.Value.LazyRefreshMaxItems);

        if (meta is null) {
            meta = new Metadata {
                AppId = appId,
                // DON'T set UpdatedOn here - no data cached yet
                TotalPositive = totalPos,
                TotalNegative = totalNeg,
                TargetSampleCount = targetCount
            };
            db.Metadatas.Add(meta);
        } else {
            meta.TotalPositive = totalPos;
            meta.TotalNegative = totalNeg;
            meta.TargetSampleCount = targetCount;
            // DON'T touch UpdatedOn
        }

        await db.SaveChangesAsync(ct);
        return meta;
    }

    public async IAsyncEnumerable<SteamReview> CacheAll(AppId appId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var seen = new HashSet<(AppId, SteamId)>();
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var meta = await GetMetadata(appId, cancellationToken);
        // get total review count and calculate target
        var totalReviews = meta.TotalPositive + meta.TotalNegative;
        var targetCount = (int)(totalReviews * Options.Value.LazyRefreshTargetPercent);
        targetCount = Math.Clamp(targetCount, Options.Value.LazyRefreshMinItems, Options.Value.LazyRefreshMaxItems);

        // calculate sentiment weights based on controversy
        // sigmoid curve: stays ~1 until very extreme ratios, then ramps to 2
        var positiveRatio = totalReviews > 0 ? (double)meta.TotalPositive / totalReviews : 0.5;
        var distanceFrom50 = Math.Abs(positiveRatio - 0.5); // 0 at 50/50, 0.5 at 100/0
        // sigmoid: 1 + 1/(1 + e^(-k*(x-midpoint)))
        // k controls steepness, midpoint at 0.42 means only 92%+ games get weighted
        var sigmoid = 1.0 / (1.0 + Math.Exp(-30 * (distanceFrom50 - 0.42)));
        var majorityWeight = 1.0 + sigmoid;
        var positiveWeight = positiveRatio >= 0.5 ? majorityWeight : 1.0;
        var negativeWeight = positiveRatio < 0.5 ? majorityWeight : 1.0;

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

        // filter modes give us different cursor paths through the same data
        // "all" = sorted by helpfulness (surfaces popular reviews)
        // "updated" = sorted by edit time (surfaces re-evaluations, important for live service games)
        var filters = totalReviews switch
        {
            > 100000 => new[] { "all", "updated" },
            _ => new[] { "all" }
        };

        // for each language × filter: all, positive, negative cursors
        // weights determine how many reviews to pull from each cursor type
        var enumeratorList = new List<(IAsyncEnumerator<SteamReview> Enumerator, double Weight, string Filter)>();
        foreach (var lang in Languages.Take(numLanguages))
        {
            foreach (var filter in filters)
            {
                enumeratorList.Add((Scraper.FetchReviews(appId, filter, "all", null, lang, cancellationToken).GetAsyncEnumerator(cancellationToken), 1.0, filter));
                enumeratorList.Add((Scraper.FetchReviews(appId, filter, "positive", null, lang, cancellationToken).GetAsyncEnumerator(cancellationToken), positiveWeight, filter));
                enumeratorList.Add((Scraper.FetchReviews(appId, filter, "negative", null, lang, cancellationToken).GetAsyncEnumerator(cancellationToken), negativeWeight, filter));
            }
        }
        
        var enumerators = enumeratorList.Select(x => x.Enumerator).ToArray();
        var weights = enumeratorList.Select(x => x.Weight).ToArray();
        var cursorFilters = enumeratorList.Select(x => x.Filter).ToArray();
        var pullCounts = new double[enumerators.Length]; // track fractional pulls
        var alive = Enumerable.Range(0, enumerators.Length).ToHashSet();
        var currentIdx = -1;
        var oneMonthAgo = EventDate.UtcNow.AddDays(-30);

        try
        {
            while (alive.Count > 0 && count < targetCount)
            {
                // pick cursor that's most behind its weighted target
                var minProgress = double.MaxValue;
                var nextIdx = -1;
                foreach (var i in alive)
                {
                    var progress = pullCounts[i] / weights[i];
                    if (progress < minProgress)
                    {
                        minProgress = progress;
                        nextIdx = i;
                    }
                }
                if (nextIdx < 0) break;
                currentIdx = nextIdx;

                // pull up to 100 reviews from current cursor before re-evaluating
                for (var pull = 0; pull < 100 && count < targetCount; pull++)
                {
                    if (!await enumerators[currentIdx].MoveNextAsync())
                    {
                        alive.Remove(currentIdx);
                        break;
                    }

                    pullCounts[currentIdx]++;
                    var review = enumerators[currentIdx].Current;

                    // skip reviews younger than 1 month from "updated" cursor
                    // (they're just new reviews, not re-evaluations)
                    if (cursorFilters[currentIdx] == "updated" && review.PostedOn > oneMonthAgo)
                        continue;

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
