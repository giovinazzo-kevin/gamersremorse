namespace gamersremorse.Models;

public record HistogramBucket(double MinPlaytime, double MaxPlaytime, int PositiveCount, int NegativeCount);
