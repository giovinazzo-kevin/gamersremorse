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

    public static Fingerprint Build(AnalysisSnapshot snapshot, Metadata meta, SteamAppInfo appInfo)
    {
        var thumbnail = RenderThumbnail(snapshot);
        var shape = ExtractShape(thumbnail);
        var (posMedian, negMedian) = ComputeMedians(snapshot);

        return new Fingerprint {
            AppId = meta.AppId,
            PosMedian = posMedian,
            NegMedian = negMedian,
            SteamPositive = meta.TotalPositive,
            SteamNegative = meta.TotalNegative,
            ThumbnailPng = EncodePng(thumbnail),
            Shape = shape,
            Snapshot = BinarySnapshotWriter.Write(snapshot),
            UpdatedOn = EventDate.Now
        };
    }

    private static byte[] RenderThumbnail(AnalysisSnapshot snapshot)
    {
        // RGBA: Width * Height * 4 bytes
        var pixels = new byte[Width * Height * 4];

        // Top 80px: histogram
        RenderHistogram(pixels, snapshot.BucketsByReviewTime);

        // Bottom 20px: timeline
        RenderTimeline(pixels, snapshot);

        return pixels;
    }

    private static void RenderHistogram(byte[] pixels, HistogramBucket[] buckets)
    {
        // Normalize buckets to 120 columns
        // For each column, draw pos (R) going up, neg (G) going down from middle
        // Middle of histogram area = row 40

        var midY = HistogramHeight / 2;
        var colsPerBucket = Width / (float)buckets.Length;

        // Find max count for normalization
        var maxCount = buckets.Max(b =>
            Math.Max(b.PositiveByMonth.Values.Sum(), b.NegativeByMonth.Values.Sum()));
        if (maxCount == 0) maxCount = 1;

        for (int i = 0; i < buckets.Length; i++) {
            var bucket = buckets[i];
            var posTotal = bucket.PositiveByMonth.Values.Sum() + bucket.UncertainPositiveByMonth.Values.Sum();
            var negTotal = bucket.NegativeByMonth.Values.Sum() + bucket.UncertainNegativeByMonth.Values.Sum();
            var uncPosTotal = bucket.UncertainPositiveByMonth.Values.Sum();
            var uncNegTotal = bucket.UncertainNegativeByMonth.Values.Sum();

            var posHeight = (int)(posTotal / (float)maxCount * midY);
            var negHeight = (int)(negTotal / (float)maxCount * midY);

            var startCol = (int)(i * colsPerBucket);
            var endCol = (int)((i + 1) * colsPerBucket);

            for (int x = startCol; x < endCol && x < Width; x++) {
                // Positive bars go up from middle
                for (int dy = 0; dy < posHeight; dy++) {
                    var y = midY - dy - 1;
                    if (y >= 0) SetPixel(pixels, x, y, posTotal - uncPosTotal, 0, uncPosTotal, 255);
                }

                // Negative bars go down from middle
                for (int dy = 0; dy < negHeight; dy++) {
                    var y = midY + dy;
                    if (y < HistogramHeight) SetPixel(pixels, x, y, 0, negTotal - uncNegTotal, uncNegTotal, 255);
                }
            }
        }
    }

    private static void RenderTimeline(byte[] pixels, AnalysisSnapshot snapshot)
    {
        // Compress all months into 120 columns
        // Each column = pos/neg/neutral intensity for that time slice

        // Gather all months from buckets
        var allMonths = snapshot.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys.Concat(b.NegativeByMonth.Keys))
            .Distinct()
            .OrderBy(m => m)
            .ToList();

        if (allMonths.Count == 0) return;

        var colsPerMonth = Width / (float)allMonths.Count;

        // Sum pos/neg per month across all buckets
        var monthlyPos = new Dictionary<string, int>();
        var monthlyNeg = new Dictionary<string, int>();

        foreach (var bucket in snapshot.BucketsByReviewTime) {
            foreach (var (month, count) in bucket.PositiveByMonth)
                monthlyPos[month] = monthlyPos.GetValueOrDefault(month) + count;
            foreach (var (month, count) in bucket.NegativeByMonth)
                monthlyNeg[month] = monthlyNeg.GetValueOrDefault(month) + count;
        }

        var maxMonthly = Math.Max(
            monthlyPos.Values.DefaultIfEmpty(0).Max(),
            monthlyNeg.Values.DefaultIfEmpty(0).Max());
        if (maxMonthly == 0) maxMonthly = 1;

        for (int i = 0; i < allMonths.Count; i++) {
            var month = allMonths[i];
            var pos = monthlyPos.GetValueOrDefault(month);
            var neg = monthlyNeg.GetValueOrDefault(month);

            var posIntensity = (byte)(pos / (float)maxMonthly * 255);
            var negIntensity = (byte)(neg / (float)maxMonthly * 255);

            var startCol = (int)(i * colsPerMonth);
            var endCol = (int)((i + 1) * colsPerMonth);

            for (int x = startCol; x < endCol && x < Width; x++) {
                for (int y = HistogramHeight; y < Height; y++) {
                    SetPixel(pixels, x, y, posIntensity, negIntensity, 0, 255);
                }
            }
        }
    }

    private static void SetPixel(byte[] pixels, int x, int y, int r, int g, int b, int a)
    {
        var idx = (y * Width + x) * 4;
        pixels[idx] = (byte)r;
        pixels[idx + 1] = (byte)g;
        pixels[idx + 2] = (byte)b;
        pixels[idx + 3] = (byte)a;
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
        // TODO: compute from buckets
        // For now placeholder
        return (TimeSpan.Zero, TimeSpan.Zero);
    }

    private static byte[] EncodePng(byte[] rgba)
    {
        // Use System.Drawing or ImageSharp or SkiaSharp
        // For now just return raw rgba
        return rgba;
    }
}