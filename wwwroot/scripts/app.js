let currentSocket = null;
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
let metricsWorker = null;
let metricsTimeoutId = null;
let controversyFetched = false;

// Shared WebSocket message handler
function handleSnapshotMessage(e, metricsTimeoutRef) {
    if (!document.getElementById('chart')) return;
    if (metricsTimeoutId) clearTimeout(metricsTimeoutId);
    metricsTimeoutId = setTimeout(() => updateMetrics(snapshot), 200);

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
    
    if (metricsTimeoutRef.id) clearTimeout(metricsTimeoutRef.id);
    metricsTimeoutRef.id = setTimeout(() => updateMetrics(snapshot), 200);
    
    isFirstSnapshot = false;
    snapshotCount++;
    if (setLoading) setLoading(true);
}

// Shared WebSocket close handler
function handleAnalysisComplete() {
    isStreaming = false;
    setExpression('neutral');

    if (currentSnapshot) {
        // Cache tag timelines
        if (Metrics) {
            const isFree = currentGameInfo?.isFree || false;
            const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;
            tagTimelineCache.predicted = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual, hidePrediction: false });
            tagTimelineCache.sampled = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual, hidePrediction: true });

            const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
            Timeline.updateTagData(tagTimelineCache[hidePrediction ? 'sampled' : 'predicted']);
        }

        // Trigger final metrics computation (worker will call applyMetricsResult)
        updateMetrics(currentSnapshot);
    }

    if (setLoading) setLoading(false);
}

// Create WebSocket with shared handlers
function createGameSocket(appId) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/game/${appId}`);
    const metricsTimeoutRef = { id: null };
    
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => handleSnapshotMessage(e, metricsTimeoutRef);
    ws.onclose = handleAnalysisComplete;
    
    return ws;
}
async function fetchSimilarGames(appId) {
    const container = document.getElementById('similar-games');
    const thumbs = container.querySelector('.similar-thumbnails');

    try {
        const res = await fetch(`/wall/similar/${appId}?limit=6`);
        if (!res.ok) {
            container.style.display = 'none';
            return;
        }

        const games = await res.json();
        if (!games.length) {
            container.style.display = 'none';
            return;
        }

        thumbs.innerHTML = games.map(g => `
            <div class="similar-thumb" onclick="analyzeSimilar('${g.appId}')" title="${g.name}">
                <img src="${g.headerImage}" alt="${g.name}" loading="lazy">
                <div class="similar-name">${g.name}</div>
            </div>
        `).join('');

        container.style.display = 'flex';
    } catch (e) {
        container.style.display = 'none';
    }
}

function analyzeSimilar(appId) {
    document.getElementById('appId').value = appId;
    analyze();
}
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
    Opinion.update(currentMetrics);

    // End-of-analysis: needs both final snapshot AND metrics ready
    if (currentSnapshot?.isFinal) {
        if (currentGameInfo?.appId) {
            fetchSimilarGames(currentGameInfo.appId);
        }
        if (!controversyFetched) {
            controversyFetched = true;
            setAchievementFlag('analyzedGame');
            updateEyeFromMetrics(currentMetrics);

            const tags = currentMetrics.verdict?.tags?.map(t => t.id) || [];
            if (snapshotCount > 1) {
                const item = Items.rollForDrop(tags, currentMetrics);
                if (item) {
                    setTimeout(() => Items.showPedestal(item), 1500);
                }
            }

            if (currentGameInfo?.appId) {
                Controversy.fetchContext(currentGameInfo.appId, currentMetrics, currentSnapshot);
            }
        }
    }
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

// Checkbox state for restoration across navigation
let checkboxState = {
    hidePrediction: false,
    hideSpikes: false,
    hideAnnotations: false,
    showTotalTime: false
};

function saveCheckboxState() {
    checkboxState.hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
    checkboxState.hideSpikes = document.getElementById('hideSpikes')?.checked ?? false;
    checkboxState.hideAnnotations = document.getElementById('hideAnnotations')?.checked ?? false;
    checkboxState.showTotalTime = document.getElementById('showTotalTime')?.checked ?? false;
}

function restoreCheckboxState() {
    const hp = document.getElementById('hidePrediction');
    const hs = document.getElementById('hideSpikes');
    const ha = document.getElementById('hideAnnotations');
    const st = document.getElementById('showTotalTime');
    if (hp) hp.checked = checkboxState.hidePrediction;
    if (hs) hs.checked = checkboxState.hideSpikes;
    if (ha) ha.checked = checkboxState.hideAnnotations;
    if (st) st.checked = checkboxState.showTotalTime;
}

// Module initialization moved to init_play() for SPA navigation support

function init_play() {
    // Destroy old chart instances before re-init
    if (typeof Charts !== 'undefined' && Charts.destroyAll) {
        Charts.destroyAll();
    }

    // Re-init modules with fresh DOM
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

    Opinion.init({
        isStreaming: () => isStreaming,
        getConvergenceScore: () => convergenceScore,
        getSnapshot: () => currentSnapshot
    });

    updateColorLegend();

    // Bind checkbox listeners (fresh DOM elements)
    document.getElementById('hidePrediction')?.addEventListener('change', () => {
        if (currentSnapshot) {
            Charts.updateChart(currentSnapshot);
            updateMetrics(currentSnapshot);
            const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
            const cacheKey = hidePrediction ? 'sampled' : 'predicted';
            if (tagTimelineCache[cacheKey]) {
                Timeline.updateTagData(tagTimelineCache[cacheKey]);
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

    // Restore state if we had a game loaded
    if (currentSnapshot && currentGameInfo) {
        // Restore checkbox state first (before redrawing)
        restoreCheckboxState();
        
        document.getElementById('game-title').textContent = currentGameInfo.name;
        document.getElementById('appId').value = currentGameInfo.appId || '';
        
        // Redraw everything from cached state
        Charts.updateChart(currentSnapshot);
        Timeline.updateData(currentSnapshot, true);
        Charts.updateVelocityChart(currentSnapshot);
        Charts.updateLanguageChart(currentSnapshot);
        Heatmap.update(currentSnapshot);
        Charts.updateStats(currentSnapshot);
        
        if (currentMetrics) {
            renderMetrics();
            Opinion.update(currentMetrics);
            
            // Restore tag timeline
            const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
            const cacheKey = hidePrediction ? 'sampled' : 'predicted';
            if (tagTimelineCache[cacheKey]) {
                Timeline.updateTagData(tagTimelineCache[cacheKey]);
            }
        }
        
        Timeline.draw();
        
        // Reconnect WebSocket to resume streaming
        const appId = currentGameInfo.appId;
        if (appId) {
            currentSocket = createGameSocket(appId);
        }
    }
}

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
    controversyFetched = false;
    Timeline.reset();
    tagTimelineData = [];
    tagTimelineCache = { predicted: null, sampled: null };
    if (metricsTimeoutId) {
        clearTimeout(metricsTimeoutId);
        metricsTimeoutId = null;
    }
    // clear UI
    Charts.destroyAll();

    document.getElementById('stats').innerHTML = '';
    document.getElementById('metrics-detail').innerHTML = '';
    document.getElementById('opinion-content').innerHTML = '<div class="opinion-loading">⌛ Analyzing...</div>';
    document.getElementById('game-title').textContent = '';
    document.getElementById('similar-games').style.display = 'none';
    document.querySelector('#similar-games .similar-thumbnails').innerHTML = '';
    Timeline.draw(); // clears the timeline canvas

    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        currentGameInfo = await infoRes.json();
        document.getElementById('game-title').textContent = currentGameInfo.name;
        window.lastAnalyzedApp = currentGameInfo;
    }

    // Close existing WebSocket if any
    if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED) {
        currentSocket.close();
    }

    isFirstSnapshot = true;
    currentSocket = createGameSocket(appId);
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
    if (!Metrics || !snapshot) return;

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
// Opinion panel moved to opinion.js

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