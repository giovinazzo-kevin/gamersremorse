namespace gamersremorse.Models;

public record HistogramBucket(
    double MinPlaytime,
    double MaxPlaytime,
    Dictionary<string, int> PositiveByMonth,
    Dictionary<string, int> NegativeByMonth,
    Dictionary<string, int> UncertainPositiveByMonth,
    Dictionary<string, int> UncertainNegativeByMonth
)
{
    public int PositiveCount => PositiveByMonth.Values.Sum();
    public int NegativeCount => NegativeByMonth.Values.Sum();
    public int UncertainPositiveCount => UncertainPositiveByMonth.Values.Sum();
    public int UncertainNegativeCount => UncertainNegativeByMonth.Values.Sum();
    public int TotalCount => PositiveCount + NegativeCount + UncertainPositiveCount + UncertainNegativeCount;
}