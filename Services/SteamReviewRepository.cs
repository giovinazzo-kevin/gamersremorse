// Services/SteamReviewRepository.cs
using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace gamersremorse.Services;

public record SteamReviewRepository(
    IOptions<SteamReviewRepository.Configuration> Options,
    SteamScraper Scraper,
    IDbContextFactory<AppDbContext> DbContextFactory,
    CursorPool CursorPool)
{
    public enum Status { Uncached, Stale, Fresh }

    public class Configuration
    {
        public int FreshnessDays { get; set; } = 21;
        public bool AllowLazyRefresh { get; set; } = true;
        public bool AllowLazyRefreshIfStale { get; set; } = true;
        public int LazyRefreshMinItems { get; set; } = 10000;
        public int LazyRefreshMaxItems { get; set; } = 100000;
        public double LazyRefreshTargetPercent { get; set; } = 0.5;
        public int LazyRefreshBatchSize { get; set; } = 100;
    }

    private static readonly string[] Languages = [
        "english", "schinese", "russian", "spanish", "portuguese",
        "german", "french", "japanese", "korean", "turkish"
    ];

    private static readonly TimeSpan FreshReviewThreshold = TimeSpan.FromDays(30);
    private static readonly TimeSpan EditThreshold = TimeSpan.FromHours(1);

    public async Task<Status> GetStatus(AppId appId, CancellationToken ct = default)
    {
        var now = EventDate.UtcNow;
        using var db = await DbContextFactory.CreateDbContextAsync(ct);
        var meta = await db.Metadatas.SingleOrDefaultAsync(x => x.AppId == appId, ct);

        if (meta is null) return Status.Uncached;
        if ((now - meta.UpdatedOn).TotalDays > Options.Value.FreshnessDays) return Status.Stale;

        var cachedCount = await db.SteamReviews.CountAsync(x => x.AppId == appId, ct);
        var totalReviews = meta.TotalPositive + meta.TotalNegative;
        var targetCount = (int)(totalReviews * Options.Value.LazyRefreshTargetPercent);
        targetCount = Math.Clamp(targetCount, Options.Value.LazyRefreshMinItems, Options.Value.LazyRefreshMaxItems);

        if (cachedCount < targetCount * 0.9) return Status.Stale;
        return Status.Fresh;
    }

    public async Task<SteamAppInfo> GetInfo(AppId appId, CancellationToken ct = default)
    {
        using var db = await DbContextFactory.CreateDbContextAsync(ct);
        var info = await db.SteamAppInfos.SingleOrDefaultAsync(x => x.AppId == appId, ct)
            ?? await Scraper.FetchAppInfo(appId, ct)
            ?? new SteamAppInfo { AppId = appId, Name = "Unknown Game", IsFree = false };
        db.Upsert(info);
        await db.SaveChangesAsync(ct);
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
                TotalPositive = totalPos,
                TotalNegative = totalNeg,
                TargetSampleCount = targetCount
            };
            db.Metadatas.Add(meta);
        } else {
            meta.TotalPositive = totalPos;
            meta.TotalNegative = totalNeg;
            meta.TargetSampleCount = targetCount;
        }

        await db.SaveChangesAsync(ct);
        return meta;
    }

    public async IAsyncEnumerable<SteamReview> CacheAll(
        AppId appId,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var seen = new HashSet<(AppId, SteamId)>();
        using var db = await DbContextFactory.CreateDbContextAsync(ct);
        var meta = await GetMetadata(appId, ct);

        var totalReviews = meta.TotalPositive + meta.TotalNegative;
        var targetCount = meta.TargetSampleCount;

        var numLanguages = totalReviews switch {
            > 500000 => 10,
            > 100000 => 5,
            > 10000 => 3,
            _ => 1
        };

        var filters = totalReviews switch {
            > 100000 => new[] { "all", "updated", "recent" },
            _ => new[] { "all", "recent" }
        };

        // Build all cursors
        var cursors = new List<IAsyncEnumerable<SteamReview>>();
        foreach (var lang in Languages.Take(numLanguages)) {
            foreach (var filter in filters) {
                cursors.Add(Scraper.FetchReviews(appId, filter, "all", null, lang, ct));
                cursors.Add(Scraper.FetchReviews(appId, filter, "positive", null, lang, ct));
                cursors.Add(Scraper.FetchReviews(appId, filter, "negative", null, lang, ct));
            }
        }

        // Merged output channel
        var merged = Channel.CreateBounded<SteamReview>(new BoundedChannelOptions(1000) {
            FullMode = BoundedChannelFullMode.Wait
        });

        // Fire off parallel cursors (don't await - runs in background)
        using var poolCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var poolTask = CursorPool.RunCursors(cursors, merged.Writer, poolCts.Token);

        var batch = new List<SteamReview>();
        var count = 0;
        var now = EventDate.UtcNow;

        await foreach (var review in merged.Reader.ReadAllAsync(ct)) {
            // Heuristic: skip fresh unedited reviews (likely from "updated" cursor, not real re-evaluations)
            var isFresh = (now - review.PostedOn) < FreshReviewThreshold;
            var isUnedited = (review.EditedOn - review.PostedOn) < EditThreshold;
            if (isFresh && isUnedited)
                continue;

            if (!seen.Add((review.AppId, review.AuthorId)))
                continue;

            batch.Add(review);
            yield return review;
            count++;

            if (count >= targetCount) {
                poolCts.Cancel(); // signal remaining cursors to stop
                break;
            }

            if (batch.Count >= Options.Value.LazyRefreshBatchSize) {
                db.ChangeTracker.Clear();
                db.UpsertRange(batch);
                db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
                await db.SaveChangesAsync(ct);
                batch.Clear();
            }
        }

        // Wait for pool to wind down
        try { await poolTask; }
        catch (OperationCanceledException) { }

        if (batch.Count > 0) {
            db.ChangeTracker.Clear();
            db.UpsertRange(batch);
            db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<(IAsyncEnumerable<SteamReview> Reviews, bool IsStreaming)> GetAll(
        AppId appId,
        CancellationToken ct = default)
    {
        var db = await DbContextFactory.CreateDbContextAsync(ct);
        var status = await GetStatus(appId, ct);

        if (status != Status.Fresh && !Options.Value.AllowLazyRefresh) {
            db.Dispose();
            return (AsyncEnumerable.Empty<SteamReview>(), false);
        }

        var acceptable = status == Status.Fresh || (status == Status.Stale && !Options.Value.AllowLazyRefreshIfStale);
        if (acceptable)
            return (StreamFromDb(db, appId, ct), false);

        db.Dispose();
        return (CacheAll(appId, ct), true);
    }

    private async IAsyncEnumerable<SteamReview> StreamFromDb(
        AppDbContext db,
        AppId appId,
        [EnumeratorCancellation] CancellationToken ct)
    {
        try {
            await foreach (var review in db.SteamReviews
                .Where(x => x.AppId == appId)
                .AsAsyncEnumerable()
                .WithCancellation(ct)) {
                yield return review;
            }
        }
        finally {
            db.Dispose();
        }
    }
}