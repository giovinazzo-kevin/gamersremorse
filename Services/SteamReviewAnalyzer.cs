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

    private int[] DetectAnomalies(HistogramBucket[] buckets, int windowSize = 3, double threshold = 2.0)
    {
        var anomalies = new List<int>();

        for (int i = 0; i < buckets.Length; i++) {
            var total = buckets[i].PositiveCount + buckets[i].NegativeCount;
            if (total == 0) continue;

            var neighbors = Enumerable.Range(
                Math.Max(0, i - windowSize),
                Math.Min(buckets.Length, i + windowSize + 1) - Math.Max(0, i - windowSize)
            )
            .Where(j => j != i)
            .Select(j => (double)(buckets[j].PositiveCount + buckets[j].NegativeCount))
            .ToList();

            if (neighbors.Count == 0) continue;
            var median = neighbors.OrderBy(x => x).ElementAt(neighbors.Count / 2);
            var mad = neighbors.Select(x => Math.Abs(x - median)).OrderBy(x => x).ElementAt(neighbors.Count / 2);
            if (mad < 1) mad = 1;

            var z = (total - median) / (mad * 1.4826); // 1.4826 scales MAD to stddev-equivalent
            if (z > threshold)
                anomalies.Add(i);
            Console.WriteLine($"Bucket {i}: total={total}, median={median:F1}, mad={mad:F1}, z={z:F2}");
        }

        return anomalies.ToArray();
    }

    private AnalysisSnapshot BuildSnapshot(List<SteamReview> reviews)
    {
        var positive = reviews.Where(r => r.Verdict > 0).Select(r => r.TimePlayedAtReview.TotalMinutes).ToList();
        var negative = reviews.Where(r => r.Verdict < 0).Select(r => r.TimePlayedAtReview.TotalMinutes).ToList();

        var allPlaytimes = reviews.Select(r => r.TimePlayedAtReview.TotalMinutes).Where(m => m > 0).ToList();
        if (allPlaytimes.Count == 0)
            return new AnalysisSnapshot([], [], 0, 0, 0, 0);

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

        var anomalies = DetectAnomalies(buckets);

        return new AnalysisSnapshot(
            buckets,
            anomalies,
            positive.Count > 0 ? positive.OrderBy(x => x).ElementAt(positive.Count / 2) : 0,
            negative.Count > 0 ? negative.OrderBy(x => x).ElementAt(negative.Count / 2) : 0,
            positive.Count,
            negative.Count
        );
    }
}
