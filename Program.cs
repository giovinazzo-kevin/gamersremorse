using gamersremorse.Services;
using Microsoft.EntityFrameworkCore;
using Pgvector.EntityFrameworkCore;
using System.Net.WebSockets;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient();
builder.Services.AddDbContextFactory<AppDbContext>();
builder.Services.AddOptions<SteamScraper.Configuration>();
builder.Services.AddTransient<SteamScraper>();
builder.Services.AddOptions<SteamReviewRepository.Configuration>();
builder.Services.AddTransient<SteamReviewRepository>();
builder.Services.AddOptions<SteamReviewAnalyzer.Configuration>();
builder.Services.AddTransient<SteamReviewAnalyzer>();
builder.Services.AddSingleton<AnalysisHub>();
builder.Services.AddSingleton<GoogleScraper>();
builder.Services.AddOptions<CursorPool.Configuration>();
builder.Services.AddSingleton<CursorPool>();
builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.None);
var app = builder.Build();

// Ensure DB schema is up to date
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContext();
    db.Database.EnsureCreated();
}

app.UseWebSockets();
app.UseHttpsRedirection();
app.MapGet("/game/{appId}", async (HttpContext ctx, AppId appId, SteamReviewRepository repo) => {
    return await repo.GetInfo(appId);
});
app.MapGet("/controversies", async (string game, string months, string? types, GoogleScraper google, CancellationToken ct) => {

    var monthList = months.Split(',', StringSplitOptions.RemoveEmptyEntries);
    var typeList = types?.Split(',', StringSplitOptions.RemoveEmptyEntries) ?? monthList.Select(_ => "unknown").ToArray();

    var monthNames = new[] { "", "January", "February", "March", "April", "May", "June",
                             "July", "August", "September", "October", "November", "December" };

    var tasks = monthList.Zip(typeList).Select(async pair => {
        var (month, eventType) = pair;
        string query;
        string? overview = null;

        const string bullets = " key points";

        var parts = month.Split('-');
        var year = parts[0];
        var monthNumber = (parts.Length > 1 && int.TryParse(parts[1], out var m) && m >= 1 && m <= 12) ? (int?)m : null;
        var monthName = monthNumber != null
            ? monthNames[monthNumber.Value] : "";

        query = eventType switch {
            "launch" => $"{game} (video game) launch reception",
            "launch_troubled" => $"{game} (video game) launch controversy",
            "launch_flop" => $"Why did {game} (video game) flop",
            "death" => $"Why did {game} (video game) die in {year}",
            "review_bomb" when !string.IsNullOrEmpty(monthName)
                => $"What was the {game} (video game) controversy in {monthName} {year}",
            "review_bomb" => $"What was the {game} (video game) controversy in {year}",
            "mass_edits" => $"Why did people talk about {game} (video game) so much in {year}",
            _ => $"What was the {game} (video game) controversy in {year}"
        } + bullets;

        overview = await google.GetAIOverview(query, ct);

        // Fallback to year-only if month-specific returned nothing
        if (overview == null && !string.IsNullOrEmpty(monthName) && eventType != "death") {
            query = $"What happened to {game} (video game) in {year}" + bullets;
            overview = await google.GetAIOverview(query, ct);
        }
        var orderBy = int.TryParse(year, out var y) ? y : 0;
        var thenBy = monthNumber ?? 0;
        return new { orderBy, thenBy, month, query, overview };
    });

    var results = await Task.WhenAll(tasks);
    return results.OrderByDescending(r => r.orderBy).ThenByDescending(r => r.thenBy).Where(r => r.overview != null);
});
app.Map("/ws/game/{appId}", async (HttpContext ctx, AppId appId, AnalysisHub hub) => {
    if (!ctx.WebSockets.IsWebSocketRequest)
        return Results.BadRequest();

    Console.WriteLine($"WS connected for {appId}");

    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var reader = await hub.Subscribe(appId, ctx.RequestAborted);

    var count = 0;
    await foreach (var snapshot in reader.ReadAllAsync(ctx.RequestAborted)) {
        var binary = BinarySnapshotWriter.Write(snapshot);
        await ws.SendAsync(binary, WebSocketMessageType.Binary, true, ctx.RequestAborted);
        count++;
    }

    Console.WriteLine($"Sent {count} snapshots");
    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", ctx.RequestAborted);
    return Results.Empty;
});
// GET /wall?sort=stockholm&order=desc&limit=50&offset=0
app.MapGet("/wall", async (
    AppDbContext db,
    string? sort,
    string? order,
    int limit = 50,
    int offset = 0) => {
        var query = db.Fingerprints
            .Join(db.SteamAppInfos, f => f.AppId, a => a.AppId, (f, a) => new { f, a });

        query = sort switch {
            "stockholm" => order == "asc"
                ? query.OrderBy(x => x.f.NegMedian / x.f.PosMedian)
                : query.OrderByDescending(x => x.f.NegMedian / x.f.PosMedian),
            "median" => order == "asc"
                ? query.OrderBy(x => x.f.NegMedian)
                : query.OrderByDescending(x => x.f.NegMedian),
            _ => query.OrderByDescending(x => x.f.UpdatedOn)
        };

        return await query
            .Skip(offset)
            .Take(limit)
            .Select(x => new {
                x.f.AppId,
                x.a.Name,
                x.a.HeaderImage,
                x.f.PosMedian,
                x.f.NegMedian,
                x.f.SteamPositive,
                x.f.SteamNegative,
                x.f.ThumbnailPng,
                x.f.UpdatedOn
            })
            .ToListAsync();
    });

// GET /wall/similar/{appId}?limit=20
app.MapGet("/wall/similar/{appId}", async (
    AppDbContext db,
    AppId appId,
    int limit = 20) => {
        var target = await db.Fingerprints.FindAsync(appId);
        if (target is null) return Results.NotFound();

        // pgvector cosine distance
        var similar = await db.Fingerprints
            .OrderBy(f => f.Shape.CosineDistance(target.Shape))
            .Take(limit + 1) // +1 to exclude self
            .Where(f => f.AppId != appId)
            .Join(db.SteamAppInfos, f => f.AppId, a => a.AppId, (f, a) => new { f, a })
            .Select(x => new {
                x.f.AppId,
                x.a.Name,
                x.a.HeaderImage,
                x.f.PosMedian,
                x.f.NegMedian
            })
            .ToListAsync();

        return Results.Ok(similar);
    });
app.UseStaticFiles();
app.Run();
