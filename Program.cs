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
app.MapGet("/controversy", async (string game, string month, GoogleScraper google, CancellationToken ct) => {
    string query = "";
    string? overview = null;
    
    if (month == "launch") {
        // Special case: query for launch reception
        query = $"What was the {game} launch reception";
        overview = await google.GetAIOverview(query, ct);
    } else {
        // Parse month like "2024-10" into "October 2024"
        var monthNames = new[] { "", "January", "February", "March", "April", "May", "June", 
                                 "July", "August", "September", "October", "November", "December" };
        var parts = month.Split('-');
        var year = parts[0];
        var monthName = parts.Length > 1 && int.TryParse(parts[1], out var m) && m >= 1 && m <= 12 
            ? monthNames[m] 
            : "";
        
        // Try month-specific query first
        if (!string.IsNullOrEmpty(monthName)) {
            query = $"What was the {game} controversy in {monthName} {year}";
            overview = await google.GetAIOverview(query, ct);
        }
        
        // Fall back to year-only if month query failed
        if (overview == null) {
            query = $"What was the {game} controversy in {year}";
            overview = await google.GetAIOverview(query, ct);
        }
    }
    
    return new { query, overview };
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
