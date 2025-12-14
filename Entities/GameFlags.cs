namespace gamersremorse.Entities;

[Flags]
public enum GameFlags : int
{
    None = 0,
    SinglePlayer = 1 << 0,      // 1
    MultiPlayer = 1 << 1,       // 2
    FamilyShare = 1 << 2,       // 4
    SexualContent = 1 << 3,     // 8  (content descriptor 1, 3, or 4)
}