using gamersremorse.Entities;
using gamersremorse.Models;
using Microsoft.Extensions.Options;
using System.Runtime.CompilerServices;

namespace gamersremorse.Services;

public record SteamReviewAnalyzer(IOptions<SteamReviewAnalyzer.Configuration> Options)
{
    public class Configuration
    {
        public int SnapshotEvery { get; set; } = 100;
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
        var bucketsByReview = BuildHistogram(reviews, r => r.TimePlayedAtReview.TotalMinutes);
        var bucketsByTotal = BuildHistogram(reviews, r => r.TimePlayedInTotal.TotalMinutes);

        var anomalies = DetectAnomalies(bucketsByReview);
        var cleanReviews = reviews.Where(r => !IsInAnomalousBucket(r, bucketsByReview, anomalies)).ToList();
        var velocityBuckets = BuildVelocityBuckets(cleanReviews);

        var positiveReviews = reviews.Where(r => r.Verdict > 0).ToList();
        var negativeReviews = reviews.Where(r => r.Verdict < 0).ToList();

        return new AnalysisSnapshot(
            bucketsByReview,
            bucketsByTotal,
            velocityBuckets,
            anomalies,
            positiveReviews.Count,
            negativeReviews.Count
        );
    }

    private HistogramBucket[] BuildHistogram(List<SteamReview> reviews, Func<SteamReview, double> getMinutes)
    {
        var allPlaytimes = reviews.Select(getMinutes).Where(m => m > 0).ToList();
        if (allPlaytimes.Count == 0)
            return [];

        var maxMinutes = allPlaytimes.Max();
        var minLog = 0.0;
        var maxLog = Math.Ceiling(Math.Log10(Math.Max(maxMinutes, 60)));

        var boundaries = Enumerable.Range(0, Options.Value.MaxBuckets + 1)
            .Select(i => Math.Pow(10, minLog + i * maxLog / Options.Value.MaxBuckets))
            .ToArray();

        return Enumerable.Range(0, boundaries.Length - 1).Select(i => {
            var minPt = boundaries[i];
            var maxPt = boundaries[i + 1];

            var inBucket = reviews.Where(r => getMinutes(r) >= minPt && getMinutes(r) < maxPt);

            var positiveByMonth = inBucket
                .Where(r => !IsUncertain(r) && r.Verdict > 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var negativeByMonth = inBucket
                .Where(r => !IsUncertain(r) && r.Verdict < 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var uncertainPositiveByMonth = inBucket
                .Where(r => IsUncertain(r) && r.Verdict > 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var uncertainNegativeByMonth = inBucket
                .Where(r => IsUncertain(r) && r.Verdict < 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            return new HistogramBucket(minPt, maxPt, positiveByMonth, negativeByMonth, uncertainPositiveByMonth, uncertainNegativeByMonth);
        }).ToArray();
    }

    private static int[] DetectAnomalies(HistogramBucket[] buckets, int windowSize = 3, double threshold = 3)
    {
        var anomalies = new List<int>();

        for (int i = 0; i < buckets.Length; i++) {
            var total = buckets[i].TotalCount;
            if (total == 0) continue;

            var neighbors = Enumerable.Range(
                Math.Max(0, i - windowSize),
                Math.Min(buckets.Length, i + windowSize + 1) - Math.Max(0, i - windowSize)
            )
            .Where(j => j != i)
            .Select(j => (double)buckets[j].TotalCount)
            .ToList();

            if (neighbors.Count == 0) continue;
            var median = neighbors.OrderBy(x => x).ElementAt(neighbors.Count / 2);
            var mad = neighbors.Select(x => Math.Abs(x - median)).OrderBy(x => x).ElementAt(neighbors.Count / 2);
            if (mad < 1) mad = 1;

            var z = (total - median) / (mad * 1.4826);
            if (z > threshold)
                anomalies.Add(i);
        }

        return anomalies.ToArray();
    }

    private static bool IsUncertain(SteamReview r) => (r.EditedOn - r.PostedOn) > TimeSpan.FromDays(7);

    private static VelocityBucket[] BuildVelocityBuckets(List<SteamReview> reviews)
    {
        var bands = new[] { 0.0, 0.25, 0.5, 1, 2, double.MaxValue };
        var result = new VelocityBucket[bands.Length - 1];

        for (int i = 0; i < bands.Length - 1; i++) {
            var min = bands[i];
            var max = bands[i + 1];

            var inBand = reviews.Where(r => GetVelocity(r) >= min && GetVelocity(r) < max);

            var positiveByMonth = inBand
                .Where(r => !IsUncertain(r) && r.Verdict > 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var negativeByMonth = inBand
                .Where(r => !IsUncertain(r) && r.Verdict < 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var uncertainPositiveByMonth = inBand
                .Where(r => IsUncertain(r) && r.Verdict > 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            var uncertainNegativeByMonth = inBand
                .Where(r => IsUncertain(r) && r.Verdict < 0)
                .GroupBy(r => r.PostedOn.ToString("yyyy-MM"))
                .ToDictionary(g => g.Key, g => g.Count());

            result[i] = new VelocityBucket(min, max, positiveByMonth, negativeByMonth, uncertainPositiveByMonth, uncertainNegativeByMonth);
        }
        return result;
    }

    private bool IsInAnomalousBucket(SteamReview review, HistogramBucket[] buckets, int[] anomalies)
    {
        var minutes = review.TimePlayedAtReview.TotalMinutes;
        for (int i = 0; i < buckets.Length; i++) {
            if (minutes >= buckets[i].MinPlaytime && minutes < buckets[i].MaxPlaytime)
                return anomalies.Contains(i);
        }
        return false;
    }

    private static double GetVelocity(SteamReview r)
    {
        var atReview = r.TimePlayedAtReview.TotalMinutes;
        if (atReview == 0) return 0;
        return (r.TimePlayedInTotal.TotalMinutes - atReview) / atReview;
    }
}