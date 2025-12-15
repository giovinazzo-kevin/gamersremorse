using gamersremorse.Models;
using System.Collections.Concurrent;
using System.Threading.Channels;

namespace gamersremorse.Services;

public class AnalysisHub
{
    private readonly ConcurrentDictionary<AppId, AnalysisSession> _sessions = new();
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AnalysisHub> _logger;

    public AnalysisHub(IServiceScopeFactory scopeFactory, ILogger<AnalysisHub> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task<ChannelReader<AnalysisSnapshot>> Subscribe(AppId appId, CancellationToken ct)
    {
        var session = _sessions.GetOrAdd(appId, _ => StartNewSession(appId));

        var subscriber = Channel.CreateBounded<AnalysisSnapshot>(new BoundedChannelOptions(16) {
            FullMode = BoundedChannelFullMode.DropOldest
        });

        lock (session.Subscribers) {
            // catch up: send latest snapshot if we have one
            if (session.LatestSnapshot is { } latest)
                subscriber.Writer.TryWrite(latest);

            if (session.IsComplete) {
                subscriber.Writer.Complete();
                return subscriber.Reader;
            }

            session.Subscribers.Add(subscriber.Writer);
        }

        ct.Register(() => {
            lock (session.Subscribers) {
                session.Subscribers.Remove(subscriber.Writer);
                subscriber.Writer.TryComplete();
            }
        });

        return subscriber.Reader;
    }

    private AnalysisSession StartNewSession(AppId appId)
    {
        var session = new AnalysisSession();
        _logger.LogInformation("Starting new analysis session for {AppId}", appId);

        _ = Task.Run(async () => {
            try {
                using var scope = _scopeFactory.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<SteamReviewRepository>();
                var analyzer = scope.ServiceProvider.GetRequiredService<SteamReviewAnalyzer>();

                var meta = await repo.GetMetadata(appId);
                var (reviews, isStreaming) = await repo.GetAll(appId, session.Cts.Token);

                await foreach (var snapshot in analyzer.VerdictByPlaytime(reviews, isStreaming, meta, session.Cts.Token)) {
                    session.LatestSnapshot = snapshot;
                    Broadcast(session, snapshot);
                }
            }
            catch (OperationCanceledException) {
                _logger.LogInformation("Analysis cancelled for {AppId}", appId);
            }
            catch (Exception ex) {
                _logger.LogError(ex, "Analysis failed for {AppId}", appId);
            }
            finally {
                lock (session.Subscribers) {
                    session.IsComplete = true;
                    foreach (var sub in session.Subscribers)
                        sub.TryComplete();
                    session.Subscribers.Clear();
                }
                _sessions.TryRemove(appId, out _);
                _logger.LogInformation("Analysis complete for {AppId}", appId);
            }
        });

        return session;
    }

    private void Broadcast(AnalysisSession session, AnalysisSnapshot snapshot)
    {
        lock (session.Subscribers) {
            foreach (var sub in session.Subscribers)
                sub.TryWrite(snapshot);
        }
    }

    private class AnalysisSession
    {
        public List<ChannelWriter<AnalysisSnapshot>> Subscribers { get; } = new();
        public AnalysisSnapshot? LatestSnapshot { get; set; }
        public bool IsComplete { get; set; }
        public CancellationTokenSource Cts { get; } = new();
    }
}
