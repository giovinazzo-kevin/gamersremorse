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
            await Task.Delay(1000, ct);
            
            // Extract AI Overview text directly via JavaScript
            var overview = await page.EvaluateFunctionAsync<string?>(@"
                () => {
                    // Find the AI Overview section
                    const aiHeader = [...document.querySelectorAll('*')].find(el => 
                        el.textContent?.trim() === 'AI Overview'
                    );
                    if (!aiHeader) return null;
                    
                    // Find the content container
                    let container = aiHeader.closest('[data-container-id]') || 
                                   aiHeader.parentElement?.parentElement?.parentElement;
                    
                    if (!container) return null;
                    
                    // Get text content, excluding scripts, styles, images
                    const clone = container.cloneNode(true);
                    clone.querySelectorAll('script, style, img, svg, video').forEach(el => el.remove());
                    
                    let text = clone.textContent || '';
                    // Clean up whitespace
                    text = text.replace(/\s+/g, ' ').trim();
                    // Remove 'AI Overview' prefix and error messages
                    text = text.replace(/^.*?AI Overview\s*/i, '');
                    text = text.replace(/^An AI Overview is not available.*?Try again later\.\s*/i, '');
                    
                    // Stop at source links and UI elements
                    const stopWords = [
                        'Show more', 'Learn more', 'People also ask', 'Related searches',
                        'Show all', 'Dive deeper', 'AI responses may include',
                        'YouTube', 'Wikipedia', 'Reddit', 'PCGamingWiki'
                    ];
                    for (const stop of stopWords) {
                        const idx = text.indexOf(stop);
                        if (idx > 100) {
                            text = text.substring(0, idx).trim();
                            break;
                        }
                    }
                    
                    // Also stop at date patterns like '25 Nov 2019 —'
                    const dateMatch = text.match(/\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s+\d{4}\s*[—-]/i);
                    if (dateMatch && dateMatch.index > 100) {
                        text = text.substring(0, dateMatch.index).trim();
                    }
                    
                    // End at last complete sentence
                    const lastPeriod = text.lastIndexOf('.');
                    if (lastPeriod > 100) {
                        text = text.substring(0, lastPeriod + 1);
                    }
                    
                    return text.length > 50 ? text : null;
                }
            ");
            
            // Debug: save HTML anyway
            var html = await page.GetContentAsync();
            await File.WriteAllTextAsync("google_debug.html", html, ct);
            Console.WriteLine($"Extracted via JS: {overview?.Length ?? 0} chars");
            
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
        
        // Find the main content container
        var containerMarker = "data-container-id=\"main-col\"";
        var containerStart = html.IndexOf(containerMarker, aiMatch.Index, StringComparison.Ordinal);
        if (containerStart < 0) return null;
        
        // Find the opening > of this div
        var contentStart = html.IndexOf('>', containerStart) + 1;
        if (contentStart <= 0) return null;
        
        // Find the closing </div> at the same level - count div depth
        var depth = 1;
        var pos = contentStart;
        var endPos = html.Length;
        
        while (pos < html.Length - 6 && depth > 0) {
            if (html[pos] == '<') {
                if (html.Substring(pos, Math.Min(4, html.Length - pos)).StartsWith("<div", StringComparison.OrdinalIgnoreCase)) {
                    depth++;
                } else if (html.Substring(pos, Math.Min(5, html.Length - pos)).StartsWith("</div", StringComparison.OrdinalIgnoreCase)) {
                    depth--;
                    if (depth == 0) {
                        endPos = pos;
                        break;
                    }
                }
            }
            pos++;
        }
        
        var chunk = html.Substring(contentStart, Math.Min(endPos - contentStart, 8000));
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
        // Remove img tags (including base64 data)
        text = Regex.Replace(text, @"<img[^>]*>", " ", RegexOptions.IgnoreCase);
        // Remove HTML comments (including Google's unclosed <!--Sv6Kpe... markers)
        text = Regex.Replace(text, @"<!--[\s\S]*?-->", " ");
        text = Regex.Replace(text, @"<!--Sv6Kpe[^<]*", " ");
        text = Regex.Replace(text, @"<!--[A-Za-z0-9]{0,10}\[\[", " ");
        // Remove HTML tags
        text = Regex.Replace(text, @"<[^>]+>", " ");
        // Remove any CSS-like content (selectors with curly braces)
        text = Regex.Replace(text, @"[.#]?[A-Za-z0-9_-]+\s*\{[^}]*\}", " ");
        // Remove CSS property-like fragments
        text = Regex.Replace(text, @"[a-z-]+:[^;}{]+;", " ", RegexOptions.IgnoreCase);
        // Remove base64 data that might have leaked
        text = Regex.Replace(text, @"[A-Za-z0-9+/=]{50,}", " ");
        // Remove JSON-like arrays/objects that Google embeds
        text = Regex.Replace(text, @"\[\[""[^\]]*\.\.\..*", " ");
        text = Regex.Replace(text, @"\[\[.*?\]\]", " ");
        text = Regex.Replace(text, @"\[\""[^\]]{20,}\]", " ");
        // Decode HTML entities
        text = System.Web.HttpUtility.HtmlDecode(text);
        // Normalize whitespace
        text = Regex.Replace(text, @"\s+", " ").Trim();
        
        // Truncate to reasonable length
        if (text.Length > 1500) {
            var cutoff = text.LastIndexOf('.', 1500);
            if (cutoff > 500) text = text[..(cutoff + 1)];
            else text = text[..1500] + "...";
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
