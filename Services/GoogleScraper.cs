using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;
using PuppeteerSharp;
using System.Text.RegularExpressions;

namespace gamersremorse.Services;

public partial class GoogleScraper(IDbContextFactory<AppDbContext> dbFactory) : IAsyncDisposable
{
    private IBrowser? _browser;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private static readonly TimeSpan CacheDuration = TimeSpan.FromDays(7);

    private async Task<IBrowser> GetBrowser()
    {
        if (_browser != null) return _browser;
        
        await _lock.WaitAsync();
        try {
            if (_browser != null) return _browser;
            
            var browserFetcher = new BrowserFetcher();
            var installed = browserFetcher.GetInstalledBrowsers().FirstOrDefault();
            
            if (installed == null) {
                Console.WriteLine("Downloading Chrome...");
                await browserFetcher.DownloadAsync();
            } else {
                Console.WriteLine($"Using installed Chrome: {installed.BuildId}");
            }
            
            Console.WriteLine("Launching browser...");
            _browser = await Puppeteer.LaunchAsync(new LaunchOptions {
                Headless = true,
                Args = new[] { 
                    "--no-sandbox", 
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--window-size=1920,1080",
                    "--start-maximized"
                }
            });
            
            return _browser;
        }
        finally {
            _lock.Release();
        }
    }

    private static async Task ApplyStealthScripts(IPage page)
    {
        // Stealth evasions - hide webdriver/automation flags
        await page.EvaluateFunctionOnNewDocumentAsync(@"
            () => {
                // Pass webdriver check
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
                
                // Pass chrome check
                window.chrome = {
                    runtime: {}
                };
                
                // Pass permissions check
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Pass plugins check
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Pass languages check
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
            }
        ");
    }

    public async Task<string?> GetAIOverview(string query, CancellationToken ct = default)
    {
        // Check cache first
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var cached = await db.ControversyCaches.FindAsync([query], ct);
        if (cached != null && DateTime.UtcNow - cached.CachedAt < CacheDuration) {
            Console.WriteLine($"Cache hit for: {query}");
            return cached.Overview;
        }
        
        try {
            var browser = await GetBrowser();
            await using var page = await browser.NewPageAsync();
            
            // Apply stealth evasions
            await ApplyStealthScripts(page);
            
            // Set a realistic viewport and user agent
            await page.SetViewportAsync(new ViewPortOptions { Width = 1920, Height = 1080 });
            await page.SetUserAgentAsync("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
            
            // Set extra headers to look more legitimate
            await page.SetExtraHttpHeadersAsync(new Dictionary<string, string> {
                ["Accept-Language"] = "en-US,en;q=0.9",
                ["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                ["sec-ch-ua"] = "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
                ["sec-ch-ua-mobile"] = "?0",
                ["sec-ch-ua-platform"] = "\"Windows\"",
                ["Upgrade-Insecure-Requests"] = "1"
            });
            
            var url = $"https://www.google.com/search?q={Uri.EscapeDataString(query)}&hl=en";
            Console.WriteLine($"Navigating to: {url}");
            
            await page.GoToAsync(url, WaitUntilNavigation.Networkidle0);
            
            // Wait a moment for any JS to render
            await Task.Delay(500, ct);
            
            // Try to find AI Overview - it's usually in a div with specific markers
            // Let's get the page HTML and search for patterns
            var html = await page.GetContentAsync();
            
            // Debug: save to file
            await File.WriteAllTextAsync("google_debug.html", html, ct);
            Console.WriteLine($"Saved HTML ({html.Length} bytes) to google_debug.html");
            
            // Look for AI Overview section
            var overview = ExtractAIOverview(html);
            Console.WriteLine($"Extracted: {overview?.Length ?? 0} chars");
            
            // Cache the result (even if null, to avoid re-fetching)
            if (cached != null) {
                cached.Overview = overview;
                cached.CachedAt = DateTime.UtcNow;
            } else {
                db.ControversyCaches.Add(new ControversyCache {
                    Query = query,
                    Overview = overview,
                    CachedAt = DateTime.UtcNow
                });
            }
            await db.SaveChangesAsync(ct);
            
            return overview;
        }
        catch (Exception ex) {
            Console.WriteLine($"Google scrape failed: {ex.Message}");
            return null;
        }
    }

    private static string? ExtractAIOverview(string html)
    {
        // Find "AI Overview" marker first to confirm it exists
        var aiMatch = AIOverviewPattern().Match(html);
        if (!aiMatch.Success) return null;
        
        // The actual content is in/around <mark> tags - there's only one in the AI Overview
        var markStart = html.IndexOf("<mark", aiMatch.Index, StringComparison.OrdinalIgnoreCase);
        if (markStart < 0) return null;
        
        // Back up to find the real sentence start - look for ">The " or similar
        var searchBackStart = Math.Max(aiMatch.Index, markStart - 1000);
        var backChunk = html.Substring(searchBackStart, markStart - searchBackStart);
        
        // Find last occurrence of a sentence starter like ">The " or ">A " or ">In "
        var sentenceStarters = new[] { ">The ", ">A ", ">In ", ">This " };
        var contentStart = -1;
        foreach (var starter in sentenceStarters) {
            var idx = backChunk.LastIndexOf(starter, StringComparison.Ordinal);
            if (idx > contentStart) {
                contentStart = idx + 1; // skip the >
            }
        }
        
        if (contentStart < 0) {
            // Fallback: just start at mark
            contentStart = 0;
        }
        
        var absoluteStart = searchBackStart + contentStart;
        var chunk = html.Substring(absoluteStart, Math.Min(5000, html.Length - absoluteStart));
        var cleaned = CleanHtml(chunk);
        
        // End at source citations or junk
        var stopPatterns = new[] { 
            "reddit.com", "pcgamer.com", "kotaku.com", "ign.com", "polygon.com",
            "steampowered.com", "youtube.com", "twitter.com", "x.com",
            "People also ask", "Related searches", "Show more", "Learn more"
        };
        
        var endIdx = cleaned.Length;
        foreach (var pattern in stopPatterns) {
            var idx = cleaned.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
            if (idx > 50 && idx < endIdx) {
                endIdx = idx;
            }
        }
        
        // Also cut at any HTML comment or encoded junk
        var commentIdx = cleaned.IndexOf("<!--", StringComparison.Ordinal);
        if (commentIdx > 50 && commentIdx < endIdx) endIdx = commentIdx;
        
        // Cut at any URL-encoded chars (like u003d which is =)
        var encodedMatch = Regex.Match(cleaned, @"\bu[0-9a-f]{4}\b");
        if (encodedMatch.Success && encodedMatch.Index > 50 && encodedMatch.Index < endIdx) {
            endIdx = encodedMatch.Index;
        }
        
        cleaned = cleaned[..endIdx].Trim();
        cleaned = Regex.Replace(cleaned, @"\s+", " ");
        
        // Fix punctuation spacing (e.g., "word ," -> "word,")
        cleaned = Regex.Replace(cleaned, @"\s+([,.!?;:])", "$1");
        
        // Remove any leading HTML attribute junk (e.g., 'CgYd" jsuid="...">') 
        cleaned = Regex.Replace(cleaned, @"^[^A-Za-z]*[A-Za-z]{2,10}\""[^>]*>\s*", "");
        // Also remove any stray attribute fragments at start
        cleaned = Regex.Replace(cleaned, @"^[^A-Z]+", "");
        
        // End at last complete sentence
        var lastPeriod = cleaned.LastIndexOf('.');
        if (lastPeriod > 100) {
            cleaned = cleaned[..(lastPeriod + 1)];
        }
        
        return cleaned.Length > 100 ? cleaned : null;
    }

    private static string CleanHtml(string html)
    {
        // Remove script and style blocks
        var text = Regex.Replace(html, @"<script[^>]*>[\s\S]*?</script>", " ", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"<style[^>]*>[\s\S]*?</style>", " ", RegexOptions.IgnoreCase);
        // Remove HTML tags
        text = Regex.Replace(text, @"<[^>]+>", " ");
        // Remove any CSS-like content (selectors with curly braces)
        text = Regex.Replace(text, @"[.#]?[A-Za-z0-9_-]+\s*\{[^}]*\}", " ");
        // Remove CSS property-like fragments
        text = Regex.Replace(text, @"[a-z-]+:[^;}{]+;", " ", RegexOptions.IgnoreCase);
        // Decode HTML entities
        text = System.Web.HttpUtility.HtmlDecode(text);
        // Normalize whitespace
        text = Regex.Replace(text, @"\s+", " ").Trim();
        
        // Truncate to reasonable length
        if (text.Length > 1000) {
            var cutoff = text.LastIndexOf('.', 1000);
            if (cutoff > 500) text = text[..(cutoff + 1)];
            else text = text[..1000] + "...";
        }
        
        return text;
    }

    [GeneratedRegex(@"AI\s*Overview", RegexOptions.IgnoreCase)]
    private static partial Regex AIOverviewPattern();

    public async ValueTask DisposeAsync()
    {
        if (_browser != null) {
            await _browser.CloseAsync();
            _browser = null;
        }
        GC.SuppressFinalize(this);
    }
}
