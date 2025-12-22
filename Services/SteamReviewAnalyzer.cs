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

    public async IAsyncEnumerable<AnalysisSnapshot> Analyze(
        IAsyncEnumerable<SteamReview> source,
        bool streamSnapshots,
        Metadata meta,
        [EnumeratorCancellation] CancellationToken stoppingToken)
    {
        var all = new List<SteamReview>();
        var count = 0;

        await foreach (var review in source) {
            if (stoppingToken.IsCancellationRequested) break;
            all.Add(review);

            if (streamSnapshots && ++count % Options.Value.SnapshotEvery == 0)
                yield return BuildSnapshot(all, meta);
        }

        if (all.Count > 0)
            yield return BuildSnapshot(all, meta);
    }

    private AnalysisSnapshot BuildSnapshot(List<SteamReview> reviews, Metadata meta)
    {
        var bucketsByReview = BuildHistogram(reviews, r => r.TimePlayedAtReview.TotalMinutes);
        var bucketsByTotal = BuildHistogram(reviews, r => r.TimePlayedInTotal.TotalMinutes);
        var velocityBuckets = BuildVelocityBuckets(reviews);

        var positiveReviews = reviews.Where(r => r.Verdict > 0).ToList();
        var negativeReviews = reviews.Where(r => r.Verdict < 0).ToList();

        // Compute sample rates
        var sampledPositive = positiveReviews.Count;
        var sampledNegative = negativeReviews.Count;
        var positiveSampleRate = meta.TotalPositive > 0 ? (double)sampledPositive / meta.TotalPositive : 1.0;
        var negativeSampleRate = meta.TotalNegative > 0 ? (double)sampledNegative / meta.TotalNegative : 1.0;

        // aggregate language stats by month
        var profanityByMonth = new Dictionary<string, int>();
        var insultsByMonth = new Dictionary<string, int>();
        var slursByMonth = new Dictionary<string, int>();
        var banterByMonth = new Dictionary<string, int>();
        var complaintsByMonth = new Dictionary<string, int>();
        
        foreach (var r in reviews) {
            var month = r.PostedOn.ToString("yyyy-MM");
            profanityByMonth[month] = profanityByMonth.GetValueOrDefault(month) + r.ProfanityCount;
            insultsByMonth[month] = insultsByMonth.GetValueOrDefault(month) + r.InsultCount;
            slursByMonth[month] = slursByMonth.GetValueOrDefault(month) + r.SlurCount;
            banterByMonth[month] = banterByMonth.GetValueOrDefault(month) + r.BanterCount;
            complaintsByMonth[month] = complaintsByMonth.GetValueOrDefault(month) + r.ComplaintCount;
        }
        
        var languageStats = new LanguageStats(
            profanityByMonth,
            insultsByMonth,
            slursByMonth,
            banterByMonth,
            complaintsByMonth
        );

        // Build edit heatmap - only include reviews that were actually edited
        var editedReviews = reviews.Where(IsUncertain).ToList();
        var editCells = new Dictionary<string, EditCell>();
        var allEditMonths = new HashSet<string>();
        
        foreach (var r in editedReviews) {
            var postedMonth = r.PostedOn.ToString("yyyy-MM");
            var editedMonth = r.EditedOn.ToString("yyyy-MM");
            allEditMonths.Add(postedMonth);
            allEditMonths.Add(editedMonth);
            
            var key = $"{postedMonth}|{editedMonth}";
            var existing = editCells.GetValueOrDefault(key);
            editCells[key] = new EditCell(
                existing.Positive + (r.Verdict > 0 ? 1 : 0),
                existing.Negative + (r.Verdict < 0 ? 1 : 0)
            );
        }
        
        var editHeatmap = new EditHeatmap(
            allEditMonths.OrderBy(m => m).ToArray(),
            editCells
        );

        return new AnalysisSnapshot(
            bucketsByReview,
            bucketsByTotal,
            velocityBuckets,
            positiveReviews.Count,
            negativeReviews.Count,
            meta.TotalPositive,
            meta.TotalNegative,
            meta.TargetSampleCount,
            languageStats,
            editHeatmap,
            positiveSampleRate,
            negativeSampleRate,
            meta.PositiveExhausted,
            meta.NegativeExhausted,
            meta.IsStreaming
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

            var inBucket = reviews.Where(r => getMinutes(r) >= minPt && getMinutes(r) < maxPt).ToList();

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

    private static readonly TimeSpan EditThreshold = TimeSpan.FromDays(7);
    private static bool IsUncertain(SteamReview r) => (r.EditedOn - r.PostedOn) > EditThreshold;

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

    private static double GetVelocity(SteamReview r)
    {
        var atReview = r.TimePlayedAtReview.TotalMinutes;
        if (atReview == 0) return 0;
        return (r.TimePlayedInTotal.TotalMinutes - atReview) / atReview;
    }
}
