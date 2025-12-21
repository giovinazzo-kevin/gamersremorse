let chart = null;
let velocityChart = null;
let languageChart = null;
let currentSnapshot = null;
let currentGameInfo = null;
let timelineCanvas = null;
let timelineCtx = null;
let timelineData = { months: [], positive: {}, negative: {}, uncertainPos: {}, uncertainNeg: {}, volume: [], maxVolume: 0 };
let timelineSelection = { start: 0, end: 1 };
let timelineDrag = null;
let isFirstSnapshot = true;
let snapshotCount = 0;
let currentMetrics = null;
let lastMetrics = null;
let cachedControversyHtml = null;
let isStreaming = true;
let convergenceScore = 0;
let loadingMessageCount = 0;
let tagTimelineData = [];
let numReactions = 0;
let currentBanner = '';

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
        updateChart(currentSnapshot);
        drawTimeline();
    }
});
document.getElementById('hideSpikes')?.addEventListener('change', () => {
    if (currentSnapshot) {
        updateChart(currentSnapshot);
        updateVelocityChart(currentSnapshot);
        updateLanguageChart(currentSnapshot);
        updateStats(currentSnapshot);
        drawTimeline();
    }
});
document.getElementById('hideAnnotations')?.addEventListener('change', () => {
    if (currentSnapshot) updateChart(currentSnapshot);
});
document.getElementById('showTotalTime')?.addEventListener('change', () => {
    if (currentSnapshot) updateChart(currentSnapshot);
});

initTimeline();

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
    timelineData = { months: [], positive: {}, negative: {}, uncertainPos: {}, uncertainNeg: {}, volume: [], maxVolume: 0 };
    timelineSelection = { start: 0, end: 1 };
    tagTimelineData = [];

    // clear UI
    if (chart) {
        chart.destroy();
        chart = null;
    }
    if (velocityChart) {
        velocityChart.destroy();
        velocityChart = null;
    }
    if (languageChart) {
        languageChart.destroy();
        languageChart = null;
    }
    if (heatmapCtx && heatmapCanvas) {
        heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
        heatmapCanvas._layout = null;
    }
    document.getElementById('stats').innerHTML = '';
    document.getElementById('metrics-detail').innerHTML = '';
    document.getElementById('opinion-content').innerHTML = '<div class="opinion-loading">⏳ Analyzing...</div>';
    document.getElementById('game-title').textContent = '';
    drawTimeline(); // clears the timeline canvas

    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        currentGameInfo = await infoRes.json();
        document.getElementById('game-title').textContent = currentGameInfo.name;
        window.lastAnalyzedApp = currentGameInfo;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/game/${appId}`);

    ws.onmessage = (e) => {
        isStreaming = true;
        state.lastInteraction = Date.now();
        const snapshot = JSON.parse(e.data);
        updateChart(snapshot);
        updateTimelineData(snapshot, isFirstSnapshot);
        updateVelocityChart(snapshot);
        updateLanguageChart(snapshot);
        updateEditHeatmap(snapshot);
        updateStats(snapshot);
        updateMetrics(snapshot);
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

            // Compute tag timeline after analysis completes
            if (Metrics) {
                const isFree = currentGameInfo?.isFree || false;
                const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;
                const tagTimeline = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual });
                updateTagTimeline(tagTimeline);
            }
            
            // Fetch controversy context for any detected events
            if (currentMetrics && currentGameInfo) {
                fetchControversyContext(currentGameInfo.name, currentMetrics, currentSnapshot);
            }
        }

        if (setLoading) setLoading(false);
        // Final metrics update triggers eye emotion
        if (currentMetrics) {
            updateEyeFromMetrics(currentMetrics);
            
            const tags = currentMetrics.verdict?.tags?.map(t => t.id) || [];
            
            // Roll for item drop based on analysis tags
            if (snapshotCount > 1) {
                const item = Items.rollForDrop(tags, currentMetrics);
                if (item) {
                    setTimeout(() => Items.showPedestal(item), 1500);
                }
            }
            
            // Drop consumables - more snapshots = more chances
            const maxDrops = snapshotCount > 1 ? 4 : 1;
            const dropChance = Math.min(1, snapshotCount / 10);
            setTimeout(() => {
                Items.dropConsumables(tags, document.getElementById('metrics-detail'), maxDrops, dropChance);
            }, 2000);
        }
    };
}

function extractAppId(input) {
    const match = input.match(/app\/(\d+)/) || input.match(/^(\d+)$/);
    return match ? match[1] : null;
}

function findInflectionPoint(snapshot) {
    const buckets = snapshot.bucketsByReviewTime;
    const months = timelineData.months;

    for (let i = 0; i < months.length; i++) {
        // compute medians for all data up to month i
        const range = { from: months[0], to: months[i] };
        const posMedian = computeMedianForRange(buckets, 'positive', range);
        const negMedian = computeMedianForRange(buckets, 'negative', range);

        if (negMedian > posMedian) {
            return months[i]; // first month where it flipped
        }
    }
    return null; // never flipped, game is healthy
}

function computeRefundHonesty(buckets) {
    let negBeforeRefund = 0;
    let negTotal = 0;

    for (const bucket of buckets) {
        const filtered = filterBucketByTime(bucket);
        const neg = filtered.neg + filtered.uncNeg;
        negTotal += neg;

        if (bucket.maxPlaytime <= 120) {
            negBeforeRefund += neg;
        } else if (bucket.minPlaytime < 120) {
            // bucket straddles refund line, interpolate
            const ratio = (120 - bucket.minPlaytime) / (bucket.maxPlaytime - bucket.minPlaytime);
            negBeforeRefund += neg * ratio;
        }
    }

    return negTotal > 0 ? negBeforeRefund / negTotal : 0;
}

function updateChart(snapshot) {
    currentSnapshot = snapshot;

    const showTotal = document.getElementById('showTotalTime').checked;
    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;

    const labels = buckets.map(() => '');
    const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
    const hideAnnotations = document.getElementById('hideAnnotations').checked;

    // Calculate projection multipliers from sample rates
    const posRate = snapshot.positiveSampleRate ?? 1;
    const negRate = snapshot.negativeSampleRate ?? 1;
    const posMultiplier = posRate > 0 ? 1 / posRate : 1;
    const negMultiplier = negRate > 0 ? 1 / negRate : 1;
    
    // Check exhaustion
    const posExhausted = snapshot.positiveExhausted ?? false;
    const negExhausted = snapshot.negativeExhausted ?? false;

    // Build 8 datasets: 4 sampled (solid) + 4 projected (faded)
    const sampledPos = [];
    const sampledUncPos = [];
    const sampledNeg = [];
    const sampledUncNeg = [];
    const projectedPos = [];
    const projectedUncPos = [];
    const projectedNeg = [];
    const projectedUncNeg = [];
    
    for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        const filtered = filterBucketByTime(b);
        
        // Sampled values
        sampledPos.push(filtered.pos);
        sampledUncPos.push(filtered.uncPos);
        sampledNeg.push(-filtered.neg);
        sampledUncNeg.push(-filtered.uncNeg);
        
        // Projected extra (only if not exhausted and not hidden)
        if (hidePrediction) {
            projectedPos.push(0);
            projectedUncPos.push(0);
            projectedNeg.push(0);
            projectedUncNeg.push(0);
        } else {
            const extraPos = posExhausted ? 0 : filtered.pos * (posMultiplier - 1);
            const extraUncPos = posExhausted ? 0 : filtered.uncPos * (posMultiplier - 1);
            const extraNeg = negExhausted ? 0 : filtered.neg * (negMultiplier - 1);
            const extraUncNeg = negExhausted ? 0 : filtered.uncNeg * (negMultiplier - 1);
            
            projectedPos.push(extraPos);
            projectedUncPos.push(extraUncPos);
            projectedNeg.push(-extraNeg);
            projectedUncNeg.push(-extraUncNeg);
        }
    }

    const colors = getColors();

    const posMedian = computeMedian(buckets, 'positive');
    const negMedian = computeMedian(buckets, 'negative');
    const annotations = buildMedianAnnotations(posMedian, negMedian, buckets);
    if (!currentGameInfo?.isFree) {
        annotations.refundLine = {
            type: 'line',
            xMin: findExactPosition(buckets, 120),
            xMax: findExactPosition(buckets, 120),
            borderColor: 'rgba(128, 128, 128, 0.9)',
            borderWidth: 2,
            label: {
                display: true,
                content: 'Refund Threshold',
                position: 'middle',
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white'
            }
        };
    }

    if (!chart) {
        chart = new Chart(document.getElementById('chart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    // Sampled (solid)
                    { label: '👍', data: sampledPos, backgroundColor: hexToRgba(colors.positive, 0.8), stack: 'stack' },
                    { label: '👍*', data: sampledUncPos, backgroundColor: hexToRgba(colors.uncertain, 0.8), stack: 'stack' },
                    { label: '👎', data: sampledNeg, backgroundColor: hexToRgba(colors.negative, 0.8), stack: 'stack' },
                    { label: '👎*', data: sampledUncNeg, backgroundColor: hexToRgba(colors.uncertain, 0.8), stack: 'stack' },
                    // Projected (faded) - hidden from legend
                    { label: '👍 (proj)', data: projectedPos, backgroundColor: hexToRgba(colors.positive, 0.35), stack: 'stack', hidden: false },
                    { label: '👍* (proj)', data: projectedUncPos, backgroundColor: hexToRgba(colors.uncertain, 0.35), stack: 'stack', hidden: false },
                    { label: '👎 (proj)', data: projectedNeg, backgroundColor: hexToRgba(colors.negative, 0.35), stack: 'stack', hidden: false },
                    { label: '👎* (proj)', data: projectedUncNeg, backgroundColor: hexToRgba(colors.uncertain, 0.35), stack: 'stack', hidden: false },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        ticks: { display: false },
                        grid: { display: false }
                    },
                    y: { stacked: true }
                },
                plugins: {
                    legend: {
                        labels: {
                            filter: (item) => !item.text.includes('(proj)')
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function (context) {
                                const idx = context[0].dataIndex;
                                const showTotal = document.getElementById('showTotalTime').checked;
                                const buckets = showTotal ? currentSnapshot.bucketsByTotalTime : currentSnapshot.bucketsByReviewTime;
                                const bucket = buckets[idx];
                                return `${formatPlaytime(bucket.minPlaytime)} - ${formatPlaytime(bucket.maxPlaytime)}`;
                            },
                            label: function (context) {
                                const value = Math.abs(context.raw);
                                const label = context.dataset.label;
                                if (value === 0) return null;
                                if (label.includes('(proj)')) {
                                    return `${label.replace(' (proj)', '')} projected: +${Math.round(value)}`;
                                }
                                return `${label}: ${Math.round(value)} sampled`;
                            }
                        }
                    }
                }
            }
        });
    } else {
        chart.data.labels = labels;
        chart.data.datasets[0].data = sampledPos;
        chart.data.datasets[0].backgroundColor = hexToRgba(colors.positive, 0.8);
        chart.data.datasets[1].data = sampledUncPos;
        chart.data.datasets[1].backgroundColor = hexToRgba(colors.uncertain, 0.8);
        chart.data.datasets[2].data = sampledNeg;
        chart.data.datasets[2].backgroundColor = hexToRgba(colors.negative, 0.8);
        chart.data.datasets[3].data = sampledUncNeg;
        chart.data.datasets[3].backgroundColor = hexToRgba(colors.uncertain, 0.8);
        chart.data.datasets[4].data = projectedPos;
        chart.data.datasets[4].backgroundColor = hexToRgba(colors.positive, 0.35);
        chart.data.datasets[5].data = projectedUncPos;
        chart.data.datasets[5].backgroundColor = hexToRgba(colors.uncertain, 0.35);
        chart.data.datasets[6].data = projectedNeg;
        chart.data.datasets[6].backgroundColor = hexToRgba(colors.negative, 0.35);
        chart.data.datasets[7].data = projectedUncNeg;
        chart.data.datasets[7].backgroundColor = hexToRgba(colors.uncertain, 0.35);
        chart.update();
    }
    addCustomLabels(snapshot, buckets);
    chart.options.plugins.annotation.annotations = hideAnnotations ? {} : annotations;
    chart.update();
}

function updateVelocityChart(snapshot) {
    const labels = ['~1x', '1.25x', '1.5x', '2x', '3x+'];
    const colors = getColors();

    const positive = snapshot.velocityBuckets.map(b => {
        const filtered = filterVelocityBucketByTime(b);
        return filtered.pos;
    });
    const uncertainPos = snapshot.velocityBuckets.map(b => {
        const filtered = filterVelocityBucketByTime(b);
        return filtered.uncPos;
    });
    const negative = snapshot.velocityBuckets.map(b => {
        const filtered = filterVelocityBucketByTime(b);
        return -filtered.neg;
    });
    const uncertainNeg = snapshot.velocityBuckets.map(b => {
        const filtered = filterVelocityBucketByTime(b);
        return -filtered.uncNeg;
    });

    if (!velocityChart) {
        velocityChart = new Chart(document.getElementById('velocity-chart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '👍', data: positive, backgroundColor: hexToRgba(colors.positive, 0.7), stack: 'stack' },
                    { label: '👍*', data: uncertainPos, backgroundColor: hexToRgba(colors.uncertain, 0.7), stack: 'stack' },
                    { label: '👎', data: negative, backgroundColor: hexToRgba(colors.negative, 0.7), stack: 'stack' },
                    { label: '👎*', data: uncertainNeg, backgroundColor: hexToRgba(colors.uncertain, 0.7), stack: 'stack' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true }
                }
            }
        });
    } else {
        velocityChart.data.datasets[0].data = positive;
        velocityChart.data.datasets[0].backgroundColor = hexToRgba(colors.positive, 0.7);
        velocityChart.data.datasets[1].data = uncertainPos;
        velocityChart.data.datasets[1].backgroundColor = hexToRgba(colors.uncertain, 0.7);
        velocityChart.data.datasets[2].data = negative;
        velocityChart.data.datasets[2].backgroundColor = hexToRgba(colors.negative, 0.7);
        velocityChart.data.datasets[3].data = uncertainNeg;
        velocityChart.data.datasets[3].backgroundColor = hexToRgba(colors.uncertain, 0.7);
        velocityChart.update();
    }
}

function updateLanguageChart(snapshot) {
    const stats = snapshot.languageStats;
    if (!stats) return;

    const range = getSelectedMonths();
    const hideSpikes = document.getElementById('hideSpikes')?.checked;
    const excludeMonths = hideSpikes && currentMetrics?.excludedMonths ? new Set(currentMetrics.excludedMonths) : new Set();
    
    // Get all months in range
    const allMonths = new Set();
    for (const bucket of snapshot.bucketsByReviewTime) {
        for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
        for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
    }
    
    const months = [...allMonths]
        .filter(m => !excludeMonths.has(m))
        .filter(m => !range || (m >= range.from && m <= range.to))
        .sort();
    
    if (months.length < 2) return;
    
    // Count reviews per month for rate calculation
    const reviewsByMonth = {};
    for (const bucket of snapshot.bucketsByReviewTime) {
        for (const month of months) {
            const count = (bucket.positiveByMonth?.[month] || 0) +
                         (bucket.negativeByMonth?.[month] || 0) +
                         (bucket.uncertainPositiveByMonth?.[month] || 0) +
                         (bucket.uncertainNegativeByMonth?.[month] || 0);
            reviewsByMonth[month] = (reviewsByMonth[month] || 0) + count;
        }
    }
    
    // Build time series for each language metric (as % of reviews that month)
    const series = {
        slurs: months.map(m => {
            const reviews = reviewsByMonth[m] || 1;
            return ((stats.slursByMonth?.[m] || 0) / reviews) * 100;
        }),
        profanity: months.map(m => {
            const reviews = reviewsByMonth[m] || 1;
            return ((stats.profanityByMonth?.[m] || 0) / reviews) * 100;
        }),
        insults: months.map(m => {
            const reviews = reviewsByMonth[m] || 1;
            return ((stats.insultsByMonth?.[m] || 0) / reviews) * 100;
        }),
        complaints: months.map(m => {
            const reviews = reviewsByMonth[m] || 1;
            return ((stats.complaintsByMonth?.[m] || 0) / reviews) * 100;
        }),
        banter: months.map(m => {
            const reviews = reviewsByMonth[m] || 1;
            return ((stats.banterByMonth?.[m] || 0) / reviews) * 100;
        }),
    };
    
    const colors = getColors();
    
    // Generate distinct line colors by hue-rotating from base colors
    // Negative family: slurs (base), profanity, insults
    // Positive family: banter (base), complaints
    const lineColors = {
        slurs: colors.negative,                          // base negative (worst)
        profanity: rotateHue(colors.negative, -40),      // negative shifted
        insults: rotateHue(colors.negative, -80),        // negative shifted more
        complaints: rotateHue(colors.positive, 50),      // positive shifted
        banter: colors.positive,                         // base positive (most benign)
    };

    if (!languageChart) {
        languageChart = new Chart(document.getElementById('language-chart'), {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: 'Slurs', data: series.slurs, borderColor: lineColors.slurs, backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 },
                    { label: 'Profanity', data: series.profanity, borderColor: lineColors.profanity, backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 },
                    { label: 'Insults', data: series.insults, borderColor: lineColors.insults, backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 },
                    { label: 'Complaints', data: series.complaints, borderColor: lineColors.complaints, backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 },
                    { label: 'Banter', data: series.banter, borderColor: lineColors.banter, backgroundColor: 'transparent', tension: 0.3, pointRadius: 0 },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { maxTicksLimit: 8 }
                    },
                    y: { 
                        beginAtZero: true,
                        ticks: {
                            callback: v => v + '%'
                        }
                    }
                }
            }
        });
    } else {
        languageChart.data.labels = months;
        languageChart.data.datasets[0].data = series.slurs;
        languageChart.data.datasets[0].borderColor = lineColors.slurs;
        languageChart.data.datasets[1].data = series.profanity;
        languageChart.data.datasets[1].borderColor = lineColors.profanity;
        languageChart.data.datasets[2].data = series.insults;
        languageChart.data.datasets[2].borderColor = lineColors.insults;
        languageChart.data.datasets[3].data = series.complaints;
        languageChart.data.datasets[3].borderColor = lineColors.complaints;
        languageChart.data.datasets[4].data = series.banter;
        languageChart.data.datasets[4].borderColor = lineColors.banter;
        languageChart.update();
    }
}

function computeMedian(buckets, type) {
    // build array of (playtime, count) for positive or negative
    const values = [];

    for (const bucket of buckets) {
        const filtered = filterBucketByTime(bucket);
        const midpoint = (bucket.minPlaytime + bucket.maxPlaytime) / 2;
        const count = type === 'positive'
            ? filtered.pos + filtered.uncPos
            : filtered.neg + filtered.uncNeg;

        for (let i = 0; i < count; i++) {
            values.push(midpoint);
        }
    }

    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
}

function addCustomLabels(snapshot, buckets) {
    const container = document.getElementById('labels-container');
    container.innerHTML = '';

    const maxMins = buckets[buckets.length - 1].maxPlaytime;
    const niceValues = getNiceLabels(maxMins);
    const chartArea = chart.chartArea;
    const totalWidth = chartArea.right - chartArea.left;

    for (const nice of niceValues) {
        const exactPos = findExactPosition(buckets, nice);
        const pct = (exactPos + 0.5) / buckets.length;
        const x = chartArea.left + (pct * totalWidth);

        const label = document.createElement('div');
        label.className = 'x-label';
        label.style.left = `${x}px`;
        label.textContent = formatPlaytime(nice);
        container.appendChild(label);
    }
}

function buildMedianAnnotations(posMedian, negMedian, buckets) {
    const colors = getColors();

    return {
        posMedian: {
            type: 'line',
            xMin: findExactPosition(buckets, posMedian),
            xMax: findExactPosition(buckets, posMedian),
            borderColor: hexToRgba(colors.positive, 0.9),
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Positive: ${formatPlaytime(posMedian)}`,
                position: 'end',
                yAdjust: 30,
                backgroundColor: hexToRgba(colors.positive, 0.7),
                color: 'white'
            }
        },
        negMedian: {
            type: 'line',
            xMin: findExactPosition(buckets, negMedian),
            xMax: findExactPosition(buckets, negMedian),
            borderColor: hexToRgba(colors.negative, 0.9),
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Negative: ${formatPlaytime(negMedian)}`,
                position: 'start',
                yAdjust: -30,
                backgroundColor: hexToRgba(colors.negative, 0.7),
                color: 'white'
            }
        }
    };
}

function getNiceLabels(maxMinutes) {
    const nice = [];
    [5, 15, 30].forEach(m => { if (m <= maxMinutes) nice.push(m); });
    [1, 2, 5, 10, 20, 50, 100, 200, 500].forEach(h => {
        const m = h * 60;
        if (m <= maxMinutes && m > 45) nice.push(m);
    });
    [1, 2, 5].forEach(f => {
        for (let exp = 0; exp <= 2; exp++) {
            const k = f * Math.pow(10, exp);
            const m = k * 1000 * 60;
            if (m <= maxMinutes && m > 500 * 60) nice.push(m);
        }
    });
    return nice.sort((a, b) => a - b);
}

function findExactPosition(buckets, minutes) {
    for (let i = 0; i < buckets.length; i++) {
        if (minutes >= buckets[i].minPlaytime && minutes < buckets[i].maxPlaytime) {
            const t = (Math.log10(minutes) - Math.log10(buckets[i].minPlaytime)) /
                (Math.log10(buckets[i].maxPlaytime) - Math.log10(buckets[i].minPlaytime));
            return i + t;
        }
    }
    return buckets.length - 1;
}

function formatPlaytime(minutes) {
    if (minutes < 60) return `${Math.round(minutes)}'`;
    const hours = minutes / 60;
    if (hours >= 1000) {
        const k = hours / 1000;
        return k % 1 === 0 ? `${k}kh` : `${k.toFixed(1)}kh`;
    }
    return `${Math.round(hours)}h`;
}

function updateStats(snapshot) {
    const showTotal = document.getElementById('showTotalTime').checked;
    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;

    const posMedian = computeMedian(buckets, 'positive');
    const negMedian = computeMedian(buckets, 'negative');

    let totalPos = 0, totalNeg = 0;
    for (const bucket of buckets) {
        const filtered = filterBucketByTime(bucket);
        totalPos += filtered.pos + filtered.uncPos;
        totalNeg += filtered.neg + filtered.uncNeg;
    }

    // Game totals from metadata
    const gameTotal = snapshot.gameTotalPositive + snapshot.gameTotalNegative;
    const gameRatio = gameTotal > 0
        ? Math.round((snapshot.gameTotalPositive / gameTotal) * 100)
        : 0;

    // Sampling progress
    const sampled = snapshot.totalPositive + snapshot.totalNegative;
    const target = snapshot.targetSampleCount;
    const coveragePct = gameTotal > 0 ? Math.round((sampled / gameTotal) * 100) : 0;
    const samplingInfo = isStreaming
        ? `<strong>Sampling:</strong> ${sampled.toLocaleString()} / ${target.toLocaleString()} (${coveragePct}% of total) |`
        : `<strong>Sampled:</strong> ${sampled.toLocaleString()} (${coveragePct}%) |`;

    document.getElementById('stats').innerHTML = `
        ${samplingInfo}
        <strong>Game:</strong> ${snapshot.gameTotalPositive.toLocaleString()} 👍 / ${snapshot.gameTotalNegative.toLocaleString()} 👎 (${gameRatio}% positive) |
        <strong>Median:</strong> ${formatPlaytime(posMedian)} 👍 / ${formatPlaytime(negMedian)} 👎
    `;
}

function initTimeline() {
    timelineCanvas = document.getElementById('timeline');
    timelineCtx = timelineCanvas.getContext('2d');

    resizeTimeline();
    addEventListener('resize', resizeTimeline);

    timelineCanvas.addEventListener('mousedown', onTimelineMouseDown);
    addEventListener('mousemove', onTimelineMouseMove);
    addEventListener('mouseup', onTimelineMouseUp);
}

function resizeTimeline() {
    const rect = timelineCanvas.getBoundingClientRect();
    timelineCanvas.width = rect.width;
    timelineCanvas.height = rect.height;
    drawTimeline();
}

function updateTimelineData(snapshot, reset = false) {
    const positive = {};
    const negative = {};
    const uncertainPos = {};
    const uncertainNeg = {};

    for (const bucket of snapshot.bucketsByReviewTime) {
        for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
            positive[month] = (positive[month] || 0) + count;
        }
        for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
            negative[month] = (negative[month] || 0) + count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
            uncertainPos[month] = (uncertainPos[month] || 0) + count;
        }
        for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
            uncertainNeg[month] = (uncertainNeg[month] || 0) + count;
        }
    }

    const allMonths = [...new Set([
        ...Object.keys(positive),
        ...Object.keys(negative),
        ...Object.keys(uncertainPos),
        ...Object.keys(uncertainNeg)
    ])].sort();

    timelineData.months = allMonths;
    timelineData.positive = positive;
    timelineData.negative = negative;
    timelineData.uncertainPos = uncertainPos;
    timelineData.uncertainNeg = uncertainNeg;
    timelineData.volume = allMonths.map(m =>
        (positive[m] || 0) + (negative[m] || 0) + (uncertainPos[m] || 0) + (uncertainNeg[m] || 0)
    );
    timelineData.maxVolume = Math.max(...timelineData.volume, 1);

    if (reset) {
        timelineSelection = { start: 0, end: 1 };
    }

    drawTimeline();
}
function getTagColor(tag) {
    const varName = `--color-tag-${(tag || "start").toLowerCase().replace(/_/g, '-')}`;
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#666';
}

function drawTimeline() {
    const w = timelineCanvas.width;
    const h = timelineCanvas.height;
    const colors = getColors();

    timelineCtx.clearRect(0, 0, w, h);

    if (timelineData.months.length === 0) return;
    if (!currentSnapshot) return;

    // Get display options
    const posExhausted = currentSnapshot?.positiveExhausted ?? false;
    const negExhausted = currentSnapshot?.negativeExhausted ?? false;
    const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
    const hideSpikes = document.getElementById('hideSpikes')?.checked ?? false;
    const excludeMonths = hideSpikes && currentMetrics?.excludedMonths
        ? new Set(currentMetrics.excludedMonths)
        : new Set();
    
    // Ground truth from Steam
    const gameTotalPos = currentSnapshot?.gameTotalPositive ?? 0;
    const gameTotalNeg = currentSnapshot?.gameTotalNegative ?? 0;
    const gameTotal = gameTotalPos + gameTotalNeg;
    const trueRatio = gameTotal > 0 ? gameTotalPos / gameTotal : 0.5;
    
    // Build per-month sampled data, excluding spikes
    const monthData = [];
    let totalSampled = 0;
    
    for (const month of timelineData.months) {
        if (excludeMonths.has(month)) continue;
        
        const pos = (timelineData.positive[month] || 0);
        const neg = (timelineData.negative[month] || 0);
        const uncPos = (timelineData.uncertainPos[month] || 0);
        const uncNeg = (timelineData.uncertainNeg[month] || 0);
        const sampledPos = pos + uncPos;
        const sampledNeg = neg + uncNeg;
        const sampledTotal = sampledPos + sampledNeg;
        
        totalSampled += sampledTotal;
        monthData.push({ month, pos, neg, uncPos, uncNeg, sampledPos, sampledNeg, sampledTotal });
    }
    
    if (monthData.length === 0 || totalSampled === 0) return;
    
    // PROJECTION LOGIC:
    // Our sampling is frontloaded (recent months overrepresented).
    // The "missing" reviews (gameTotal - totalSampled) are disproportionately OLD.
    // 
    // Approach: distribute missing volume BOTTOM-FIRST.
    // Older months get filled up before newer months get extras.
    // This counteracts the frontloading bias.
    
    const missingTotal = Math.max(0, gameTotal - totalSampled);
    
    // First pass: estimate each month's "fair share" of total volume.
    // Use sampled distribution as a starting point, but we'll redistribute.
    // For now, assume uniform-ish distribution as baseline, then adjust.
    
    // Calculate how much each month is "owed" vs what we sampled.
    // If we sampled 10% of gameTotal, each month should have ~10% of its true volume.
    // Months with LESS than that proportion are undersampled (older months).
    
    const sampleRate = totalSampled / gameTotal; // e.g., 0.14 for 20k of 145k
    
    // For each month, estimate its TRUE volume.
    // If sampling were uniform, true volume = sampled / sampleRate.
    // But sampling ISN'T uniform - it's frontloaded.
    // So we use a position-based correction: older months get scaled up more.
    
    const n = monthData.length;
    for (let i = 0; i < n; i++) {
        const m = monthData[i];
        
        // Position 0 = oldest, position n-1 = newest
        // Recent months are OVERSAMPLED (cursor is frontloaded), so we may have nearly all of them.
        // Old months are UNDERSAMPLED, so we need to extrapolate more.
        //
        // Use exponential decay: newest months get almost no extrapolation,
        // oldest months get full extrapolation.
        const positionRatio = i / Math.max(1, n - 1); // 0 (oldest) to 1 (newest)
        
        // For newest months (positionRatio=1): multiplier → 1 (no extrapolation beyond sampled)
        // For oldest months (positionRatio=0): multiplier → 1/sampleRate (full extrapolation)
        // Use exponential interpolation between these
        const maxMultiplier = sampleRate > 0 ? 1 / sampleRate : 1;
        const multiplier = Math.pow(maxMultiplier, 1 - positionRatio);
        
        m.estimatedTrue = m.sampledTotal * multiplier;
    }
    
    // Normalize so estimates sum to gameTotal
    const estimateSum = monthData.reduce((sum, m) => sum + m.estimatedTrue, 0);
    const normalizeFactor = estimateSum > 0 ? gameTotal / estimateSum : 1;
    
    for (const m of monthData) {
        m.projectedTotal = m.estimatedTrue * normalizeFactor;
        
        // Key insight: spikes are ADDITIONAL angry/happy people on top of baseline.
        // If this month is more negative than usual, only project the negatives.
        // If this month is more positive than usual, only project the positives.
        // The non-spiking side stays at what we sampled.
        
        const localRatio = m.sampledTotal > 0 ? m.sampledPos / m.sampledTotal : trueRatio;
        const ratioDiff = localRatio - trueRatio; // positive = more positive than usual
        
        if (ratioDiff >= 0) {
            // More positive than usual - only project positives, negatives stay as sampled
            m.projectedNeg = m.sampledNeg;
            m.projectedPos = Math.max(m.sampledPos, m.projectedTotal - m.projectedNeg);
        } else {
            // More negative than usual - only project negatives, positives stay as sampled
            m.projectedPos = m.sampledPos;
            m.projectedNeg = Math.max(m.sampledNeg, m.projectedTotal - m.projectedPos);
        }
        
        // Extra is what we project minus what we sampled
        // But respect exhaustion flags
        m.extraPos = posExhausted ? 0 : Math.max(0, m.projectedPos - m.sampledPos);
        m.extraNeg = negExhausted ? 0 : Math.max(0, m.projectedNeg - m.sampledNeg);
    }

    const tagStripH = tagTimelineData.length > 0 ? 8 : 0;
    const chartH = h - 20 - tagStripH;
    const barW = w / monthData.length;
    
    // Calculate max volume for scaling
    let maxVolume = 1;
    for (const m of monthData) {
        if (hidePrediction) {
            maxVolume = Math.max(maxVolume, m.sampledTotal);
        } else {
            maxVolume = Math.max(maxVolume, m.sampledTotal + m.extraPos + m.extraNeg);
        }
    }

    // Draw bars
    for (let i = 0; i < monthData.length; i++) {
        const m = monthData[i];
        
        const displayTotal = hidePrediction 
            ? m.sampledTotal 
            : (m.sampledTotal + m.extraPos + m.extraNeg);
        
        if (displayTotal === 0) continue;
        
        const totalH = (displayTotal / maxVolume) * chartH;
        
        // Heights for sampled portions
        const sampledPosH = (m.pos / displayTotal) * totalH;
        const sampledUncPosH = (m.uncPos / displayTotal) * totalH;
        const sampledNegH = (m.neg / displayTotal) * totalH;
        const sampledUncNegH = (m.uncNeg / displayTotal) * totalH;
        
        // Heights for projected extra
        const projectedPosH = hidePrediction ? 0 : (m.extraPos / displayTotal) * totalH;
        const projectedNegH = hidePrediction ? 0 : (m.extraNeg / displayTotal) * totalH;

        let y = chartH;

        // === SAMPLED PORTION (bottom, solid) ===
        timelineCtx.globalAlpha = 1;
        
        // negative on bottom
        timelineCtx.fillStyle = colors.negative;
        timelineCtx.fillRect(i * barW, y - sampledNegH, barW - 1, sampledNegH);
        y -= sampledNegH;

        // uncertain negative
        timelineCtx.fillStyle = colors.uncertain;
        timelineCtx.fillRect(i * barW, y - sampledUncNegH, barW - 1, sampledUncNegH);
        y -= sampledUncNegH;

        // uncertain positive
        timelineCtx.fillStyle = colors.uncertain;
        timelineCtx.fillRect(i * barW, y - sampledUncPosH, barW - 1, sampledUncPosH);
        y -= sampledUncPosH;

        // positive
        timelineCtx.fillStyle = colors.positive;
        timelineCtx.fillRect(i * barW, y - sampledPosH, barW - 1, sampledPosH);
        y -= sampledPosH;

        // === PROJECTED PORTION (top, faded) ===
        if (!hidePrediction && (projectedPosH > 0 || projectedNegH > 0)) {
            timelineCtx.globalAlpha = 0.5;
            
            if (projectedNegH > 0) {
                timelineCtx.fillStyle = colors.negative;
                timelineCtx.fillRect(i * barW, y - projectedNegH, barW - 1, projectedNegH);
                y -= projectedNegH;
            }

            if (projectedPosH > 0) {
                timelineCtx.fillStyle = colors.positive;
                timelineCtx.fillRect(i * barW, y - projectedPosH, barW - 1, projectedPosH);
                y -= projectedPosH;
            }
            
            timelineCtx.globalAlpha = 1;
        }
    }

    // Draw tag strip below chart
    if (tagTimelineData.length > 0) {
        const stripY = chartH + 2;

        for (const entry of tagTimelineData) {
            const monthIdx = monthData.findIndex(m => m.month === entry.month);
            if (monthIdx < 0) continue;

            const x = (monthIdx / monthData.length) * w;

            const significantTags = entry.tags.filter(t =>
                !['LOW_DATA', 'CORRUPTED', 'HORNY'].includes(t)
            );
            const primaryTag = significantTags[0] || entry.tags[0];
            const color = getTagColor(primaryTag);

            timelineCtx.fillStyle = color;
            timelineCtx.fillRect(x, stripY, barW, tagStripH - 2);
        }
    }

    // Selection outline
    const selX = timelineSelection.start * w;
    const selW = (timelineSelection.end - timelineSelection.start) * w;

    timelineCtx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
    timelineCtx.lineWidth = 2;
    timelineCtx.strokeRect(selX, 0, selW, chartH + tagStripH);

    // Handles
    timelineCtx.fillStyle = '#8b0000';
    timelineCtx.fillRect(selX - 4, 0, 8, chartH + tagStripH);
    timelineCtx.fillRect(selX + selW - 4, 0, 8, chartH + tagStripH);

    // Year labels
    timelineCtx.fillStyle = isDarkMode() ? '#888' : '#666';
    timelineCtx.font = '10px Verdana';
    timelineCtx.textAlign = 'center';

    const years = [...new Set(monthData.map(m => m.month.split('-')[0]))];
    for (const year of years) {
        const juneMonth = `${year}-06`;
        const juneIdx = monthData.findIndex(m => m.month === juneMonth);
        if (juneIdx < 0) continue;
        const x = (juneIdx / monthData.length) * w;
        timelineCtx.fillText(year, x, h - 5);
    }

    updateTimelineLabel();
}

function updateTimelineLabel() {
    const el = document.getElementById('timeline-range');
    if (timelineData.months.length === 0) {
        el.textContent = '';
        return;
    }

    const startIdx = Math.floor(timelineSelection.start * (timelineData.months.length - 1));
    const endIdx = Math.floor(timelineSelection.end * (timelineData.months.length - 1));
    const startMonth = timelineData.months[startIdx];
    const endMonth = timelineData.months[endIdx];

    el.textContent = `${startMonth} → ${endMonth}`;
}

function onTimelineMouseDown(e) {
    const rect = timelineCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    const handleSize = 0.02;
    const nearStart = Math.abs(x - timelineSelection.start) < handleSize;
    const nearEnd = Math.abs(x - timelineSelection.end) < handleSize;
    const inside = x >= timelineSelection.start && x <= timelineSelection.end;

    if (nearStart && !nearEnd) {
        timelineDrag = 'start';
    } else if (nearEnd && !nearStart) {
        timelineDrag = 'end';
    } else if (inside) {
        timelineDrag = { type: 'middle', offsetStart: x - timelineSelection.start, offsetEnd: timelineSelection.end - x };
    }
}

function onTimelineMouseMove(e) {
    if (!timelineDrag) return;

    const rect = timelineCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (timelineDrag === 'start') {
        timelineSelection.start = Math.min(x, timelineSelection.end - 0.02);
    } else if (timelineDrag === 'end') {
        timelineSelection.end = Math.max(x, timelineSelection.start + 0.02);
    } else if (timelineDrag.type === 'middle') {
        const width = timelineSelection.end - timelineSelection.start;
        let newStart = x - timelineDrag.offsetStart;
        let newEnd = x + timelineDrag.offsetEnd;

        if (newStart < 0) { newStart = 0; newEnd = width; }
        if (newEnd > 1) { newEnd = 1; newStart = 1 - width; }

        timelineSelection.start = newStart;
        timelineSelection.end = newEnd;
    }

    drawTimeline();
}

function onTimelineMouseUp() {
    if (timelineDrag) {
        timelineDrag = null;
        applyTimelineFilter();
    }
}

function applyTimelineFilter() {
    if (currentSnapshot) {
        updateChart(currentSnapshot);
        updateVelocityChart(currentSnapshot);
        updateLanguageChart(currentSnapshot);
        updateEditHeatmap(currentSnapshot);
        updateStats(currentSnapshot);
        updateMetrics(currentSnapshot);
        if (currentMetrics) {
            updateEyeFromMetrics(currentMetrics);
        }
    }
}

function getSelectedMonths() {
    if (timelineData.months.length === 0) return null;

    const startIdx = Math.floor(timelineSelection.start * (timelineData.months.length - 1));
    const endIdx = Math.floor(timelineSelection.end * (timelineData.months.length - 1));

    return {
        from: timelineData.months[startIdx],
        to: timelineData.months[endIdx]
    };
}

function filterBucketByTime(bucket) {
    const range = getSelectedMonths();
    const hideSpikes = document.getElementById('hideSpikes')?.checked;
    const excludeMonths = hideSpikes && currentMetrics?.excludedMonths ? new Set(currentMetrics.excludedMonths) : new Set();

    if (!range && excludeMonths.size === 0) return {
        pos: bucket.positiveCount,
        neg: bucket.negativeCount,
        uncPos: bucket.uncertainPositiveCount,
        uncNeg: bucket.uncertainNegativeCount
    };

    let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
    for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) pos += count;
    }
    for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) neg += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) uncPos += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) uncNeg += count;
    }
    return { pos, neg, uncPos, uncNeg };
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
    const loadingMsg = getLoadingMessage();

    // confidence is about absolute sample size AND relative coverage
    convergenceScore = updateConvergence(currentMetrics, lastMetrics, currentSnapshot);
    lastMetrics = currentMetrics;

    currentMetrics = Metrics.compute(snapshot, { timelineFilter: filter, isFree, isSexual, convergenceScore });

    const metricsEl = document.getElementById('metrics-detail');
    if (metricsEl && currentMetrics) {
        const v = currentMetrics.verdict;
        const severityPct = Math.round(v.severity * 100);
        const opacity = isStreaming ? (0.3 + convergenceScore * 0.7) : 1;
        const tagPills = v.tags.map(t =>
            `<span class="tag-pill" style="background:${t.color}; opacity:${opacity}">${t.id}</span>`
        ).join(' ');
        const preliminaryWarning = isStreaming && convergenceScore < 0.8
            ? `<div class="loading"><span class="loading-icon">⏳</span> ${loadingMsg}</div>`
            : isStreaming
                ? `<div class="loading"><span class="loading-icon">💬</span> ${loadingMsg}</div>`
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

    // Update opinion panel
    updateOpinionPanel(currentMetrics);
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
                <div class="opinion-verdict caution">⏳ Analysis in progress...</div>
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
        verdictExplain = `People who dislike this game figure it out at ${negMedianHours}h—after those who like it (${posMedianHours}h). The game takes before it reveals.`;
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
    drawTimeline(); // redraw to include tag overlay
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
    const range = getSelectedMonths();
    const hideSpikes = document.getElementById('hideSpikes')?.checked;
    const excludeMonths = hideSpikes && currentMetrics?.excludedMonths ? new Set(currentMetrics.excludedMonths) : new Set();

    if (!range && excludeMonths.size === 0) return {
        pos: bucket.positiveCount,
        neg: bucket.negativeCount,
        uncPos: bucket.uncertainPositiveCount,
        uncNeg: bucket.uncertainNegativeCount
    };

    let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
    for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) pos += count;
    }
    for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) neg += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) uncPos += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
        if ((!range || (month >= range.from && month <= range.to)) && !excludeMonths.has(month)) uncNeg += count;
    }
    return { pos, neg, uncPos, uncNeg };
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
                <h4>📰 What Happened?</h4>
                <div class="controversy-item">
                    <div class="controversy-text">🔍 Searching for context...</div>
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

    // Get first 3 months of data to determine launch sentiment
    const allMonths = new Set();
    for (const bucket of snapshot.bucketsByReviewTime) {
        for (const month of Object.keys(bucket.positiveByMonth || {})) allMonths.add(month);
        for (const month of Object.keys(bucket.negativeByMonth || {})) allMonths.add(month);
    }
    const sortedMonths = [...allMonths].sort();
    const launchMonths = sortedMonths.slice(0, 3);

    if (launchMonths.length > 0) {
        let launchPos = 0, launchNeg = 0;
        for (const bucket of snapshot.bucketsByReviewTime) {
            for (const month of launchMonths) {
                launchPos += (bucket.positiveByMonth?.[month] || 0) + (bucket.uncertainPositiveByMonth?.[month] || 0);
                launchNeg += (bucket.negativeByMonth?.[month] || 0) + (bucket.uncertainNegativeByMonth?.[month] || 0);
            }
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
    html += '<h4>📰 What Happened?</h4>';

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