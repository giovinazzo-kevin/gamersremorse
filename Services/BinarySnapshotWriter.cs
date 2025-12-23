using gamersremorse.Models;
using System.Text;

namespace gamersremorse.Services;

/// <summary>
/// Writes AnalysisSnapshot as compact binary format.
/// Format is optimized for fast client parsing via DataView.
/// </summary>
public static class BinarySnapshotWriter
{
    private const byte VERSION = 1;

    public static byte[] Write(AnalysisSnapshot snapshot)
    {
        // Collect all unique months across all buckets
        var monthSet = new SortedSet<string>();
        
        foreach (var b in snapshot.BucketsByReviewTime) {
            foreach (var m in b.PositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.NegativeByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainPositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainNegativeByMonth.Keys) monthSet.Add(m);
        }
        foreach (var b in snapshot.BucketsByTotalTime) {
            foreach (var m in b.PositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.NegativeByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainPositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainNegativeByMonth.Keys) monthSet.Add(m);
        }
        foreach (var b in snapshot.VelocityBuckets) {
            foreach (var m in b.PositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.NegativeByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainPositiveByMonth.Keys) monthSet.Add(m);
            foreach (var m in b.UncertainNegativeByMonth.Keys) monthSet.Add(m);
        }
        
        var months = monthSet.ToArray();
        var monthIndex = new Dictionary<string, ushort>();
        for (ushort i = 0; i < months.Length; i++) {
            monthIndex[months[i]] = i;
        }

        using var ms = new MemoryStream();
        using var w = new BinaryWriter(ms, Encoding.ASCII);

        // Header
        w.Write(VERSION);
        w.Write((ushort)months.Length);
        w.Write((byte)snapshot.BucketsByReviewTime.Length);
        w.Write((byte)snapshot.BucketsByTotalTime.Length);
        w.Write((byte)snapshot.VelocityBuckets.Length);

        // Month strings (7 bytes each: "YYYY-MM")
        foreach (var m in months) {
            var bytes = Encoding.ASCII.GetBytes(m.PadRight(7));
            w.Write(bytes, 0, 7);
        }

        // Histogram buckets (by review time)
        foreach (var b in snapshot.BucketsByReviewTime) {
            WriteBucket(w, b, months, monthIndex);
        }

        // Histogram buckets (by total time)
        foreach (var b in snapshot.BucketsByTotalTime) {
            WriteBucket(w, b, months, monthIndex);
        }

        // Velocity buckets
        foreach (var b in snapshot.VelocityBuckets) {
            WriteVelocityBucket(w, b, months, monthIndex);
        }

        // Metadata
        w.Write(snapshot.TotalPositive);
        w.Write(snapshot.TotalNegative);
        w.Write(snapshot.GameTotalPositive);
        w.Write(snapshot.GameTotalNegative);
        w.Write(snapshot.TargetSampleCount);
        w.Write(snapshot.PositiveSampleRate);
        w.Write(snapshot.NegativeSampleRate);
        
        byte flags = 0;
        if (snapshot.PositiveExhausted) flags |= 1;
        if (snapshot.NegativeExhausted) flags |= 2;
        if (snapshot.IsStreaming) flags |= 4;
        if (snapshot.IsFinal) flags |= 8;
        w.Write(flags);

        // Language stats
        WriteLanguageChannel(w, snapshot.LanguageStats.ProfanityByMonth, months, monthIndex);
        WriteLanguageChannel(w, snapshot.LanguageStats.InsultsByMonth, months, monthIndex);
        WriteLanguageChannel(w, snapshot.LanguageStats.SlursByMonth, months, monthIndex);
        WriteLanguageChannel(w, snapshot.LanguageStats.BanterByMonth, months, monthIndex);
        WriteLanguageChannel(w, snapshot.LanguageStats.ComplaintsByMonth, months, monthIndex);

        // Edit heatmap
        WriteEditHeatmap(w, snapshot.EditHeatmap);

        return ms.ToArray();
    }

    private static void WriteBucket(BinaryWriter w, HistogramBucket b, string[] months, Dictionary<string, ushort> monthIndex)
    {
        w.Write(b.MinPlaytime);
        w.Write(b.MaxPlaytime);
        WriteChannel(w, b.PositiveByMonth, months, monthIndex);
        WriteChannel(w, b.NegativeByMonth, months, monthIndex);
        WriteChannel(w, b.UncertainPositiveByMonth, months, monthIndex);
        WriteChannel(w, b.UncertainNegativeByMonth, months, monthIndex);
    }

    private static void WriteVelocityBucket(BinaryWriter w, VelocityBucket b, string[] months, Dictionary<string, ushort> monthIndex)
    {
        w.Write(b.MinVelocity);
        w.Write(b.MaxVelocity);
        WriteChannel(w, b.PositiveByMonth, months, monthIndex);
        WriteChannel(w, b.NegativeByMonth, months, monthIndex);
        WriteChannel(w, b.UncertainPositiveByMonth, months, monthIndex);
        WriteChannel(w, b.UncertainNegativeByMonth, months, monthIndex);
    }

    private static void WriteChannel(BinaryWriter w, Dictionary<string, int> data, string[] months, Dictionary<string, ushort> monthIndex)
    {
        foreach (var m in months) {
            var count = data.TryGetValue(m, out var c) ? c : 0;
            w.Write((ushort)Math.Min(count, ushort.MaxValue));
        }
    }

    private static void WriteLanguageChannel(BinaryWriter w, Dictionary<string, int> data, string[] months, Dictionary<string, ushort> monthIndex)
    {
        if (data == null) {
            foreach (var _ in months) w.Write((ushort)0);
            return;
        }
        foreach (var m in months) {
            var count = data.TryGetValue(m, out var c) ? c : 0;
            w.Write((ushort)Math.Min(count, ushort.MaxValue));
        }
    }

    private static void WriteEditHeatmap(BinaryWriter w, EditHeatmap heatmap)
    {
        var months = heatmap.Months ?? [];
        var cells = heatmap.Cells ?? new Dictionary<string, EditCell>();
        
        // Build month index for edit heatmap (separate from main months)
        var editMonthIndex = new Dictionary<string, ushort>();
        for (ushort i = 0; i < months.Length; i++) {
            editMonthIndex[months[i]] = i;
        }

        w.Write((ushort)months.Length);
        foreach (var m in months) {
            var bytes = Encoding.ASCII.GetBytes(m.PadRight(7));
            w.Write(bytes, 0, 7);
        }

        // Write cell count then cells
        w.Write(cells.Count);
        foreach (var (key, cell) in cells) {
            var parts = key.Split('|');
            if (parts.Length != 2) continue;
            if (!editMonthIndex.TryGetValue(parts[0], out var postedIdx)) continue;
            if (!editMonthIndex.TryGetValue(parts[1], out var editedIdx)) continue;
            
            w.Write(postedIdx);
            w.Write(editedIdx);
            w.Write((ushort)Math.Min(cell.Positive, ushort.MaxValue));
            w.Write((ushort)Math.Min(cell.Negative, ushort.MaxValue));
        }
    }
}
