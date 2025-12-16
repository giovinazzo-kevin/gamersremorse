using gamersremorse.Services;
using Microsoft.EntityFrameworkCore;
using System.Net.WebSockets;
using System.Text.Json;

var options = new JsonSerializerOptions() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
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

        const string bullets = " bullet points";

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
            "mass_edits" => $"What happened to {game} (video game) in {year} that made players angry",
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
        var json = JsonSerializer.SerializeToUtf8Bytes(snapshot, options);
        await ws.SendAsync(json, WebSocketMessageType.Text, true, ctx.RequestAborted);
        count++;
    }

    Console.WriteLine($"Sent {count} snapshots");
    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", ctx.RequestAborted);
    return Results.Empty;
});
app.UseStaticFiles();
app.Run();
