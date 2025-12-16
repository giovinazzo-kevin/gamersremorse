// Services/CursorPool.cs
using System.Threading.Channels;
using gamersremorse.Entities;
using Microsoft.Extensions.Options;

namespace gamersremorse.Services;

public class CursorPool
{
    private readonly ILogger<CursorPool> _logger;
    private readonly Configuration _config;
    private readonly SemaphoreSlim _throttle;

    // Circuit breaker state
    private readonly object _lock = new();
    private DateTime _circuitOpenUntil = DateTime.MinValue;
    private int _consecutiveFailures = 0;

    public class Configuration
    {
        public int MaxParallel { get; set; } = 3;
        public int MaxStaggerDelayMs { get; set; } = 1500;
        public int BaseBackoffMs { get; set; } = 5000;
        public int MaxBackoffMs { get; set; } = 60000;
        public int FailuresBeforeBreak { get; set; } = 2;
    }

    public CursorPool(IOptions<Configuration> options, ILogger<CursorPool> logger)
    {
        _config = options.Value;
        _logger = logger;
        _throttle = new SemaphoreSlim(_config.MaxParallel, _config.MaxParallel);
    }

    public async Task RunCursors(
        IEnumerable<IAsyncEnumerable<SteamReview>> cursors,
        ChannelWriter<SteamReview> output,
        CancellationToken ct)
    {
        var cursorList = cursors.ToList();
        var tasks = new List<Task>();

        // Stagger cursor starts
        foreach (var cursor in cursorList) {
            await Task.Delay(Random.Shared.Next(500, _config.MaxStaggerDelayMs), ct);
            tasks.Add(RunSingleCursor(cursor, output, ct));
        }

        try {
            await Task.WhenAll(tasks);
        }
        finally {
            output.Complete();
        }
    }

    private async Task RunSingleCursor(
        IAsyncEnumerable<SteamReview> cursor,
        ChannelWriter<SteamReview> output,
        CancellationToken ct)
    {
        await _throttle.WaitAsync(ct);
        try {
            await foreach (var review in cursor.WithCancellation(ct)) {
                // Check circuit breaker before processing
                await WaitForCircuit(ct);

                await output.WriteAsync(review, ct);
                ReportSuccess();
            }
        }
        catch (OperationCanceledException) { }
        catch (HttpRequestException ex) when (ex.StatusCode is System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.BadGateway or System.Net.HttpStatusCode.TooManyRequests) {
            ReportFailure();
            _logger.LogWarning("Cursor hit rate limit ({Status}), circuit breaker engaged", ex.StatusCode);
        }
        catch (Exception ex) {
            _logger.LogWarning(ex, "Cursor failed");
        }
        finally {
            _throttle.Release();
        }
    }

    private async Task WaitForCircuit(CancellationToken ct)
    {
        while (true) {
            DateTime openUntil;
            lock (_lock) {
                openUntil = _circuitOpenUntil;
            }

            var delay = openUntil - DateTime.UtcNow;
            if (delay <= TimeSpan.Zero)
                return;

            _logger.LogDebug("Circuit open, waiting {Delay}ms", delay.TotalMilliseconds);
            await Task.Delay(delay, ct);
        }
    }

    private void ReportSuccess()
    {
        lock (_lock) {
            _consecutiveFailures = 0;
        }
    }

    private void ReportFailure()
    {
        lock (_lock) {
            _consecutiveFailures++;

            if (_consecutiveFailures >= _config.FailuresBeforeBreak) {
                // Exponential backoff: 5s, 10s, 20s, 40s... capped at MaxBackoffMs
                var backoffMs = Math.Min(
                    _config.BaseBackoffMs * (1 << (_consecutiveFailures - _config.FailuresBeforeBreak)),
                    _config.MaxBackoffMs
                );

                _circuitOpenUntil = DateTime.UtcNow.AddMilliseconds(backoffMs);
                _logger.LogWarning("Circuit breaker OPEN for {Backoff}ms ({Failures} consecutive failures)",
                    backoffMs, _consecutiveFailures);
            }
        }
    }
}