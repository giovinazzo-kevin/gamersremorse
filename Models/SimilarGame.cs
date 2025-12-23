namespace gamersremorse.Models;

public record SimilarGame(
    AppId AppId,
    string Name,
    string HeaderImage,
    double PosMedianMinutes,
    double NegMedianMinutes,
    double Similarity);