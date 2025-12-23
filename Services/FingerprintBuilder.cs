using gamersremorse.Entities;
using gamersremorse.Models;
using System.Collections;

namespace gamersremorse.Services;

public static class FingerprintBuilder
{
    private const int Width = 120, Height = 100;
    private const int HistW = 80, HistH = 60, VelW = 40, VelH = 60, VelX = 80;
    private const int TimeW = 80, TimeH = 40, TimeY = 60;
    private const int EditW = 40, EditH = 40, EditX = 80, EditY = 60;
    private const int CurvePoints = 24;

    public static Fingerprint Build(AnalysisSnapshot snap, Metadata meta)
    {
        var (posMedian, negMedian) = ComputeMedians(snap);
        var pixels = new byte[Width * Height * 4];
        
        RenderHistogram(pixels, snap.BucketsByReviewTime, snap.BucketsByTotalTime);
        RenderTimeline(pixels, snap);
        RenderEditMap(pixels, snap.EditHeatmap);
        RenderDiagonalBars(pixels, meta, posMedian, negMedian, snap.VelocityBuckets, snap.LanguageStats);

        var (pos, neg) = ExtractBitmasks(pixels);
        
        return new Fingerprint {
            AppId = meta.AppId,
            PosMedian = posMedian,
            NegMedian = negMedian,
            SteamPositive = meta.TotalPositive,
            SteamNegative = meta.TotalNegative,
            ThumbnailPng = pixels,
            PosMask = pos,
            NegMask = neg,
            Curve = BuildCurve(snap),
            UpdatedOn = EventDate.UtcNow
        };
    }

    // log2 height: 1→1px, 2→2px, 4→3px, 8→4px, etc
    private static int LogHeight(int count) => count > 0 ? (int)Math.Log2(count) + 1 : 0;

    private static void RenderHistogram(byte[] px, HistogramBucket[] review, HistogramBucket[] total)
    {
        var midY = HistH / 2;

        for (int i = 0; i < review.Length && i < HistW; i++) {
            var (r, t) = (review[i], total[i]);
            var x = i; // 1px per bucket

            var posH = LogHeight(r.PositiveCount);
            var negH = LogHeight(r.NegativeCount);
            
            // 1. Uncertain first (yellow, stacked beyond review)
            DrawBar(px, x, midY - posH, -1, LogHeight(r.UncertainPositiveCount), 128, 128, 0);
            DrawBar(px, x, midY + negH, 1, LogHeight(r.UncertainNegativeCount), 128, 128, 0);
            
            // 2. Shadow (opposite colors) - overwrites uncertain where it overlaps
            DrawBar(px, x, midY, -1, LogHeight(t.PositiveCount), 0, 255, 0);
            DrawBar(px, x, midY, 1, LogHeight(t.NegativeCount), 255, 0, 0);
            
            // 3. Review on top (normal colors) - overwrites shadow
            DrawBar(px, x, midY, -1, posH, 255, 0, 0);
            DrawBar(px, x, midY, 1, negH, 0, 255, 0);
        }
    }

    private static void DrawBar(byte[] px, int x, int baseY, int dir, int len, int r, int g, int b)
    {
        for (int i = 0; i < len; i++) {
            var y = baseY + (dir < 0 ? -i - 1 : i);
            if (y >= 0 && y < Height) SetPixel(px, x, y, r, g, b, 255);
        }
    }

    private static void RenderTimeline(byte[] px, AnalysisSnapshot snap)
    {
        var agg = snap.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys.Concat(b.NegativeByMonth.Keys)
                .Concat(b.UncertainPositiveByMonth.Keys).Concat(b.UncertainNegativeByMonth.Keys))
            .Distinct().OrderBy(m => m)
            .ToDictionary(m => m, m => (
                pos: snap.BucketsByReviewTime.Sum(b => b.PositiveByMonth.GetValueOrDefault(m)),
                neg: snap.BucketsByReviewTime.Sum(b => b.NegativeByMonth.GetValueOrDefault(m)),
                uncPos: snap.BucketsByReviewTime.Sum(b => b.UncertainPositiveByMonth.GetValueOrDefault(m)),
                uncNeg: snap.BucketsByReviewTime.Sum(b => b.UncertainNegativeByMonth.GetValueOrDefault(m))));

        if (agg.Count == 0) return;
        
        var months = agg.Keys.ToList();
        var firstMonth = months[0];
        var totalMonths = MonthsBetween(firstMonth, months[^1]) + 1;
        
        var needsElision = totalMonths > TimeW;
        var seamWidth = needsElision ? 1 : 0;
        var edgeMonths = needsElision ? (TimeW - seamWidth) / 2 : TimeW;

        var midY = TimeY + TimeH / 2;
        var halfH = TimeH / 2;

        foreach (var (month, data) in agg) {
            var monthIdx = MonthsBetween(firstMonth, month);
            int x;
            if (!needsElision) x = monthIdx;
            else if (monthIdx < edgeMonths) x = monthIdx;
            else if (monthIdx >= totalMonths - edgeMonths) x = edgeMonths + seamWidth + (monthIdx - (totalMonths - edgeMonths));
            else continue;
            
            if (x < 0 || x >= TimeW) continue;

            var posH = LogHeight(data.pos);
            var negH = LogHeight(data.neg);
            DrawBar(px, x, midY, -1, posH, 255, 0, 0);
            DrawBar(px, x, midY, 1, negH, 0, 255, 0);
            DrawBar(px, x, midY - posH, -1, LogHeight(data.uncPos), 128, 128, 0);
            DrawBar(px, x, midY + negH, 1, LogHeight(data.uncNeg), 128, 128, 0);
        }

        if (needsElision)
            for (int sx = 0; sx < seamWidth && edgeMonths + sx < TimeW; sx++)
                for (int dy = 0; dy < halfH; dy++) {
                    // Both colors = yellow seam
                    SetPixel(px, edgeMonths + sx, midY - dy - 1, 255, 255, 0, 255);
                    SetPixel(px, edgeMonths + sx, midY + dy, 255, 255, 0, 255);
                }
    }

    private static void RenderEditMap(byte[] px, EditHeatmap hm)
    {
        if (hm.Cells == null) return;
        
        // Fixed 20-year scale: 2005-2024, 2px per year = 40x40
        const int StartYear = 2005;
        const int Years = 20;
        const int PxPerYear = 2;
        
        // Aggregate to years
        var cells = hm.Cells
            .GroupBy(kv => $"{kv.Key.Split('|')[0][..4]}|{kv.Key.Split('|')[1][..4]}")
            .ToDictionary(g => g.Key, g => new EditCell(g.Sum(x => x.Value.Positive), g.Sum(x => x.Value.Negative)));
        
        var max = cells.Values.Select(c => Math.Max(c.Positive, c.Negative)).DefaultIfEmpty(1).Max();
        if (max == 0) max = 1;

        for (int py = 0; py < Years; py++)
            for (int ey = 0; ey < Years; ey++) {

                var posted = StartYear + py;
                var edited = StartYear + ey;
                var key = $"{posted}|{edited}";
                
                if (!cells.TryGetValue(key, out var c) || c.Positive + c.Negative == 0) continue;
                
                var (r, g) = c.Positive > c.Negative ? (Math.Clamp(255 * c.Positive / max, 50, 255), 0)
                    : c.Negative > c.Positive ? (0, Math.Clamp(255 * c.Negative / max, 50, 255))
                    : (Math.Clamp(255 * c.Positive / max, 50, 255), Math.Clamp(255 * c.Positive / max, 50, 255));

                // X = posted year (left=new, right=old), Y = edited year (top=old, bottom=new)
                for (int dx = 0; dx < PxPerYear; dx++)
                    for (int dy = 0; dy < PxPerYear; dy++) {
                        var x = EditX + (Years - 1 - py) * PxPerYear + dx;
                        var y = EditY + ey * PxPerYear + dy;
                        if (x < EditX + EditW && y < EditY + EditH)
                            SetPixel(px, x, y, r, g, 0, 255);
                    }
            }
    }

    private static void RenderDiagonalBars(byte[] px, Metadata meta, TimeSpan posMedian, TimeSpan negMedian, VelocityBucket[]? velocity, LanguageStats? lang)
    {
        var total = meta.TotalPositive + meta.TotalNegative;
        if (total == 0) return;
        
        int offset = 0;
        
        // Bar 0: Steam rating
        RenderDiagBar(px, offset, 4, (float)meta.TotalPositive / total, false);
        offset += 4;
        
        // Bar 1: Median ratio
        var medTotal = posMedian.TotalMinutes + negMedian.TotalMinutes;
        if (medTotal > 0) {
            RenderDiagBar(px, offset, 4, (float)(posMedian.TotalMinutes / medTotal), true);
        }
        offset += 4;
        
        // Bars 2-11: Velocity buckets (2px each - certain then uncertain)
        if (velocity != null) {
            foreach (var b in velocity) {
                // First pixel: certain pos/neg ratio
                var certainTotal = b.PositiveCount + b.NegativeCount;
                if (certainTotal > 0) {
                    RenderDiagBar(px, offset, 1, (float)b.PositiveCount / certainTotal, false);
                }
                offset++;
                
                // Second pixel: uncertain pos/neg ratio
                var uncTotal = b.UncertainPositiveCount + b.UncertainNegativeCount;
                if (uncTotal > 0) {
                    RenderDiagBar(px, offset, 1, (float)b.UncertainPositiveCount / uncTotal, false);
                }
                offset++;
            }
        }
        
        // Language bars: complaints, banter, profanity, insults, slurs (4px, 3px, 2px, 2px, 1px)
        if (lang != null) {
            var complaints = lang.Value.ComplaintsByMonth.Values.Sum();
            var banter = lang.Value.BanterByMonth.Values.Sum();
            var profanity = lang.Value.ProfanityByMonth.Values.Sum();
            var insults = lang.Value.InsultsByMonth.Values.Sum();
            var slurs = lang.Value.SlursByMonth.Values.Sum();
            var langTotal = complaints + banter + profanity + insults + slurs;
            
            if (langTotal > 0) {
                // Complaints vs rest
                RenderDiagBar(px, offset, 4, (float)complaints / langTotal, false);
                offset += 4;
                
                // Banter vs rest  
                RenderDiagBar(px, offset, 3, (float)banter / langTotal, false);
                offset += 3;
                
                // Profanity vs rest
                RenderDiagBar(px, offset, 2, (float)profanity / langTotal, false);
                offset += 2;
                
                // Insults vs rest
                RenderDiagBar(px, offset, 2, (float)insults / langTotal, false);
                offset += 2;
                
                // Slurs vs rest
                RenderDiagBar(px, offset, 1, (float)slurs / langTotal, false);
                offset += 1;
            }
        }
    }

    private static void RenderDiagBar(byte[] px, int offset, int thick, float val, bool flip)
    {
        for (int i = 0; i < thick; i++) {
            var band = EditW - 2 - offset - i;
            if (band < 0) continue;
            var split = (int)(val * (band + 1));
            for (int j = 0; j <= band; j++) {
                var pos = flip ? band - j : j;
                if (j < EditW && band - j < EditH) 
                    SetPixel(px, EditX + j, EditY + band - j, pos < split ? 255 : 0, pos < split ? 0 : 255, 0, 255);
            }
        }
    }

    private static (BitArray, BitArray) ExtractBitmasks(byte[] rgba)
    {
        var pos = new BitArray(Width * Height);
        var neg = new BitArray(Width * Height);

        for (int i = 0; i < Width * Height; i++) {
            var r = rgba[i * 4];
            var g = rgba[i * 4 + 1];
            if (r > 0) pos[i] = true;
            if (g > 0) neg[i] = true;
        }
        return (pos, neg);
    }

    private static (TimeSpan, TimeSpan) ComputeMedians(AnalysisSnapshot snap)
    {
        var pos = snap.BucketsByReviewTime.SelectMany(b => 
            Enumerable.Repeat((b.MinPlaytime + b.MaxPlaytime) / 2, b.PositiveCount)).OrderBy(x => x).ToList();
        var neg = snap.BucketsByReviewTime.SelectMany(b => 
            Enumerable.Repeat((b.MinPlaytime + b.MaxPlaytime) / 2, b.NegativeCount)).OrderBy(x => x).ToList();
        return (TimeSpan.FromMinutes(pos.Count > 0 ? pos[pos.Count / 2] : 0),
                TimeSpan.FromMinutes(neg.Count > 0 ? neg[neg.Count / 2] : 0));
    }

    public static float[] BuildCurve(AnalysisSnapshot snap)
    {
        var months = snap.BucketsByReviewTime
            .SelectMany(b => b.PositiveByMonth.Keys.Concat(b.NegativeByMonth.Keys)
                .Concat(b.UncertainPositiveByMonth.Keys).Concat(b.UncertainNegativeByMonth.Keys))
            .Distinct().OrderBy(m => m).ToList();

        if (months.Count == 0) return new float[CurvePoints * 4];

        var data = months.Select(m => (
            cp: snap.BucketsByReviewTime.Sum(b => b.PositiveByMonth.GetValueOrDefault(m)),
            cn: snap.BucketsByReviewTime.Sum(b => b.NegativeByMonth.GetValueOrDefault(m)),
            up: snap.BucketsByReviewTime.Sum(b => b.UncertainPositiveByMonth.GetValueOrDefault(m)),
            un: snap.BucketsByReviewTime.Sum(b => b.UncertainNegativeByMonth.GetValueOrDefault(m)))).ToArray();

        float[] Resample(Func<(int cp, int cn, int up, int un), int> sel) => 
            Enumerable.Range(0, CurvePoints).Select(i => {
                var t = i / (float)(CurvePoints - 1);
                var srcPos = t * (data.Length - 1);
                var idx = (int)srcPos;
                var frac = srcPos - idx;
                return idx >= data.Length - 1 ? sel(data[^1]) : sel(data[idx]) * (1 - frac) + sel(data[idx + 1]) * frac;
            }).Select(x => (float)x).ToArray();

        var curve = Resample(d => d.cp).Concat(Resample(d => d.cn)).Concat(Resample(d => d.up)).Concat(Resample(d => d.un)).ToArray();
        var sum = curve.Sum();
        return sum > 0 ? curve.Select(x => x / sum).ToArray() : curve;
    }

    private static int MonthsBetween(string a, string b)
    {
        var (ay, am) = (int.Parse(a[..4]), int.Parse(a[5..7]));
        var (by, bm) = (int.Parse(b[..4]), int.Parse(b[5..7]));
        return (by - ay) * 12 + (bm - am);
    }

    private static void SetPixel(byte[] px, int x, int y, int r, int g, int b, int a)
    {
        var idx = (y * Width + x) * 4;
        px[idx] = (byte)r; px[idx + 1] = (byte)g; px[idx + 2] = (byte)b; px[idx + 3] = (byte)a;
    }
}
