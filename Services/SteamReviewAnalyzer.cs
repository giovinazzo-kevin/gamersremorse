using gamersremorse.Entities;
using gamersremorse.Models;
using Microsoft.Extensions.Options;
using System.Linq;
using System.Runtime.CompilerServices;

namespace gamersremorse.Services;

public record SteamReviewAnalyzer(IOptions<SteamReviewAnalyzer.Configuration> Options)
{
    public class Configuration
    {
        public int SnapshotEvery { get; set; } = 20;
        public int MaxBuckets = 50;
    }

    public async IAsyncEnumerable<AnalysisSnapshot> VerdictByPlaytime(
     IAsyncEnumerable<SteamReview> source,
     [EnumeratorCancellation] CancellationToken stoppingToken)
    {
        var all = new List<SteamReview>();
        var count = 0;

        await foreach (var review in source) {
            if (stoppingToken.IsCancellationRequested) break;
            all.Add(review);

            if (++count % Options.Value.SnapshotEvery == 0)
                yield return BuildSnapshot(all);
        }

        if (all.Count > 0)
            yield return BuildSnapshot(all);
    }

    private AnalysisSnapshot BuildSnapshot(List<SteamReview> reviews)
    {
        var positive = reviews.Where(r => r.Verdict > 0).Select(r => r.TimePlayedAtReview.TotalMinutes).ToList();
        var negative = reviews.Where(r => r.Verdict < 0).Select(r => r.TimePlayedAtReview.TotalMinutes).ToList();

        var allPlaytimes = reviews.Select(r => r.TimePlayedAtReview.TotalMinutes).Where(m => m > 0).ToList();
        if (allPlaytimes.Count == 0)
            return new AnalysisSnapshot([], 0, 0, 0, 0);

        var maxMinutes = allPlaytimes.Max();
        var minLog = 0.0;
        var maxLog = Math.Ceiling(Math.Log10(Math.Max(maxMinutes, 60)));

        var boundaries = Enumerable.Range(0, Options.Value.MaxBuckets + 1)
            .Select(i => Math.Pow(10, minLog + i * maxLog / Options.Value.MaxBuckets))
            .ToArray();

        var buckets = Enumerable.Range(0, boundaries.Length - 1).Select(i =>
        {
            var minPt = boundaries[i];
            var maxPt = boundaries[i + 1];
            return new HistogramBucket(
                minPt,
                maxPt,
                positive.Count(p => p >= minPt && p < maxPt),
                negative.Count(p => p >= minPt && p < maxPt)
            );
        }).ToArray();

        return new AnalysisSnapshot(
            buckets,
            positive.Count > 0 ? positive.OrderBy(x => x).ElementAt(positive.Count / 2) : 0,
            negative.Count > 0 ? negative.OrderBy(x => x).ElementAt(negative.Count / 2) : 0,
            positive.Count,
            negative.Count
        );
    }
}
