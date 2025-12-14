using gamersremorse.Services;
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
builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.None);
var app = builder.Build();
app.UseWebSockets();
app.UseHttpsRedirection();
app.MapGet("/game/{appId}", async (HttpContext ctx, AppId appId, SteamReviewRepository repo) => {
    return await repo.GetInfo(appId);
});
app.Map("/ws/game/{appId}", async (HttpContext ctx, AppId appId, SteamReviewAnalyzer analyzer, SteamReviewRepository repo) => {
    if (!ctx.WebSockets.IsWebSocketRequest)
        return Results.BadRequest();

    Console.WriteLine($"WS connected for {appId}");

    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var (reviews, isStreaming) = await repo.GetAll(appId, ctx.RequestAborted);

    var count = 0;
    await foreach (var snapshot in analyzer.VerdictByPlaytime(reviews, isStreaming, ctx.RequestAborted)) {
        Console.WriteLine($"Sending snapshot with {snapshot.BucketsByTotalTime.Length} buckets");
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
