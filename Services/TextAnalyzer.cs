using System.Text.RegularExpressions;

namespace gamersremorse.Services;

public static partial class TextAnalyzer
{
    // profanity - crude but not directed at anyone
    private static readonly string[] Profanity = [
        "fuck", "fucking", "fucked", "fucker", "fucks",
        "shit", "shitty", "shitting", "shidding",
        "crap", "crapping",
        "fart", "farting", "farding",
        "piss", "pissed", "pissing",
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
        "moron", "morons", "moronic", "retard",
        "mongoloid", "mongoloids",
        "worthless",
        "lazy", "incompetent", "pathetic",
        "joke", "laughable",
        "disgrace", "disgusting"
    ];

    // complaints - about business practices or the game
    private static readonly string[] Complaints = [
        "predatory", "cashgrab", "cash grab",
        "greedy", "greed",
        "overpriced", "ripoff", "rip off", "rip-off",
        "pay to win", "p2w", "paytowin",
        "microtransactions", "mtx",
        "dlc", "kernel", "kernel-level", "kernel level",
        "bots", "aimbots", "cheaters", "ruined",
        "monetization", "monetized",
        "gacha", "lootbox", "loot box",
        "battle pass", "battlepass",
        "fomo",
        "grindy", "grind",
        "broken", "overpowered", "nerf", "buff", 
        "please", "complain", "complaints", "complaining",
        "timegated", "time-gated", "time gated",
        "abandoned", "dead game", "trash game",
        "so ass", "this shit is so ass", "abysmal dogshi", "abysmal dogshit",
        "early access",
        "broken", "buggy", "unfinished", "unpolished",
        "asset flip",
        "shovelware",
        "enshittified",
        "was better", "got worse",
        "pride and accomplishment"
    ];

    // competitive banter - gamer-specific dismissiveness
    private static readonly string[] Banter = [
        "git gud", "gitgud",
        "skill issue", "skill-issue",
        "skill diff", "skilldiff",
        "diff",
        "gap",
        "cope", "copium",
        "seethe", "seething",
        "mald", "malding",
        "ratio", "ratioed",
        "touch grass",
        "report", "reported",
        "gg ez", "ggez", "ez", "ezpz", "no re",
        "mad",
        "bad",
        "noob", "n00b", "newb",
        "scrub", "scrubs",
        "casual", "casuals",
        "carried", "carry",
        "boosted",
        "hardstuck", "trench", "trenches",
        "uninstall", "alt+f4",
        "l2p", "deserved", 
        "veterans", "competitive",
        "outplayed", "outskilled", "outfarmed", "outsmarted",
        "elo", "mmr",
        "tilted", "tilt"
    ];

    // slurs - categorized
    private static readonly string[] Slurs = [
        // ableist
        "retard", "retarded", "retards",
        "sperg", "spergs", 
        // homophobic  
        "fag", "fags", "faggot", "faggots",
        "tranny", "trannies", "troon", "troons",
        "dyke", "dykes", "homo", "homos",
        // racial
        "nigger", "niggers", "nigga", "niggas",
        "mongoloid", "mongoloids",
        "chink", "chinks",
        "spic", "spics",
        "kike", "kikes",
        "gook", "gooks",
    ];

    [GeneratedRegex(@"\w+", RegexOptions.Compiled)]
    private static partial Regex WordPattern();

    public static (int profanity, int insults, int slurs, int banter, int complaints) Analyze(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return (0, 0, 0, 0, 0);

        var lower = text.ToLowerInvariant();
        var matches = WordPattern().Matches(lower);

        int profanity = 0, insults = 0, slurs = 0, banter = 0, complaints = 0;

        foreach (Match match in matches)
        {
            var word = match.Value;
            if (Profanity.Contains(word)) profanity++;
            else if (Insults.Contains(word)) insults++;
            else if (Slurs.Contains(word)) slurs++;
            else if (Banter.Contains(word)) banter++;
            else if (Complaints.Contains(word)) complaints++;
        }

        // Also check for multi-word phrases
        var allPhrases = Banter.Concat(Complaints).Where(b => b.Contains(' '));
        foreach (var phrase in allPhrases)
        {
            var count = 0;
            var idx = 0;
            while ((idx = lower.IndexOf(phrase, idx)) != -1)
            {
                count++;
                idx += phrase.Length;
            }
            if (Banter.Contains(phrase)) banter += count;
            else if (Complaints.Contains(phrase)) complaints += count;
        }

        return (profanity, insults, slurs, banter, complaints);
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

    public static (byte profanity, byte insults, byte slurs, byte banter, byte complaints) AnalyzeCapped(string text)
    {
        var (p, i, s, b, c) = Analyze(text);
        return (
            (byte)Math.Min(p, 255),
            (byte)Math.Min(i, 255),
            (byte)Math.Min(s, 255),
            (byte)Math.Min(b, 255),
            (byte)Math.Min(c, 255)
        );
    }
}
