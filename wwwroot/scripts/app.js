let currentSnapshot = null;
let currentGameInfo = null;
// Timeline state now managed by Timeline module
let isFirstSnapshot = true;
let snapshotCount = 0;
let currentMetrics = null;
let lastMetrics = null;
let cachedControversyHtml = null;
let isStreaming = true;
let convergenceScore = 0;
let loadingMessageCount = 0;
let tagTimelineData = [];
let tagTimelineCache = { predicted: null, sampled: null };
let numReactions = 0;
let currentBanner = '';
let hasReactedToGame = false;
let metricsWorker = null;

function getMetricsWorker() {
    if (!metricsWorker) {
        metricsWorker = new Worker('scripts/metrics-worker.js');
        metricsWorker.onmessage = (e) => {
            if (e.data.ok) {
                applyMetricsResult(e.data.result);
            }
        };
    }
    return metricsWorker;
}

function applyMetricsResult(metrics) {
    currentMetrics = metrics;
    renderMetrics();
    updateOpinionPanel(currentMetrics);
}

function renderMetrics() {
    const metricsEl = document.getElementById('metrics-detail');
    if (!metricsEl || !currentMetrics) return;
    
    const v = currentMetrics.verdict;
    const opacity = isStreaming ? (0.3 + convergenceScore * 0.7) : 1;
    const tagPills = v.tags.map(t =>
        `<span class="tag-pill" style="background:${t.color}; opacity:${opacity}">${t.id}</span>`
    ).join(' ');
    const loadingMsg = getLoadingMessage();
    const preliminaryWarning = isStreaming && convergenceScore < 0.8
        ? `<div class="loading"><span class="loading-icon">?</span> ${loadingMsg}</div>`
        : isStreaming
            ? `<div class="loading"><span class="loading-icon">??</span> ${loadingMsg}</div>`
            : '';
    metricsEl.innerHTML = `
        <div class="verdict-tags">
            ${tagPills || '<span class="tag-pill" style="background:#666">NEUTRAL</span>'}
        </div>
        <ul class="reasons">
            ${v.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        ${preliminaryWarning}
        <div class="metrics-raw">
            Median ratio: ${currentMetrics.medianRatio.toFixed(2)} |
            Refund honesty: ${currentMetrics.refundNegRate !== null ? Math.round(currentMetrics.refundNegRate * 100) + '%' : 'N/A (F2P)'} |
            Stockholm: ${currentMetrics.stockholmIndex.toFixed(2)}x |
            Confidence: ${Math.round(convergenceScore * 100)}%
        </div>
    `;
    if (cachedControversyHtml) {
        metricsEl.innerHTML += cachedControversyHtml;
    }
}

function quitToDesktop() {
    const msg = exitMessages[Math.floor(Math.random() * exitMessages.length)];
    const keys = Object.keys(expressions);
    const expr = keys[Math.floor(Math.random() * keys.length)];

    setTimeout(() => {
        document.body.innerHTML = `
        <div style="
            position: fixed;
            inset: 0;
            background: #000;
            display: flex;
            align-items: top;
            justify-content: center;
            width: 100%;
            height: 100%;
        ">
            <svg id="eye" style="width: 600px; height: 400px"></svg>
        </div>
    `;
        svg = document.getElementById('eye');
        setPeeved(true, false, false);
        playRandomJingle();
        setTimeout(() => {
            setExpression(expr);
            setPeeved(true, false, false, (Math.random() - 0.5), (Math.random() - 0.5), 4.5);
            state.nextBlink
        }, 100 + Math.random() * 500);
        setTimeout(() => {
            alert(msg);
            location.reload();
        }, 1000 + Math.random() * 400);
    }, Math.random() * 500);
    return false;
}

function getLoadingMessage() {
    const tags = currentMetrics?.verdict?.tags?.map(t => t.id) || [];

    // Always start with neutral pool
    let pool = [...loadingMessages.neutral];

    // Add tag-specific pools
    for (const tag of tags) {
        if (loadingMessages[tag]) {
            pool = pool.concat(loadingMessages[tag]);
        }
    }

    // Some tags share pools
    if (tags.includes('180') || tags.includes('PHOENIX')) {
        pool = pool.concat(loadingMessages.REDEMPTION || []);
    }

    // Filter based on unhinged state
    // ALL CAPS messages only allowed when unhinged
    if (!isUnhinged()) {
        pool = pool.filter(msg => msg !== msg.toUpperCase());
    }

    return pool[Math.floor(Math.random() * pool.length)];
}

document.getElementById('hidePrediction')?.addEventListener('change', () => {
    if (currentSnapshot) {
        Charts.updateChart(currentSnapshot);
        updateMetrics(currentSnapshot);
        // Use cached tag timeline, compute lazily if not cached
        if (Metrics && currentGameInfo) {
            const isFree = currentGameInfo?.isFree || false;
            const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;
            const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
            const cacheKey = hidePrediction ? 'sampled' : 'predicted';
            if (!tagTimelineCache[cacheKey]) {
                tagTimelineCache[cacheKey] = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual, hidePrediction });
            }
            updateTagTimeline(tagTimelineCache[cacheKey]);
        }
        Timeline.draw();
    }
});
document.getElementById('hideSpikes')?.addEventListener('change', () => {
    if (currentSnapshot) {
        Charts.updateChart(currentSnapshot);
        Charts.updateVelocityChart(currentSnapshot);
        Charts.updateLanguageChart(currentSnapshot);
        Charts.updateStats(currentSnapshot);
        Timeline.draw();
    }
});
document.getElementById('hideAnnotations')?.addEventListener('change', () => {
    if (currentSnapshot) Charts.updateChart(currentSnapshot);
});
document.getElementById('showTotalTime')?.addEventListener('change', () => {
    if (currentSnapshot) Charts.updateChart(currentSnapshot);
});

Timeline.init({
    getSnapshot: () => currentSnapshot,
    getMetrics: () => currentMetrics,
    onSelectionChange: applyTimelineFilter
});

Charts.init({
    getSnapshot: () => currentSnapshot,
    getGameInfo: () => currentGameInfo,
    getMetrics: () => currentMetrics,
    getSelectedMonths: () => Timeline.getSelectedMonths(),
    filterBucket: filterBucketByTime,
    isStreaming: () => isStreaming
});

async function analyze() {
    const input = document.getElementById('appId').value;
    const appId = extractAppId(input);
    if (!appId) return alert('Invalid App ID');

    setExpression('neutral');

    // reset state
    cachedControversyHtml = null;
    currentSnapshot = null;
    currentMetrics = null;
    lastMetrics = null;
    convergenceScore = 0;
    loadingMessageCount = 0;
    isFirstSnapshot = true;
    snapshotCount = 0;
    hasReactedToGame = false;
    Timeline.reset();
    tagTimelineData = [];
    tagTimelineCache = { predicted: null, sampled: null };

    // clear UI
    Charts.destroyAll();
    if (heatmapCtx && heatmapCanvas) {
        heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
        heatmapCanvas._layout = null;
    }
    document.getElementById('stats').innerHTML = '';
    document.getElementById('metrics-detail').innerHTML = '';
    document.getElementById('opinion-content').innerHTML = '<div class="opinion-loading">⌛ Analyzing...</div>';
    document.getElementById('game-title').textContent = '';
    Timeline.draw(); // clears the timeline canvas

    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        currentGameInfo = await infoRes.json();
        document.getElementById('game-title').textContent = currentGameInfo.name;
        window.lastAnalyzedApp = currentGameInfo;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/game/${appId}`);

    let metricsTimeout = null;
    
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => {
        isStreaming = true;
        state.lastInteraction = Date.now();
        const snapshot = BinarySnapshot.parse(e.data);
        currentSnapshot = snapshot;
        Charts.updateChart(snapshot);
        Timeline.updateData(snapshot, isFirstSnapshot);
        Charts.updateVelocityChart(snapshot);
        Charts.updateLanguageChart(snapshot);
        updateEditHeatmap(snapshot);
        Charts.updateStats(snapshot);
        
        // Debounce metrics - expensive, only run after 200ms of no new snapshots
        if (metricsTimeout) clearTimeout(metricsTimeout);
        metricsTimeout = setTimeout(() => updateMetrics(snapshot), 200);
        
        isFirstSnapshot = false;
        snapshotCount++;

        if (setLoading) setLoading(true);
    };

    isFirstSnapshot = true;
    ws.onclose = () => {
        isStreaming = false;
        setExpression('neutral');
        
        // Achievement: first analysis
         setAchievementFlag('analyzedGame');

        if (currentSnapshot) {
            const sampled = currentSnapshot.totalPositive + currentSnapshot.totalNegative;
            const gameTotal = currentSnapshot.gameTotalPositive + currentSnapshot.gameTotalNegative;
            const coverage = gameTotal > 0 ? sampled / gameTotal : 1;

            if (coverage > 0.95 || convergenceScore > 0.9) {
                convergenceScore = 1;
            }

            updateMetrics(currentSnapshot);

            // Compute tag timeline after analysis completes (cache predicted version)
            if (Metrics) {
                const isFree = currentGameInfo?.isFree || false;
                const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;
                const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
                const cacheKey = hidePrediction ? 'sampled' : 'predicted';
                if (!tagTimelineCache[cacheKey]) {
                    tagTimelineCache[cacheKey] = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual, hidePrediction });
                }
                Timeline.updateTagData(tagTimelineCache[cacheKey]);
            }
            
            // Fetch controversy context for any detected events
            if (currentMetrics && currentGameInfo) {
                fetchControversyContext(currentGameInfo.name, currentMetrics, currentSnapshot);
            }
        }

        if (setLoading) setLoading(false);
        // Final metrics update triggers eye emotion (only once per analysis)
        if (currentMetrics && !hasReactedToGame) {
            hasReactedToGame = true;
            updateEyeFromMetrics(currentMetrics);
            
            const tags = currentMetrics.verdict?.tags?.map(t => t.id) || [];
            
            // Roll for item drop based on analysis tags
            if (snapshotCount > 1) {
                const item = Items.rollForDrop(tags, currentMetrics);
                if (item) {
                    setTimeout(() => Items.showPedestal(item), 1500);
                }
            }
        }
    };
}

function extractAppId(input) {
    const match = input.match(/app\/(\d+)/) || input.match(/^(\d+)$/);
    return match ? match[1] : null;
}

// Chart functions moved to charts.js

// drawTimeline, updateTimelineLabel, mouse handlers moved to timeline.js

function applyTimelineFilter() {
    if (currentSnapshot) {
        Charts.updateChart(currentSnapshot);
        Charts.updateVelocityChart(currentSnapshot);
        Charts.updateLanguageChart(currentSnapshot);
        updateEditHeatmap(currentSnapshot);
        Charts.updateStats(currentSnapshot);
        updateMetrics(currentSnapshot);
        if (currentMetrics) {
            updateEyeFromMetrics(currentMetrics);
        }
    }
}

function getSelectedMonths() {
    return Timeline.getSelectedMonths();
}

function filterBucketByTime(bucket) {
    const range = getSelectedMonths();
    const hideSpikes = document.getElementById('hideSpikes')?.checked;
    const excludeMonths = hideSpikes && currentMetrics?.excludedMonths ? currentMetrics.excludedMonths : null;

    if (!range && !excludeMonths) return {
        pos: bucket.positiveCount,
        neg: bucket.negativeCount,
        uncPos: bucket.uncertainPositiveCount,
        uncNeg: bucket.uncertainNegativeCount
    };

    // Use typed array fast path
    const filter = {
        from: range?.from,
        to: range?.to,
        excludeMonths
    };
    return BinarySnapshot.filterBucket(bucket, currentSnapshot.months, filter, currentSnapshot.monthIndex);
}

function updateConvergence(current, last, snapshot) {
    const sampled = snapshot.totalPositive + snapshot.totalNegative;
    const gameTotal = snapshot.gameTotalPositive + snapshot.gameTotalNegative;

    // how much of target sample do we have?
    // target is 10% of total, clamped to 5k-20k
    const targetSample = Math.min(20000, Math.max(5000, gameTotal * 0.1));
    const sampleProgress = Math.min(1, sampled / targetSample);

    // fixpoint detection
    if (!last) return sampleProgress * 0.5; // start at half of sample progress

    const medianDrift = Math.abs(current.medianRatio - last.medianRatio);
    const ratioDrift = Math.abs(current.positiveRatio - last.positiveRatio);
    const totalDrift = medianDrift + ratioDrift;

    const isStable = totalDrift < 0.05;

    if (!isStable) {
        // drifting - convergence can't exceed sample progress
        return sampleProgress * 0.5;
    } else {
        // stable - approach sample progress asymptotically
        const target = sampleProgress;
        return convergenceScore + (target - convergenceScore) * 0.1;
    }
}

function updateMetrics(snapshot) {
    if (!Metrics) return;

    const filter = getSelectedMonths();
    const isFree = currentGameInfo?.isFree || false;
    const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;

    convergenceScore = updateConvergence(currentMetrics, lastMetrics, currentSnapshot);
    lastMetrics = currentMetrics;

    const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
    const options = { timelineFilter: filter, isFree, isSexual, convergenceScore, hidePrediction };
    
    // Offload to worker
    const worker = getMetricsWorker();
    worker.postMessage({ snapshot, options });
}
function updateOpinionPanel(metrics) {
    const el = document.getElementById('opinion-content');
    if (!el || !metrics) return;

    // Don't render verdict until converged
    if (isStreaming && convergenceScore < 0.8) {
        const sampled = currentSnapshot.totalPositive + currentSnapshot.totalNegative;
        const target = currentSnapshot.targetSampleCount;
        const pct = Math.round(convergenceScore * 100);
        const progressPct = target > 0 ? Math.round((sampled / target) * 100) : 0;
        el.innerHTML = `
            <div class="opinion-converging">
                <div class="opinion-verdict caution">? Analysis in progress...</div>
                <p>The data is still converging. Early patterns are forming but the verdict isn't stable yet.</p>
                <p><strong>Progress:</strong> ${sampled.toLocaleString()} / ${target.toLocaleString()} reviews (${progressPct}%)</p>
                <p><strong>Confidence:</strong> ${pct}%${pct == 69 ? " (nice)" : ""}</p>
                <p class="opinion-hint">Once the tags settle, we'll have something to say.</p>
            </div>
        `;
        return;
    }

    const tags = metrics.verdict.tags.map(t => t.id);
    const posMedianHours = Math.round(metrics.posMedianReview / 60);
    const negMedianHours = Math.round(metrics.negMedianReview / 60);
    const positivePct = Math.round(metrics.positiveRatio * 100);
    const negativePct = Math.round(metrics.negativeRatio * 100);

    // Determine overall verdict class and message
    let verdictClass = 'caution';
    let verdictText = 'Proceed with awareness';
    let verdictExplain = '';

    if (tags.includes('PREDATORY') || tags.includes('REFUND_TRAP')) {
        verdictClass = 'warning';
        verdictText = 'High risk of regret';
        verdictExplain = `This game shows patterns associated with buyer's remorse. ${negativePct}% of reviews are negative, and they come after significant time investment.`;
    } else if (tags.includes('EXTRACTIVE') || tags.includes('STOCKHOLM')) {
        verdictClass = 'warning';
        verdictText = 'Time extraction detected';
        verdictExplain = `People who dislike this game figure it out at ${negMedianHours}h�after those who like it (${posMedianHours}h). The game takes before it reveals.`;
    } else if (tags.includes('HEALTHY') || tags.includes('HONEST')) {
        verdictClass = 'healthy';
        verdictText = 'Respects your time';
        verdictExplain = `${positivePct}% positive. People who won't like it figure that out by ${negMedianHours}h. The game is honest about what it is.`;
    } else if (tags.includes('FLOP')) {
        verdictClass = 'warning';
        verdictText = 'Most people bounce';
        verdictExplain = `${negativePct}% negative reviews, and they knew fast (${negMedianHours}h median). This might not be for you either.`;
    } else if (tags.includes('DIVISIVE')) {
        verdictClass = 'caution';
        verdictText = 'Love it or hate it';
        verdictExplain = `Near 50/50 split. Some people adore this, others don't. Worth researching if it's your kind of thing.`;
    } else if (tags.includes('REDEMPTION') || tags.includes('180') || tags.includes('PHOENIX')) {
        verdictClass = 'healthy';
        verdictText = 'Redemption arc';
        verdictExplain = `This game improved over time. Earlier reviews may not reflect current state. Recent sentiment is more positive.`;
    } else if (tags.includes('ENSHITTIFIED') || tags.includes('HONEYMOON')) {
        verdictClass = 'caution';
        verdictText = 'Getting worse';
        verdictExplain = `Sentiment has declined over time. What you read in old reviews may not match current experience.`;
    }

    // Build the time commitment section
    let timeCommitment = '';
    if (negMedianHours < 10) {
        timeCommitment = `<strong>Quick read:</strong> You'll know if it's for you within ${negMedianHours} hours.`;
    } else if (negMedianHours < 50) {
        timeCommitment = `<strong>Medium investment:</strong> Expect to put in ${negMedianHours}+ hours before you really know.`;
    } else if (negMedianHours < 200) {
        timeCommitment = `<strong>Significant commitment:</strong> People who dislike it played ${negMedianHours} hours first. That's a lot of time to risk.`;
    } else {
        timeCommitment = `<strong>Lifestyle game:</strong> ${negMedianHours} hours before people decided they didn't like it. This isn't a game, it's a relationship.`;
    }

    // Stockholm warning
    let stockholmWarning = '';
    if (metrics.stockholmIndex > 1.5 && negMedianHours > 100) {
        const extraHours = Math.round((metrics.negMedianTotal - metrics.negMedianReview) / 60);
        stockholmWarning = `
            <div class="opinion-tldr" style="border-left-color: var(--color-negative);">
                <strong>Stockholm alert:</strong> People who left negative reviews played ${extraHours} MORE hours after saying they hated it. 
                The game is designed to keep you playing even when you're not having fun.
            </div>
        `;
    }

    el.innerHTML = `
        <div class="opinion-verdict ${verdictClass}">${verdictText}</div>
        <p>${verdictExplain}</p>
        <p>${timeCommitment}</p>
        ${stockholmWarning}
        <div class="opinion-tldr">
            <strong>TL;DR:</strong> 
            ${positivePct}% positive at ${posMedianHours}h, 
            ${negativePct}% negative at ${negMedianHours}h.
            ${metrics.medianRatio > 1.3 ? 'Red flag: negatives take longer to form.' :
            metrics.medianRatio < 0.7 ? 'Good sign: negatives bounce early.' :
                'Neutral: similar time to verdict either way.'}
        </div>
    `;
}

function updateTagTimeline(timeline) {
    tagTimelineData = timeline;
    Timeline.updateTagData(timeline);
}

function updateEyeFromMetrics(metrics) {
    const tags = metrics.verdict.tags.map(t => t.id);

    let targetExpr = 'neutral';
    let emoteDuration = Infinity;

    const isBullshit = tags.includes('PREDATORY') || tags.includes('REFUND_TRAP');
    const isDisrespectful = tags.includes('EXTRACTIVE') || tags.includes('STOCKHOLM');
    const isGood = tags.includes('HEALTHY') || tags.includes('HONEST');
    const isLewd = tags.includes('HORNY');
    const isDead = tags.includes('DEAD');
    const isDeadLmao = isDead && (isBullshit | isDisrespectful);
    // Priority-based expression
    if (isDeadLmao) {
        targetExpr = 'mocking';
        emoteDuration = 2500;
    } else if (isLewd) {
        setAchievementFlag('baka', true);
        targetExpr = 'flustered';
        emoteDuration = Infinity;
    } else if (isDead) {
        targetExpr = 'sad';
        emoteDuration = 60000;
    } else if (isBullshit) {
        targetExpr = 'angry';
        emoteDuration = 6000;
    } else if (isDisrespectful) {
        targetExpr = 'disappointed';
        emoteDuration = 4000;
    }  else if (isGood) {
        targetExpr = 'neutral';
    }
    const reaction = numReactions++;
    state.lastReaction = reaction;
    setExpression(targetExpr);

    // Pupil dilation for addictive games
    setDilation(tags.includes('ADDICTIVE') ? 1 : 0);

    // Unhinged mode for really bad games
    const unhingedTags = ['PREDATORY', 'ENSHITTIFIED', 'PLAGUE', 'CURSED', 'FLOP'];
    setUnhinged(unhingedTags.some(t => tags.includes(t)));

    if (emoteDuration != Infinity) {
        setTimeout(() => {
            if (state.lastReaction == reaction) {
                setExpression('neutral');
            }
        }, emoteDuration);
    }
}

function filterVelocityBucketByTime(bucket) {
    // Velocity buckets use same structure as histogram buckets
    return filterBucketByTime(bucket);
}

// ============================================================
// EDIT HEATMAP
// X = when posted, Y = when edited, color = sentiment
// ============================================================

let heatmapCanvas = null;
let heatmapCtx = null;

function initHeatmap() {
    heatmapCanvas = document.getElementById('edit-heatmap');
    if (!heatmapCanvas) return;
    heatmapCtx = heatmapCanvas.getContext('2d');
    
    // Handle mouse hover for tooltip
    heatmapCanvas.addEventListener('mousemove', onHeatmapMouseMove);
    heatmapCanvas.addEventListener('mouseleave', () => {
        document.getElementById('heatmap-tooltip').style.display = 'none';
    });
}

function updateEditHeatmap(snapshot) {
    if (!heatmapCanvas) {
        initHeatmap();
        if (!heatmapCanvas) return;
    }
    
    if (!snapshot.editHeatmap) {
        return;
    }
    
    const heatmap = snapshot.editHeatmap;
    let months = heatmap.months || [];
    let cells = heatmap.cells || {};
    
    // Apply timeline filter
    const range = getSelectedMonths();
    if (range) {
        // Filter months to only those in range
        months = months.filter(m => m >= range.from && m <= range.to);
        
        // Filter cells to only those where both posted and edited are in range
        const filteredCells = {};
        for (const [key, cell] of Object.entries(cells)) {
            const [postedMonth, editedMonth] = key.split('|');
            if (postedMonth >= range.from && postedMonth <= range.to &&
                editedMonth >= range.from && editedMonth <= range.to) {
                filteredCells[key] = cell;
            }
        }
        cells = filteredCells;
    }
    
    // If too many months, aggregate to quarters or years
    if (months.length > 96) {
        // >8 years: aggregate to years
        const aggregated = aggregateToYears(months, cells);
        months = aggregated.periods;
        cells = aggregated.cells;
    } else if (months.length > 48) {
        // >4 years: aggregate to quarters
        const aggregated = aggregateToQuarters(months, cells);
        months = aggregated.periods;
        cells = aggregated.cells;
    }
    
    if (months.length < 2) {
        // Not enough data
        heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
        heatmapCtx.fillStyle = isDarkMode() ? '#666' : '#999';
        heatmapCtx.font = '12px Verdana';
        heatmapCtx.textAlign = 'center';
        heatmapCtx.fillText('Not enough edit data', heatmapCanvas.width / 2, heatmapCanvas.height / 2);
        return;
    }
    
    // Resize canvas to container
    const rect = heatmapCanvas.parentElement.getBoundingClientRect();
    heatmapCanvas.width = rect.width - 20;
    heatmapCanvas.height = rect.height - 20;
    
    const w = heatmapCanvas.width;
    const h = heatmapCanvas.height;
    const padding = { left: 50, right: 10, top: 10, bottom: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    const n = months.length;
    const cellW = chartW / n;
    const cellH = chartH / n;
    
    // Find max count for color scaling
    let maxCount = 1;
    for (const cell of Object.values(cells)) {
        maxCount = Math.max(maxCount, cell.positive + cell.negative);
    }
    
    // Store layout for tooltip
    heatmapCanvas._layout = { months, cells, padding, cellW, cellH, n };
    
    // Clear
    heatmapCtx.clearRect(0, 0, w, h);
    
    // Draw cells
    for (let xi = 0; xi < n; xi++) {
        for (let yi = 0; yi < n; yi++) {
            const postedMonth = months[xi];
            const editedMonth = months[yi];
            
            // Only show cells where edit is after post
            if (editedMonth < postedMonth) continue;
            
            const key = `${postedMonth}|${editedMonth}`;
            const cell = cells[key];
            
            const x = padding.left + xi * cellW;
            const y = padding.top + (n - 1 - yi) * cellH; // flip Y so newer edits are at top
            
            if (cell) {
                const total = cell.positive + cell.negative;
                const intensity = Math.sqrt(total / maxCount); // sqrt for better visual scaling
                const negRatio = total > 0 ? cell.negative / total : 0;
                
                // Color: blend between positive (blue) and negative (pink) based on ratio
                const colors = getColors();
                const color = negRatio > 0.5 
                    ? hexToRgba(colors.negative, 0.3 + intensity * 0.7)
                    : hexToRgba(colors.positive, 0.3 + intensity * 0.7);
                
                heatmapCtx.fillStyle = color;
            } else {
                // Empty cell on diagonal or above - light gray
                heatmapCtx.fillStyle = postedMonth === editedMonth ? 'rgba(100,100,100,0.1)' : 'rgba(0,0,0,0.02)';
            }
            
            heatmapCtx.fillRect(x, y, cellW - 1, cellH - 1);
        }
    }
    
    // Draw diagonal line (same month = no real edit)
    heatmapCtx.strokeStyle = 'rgba(0,0,0,0.2)';
    heatmapCtx.setLineDash([2, 2]);
    heatmapCtx.beginPath();
    heatmapCtx.moveTo(padding.left, padding.top + chartH);
    heatmapCtx.lineTo(padding.left + chartW, padding.top);
    heatmapCtx.stroke();
    heatmapCtx.setLineDash([]);
    
    // X axis labels (posted month) - show every Nth
    heatmapCtx.fillStyle = isDarkMode() ? '#888' : '#666';
    heatmapCtx.font = '9px Verdana';
    heatmapCtx.textAlign = 'center';
    const labelStep = Math.ceil(n / 10);
    for (let i = 0; i < n; i += labelStep) {
        const x = padding.left + i * cellW + cellW / 2;
        heatmapCtx.fillText(months[i], x, h - padding.bottom + 15);
    }
    
    // Y axis labels (edited month)
    heatmapCtx.textAlign = 'right';
    for (let i = 0; i < n; i += labelStep) {
        const y = padding.top + (n - 1 - i) * cellH + cellH / 2 + 3;
        heatmapCtx.fillText(months[i], padding.left - 5, y);
    }
    
    // Axis titles
    heatmapCtx.fillStyle = isDarkMode() ? '#aaa' : '#333';
    heatmapCtx.font = '10px Verdana';
    heatmapCtx.textAlign = 'center';
    heatmapCtx.fillText('Posted', padding.left + chartW / 2, h - 5);
    
    heatmapCtx.save();
    heatmapCtx.translate(12, padding.top + chartH / 2);
    heatmapCtx.rotate(-Math.PI / 2);
    heatmapCtx.fillText('Edited', 0, 0);
    heatmapCtx.restore();
}

function onHeatmapMouseMove(e) {
    const layout = heatmapCanvas._layout;
    if (!layout) return;
    
    const rect = heatmapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { months, cells, padding, cellW, cellH, n } = layout;
    
    // Convert to cell indices
    const xi = Math.floor((x - padding.left) / cellW);
    const yi = n - 1 - Math.floor((y - padding.top) / cellH); // flip Y back
    
    if (xi < 0 || xi >= n || yi < 0 || yi >= n) {
        document.getElementById('heatmap-tooltip').style.display = 'none';
        return;
    }
    
    const postedMonth = months[xi];
    const editedMonth = months[yi];
    
    if (editedMonth < postedMonth) {
        document.getElementById('heatmap-tooltip').style.display = 'none';
        return;
    }
    
    const key = `${postedMonth}|${editedMonth}`;
    const cell = cells[key];
    
    const tooltip = document.getElementById('heatmap-tooltip');
    if (cell && (cell.positive > 0 || cell.negative > 0)) {
        const total = cell.positive + cell.negative;
        // Handle months (2023-01), quarters (2023-Q1), and years (2023)
        const isQuarter = postedMonth.includes('Q');
        const isYear = postedMonth.length === 4;
        let timeLater = '';
        if (isYear) {
            const yDiff = parseInt(editedMonth) - parseInt(postedMonth);
            timeLater = yDiff > 0 ? `(${yDiff}y later)` : '';
        } else if (isQuarter) {
            const pq = parseInt(postedMonth.split('Q')[1]) + (parseInt(postedMonth.split('-')[0]) * 4);
            const eq = parseInt(editedMonth.split('Q')[1]) + (parseInt(editedMonth.split('-')[0]) * 4);
            const qDiff = eq - pq;
            timeLater = qDiff > 0 ? `(${qDiff}q later)` : '';
        } else {
            const monthsLater = monthDiff(postedMonth, editedMonth);
            timeLater = `(${monthsLater}mo later)`;
        }
        tooltip.innerHTML = `
            <strong>Posted:</strong> ${postedMonth}<br>
            <strong>Edited:</strong> ${editedMonth} ${timeLater}<br>
            <strong>Positive:</strong> ${cell.positive}<br>
            <strong>Negative:</strong> ${cell.negative}
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = (x + 15) + 'px';
        tooltip.style.top = (y + 15) + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

function monthDiff(m1, m2) {
    const [y1, mo1] = m1.split('-').map(Number);
    const [y2, mo2] = m2.split('-').map(Number);
    return (y2 - y1) * 12 + (mo2 - mo1);
}

/**
 * Convert month to quarter string (e.g., "2023-01" -> "2023-Q1")
 */
function monthToQuarter(month) {
    const [year, mo] = month.split('-');
    const q = Math.ceil(parseInt(mo) / 3);
    return `${year}-Q${q}`;
}

/**
 * Aggregate monthly heatmap data to years
 */
function aggregateToYears(months, cells) {
    const yearSet = new Set();
    const newCells = {};
    
    // First pass: collect all years
    for (const month of months) {
        yearSet.add(month.split('-')[0]);
    }
    
    // Second pass: aggregate cells
    for (const [key, cell] of Object.entries(cells)) {
        const [postedMonth, editedMonth] = key.split('|');
        const postedY = postedMonth.split('-')[0];
        const editedY = editedMonth.split('-')[0];
        const newKey = `${postedY}|${editedY}`;
        
        if (!newCells[newKey]) {
            newCells[newKey] = { positive: 0, negative: 0 };
        }
        newCells[newKey].positive += cell.positive;
        newCells[newKey].negative += cell.negative;
    }
    
    const periods = [...yearSet].sort();
    return { periods, cells: newCells };
}

/**
 * Aggregate monthly heatmap data to quarters
 */
function aggregateToQuarters(months, cells) {
    const quarterSet = new Set();
    const newCells = {};
    
    // First pass: collect all quarters
    for (const month of months) {
        quarterSet.add(monthToQuarter(month));
    }
    
    // Second pass: aggregate cells
    for (const [key, cell] of Object.entries(cells)) {
        const [postedMonth, editedMonth] = key.split('|');
        const postedQ = monthToQuarter(postedMonth);
        const editedQ = monthToQuarter(editedMonth);
        const newKey = `${postedQ}|${editedQ}`;
        
        if (!newCells[newKey]) {
            newCells[newKey] = { positive: 0, negative: 0 };
        }
        newCells[newKey].positive += cell.positive;
        newCells[newKey].negative += cell.negative;
    }
    
    const periods = [...quarterSet].sort();
    return { periods, cells: newCells };
}

// Initialize heatmap on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeatmap);
} else {
    initHeatmap();
}

// ============================================================
// CONTROVERSY CONTEXT
// Fetch Google AI Overview for detected events
// ============================================================

async function fetchControversyContext(gameName, metrics, snapshot) {
    const events = detectNotableEvents(metrics, snapshot);
    
    // Show status in the controversy section
    const container = document.getElementById('metrics-detail');
    if (container) {
        container.innerHTML += `
            <div class="controversy-section" id="controversy-loading">
                <h4>?? What Happened?</h4>
                <div class="controversy-item">
                    <div class="controversy-text">?? Searching for context...</div>
                </div>
            </div>
        `;
    }
    
    // Fetch context for events + launch (limit to 4 total)

    const allEvents = events.slice(0, 4);
    const months = allEvents.map(e => e.month).join(',');
    const types = allEvents.map(e => e.type).join(',');
    const res = await fetch(`/controversies?game=${encodeURIComponent(gameName)}&months=${months}&types=${types}`);
    // In fetchControversyContext, map the response
    const data = await res.json();
    const contexts = data
        .filter(d => d.overview)
        .map(d => ({
            event: allEvents.find(e => e.month === d.month) || { type: 'unknown', month: d.month, year: d.month.split('-')[0] },
            overview: d.overview
        }));
    
    // Remove loading indicator
    document.getElementById('controversy-loading')?.remove();
    
    if (contexts.length > 0) {
        displayControversyContext(contexts);
    }
}

function detectNotableEvents(metrics, snapshot) {
    const events = [];
    const tags = metrics.verdict.tags.map(t => t.id);

    // Launch is always notable
    // Check first few months of timeline for sentiment
    const months = Object.keys(metrics.counts).length > 0 ? [] : [];
    let launchWasNegative = false;

    // Get first 3 months of data to determine launch sentiment (typed array format)
    const sortedMonths = snapshot.months || [];
    const monthlyTotals = snapshot.monthlyTotals;
    const launchMonthCount = Math.min(3, sortedMonths.length);

    if (launchMonthCount > 0 && monthlyTotals) {
        let launchPos = 0, launchNeg = 0;
        for (let i = 0; i < launchMonthCount; i++) {
            launchPos += (monthlyTotals.pos[i] || 0) + (monthlyTotals.uncPos[i] || 0);
            launchNeg += (monthlyTotals.neg[i] || 0) + (monthlyTotals.uncNeg[i] || 0);
        }
        launchWasNegative = launchNeg > launchPos;
    }

    events.push({
        type: launchWasNegative ? (tags.includes('FLOP') ? 'launch_flop' : 'launch_troubled') : 'launch',
        month: sortedMonths[0],
        year: sortedMonths[0] || '',
        severity: 0,
        tag: launchWasNegative ? (tags.includes('FLOP') ? 'FLOP' : 'LAUNCH') : 'LAUNCH'
    });

    // Review bombs
    if (tags.includes('REVIEW_BOMBED') && metrics.negativeSpikes) {
        for (const spike of metrics.negativeSpikes) {
            const hasVolume = spike.isVolumeSpike && spike.count >= 50;
            const hasSentiment = spike.isSentimentSpike && spike.sentimentZ >= 2;
            if (hasVolume || hasSentiment) {
                const year = spike.month.split('-')[0];
                const severity = Math.max(spike.volumeZ || 0, spike.sentimentZ || 0);
                events.push({
                    type: 'review_bomb',
                    year,
                    month: spike.month,
                    severity,
                    count: spike.count,
                    tag: 'REVIEW_BOMBED'
                });
            }
        }
    }

    // DEAD GAME
    if (tags.includes('DEAD') || tags.includes('ZOMBIE') || tags.includes('PRESS_F') || tags.includes('RUGPULL') || tags.includes('CURSED') || tags.includes('HOPELESS')) {
        // Find when activity dropped off - reuse the same logic as computeWindowEndActivity
        const activityData = Metrics.getMonthlyActivityData(snapshot.bucketsByReviewTime, null);
        const activity = activityData.activity;

        if (activity.length >= 6) {
            // Find last month before activity dropped to <20% of first half average
            const firstHalfCount = Math.floor(activity.length / 2);
            const firstHalf = activity.slice(0, firstHalfCount);
            const avgActivity = firstHalf.reduce((sum, m) => sum + m.count, 0) / firstHalf.length;
            const threshold = avgActivity * 0.2;

            // Walk backwards to find last "alive" month
            let deathMonth = null;
            for (let i = activity.length - 1; i >= 0; i--) {
                if (activity[i].count >= threshold) {
                    deathMonth = activity[i].month;
                    break;
                }
            }

            if (deathMonth) {
                const year = deathMonth.split('-')[0];
                events.push({
                    type: 'death',
                    year,
                    month: deathMonth,
                    severity: 2,
                    tag: tags.find(t => ['DEAD', 'ZOMBIE', 'PRESS_F', 'RUGPULL', 'CURSED', 'HOPELESS'].includes(t))
                });
            }
        }
    }

    // Mass edit events
    if (tags.includes('RETCONNED') || tags.includes('ENSHITTIFIED')) {
        const editHeatmap = snapshot.editHeatmap;
        if (editHeatmap?.months?.length > 0) {
            // Count edits by month (when edited, not when posted)
            const editsByMonth = {};
            for (const [key, cell] of Object.entries(editHeatmap.cells || {})) {
                const [posted, edited] = key.split('|');
                if (edited !== posted) {
                    editsByMonth[edited] = (editsByMonth[edited] || 0) + cell.positive + cell.negative;
                }
            }

            const sortedMonths = Object.keys(editsByMonth).sort();
            if (sortedMonths.length > 0) {
                // Find largest contiguous period above threshold
                const avgEdits = Object.values(editsByMonth).reduce((a, b) => a + b, 0) / sortedMonths.length;
                const threshold = avgEdits * 0.5;  // At least half of average

                let bestStart = null, bestEnd = null, bestSum = 0;
                let currStart = null, currSum = 0;

                for (let i = 0; i < sortedMonths.length; i++) {
                    const month = sortedMonths[i];
                    const count = editsByMonth[month];

                    if (count >= threshold) {
                        if (currStart === null) currStart = month;
                        currSum += count;

                        // Check if contiguous (next month follows)
                        const nextMonth = sortedMonths[i + 1];
                        const isContiguous = nextMonth && isNextMonth(month, nextMonth);

                        if (!isContiguous || i === sortedMonths.length - 1) {
                            // End of run
                            if (currSum > bestSum) {
                                bestStart = currStart;
                                bestEnd = month;
                                bestSum = currSum;
                            }
                            currStart = null;
                            currSum = 0;
                        }
                    } else {
                        if (currSum > bestSum) {
                            bestStart = currStart;
                            bestEnd = sortedMonths[i - 1];
                            bestSum = currSum;
                        }
                        currStart = null;
                        currSum = 0;
                    }
                }
                if (bestStart && bestEnd) {
                    const periodStr = bestStart === bestEnd
                        ? bestStart
                        : `${bestStart} to ${bestEnd}`;
                    events.push({
                        type: 'mass_edits',
                        year: periodStr,
                        month: periodStr,
                        severity: metrics.recentNegativeEditRatio,
                        tag: tags.includes('RETCONNED') ? 'RETCONNED' : 'ENSHITTIFIED'
                    });
                }
            }
        }
    }

    // Dedupe by year - only keep most severe event per year
    const byYear = {};
    for (const event of events) {
        if (!byYear[event.year] || event.severity > byYear[event.year].severity) {
            byYear[event.year] = event;
        }
    }

    return Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
}

function isNextMonth(m1, m2) {
    const [y1, mo1] = m1.split('-').map(Number);
    const [y2, mo2] = m2.split('-').map(Number);
    if (mo1 === 12) {
        return y2 === y1 + 1 && mo2 === 1;
    }
    return y2 === y1 && mo2 === mo1 + 1;
}
function displayControversyContext(contexts) {
    const container = document.getElementById('metrics-detail');
    if (!container) return;

    let html = '<div class="controversy-section">';
    html += '<h4>?? What Happened?</h4>';

    for (const ctx of contexts) {
        const tag = ctx.event.tag;
        const tagClass = tag ? tag.toLowerCase().replace(/_/g, '-') : 'launch';
        const yearLabel = ctx.event.year;

        html += `
            <details class="controversy-item">
                <summary>
                    <span class="tag-pill" style="background: var(--color-tag-${tagClass})">${tag || 'LAUNCH'}</span>
                    <span class="controversy-year">${yearLabel}</span>
                </summary>
                <div class="controversy-text">${ctx.overview}</div>
            </details>
        `;
    }

    html += '</div>';
    container.innerHTML += html;
    cachedControversyHtml = html;
}



function flashChessboard() {
    // Play the screenshot sound
    playScreenshotSound();

    // Achievement: Eye of the Beholder
    setAchievementFlag('triedScreenshot');

    const overlay = document.createElement('div');
    overlay.className = 'screenshot-blocker';

    // Generate chessboard pattern
    const size = 64; // px per square
    let html = '<div class="chessboard">';
    const cols = Math.ceil(window.innerWidth / size) + 1;
    const rows = Math.ceil(window.innerHeight / size) + 1;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const isMagenta = (x + y) % 2 === 0;
            html += `<div class="chess-square" style="
                left: ${x * size}px;
                top: ${y * size}px;
                width: ${size}px;
                height: ${size}px;
                background: ${isMagenta ? '#ff00ff' : '#000000'};
            "></div>`;
        }
    }
    html += '</div>';
    overlay.innerHTML = html;

    document.body.appendChild(overlay);

    // Remove after a brief flash
    setTimeout(() => overlay.remove(), 150);
}

// Update legend on load and expose for color changes
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateColorLegend);
} else {
    updateColorLegend();
}


document.addEventListener('click', onPageClick);

// Press F to pay respects
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't trigger if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Check if current game has DEAD or PRESS_F tag
        const tags = currentMetrics?.verdict?.tags?.map(t => t.id) || [];
        if (tags.includes('DEAD') || tags.includes('PRESS_F')) {
            setAchievementFlag('paidRespects');
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        flashChessboard();
    }
});


// Init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        Eye.load();
        Items.loadInventory();
        Combat.init();
    });
} else {
    Eye.load();
    Items.loadInventory();
    Combat.init();
}