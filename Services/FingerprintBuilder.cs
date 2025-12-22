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
    private const int CurvePoints = 24;

    public static Fingerprint Build(AnalysisSnapshot snapshot, Metadata meta)
    {
        var (posMedian, negMedian) = ComputeMedians(snapshot);
        var thumbnail = RenderThumbnail(snapshot, posMedian, negMedian);
        var shape = ExtractShape(thumbnail);
        var curve = BuildCurve(snapshot);

        return new Fingerprint {
            AppId = meta.AppId,
            PosMedian = posMedian,
            NegMedian = negMedian,
            SteamPositive = meta.TotalPositive,
            SteamNegative = meta.TotalNegative,
            ThumbnailPng = EncodePng(thumbnail),
            Shape = shape,
            Curve = curve,
            UpdatedOn = EventDate.UtcNow
        };
    }

    public static float[] BuildCurve(AnalysisSnapshot snapshot)
    {
        // Gather monthly totals for all 4 bands
        var allMonths = snapshot.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys
                .Concat(b.NegativeByMonth.Keys)
                .Concat(b.UncertainPositiveByMonth.Keys)
                .Concat(b.UncertainNegativeByMonth.Keys))
            .Distinct()
            .OrderBy(m => m)
            .ToList();

        if (allMonths.Count == 0)
            return new float[CurvePoints * 4];

        // Aggregate per month
        var monthlyData = new Dictionary<string, (int certPos, int certNeg, int uncPos, int uncNeg)>();

        foreach (var month in allMonths)
            monthlyData[month] = (0, 0, 0, 0);

        foreach (var bucket in snapshot.BucketsByReviewTime) {
            foreach (var (month, count) in bucket.PositiveByMonth) {
                var d = monthlyData[month];
                monthlyData[month] = (d.certPos + count, d.certNeg, d.uncPos, d.uncNeg);
            }
            foreach (var (month, count) in bucket.NegativeByMonth) {
                var d = monthlyData[month];
                monthlyData[month] = (d.certPos, d.certNeg + count, d.uncPos, d.uncNeg);
            }
            foreach (var (month, count) in bucket.UncertainPositiveByMonth) {
                var d = monthlyData[month];
                monthlyData[month] = (d.certPos, d.certNeg, d.uncPos + count, d.uncNeg);
            }
            foreach (var (month, count) in bucket.UncertainNegativeByMonth) {
                var d = monthlyData[month];
                monthlyData[month] = (d.certPos, d.certNeg, d.uncPos, d.uncNeg + count);
            }
        }

        // Convert to arrays indexed by normalized position [0, 1]
        var n = allMonths.Count;
        var certPos = new float[n];
        var certNeg = new float[n];
        var uncPos = new float[n];
        var uncNeg = new float[n];

        for (int i = 0; i < n; i++) {
            var d = monthlyData[allMonths[i]];
            certPos[i] = d.certPos;
            certNeg[i] = d.certNeg;
            uncPos[i] = d.uncPos;
            uncNeg[i] = d.uncNeg;
        }

        // Resample each band to CurvePoints using linear interpolation
        var curve = new float[CurvePoints * 4];

        Resample(certPos, curve, 0);
        Resample(certNeg, curve, CurvePoints);
        Resample(uncPos, curve, CurvePoints * 2);
        Resample(uncNeg, curve, CurvePoints * 3);

        // Normalize so total sums to 1 (makes similarity independent of game size)
        var sum = curve.Sum();
        if (sum > 0) {
            for (int i = 0; i < curve.Length; i++)
                curve[i] /= sum;
        }

        return curve;
    }

    private static void Resample(float[] source, float[] dest, int destOffset)
    {
        if (source.Length == 0) return;
        if (source.Length == 1) {
            for (int i = 0; i < CurvePoints; i++)
                dest[destOffset + i] = source[0] / CurvePoints;
            return;
        }

        for (int i = 0; i < CurvePoints; i++) {
            // Map destination index to source position
            var t = i / (float)(CurvePoints - 1); // 0 to 1
            var srcPos = t * (source.Length - 1);  // 0 to source.Length-1

            var srcIdx = (int)srcPos;
            var frac = srcPos - srcIdx;

            if (srcIdx >= source.Length - 1) {
                dest[destOffset + i] = source[source.Length - 1];
            } else {
                // Linear interpolation
                dest[destOffset + i] = source[srcIdx] * (1 - frac) + source[srcIdx + 1] * frac;
            }
        }
    }
    private static byte[] RenderThumbnail(AnalysisSnapshot snapshot, PlayTime posMedian, PlayTime negMedian)
    {
        var pixels = new byte[Width * Height * 4];

        RenderHistogram(pixels, snapshot.BucketsByReviewTime);
        RenderTimeline(pixels, snapshot);
        RenderMedianLines(pixels, snapshot.BucketsByReviewTime, posMedian, negMedian);

        return pixels;
    }
    private static void RenderHistogram(byte[] pixels, HistogramBucket[] buckets)
    {
        var midY = HistogramHeight / 2;
        var colsPerBucket = Width / (float)buckets.Length;

        // Find max for normalization (certain + uncertain combined, since they stack)
        var maxCount = buckets.Max(b =>
            Math.Max(
                b.PositiveByMonth.Values.Sum() + b.UncertainPositiveByMonth.Values.Sum(),
                b.NegativeByMonth.Values.Sum() + b.UncertainNegativeByMonth.Values.Sum()));
        if (maxCount == 0) maxCount = 1;

        for (int i = 0; i < buckets.Length; i++) {
            var bucket = buckets[i];

            var posTotal = bucket.PositiveByMonth.Values.Sum();
            var negTotal = bucket.NegativeByMonth.Values.Sum();
            var uncPosTotal = bucket.UncertainPositiveByMonth.Values.Sum();
            var uncNegTotal = bucket.UncertainNegativeByMonth.Values.Sum();

            var posHeight = (int)(posTotal / (float)maxCount * midY);
            var negHeight = (int)(negTotal / (float)maxCount * midY);
            var uncPosHeight = (int)(uncPosTotal / (float)maxCount * midY);
            var uncNegHeight = (int)(uncNegTotal / (float)maxCount * midY);

            var posIntensity = posTotal > 0 ? Math.Max(64, (int)(posTotal / (float)maxCount * 255)) : 0;
            var negIntensity = negTotal > 0 ? Math.Max(64, (int)(negTotal / (float)maxCount * 255)) : 0;
            var uncIntensity = 128; // fixed gray intensity

            var startCol = (int)(i * colsPerBucket);
            var endCol = (int)((i + 1) * colsPerBucket);

            for (int x = startCol; x < endCol && x < Width; x++) {
                // Certain positive: grows UP from midline (R only)
                for (int dy = 0; dy < posHeight; dy++) {
                    var y = midY - dy - 1;
                    if (y >= 0) SetPixel(pixels, x, y, posIntensity, 0, 0, 255);
                }

                // Uncertain positive: stacks above certain positive (R + G = gray)
                for (int dy = 0; dy < uncPosHeight; dy++) {
                    var y = midY - posHeight - dy - 1;
                    if (y >= 0) SetPixel(pixels, x, y, uncIntensity, uncIntensity, 0, 255);
                }

                // Certain negative: grows DOWN from midline (G only)
                for (int dy = 0; dy < negHeight; dy++) {
                    var y = midY + dy;
                    if (y < HistogramHeight) SetPixel(pixels, x, y, 0, negIntensity, 0, 255);
                }

                // Uncertain negative: stacks below certain negative (R + G = gray)
                for (int dy = 0; dy < uncNegHeight; dy++) {
                    var y = midY + negHeight + dy;
                    if (y < HistogramHeight) SetPixel(pixels, x, y, uncIntensity, uncIntensity, 0, 255);
                }
            }
        }
    }
    private static void RenderTimeline(byte[] pixels, AnalysisSnapshot snapshot)
    {
        var allMonths = snapshot.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys
                .Concat(b.NegativeByMonth.Keys)
                .Concat(b.UncertainPositiveByMonth.Keys)
                .Concat(b.UncertainNegativeByMonth.Keys))
            .Distinct()
            .OrderBy(m => m)
            .ToList();

        if (allMonths.Count == 0) return;

        var colsPerMonth = Width / (float)allMonths.Count;

        var monthlyPos = new Dictionary<string, int>();
        var monthlyNeg = new Dictionary<string, int>();
        var monthlyUncPos = new Dictionary<string, int>();
        var monthlyUncNeg = new Dictionary<string, int>();

        foreach (var bucket in snapshot.BucketsByReviewTime) {
            foreach (var (month, count) in bucket.PositiveByMonth)
                monthlyPos[month] = monthlyPos.GetValueOrDefault(month) + count;
            foreach (var (month, count) in bucket.NegativeByMonth)
                monthlyNeg[month] = monthlyNeg.GetValueOrDefault(month) + count;
            foreach (var (month, count) in bucket.UncertainPositiveByMonth)
                monthlyUncPos[month] = monthlyUncPos.GetValueOrDefault(month) + count;
            foreach (var (month, count) in bucket.UncertainNegativeByMonth)
                monthlyUncNeg[month] = monthlyUncNeg.GetValueOrDefault(month) + count;
        }

        // Max includes stacked totals
        var maxVal = allMonths
            .SelectMany(m => new[] {
            monthlyPos.GetValueOrDefault(m) + monthlyUncPos.GetValueOrDefault(m),
            monthlyNeg.GetValueOrDefault(m) + monthlyUncNeg.GetValueOrDefault(m) })
            .DefaultIfEmpty(1)
            .Max();
        if (maxVal == 0) maxVal = 1;

        var midY = HistogramHeight + TimelineHeight / 2;
        var halfHeight = TimelineHeight / 2;
        var uncIntensity = 128;

        for (int i = 0; i < allMonths.Count; i++) {
            var month = allMonths[i];
            var pos = monthlyPos.GetValueOrDefault(month);
            var neg = monthlyNeg.GetValueOrDefault(month);
            var uncPos = monthlyUncPos.GetValueOrDefault(month);
            var uncNeg = monthlyUncNeg.GetValueOrDefault(month);

            var posHeight = pos > 0 ? (int)(Math.Sqrt(pos / (double)maxVal) * halfHeight) : 0;
            var negHeight = neg > 0 ? (int)(Math.Sqrt(neg / (double)maxVal) * halfHeight) : 0;
            var uncPosHeight = uncPos > 0 ? (int)(Math.Sqrt(uncPos / (double)maxVal) * halfHeight) : 0;
            var uncNegHeight = uncNeg > 0 ? (int)(Math.Sqrt(uncNeg / (double)maxVal) * halfHeight) : 0;

            var startCol = (int)(i * colsPerMonth);
            var endCol = (int)((i + 1) * colsPerMonth);

            for (int x = startCol; x < endCol && x < Width; x++) {
                // Certain positive
                for (int dy = 0; dy < posHeight; dy++) {
                    var y = midY - dy - 1;
                    if (y >= HistogramHeight) SetPixel(pixels, x, y, 255, 0, 0, 255);
                }

                // Uncertain positive stacks above
                for (int dy = 0; dy < uncPosHeight; dy++) {
                    var y = midY - posHeight - dy - 1;
                    if (y >= HistogramHeight) SetPixel(pixels, x, y, uncIntensity, uncIntensity, 0, 255);
                }

                // Certain negative
                for (int dy = 0; dy < negHeight; dy++) {
                    var y = midY + dy;
                    if (y < Height) SetPixel(pixels, x, y, 0, 255, 0, 255);
                }

                // Uncertain negative stacks below
                for (int dy = 0; dy < uncNegHeight; dy++) {
                    var y = midY + negHeight + dy;
                    if (y < Height) SetPixel(pixels, x, y, uncIntensity, uncIntensity, 0, 255);
                }
            }
        }
    }
    private static void RenderMedianLines(byte[] pixels, HistogramBucket[] buckets, PlayTime posMedian, PlayTime negMedian)
    {
        var posCol = FindColumnForPlaytime(buckets, posMedian.TotalMinutes);
        var negCol = FindColumnForPlaytime(buckets, negMedian.TotalMinutes);

        var midY = HistogramHeight / 2;

        // Positive median: 2px wide, draws in negative (lower) half for contrast
        // Align to even pixel for clean 50% downscaling → 1px at half size
        var posX = (posCol / 2) * 2;
        for (int dx = 0; dx < 2; dx++) {
            var x = posX + dx;
            if (x >= 0 && x < Width) {
                for (int y = midY; y < HistogramHeight; y++) {
                    SetPixel(pixels, x, y, 255, 0, 0, 255);
                }
            }
        }

        // Negative median: 2px wide, draws in positive (upper) half for contrast
        var negX = (negCol / 2) * 2;
        for (int dx = 0; dx < 2; dx++) {
            var x = negX + dx;
            if (x >= 0 && x < Width) {
                for (int y = 0; y < midY; y++) {
                    SetPixel(pixels, x, y, 0, 255, 0, 255);
                }
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

            // Keep edits separate for median calculation too
            var posCount = bucket.PositiveByMonth.Values.Sum();
            var negCount = bucket.NegativeByMonth.Values.Sum();

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
        return rgba;
    }
}