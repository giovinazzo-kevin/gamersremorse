using gamersremorse.Models;
using System.Text;

namespace gamersremorse.Services;

/// <summary>
/// Reads AnalysisSnapshot from compact binary format.
/// Inverse of BinarySnapshotWriter.
/// </summary>
public static class BinarySnapshotReader
{
    private const byte VERSION = 1;

    public static AnalysisSnapshot Read(byte[] data)
    {
        using var ms = new MemoryStream(data);
        using var r = new BinaryReader(ms, Encoding.ASCII);

        // Header
        var version = r.ReadByte();
        if (version != VERSION)
            throw new InvalidDataException($"Unknown snapshot version: {version}");

        var monthCount = r.ReadUInt16();
        var reviewBucketCount = r.ReadByte();
        var totalBucketCount = r.ReadByte();
        var velocityBucketCount = r.ReadByte();

        // Month strings (7 bytes each: "YYYY-MM")
        var months = new string[monthCount];
        for (int i = 0; i < monthCount; i++) {
            var bytes = r.ReadBytes(7);
            months[i] = Encoding.ASCII.GetString(bytes).TrimEnd();
        }

        // Histogram buckets (by review time)
        var bucketsByReviewTime = new HistogramBucket[reviewBucketCount];
        for (int i = 0; i < reviewBucketCount; i++) {
            bucketsByReviewTime[i] = ReadBucket(r, months);
        }

        // Histogram buckets (by total time)
        var bucketsByTotalTime = new HistogramBucket[totalBucketCount];
        for (int i = 0; i < totalBucketCount; i++) {
            bucketsByTotalTime[i] = ReadBucket(r, months);
        }

        // Velocity buckets
        var velocityBuckets = new VelocityBucket[velocityBucketCount];
        for (int i = 0; i < velocityBucketCount; i++) {
            velocityBuckets[i] = ReadVelocityBucket(r, months);
        }

        // Metadata
        var totalPositive = r.ReadInt32();
        var totalNegative = r.ReadInt32();
        var gameTotalPositive = r.ReadInt32();
        var gameTotalNegative = r.ReadInt32();
        var targetSampleCount = r.ReadInt32();
        var positiveSampleRate = r.ReadDouble();
        var negativeSampleRate = r.ReadDouble();

        var flags = r.ReadByte();
        var positiveExhausted = (flags & 1) != 0;
        var negativeExhausted = (flags & 2) != 0;
        var isStreaming = (flags & 4) != 0;

        // Language stats
        var languageStats = new LanguageStats {
            ProfanityByMonth = ReadLanguageChannel(r, months),
            InsultsByMonth = ReadLanguageChannel(r, months),
            SlursByMonth = ReadLanguageChannel(r, months),
            BanterByMonth = ReadLanguageChannel(r, months),
            ComplaintsByMonth = ReadLanguageChannel(r, months)
        };

        // Edit heatmap
        var editHeatmap = ReadEditHeatmap(r);

        return new AnalysisSnapshot {
            BucketsByReviewTime = bucketsByReviewTime,
            BucketsByTotalTime = bucketsByTotalTime,
            VelocityBuckets = velocityBuckets,
            TotalPositive = totalPositive,
            TotalNegative = totalNegative,
            GameTotalPositive = gameTotalPositive,
            GameTotalNegative = gameTotalNegative,
            TargetSampleCount = targetSampleCount,
            PositiveSampleRate = positiveSampleRate,
            NegativeSampleRate = negativeSampleRate,
            PositiveExhausted = positiveExhausted,
            NegativeExhausted = negativeExhausted,
            IsStreaming = isStreaming,
            LanguageStats = languageStats,
            EditHeatmap = editHeatmap
        };
    }

    private static HistogramBucket ReadBucket(BinaryReader r, string[] months)
    {
        return new HistogramBucket(
            MinPlaytime: r.ReadInt32(),
            MaxPlaytime: r.ReadInt32(),
            PositiveByMonth: ReadChannel(r, months),
            NegativeByMonth: ReadChannel(r, months),
            UncertainPositiveByMonth: ReadChannel(r, months),
            UncertainNegativeByMonth: ReadChannel(r, months)
        );
    }

    private static VelocityBucket ReadVelocityBucket(BinaryReader r, string[] months)
    {
        return new VelocityBucket(
            MinVelocity: r.ReadDouble(),
            MaxVelocity: r.ReadDouble(),
            PositiveByMonth: ReadChannel(r, months),
            NegativeByMonth: ReadChannel(r, months),
            UncertainPositiveByMonth: ReadChannel(r, months),
            UncertainNegativeByMonth: ReadChannel(r, months)
        );
    }

    private static Dictionary<string, int> ReadChannel(BinaryReader r, string[] months)
    {
        var dict = new Dictionary<string, int>();
        foreach (var m in months) {
            var count = r.ReadUInt16();
            if (count > 0)
                dict[m] = count;
        }
        return dict;
    }

    private static Dictionary<string, int> ReadLanguageChannel(BinaryReader r, string[] months)
    {
        var dict = new Dictionary<string, int>();
        foreach (var m in months) {
            var count = r.ReadUInt16();
            if (count > 0)
                dict[m] = count;
        }
        return dict;
    }

    private static EditHeatmap ReadEditHeatmap(BinaryReader r)
    {
        var monthCount = r.ReadUInt16();
        var months = new string[monthCount];
        for (int i = 0; i < monthCount; i++) {
            var bytes = r.ReadBytes(7);
            months[i] = Encoding.ASCII.GetString(bytes).TrimEnd();
        }

        var cellCount = r.ReadInt32();
        var cells = new Dictionary<string, EditCell>();
        for (int i = 0; i < cellCount; i++) {
            var postedIdx = r.ReadUInt16();
            var editedIdx = r.ReadUInt16();
            var positive = r.ReadUInt16();
            var negative = r.ReadUInt16();

            var key = $"{months[postedIdx]}|{months[editedIdx]}";
            cells[key] = new EditCell { Positive = positive, Negative = negative };
        }

        return new EditHeatmap {
            Months = months,
            Cells = cells
        };
    }
}