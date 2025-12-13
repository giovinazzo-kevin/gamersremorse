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
        public int LazyRefreshMaxItems { get; set; } = 10000;
        public int LazyRefreshBatchSize = 100;
    }

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
        var count = 0;
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var meta = await db.Metadatas.SingleOrDefaultAsync(x => x.AppId == appId, cancellationToken) 
            ?? new Metadata() { AppId = appId };
        var batch = new List<SteamReview>();
        await foreach (var next in Scraper.FetchReviews(appId, cancellationToken)) {
            batch.Add(next);
            yield return next;
            if (++count > Options.Value.LazyRefreshMaxItems)
                break;
            if (count % Options.Value.LazyRefreshBatchSize == 0) {
                db.ChangeTracker.Clear();
                db.UpsertRange(batch);
                db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
                await db.SaveChangesAsync(cancellationToken);
                batch.Clear();
            }
        }
        if (batch.Count > 0) {
            db.ChangeTracker.Clear();
            db.UpsertRange(batch);
            db.Upsert(meta with { UpdatedOn = EventDate.UtcNow });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async IAsyncEnumerable<SteamReview> GetAll(AppId appId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var db = await DbContextFactory.CreateDbContextAsync(cancellationToken);
        var status = await GetStatus(appId, cancellationToken);
        if (status != Status.Fresh && !Options.Value.AllowLazyRefresh)
            yield break; // must schedule externally
        var acceptable = status == Status.Fresh || status == Status.Stale && !Options.Value.AllowLazyRefreshIfStale;
        var reviews = acceptable
            ? db.SteamReviews.Where(x => x.AppId == appId).AsAsyncEnumerable()
            : CacheAll(appId, cancellationToken);
        await foreach (var review in reviews)
            yield return review;
    }
}
