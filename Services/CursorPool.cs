// Services/CursorPool.cs
using System.Threading.Channels;
using gamersremorse.Entities;
using Microsoft.Extensions.Options;

namespace gamersremorse.Services;

public record SamplingProgress(int SampledPos, int SampledNeg, int TotalPos, int TotalNeg);

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
        public int MaxParallel { get; set; } = 4;
        public int MaxStaggerDelayMs { get; set; } = 1500;
        public int BaseBackoffMs { get; set; } = 5000;
        public int MaxBackoffMs { get; set; } = 60000;
        public int FailuresBeforeBreak { get; set; } = 2;
        public int BatchSize { get; set; } = 20; // Pull this many before re-evaluating priority
    }

    public CursorPool(IOptions<Configuration> options, ILogger<CursorPool> logger)
    {
        _config = options.Value;
        _logger = logger;
        _throttle = new SemaphoreSlim(_config.MaxParallel, _config.MaxParallel);
    }

    /// <summary>
    /// Run cursors with adaptive priority - pulls from whichever pool needs more samples
    /// </summary>
    public async Task RunCursorsAdaptive(
        List<IAsyncEnumerable<SteamReview>> positiveCursors,
        List<IAsyncEnumerable<SteamReview>> negativeCursors,
        Func<SamplingProgress> getProgress,
        ChannelWriter<SteamReview> output,
        CancellationToken ct)
    {
        // Create cursor state trackers
        var posCursors = positiveCursors.Select(c => new CursorState(c, isPositive: true)).ToList();
        var negCursors = negativeCursors.Select(c => new CursorState(c, isPositive: false)).ToList();
        
        var allCursors = new List<CursorState>();
        allCursors.AddRange(posCursors);
        allCursors.AddRange(negCursors);
        
        try
        {
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                
                // Check progress and decide priority
                var progress = getProgress();
                var posRatio = progress.TotalPos > 0 ? (double)progress.SampledPos / progress.TotalPos : 1;
                var negRatio = progress.TotalNeg > 0 ? (double)progress.SampledNeg / progress.TotalNeg : 1;
                var preferNegative = negRatio < posRatio;
                
                // Check if both pools are effectively exhausted
                var posExhausted = posCursors.All(c => c.IsExhausted) || posRatio >= 0.95;
                var negExhausted = negCursors.All(c => c.IsExhausted) || negRatio >= 0.95;
                
                if (posExhausted && negExhausted)
                    break;
                
                // Pick which pool to pull from
                List<CursorState> targetPool;
                if (preferNegative && !negExhausted)
                    targetPool = negCursors;
                else if (!posExhausted)
                    targetPool = posCursors;
                else if (!negExhausted)
                    targetPool = negCursors;
                else
                    break;
                
                // Find an active cursor in the target pool
                var cursor = targetPool.FirstOrDefault(c => !c.IsExhausted && !c.IsRunning);
                if (cursor == null)
                {
                    // All cursors in preferred pool are busy or exhausted, try other pool
                    var otherPool = targetPool == posCursors ? negCursors : posCursors;
                    cursor = otherPool.FirstOrDefault(c => !c.IsExhausted && !c.IsRunning);
                }
                
                if (cursor == null)
                {
                    // All cursors busy, wait a bit
                    await Task.Delay(50, ct);
                    continue;
                }
                
                // Pull a batch from this cursor
                await WaitForCircuit(ct);
                await _throttle.WaitAsync(ct);
                
                try
                {
                    var batchCount = 0;
                    await foreach (var review in cursor.GetItems(ct))
                    {
                        await output.WriteAsync(review, ct);
                        ReportSuccess();
                        batchCount++;
                        
                        if (batchCount >= _config.BatchSize)
                            break; // Re-evaluate priority
                    }
                    
                    if (batchCount == 0)
                        cursor.MarkExhausted();
                }
                catch (OperationCanceledException) { throw; }
                catch (HttpRequestException ex) when (ex.StatusCode is System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.BadGateway or System.Net.HttpStatusCode.TooManyRequests)
                {
                    ReportFailure();
                    _logger.LogWarning("Cursor hit rate limit ({Status}), circuit breaker engaged", ex.StatusCode);
                    cursor.MarkExhausted(); // Don't retry this cursor
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Cursor failed");
                    cursor.MarkExhausted();
                }
                finally
                {
                    _throttle.Release();
                }
            }
        }
        finally
        {
            output.Complete();
            
            // Cleanup
            foreach (var c in allCursors)
                await c.DisposeAsync();
        }
    }

    /// <summary>
    /// Original simple round-robin (kept for compatibility)
    /// </summary>
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

    private class CursorState : IAsyncDisposable
    {
        private readonly IAsyncEnumerable<SteamReview> _source;
        private IAsyncEnumerator<SteamReview>? _enumerator;
        private bool _exhausted;
        private bool _running;
        
        public bool IsPositive { get; }
        public bool IsExhausted => _exhausted;
        public bool IsRunning => _running;

        public CursorState(IAsyncEnumerable<SteamReview> source, bool isPositive)
        {
            _source = source;
            IsPositive = isPositive;
        }

        public async IAsyncEnumerable<SteamReview> GetItems([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
        {
            if (_exhausted) yield break;
            
            _running = true;
            try
            {
                _enumerator ??= _source.GetAsyncEnumerator(ct);
                
                while (await _enumerator.MoveNextAsync())
                {
                    yield return _enumerator.Current;
                }
                
                // If we get here, cursor is done
                _exhausted = true;
            }
            finally
            {
                _running = false;
            }
        }

        public void MarkExhausted() => _exhausted = true;

        public async ValueTask DisposeAsync()
        {
            if (_enumerator != null)
                await _enumerator.DisposeAsync();
        }
    }
}
