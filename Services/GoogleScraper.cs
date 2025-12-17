using gamersremorse.Entities;
using Microsoft.EntityFrameworkCore;
using PuppeteerSharp;
using System.Text.RegularExpressions;

namespace gamersremorse.Services;

public class GoogleScraper(IDbContextFactory<AppDbContext> dbFactory) : IAsyncDisposable
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
            if (installed == null) await browserFetcher.DownloadAsync();
            
            _browser = await Puppeteer.LaunchAsync(new LaunchOptions {
                Headless = true,
                Args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
            });
            
            return _browser;
        }
        finally {
            _lock.Release();
        }
    }

    private static async Task ApplyStealthScripts(IPage page)
    {
        await page.EvaluateFunctionOnNewDocumentAsync(@"
            () => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            }
        ");
    }

    public async Task<string?> GetAIOverview(string query, CancellationToken ct = default, int maxRetries = 2)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var cached = await db.ControversyCaches.FindAsync([query], ct);
        if (cached != null && DateTime.UtcNow - cached.CachedAt < CacheDuration)
            return cached.Overview;

        string? overview = null;

        for (int attempt = 0; attempt <= maxRetries && overview == null; attempt++) {
            if (attempt > 0) {
                await Task.Delay(1000 * attempt, ct); // backoff: 1s, 2s
            }

            try {
                var browser = await GetBrowser();
                await using var page = await browser.NewPageAsync();

                await ApplyStealthScripts(page);
                await page.SetViewportAsync(new ViewPortOptions { Width = 1920, Height = 1080 });
                await page.SetUserAgentAsync("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                await page.SetExtraHttpHeadersAsync(new Dictionary<string, string> {
                    ["Accept-Language"] = "en-US,en;q=0.9",
                    ["sec-ch-ua"] = "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\"",
                    ["sec-ch-ua-platform"] = "\"Windows\""
                });

                await page.GoToAsync($"https://www.google.com/search?q={Uri.EscapeDataString(query)}&hl=en", WaitUntilNavigation.Networkidle0);
                await Task.Delay(1000, ct);

                overview = await page.EvaluateFunctionAsync<string?>(@"
                () => {
                    const mainCol = document.querySelector('[data-container-id=""main-col""]');
                    if (!mainCol) return null;
                    const rect = mainCol.getBoundingClientRect();
                    // force a paint, then grab innerText which respects visibility

                    const ul = mainCol.querySelector('ul');
                    if (!ul) return mainCol.innerText.trim();

                    const items = [...ul.querySelectorAll('li')]
                        .map(li => li.innerText.trim())
                        .filter(t => t && t.length > 2)
                        .map(t => '• ' + t);

                    return items.length ? items.join('\n') : null;
                }
            ");

                if (overview != null) {
                    overview = Regex.Replace(overview, @"• ([^:]+):", "• <strong>$1</strong>:");
                    overview = overview.Trim();
                    if (string.IsNullOrWhiteSpace(overview)) overview = null;
                }
            }
            catch {
                // retry
            }
        }

        // Cache result (even null to avoid hammering)
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

    public async ValueTask DisposeAsync()
    {
        if (_browser != null) {
            await _browser.CloseAsync();
            _browser = null;
        }
        GC.SuppressFinalize(this);
    }
}
