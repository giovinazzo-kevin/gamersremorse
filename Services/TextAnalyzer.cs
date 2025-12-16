using System.Text.RegularExpressions;

namespace gamersremorse.Services;

public static partial class TextAnalyzer
{
    // profanity - crude but not directed at anyone
    private static readonly string[] Profanity = [
        "fuck", "fucking", "fucked", "fucker", "fucks",
        "shit", "shitty", "shitting",
        "piss", "pissed",
        "damn", "damned",
        "ass", "asses", // careful with "class", "pass" etc
        "bitch", "bitches",
        "crap", "crappy",
        "cock", "dick", "dicks",
        "cunt", "cunts"
    ];

    // insults - directed at devs/game/players
    private static readonly string[] Insults = [
        "trash", "garbage", "scam", "scammer",
        "waste", "wasted",
        "stupid", "idiot", "idiots", "idiotic",
        "moron", "morons", "moronic",
        "lazy", "greedy", "greed",
        "incompetent", "pathetic",
        "joke", "laughable",
        "disgrace", "disgusting",
        "predatory", "cashgrab", "cash grab"
    ];

    // slurs - categorized
    private static readonly string[] Slurs = [
        // ableist
        "retard", "retarded", "retards",
        "autist", "autistic", // when used as insult
        "sperg",
        // homophobic  
        "fag", "fags", "faggot", "faggots",
        "tranny", "trannies",
        "dyke", "dykes",
        // racial
        "nigger", "niggers", "nigga", "niggas",
        "chink", "chinks",
        "spic", "spics",
        "kike", "kikes",
        "gook", "gooks",
        "wetback", "wetbacks"
    ];

    [GeneratedRegex(@"\w+", RegexOptions.Compiled)]
    private static partial Regex WordPattern();

    public static (int profanity, int insults, int slurs) Analyze(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return (0, 0, 0);

        var lower = text.ToLowerInvariant();
        var matches = WordPattern().Matches(lower);

        int profanity = 0, insults = 0, slurs = 0;

        foreach (Match match in matches)
        {
            var word = match.Value;
            if (Profanity.Contains(word)) profanity++;
            else if (Insults.Contains(word)) insults++;
            else if (Slurs.Contains(word)) slurs++;
        }

        return (profanity, insults, slurs);
    }

    public static (Dictionary<string, int> profanity, Dictionary<string, int> insults, Dictionary<string, int> slurs) AnalyzeWords(string text)
    {
        var profanity = new Dictionary<string, int>();
        var insults = new Dictionary<string, int>();
        var slurs = new Dictionary<string, int>();

        if (string.IsNullOrWhiteSpace(text))
            return (profanity, insults, slurs);

        var lower = text.ToLowerInvariant();
        var matches = WordPattern().Matches(lower);

        foreach (Match match in matches)
        {
            var word = match.Value;
            if (Profanity.Contains(word))
                profanity[word] = profanity.GetValueOrDefault(word) + 1;
            else if (Insults.Contains(word))
                insults[word] = insults.GetValueOrDefault(word) + 1;
            else if (Slurs.Contains(word))
                slurs[word] = slurs.GetValueOrDefault(word) + 1;
        }

        return (profanity, insults, slurs);
    }

    public static (byte profanity, byte insults, byte slurs) AnalyzeCapped(string text)
    {
        var (p, i, s) = Analyze(text);
        return (
            (byte)Math.Min(p, 255),
            (byte)Math.Min(i, 255),
            (byte)Math.Min(s, 255)
        );
    }
}
