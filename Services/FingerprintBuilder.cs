using gamersremorse.Entities;
using gamersremorse.Models;
using Pgvector;
namespace gamersremorse.Services;

public static class FingerprintBuilder
{
    private const int Width = 120;
    private const int Height = 100;
    private const int HistogramHeight = 80;
    private const int TimelineHeight = 20;

    public static Fingerprint Build(AnalysisSnapshot snapshot, Metadata meta)
    {
        var (posMedian, negMedian) = ComputeMedians(snapshot);
        var thumbnail = RenderThumbnail(snapshot, posMedian, negMedian);
        var shape = ExtractShape(thumbnail);

        return new Fingerprint {
            AppId = meta.AppId,
            PosMedian = posMedian,
            NegMedian = negMedian,
            SteamPositive = meta.TotalPositive,
            SteamNegative = meta.TotalNegative,
            ThumbnailPng = EncodePng(thumbnail),
            Shape = shape,
            Snapshot = BinarySnapshotWriter.Write(snapshot),
            UpdatedOn = EventDate.UtcNow
        };
    }

    private static byte[] RenderThumbnail(AnalysisSnapshot snapshot, PlayTime posMedian, PlayTime negMedian)
    {
        // RGBA: Width * Height * 4 bytes
        var pixels = new byte[Width * Height * 4];

        // Top 80px: histogram
        RenderHistogram(pixels, snapshot.BucketsByReviewTime);

        // Bottom 20px: timeline
        RenderTimeline(pixels, snapshot);

        // Median lines on top
        RenderMedianLines(pixels, snapshot.BucketsByReviewTime, posMedian, negMedian);

        return pixels;
    }

    private static void RenderHistogram(byte[] pixels, HistogramBucket[] buckets)
    {
        var midY = HistogramHeight / 2;
        var colsPerBucket = Width / (float)buckets.Length;

        // Find max count for normalization
        var maxCount = buckets.Max(b =>
            Math.Max(
                b.PositiveByMonth.Values.Sum() + b.UncertainPositiveByMonth.Values.Sum(),
                b.NegativeByMonth.Values.Sum() + b.UncertainNegativeByMonth.Values.Sum()));
        if (maxCount == 0) maxCount = 1;

        for (int i = 0; i < buckets.Length; i++) {
            var bucket = buckets[i];
            var posTotal = bucket.PositiveByMonth.Values.Sum() + bucket.UncertainPositiveByMonth.Values.Sum();
            var negTotal = bucket.NegativeByMonth.Values.Sum() + bucket.UncertainNegativeByMonth.Values.Sum();
            var uncPosTotal = bucket.UncertainPositiveByMonth.Values.Sum();
            var uncNegTotal = bucket.UncertainNegativeByMonth.Values.Sum();

            var posHeight = (int)(posTotal / (float)maxCount * midY);
            var negHeight = (int)(negTotal / (float)maxCount * midY);

            // Normalize intensities to 0-255
            var posIntensity = (int)(posTotal / (float)maxCount * 255);
            var negIntensity = (int)(negTotal / (float)maxCount * 255);
            var uncPosIntensity = (int)(uncPosTotal / (float)maxCount * 255);
            var uncNegIntensity = (int)(uncNegTotal / (float)maxCount * 255);

            var startCol = (int)(i * colsPerBucket);
            var endCol = (int)((i + 1) * colsPerBucket);

            for (int x = startCol; x < endCol && x < Width; x++) {
                // Positive bars go up from middle - R channel
                for (int dy = 0; dy < posHeight; dy++) {
                    var y = midY - dy - 1;
                    if (y >= 0) SetPixel(pixels, x, y, posIntensity, 0, uncPosIntensity, 255);
                }

                // Negative bars go down from middle - G channel
                for (int dy = 0; dy < negHeight; dy++) {
                    var y = midY + dy;
                    if (y < HistogramHeight) SetPixel(pixels, x, y, 0, negIntensity, uncNegIntensity, 255);
                }
            }
        }
    }
    private static void RenderTimeline(byte[] pixels, AnalysisSnapshot snapshot)
    {
        var allMonths = snapshot.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys.Concat(b.NegativeByMonth.Keys))
            .Distinct()
            .OrderBy(m => m)
            .ToList();

        if (allMonths.Count == 0) return;

        var colsPerMonth = Width / (float)allMonths.Count;

        var monthlyPos = new Dictionary<string, int>();
        var monthlyNeg = new Dictionary<string, int>();

        foreach (var bucket in snapshot.BucketsByReviewTime) {
            foreach (var (month, count) in bucket.PositiveByMonth)
                monthlyPos[month] = monthlyPos.GetValueOrDefault(month) + count;
            foreach (var (month, count) in bucket.NegativeByMonth)
                monthlyNeg[month] = monthlyNeg.GetValueOrDefault(month) + count;
        }

        // Find max for sqrt scale
        var maxPos = allMonths.Select(m => monthlyPos.GetValueOrDefault(m)).DefaultIfEmpty(1).Max();
        var maxNeg = allMonths.Select(m => monthlyNeg.GetValueOrDefault(m)).DefaultIfEmpty(1).Max();
        if (maxPos == 0) maxPos = 1;
        if (maxNeg == 0) maxNeg = 1;

        var midY = HistogramHeight + TimelineHeight / 2;
        var halfHeight = TimelineHeight / 2;

        for (int i = 0; i < allMonths.Count; i++) {
            var month = allMonths[i];
            var pos = monthlyPos.GetValueOrDefault(month);
            var neg = monthlyNeg.GetValueOrDefault(month);

            // Sqrt scale for height
            var posHeight = pos > 0 ? (int)(Math.Sqrt(pos / (double)maxPos) * halfHeight) : 0;
            var negHeight = neg > 0 ? (int)(Math.Sqrt(neg / (double)maxNeg) * halfHeight) : 0;

            var startCol = (int)(i * colsPerMonth);
            var endCol = (int)((i + 1) * colsPerMonth);

            for (int x = startCol; x < endCol && x < Width; x++) {
                for (int dy = 0; dy < posHeight; dy++) {
                    var y = midY - dy - 1;
                    if (y >= HistogramHeight) SetPixel(pixels, x, y, 255, 0, 0, 255);
                }

                for (int dy = 0; dy < negHeight; dy++) {
                    var y = midY + dy;
                    if (y < Height) SetPixel(pixels, x, y, 0, 255, 0, 255);
                }
            }
        }
    }

    private static void RenderMedianLines(byte[] pixels, HistogramBucket[] buckets, PlayTime posMedian, PlayTime negMedian)
    {
        var posCol = FindColumnForPlaytime(buckets, posMedian.TotalMinutes);
        var negCol = FindColumnForPlaytime(buckets, negMedian.TotalMinutes);

        var midY = HistogramHeight / 2;

        // Positive median line draws in NEGATIVE region (bottom half) - so R stands out against G
        if (posCol >= 0 && posCol < Width) {
            for (int y = midY; y < HistogramHeight; y++) {
                SetPixel(pixels, posCol, y, 255, 0, 0, 255);
            }
        }

        // Negative median line draws in POSITIVE region (top half) - so G stands out against R
        if (negCol >= 0 && negCol < Width) {
            for (int y = 0; y < midY; y++) {
                SetPixel(pixels, negCol, y, 0, 255, 0, 255);
            }
        }
    }

    private static int FindColumnForPlaytime(HistogramBucket[] buckets, double minutes)
    {
        var colsPerBucket = Width / (float)buckets.Length;

        for (int i = 0; i < buckets.Length; i++) {
            if (minutes >= buckets[i].MinPlaytime && minutes < buckets[i].MaxPlaytime) {
                return (int)(i * colsPerBucket + colsPerBucket / 2);
            }
        }
        return -1;
    }

    private static void SetPixel(byte[] pixels, int x, int y, int r, int g, int b, int a)
    {
        var idx = (y * Width + x) * 4;
        pixels[idx] = (byte)Math.Clamp(r, 0, 255);
        pixels[idx + 1] = (byte)Math.Clamp(g, 0, 255);
        pixels[idx + 2] = (byte)Math.Clamp(b, 0, 255);
        pixels[idx + 3] = (byte)Math.Clamp(a, 0, 255);
    }

    private static Vector ExtractShape(byte[] rgba)
    {
        var values = new float[Width * Height];
        for (int i = 0; i < Width * Height; i++) {
            var r = rgba[i * 4];
            var g = rgba[i * 4 + 1];
            var b = rgba[i * 4 + 2];
            var a = rgba[i * 4 + 3];

            var mag = MathF.Sqrt(r * r + g * g + b * b);
            values[i] = mag * (a / 255f);
        }
        return new Vector(values);
    }

    private static (PlayTime pos, PlayTime neg) ComputeMedians(AnalysisSnapshot snapshot)
    {
        var posTimes = new List<double>();
        var negTimes = new List<double>();

        foreach (var bucket in snapshot.BucketsByReviewTime) {
            var midpoint = (bucket.MinPlaytime + bucket.MaxPlaytime) / 2;

            var posCount = bucket.PositiveByMonth.Values.Sum() + bucket.UncertainPositiveByMonth.Values.Sum();
            var negCount = bucket.NegativeByMonth.Values.Sum() + bucket.UncertainNegativeByMonth.Values.Sum();

            for (int i = 0; i < posCount; i++) posTimes.Add(midpoint);
            for (int i = 0; i < negCount; i++) negTimes.Add(midpoint);
        }

        var posMedian = posTimes.Count > 0
            ? TimeSpan.FromMinutes(posTimes.OrderBy(t => t).ElementAt(posTimes.Count / 2))
            : TimeSpan.Zero;

        var negMedian = negTimes.Count > 0
            ? TimeSpan.FromMinutes(negTimes.OrderBy(t => t).ElementAt(negTimes.Count / 2))
            : TimeSpan.Zero;

        return (posMedian, negMedian);
    }

    private static byte[] EncodePng(byte[] rgba)
    {
        // For now just return raw rgba
        return rgba;
    }
}
