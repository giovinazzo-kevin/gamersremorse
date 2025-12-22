let currentSnapshot = null;
let currentGameInfo = null;
// Timeline state now managed by Timeline module
let isFirstSnapshot = true;
let snapshotCount = 0;
let currentMetrics = null;
let lastMetrics = null;
// cachedControversyHtml moved to Controversy module
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
    const cachedControversyHtml = Controversy.getCachedHtml();
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

Heatmap.init({
    getSnapshot: () => currentSnapshot,
    getSelectedMonths: () => Timeline.getSelectedMonths()
});

async function analyze() {
    const input = document.getElementById('appId').value;
    const appId = extractAppId(input);
    if (!appId) return alert('Invalid App ID');

    setExpression('neutral');

    // reset state
    Controversy.clearCache();
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
        Heatmap.update(snapshot);
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
                Controversy.fetchContext(currentGameInfo.name, currentMetrics, currentSnapshot);
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
        Heatmap.update(currentSnapshot);
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





// Controversy functions moved to controversy.js



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