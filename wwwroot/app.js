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
let currentMetrics = null;
let lastMetrics = null;
let isStreaming = true;
let convergenceScore = 0;
let loadingMessageCount = 0;
let tagTimelineData = [];

const loadingMessages = {
    // Always available - generic loading flavor
    neutral: [
        "Reticulating splines...",
        "Unburying the lede...",
        "Calculating regret vectors...",
        "Correlating causations...",
        "Causing correlations...",
        "Interviewing haters...",
        "Cross-referencing copium levels...",
        "Evaluating life choices...",
        "Tabulating hours lost...",
        "Disregarding anime pfp opinions...",
        "Rerolling...",
        "Scrolling...",
        "Saving...",
        "Loading...",
        "Fast travelling to a conclusion...",
        "Taking the scenic route...",
        "Shifting the goalposts...",
        "Checking if you can pet the dog...",
        "Asking mom for more EYE-bucks...",
        "Triangulating the shadows on the wall...",
        "Confabulating plausible narratives...",
        "Maintaining the agenda...",
        "Watching the movie adaptation...",
        "Asking a crowd to count all these reviews...",
        "Taking off the nostalgia goggles...",
        "Looking through rose-tinted glasses...",
        "Normalizing the deviance...",
        "Factoring in the FOMO...",
        "Adjusting for skill issue...",
        "Polling the backlog...",
        "Measuring the cope gradient...",
        "Auditing the fun budget...",
        "Rolling for critical disappointment...",
        "Checking the wiki...",
        "Counting early access years...",
        "Preordering the special edition...",
        "Buying the DLC...",
        "Installing EAC...",
        "Cracking Denuvo...",
        "Asking FitGirl...",
        "Dividing by zero...",
        "Remembering when games had manuals...",
        "Remembering when games were meant to be fun...",
        "Factoring in the day one patch...",
        "Subtracting the tutorial hours...",
        "Accounting for review bombs...",
        "Forgiving the launch window...",
        "Blaming the publisher...",
        "Assuming good faith...",
        "Trusting the process...",
        "Doubting the process...",
        "Abandoning the process...",
        "Speedrunning to conclusions...",
        "Netdecking opinions...",
        "Touching grass...",
        "Chasing the meta...",
        "Nerfing expectations...",
        "Buffing skepticism...",
        "Mapping echo chamber acoustics...",
        "Tracking Pink Wojack index...",
        "Regulating the markets...",
        "Squeezing the invisible hand...",
        "Rationalizing with agents...",
        "Consulting the backseaters...",
        "Malding...",
        "Seething...",
        "Coping...",
        "Respeccing...",
        "Looting containers...",
        "Managing inventory...",
        "Identifying scrolls...",
        "Quaffing unidentified potions...",
        "Monitoring the botnet...",
        "ENHANCING...",
        "Polishing JPEG artifacts...",
        "Refunding within two hours...",
        "Wishlisting for later...",
        "Waiting for a sale...",
        "Waiting for the complete edition...",
        "Waiting for mods to fix it...",
        "Reading between the patch notes...",
        "Translating from marketing speak...",
        "Decoding the investor call...",
        "Pouring one out for the devs...",
        "Blaming the executives...",
        "~*~✿ Drawing a pretty chart ✿~*~",
        "Studying game development...",
        "Studying game theory...",
        "Studying data science...",
        "Undersampling shill takes...",
        "Oversampling based takes...",
        "Tuning desire sensor...",
        "Calculating world-line divergence...",
        "Accepting reality...",
        "Building the Numidium...",
        "WAKE UP",
        "QUESTION AUTHORITY",
        "YOU HAVE NOBODY TO BLAME BUT THEM",
        "ASK AGAIN LATER",
    ],

    // EXTRACTIVE
    EXTRACTIVE: [
        "Calibrating extraction detectors...",
        "Sampling buyer's remorse...",
        "Indexing broken promises...",
        "Reverse engineering the hype...",
        "Amortizing disappointment...",
        "Measuring distance to cashgrab...",
        "Comparing to what was promised...",
        "YOU ARE THROWING YOUR TIME AWAY",
    ],

    // PREDATORY
    PREDATORY: [
        "Liquidating good faith...",
        "Shorting the long-term support...",
        "Auditing the battle pass...",
        "Detecting the pivot to mobile...",
        "Anticipating the live service sunset...",
        "Astroturfing the discourse...",
        "Unleashing the AI shills...",
        "Addressing death threats...",
        "THEY WILL NEVER BE FORGIVEN",
        "READ REVIEWS WITH PREJUDICE",
    ],

    // STOCKHOLM
    STOCKHOLM: [
        "You're not addicted, you just can't stop using it",
        "Measuring stockholm syndrome...",
        "Locating sunk cost fixpoint...",
        "Sampling the salt mines...",
        "HAVE YOU SEEN THE EXIT?",
    ],

    // REFUND_TRAP
    REFUND_TRAP: [
        "Becoming back my money...",
        "Querying the refund window...",
    ],

    // DEAD
    DEAD: [
        "Polling dead servers...",
        "Exhuming abandoned roadmaps...",
        "YOUR OLD GAMES LIE IN RUIN",
        "A DEAD GAME WILL BRING YOU NO FUN TODAY",
    ],

    // ADDICTIVE
    ADDICTIVE: [
        "Computing addiction coefficients...",
        "Remembering when games were not full-time jobs...",
    ],

    // DIVISIVE
    DIVISIVE: [
        "Accepting reality...",
        "Confirming the bias...",
    ],

    // REDEMPTION
    REDEMPTION: [
        "Verifying that it was actually fixed...",
        "Parsing the patch notes...",
        "Crediting the modding community...",
    ],

    // ENSHITTIFIED
    ENSHITTIFIED: [
        "Wondering if it ever gets good...",
        "Mourning the single player campaign...",
    ],

    // LOW_DATA
    LOW_DATA: [
        "THERE IS AS YET INSUFFICIENT DATA FOR A MEANINGFUL ANSWER",
        "Squinting at the sample size...",
        "Extrapolating from vibes...",
        "Drawing conclusions from thin air...",
        "Pulling the relevant bits out of my ass...",
        "THE SOURCE IS THAT I MADE IT THE FUCK UP!",
    ],

    // HORNY
    HORNY: [
        "Getting stuck in the washing machine...",
        "Researching for a friend...",
        "Clearing browser history...",
        "Adjusting the mosaic...",
        "Reading it for the plot...",
        "Proving theorem #34...",
    ],
};

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

    return pool[Math.floor(Math.random() * pool.length)];
}

document.getElementById('hideAnomalies')?.addEventListener('change', () => {
    if (currentSnapshot) updateChart(currentSnapshot);
});
document.getElementById('hideSpikes')?.addEventListener('change', () => {
    if (currentSnapshot) {
        updateChart(currentSnapshot);
        updateVelocityChart(currentSnapshot);
        updateLanguageChart(currentSnapshot);
        updateStats(currentSnapshot);
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

    // reset state
    currentSnapshot = null;
    currentMetrics = null;
    lastMetrics = null;
    convergenceScore = 0;
    loadingMessageCount = 0;
    isFirstSnapshot = true;
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
    document.getElementById('stats').innerHTML = '';
    document.getElementById('metrics-detail').innerHTML = '';
    document.getElementById('opinion-content').innerHTML = '<div class="opinion-loading">⏳ Analyzing...</div>';
    document.getElementById('game-title').textContent = '';
    drawTimeline(); // clears the timeline canvas

    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        currentGameInfo = await infoRes.json();
        document.getElementById('game-title').textContent = currentGameInfo.name;

        // Check for sexual content (flag bit 3 = 8)
        const isSexual = (currentGameInfo.flags & 8) !== 0;
        if (window.setEyeShy) {
            window.setEyeShy(isSexual);
        }
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
        updateStats(snapshot);
        updateMetrics(snapshot);
        isFirstSnapshot = false;

        if (window.setEyeLoading) window.setEyeLoading(true);
    };

    isFirstSnapshot = true;
    ws.onclose = () => {
        isStreaming = false;
        console.log('Analysis complete');

        if (currentSnapshot) {
            const sampled = currentSnapshot.totalPositive + currentSnapshot.totalNegative;
            const gameTotal = currentSnapshot.gameTotalPositive + currentSnapshot.gameTotalNegative;
            const coverage = gameTotal > 0 ? sampled / gameTotal : 1;

            if (coverage > 0.95 || convergenceScore > 0.9) {
                convergenceScore = 1;
            }

            updateMetrics(currentSnapshot);

            // Compute tag timeline after analysis completes
            if (window.Metrics) {
                const isFree = currentGameInfo?.isFree || false;
                const isSexual = currentGameInfo?.flags ? (currentGameInfo.flags & 8) !== 0 : false;
                const tagTimeline = Metrics.computeTimeline(currentSnapshot, 3, { isFree, isSexual });
                console.log('Tag timeline:', tagTimeline);
                updateTagTimeline(tagTimeline);
            }
        }

        if (window.setEyeLoading) window.setEyeLoading(false);
        // Final metrics update triggers eye emotion
        if (currentMetrics) {
            updateEyeFromMetrics(currentMetrics);
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

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
        positive: styles.getPropertyValue('--color-positive').trim(),
        negative: styles.getPropertyValue('--color-negative').trim(),
        uncertain: styles.getPropertyValue('--color-uncertain').trim()
    };
}

function updateChart(snapshot) {
    currentSnapshot = snapshot;

    const showTotal = document.getElementById('showTotalTime').checked;
    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;

    const labels = buckets.map(() => '');
    const hideAnomalies = document.getElementById('hideAnomalies').checked;
    const hideAnnotations = document.getElementById('hideAnnotations').checked;
    const anomalySet = new Set(snapshot.anomalyIndices);

    const positive = buckets.map((b, i) => {
        const filtered = filterBucketByTime(b);
        return hideAnomalies && anomalySet.has(i) ? 0 : filtered.pos;
    });
    const uncertainPos = buckets.map((b, i) => {
        const filtered = filterBucketByTime(b);
        return hideAnomalies && anomalySet.has(i) ? 0 : filtered.uncPos;
    });
    const negative = buckets.map((b, i) => {
        const filtered = filterBucketByTime(b);
        return hideAnomalies && anomalySet.has(i) ? 0 : -filtered.neg;
    });
    const uncertainNeg = buckets.map((b, i) => {
        const filtered = filterBucketByTime(b);
        return hideAnomalies && anomalySet.has(i) ? 0 : -filtered.uncNeg;
    });

    const colors = getColors();

    const positiveColors = buckets.map((_, i) =>
        hexToRgba(colors.positive, anomalySet.has(i) ? 0.3 : 0.7)
    );
    const uncertainPosColors = buckets.map((_, i) =>
        hexToRgba(colors.uncertain, anomalySet.has(i) ? 0.3 : 0.7)
    );
    const negativeColors = buckets.map((_, i) =>
        hexToRgba(colors.negative, anomalySet.has(i) ? 0.3 : 0.7)
    );
    const uncertainNegColors = buckets.map((_, i) =>
        hexToRgba(colors.uncertain, anomalySet.has(i) ? 0.3 : 0.7)
    );

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
                    { label: '👍', data: positive, backgroundColor: positiveColors, stack: 'stack' },
                    { label: '👍*', data: uncertainPos, backgroundColor: uncertainPosColors, stack: 'stack' },
                    { label: '👎', data: negative, backgroundColor: negativeColors, stack: 'stack' },
                    { label: '👎*', data: uncertainNeg, backgroundColor: uncertainNegColors, stack: 'stack' }
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
                                return `${label}: ${value} reviews`;
                            }
                        }
                    }
                }
            }
        });
    } else {
        chart.data.labels = labels;
        chart.data.datasets[0].data = positive;
        chart.data.datasets[0].backgroundColor = positiveColors;
        chart.data.datasets[1].data = uncertainPos;
        chart.data.datasets[1].backgroundColor = uncertainPosColors;
        chart.data.datasets[2].data = negative;
        chart.data.datasets[2].backgroundColor = negativeColors;
        chart.data.datasets[3].data = uncertainNeg;
        chart.data.datasets[3].backgroundColor = uncertainNegColors;
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

    const totalReviews = snapshot.totalPositive + snapshot.totalNegative;
    if (totalReviews === 0) return;

    const profanity = stats.profanity?.total || 0;
    const insults = stats.insults?.total || 0;
    const slurs = stats.slurs?.total || 0;
    const banter = stats.banter?.total || 0;
    const complaints = stats.complaints?.total || 0;

    // calculate rate per review, show as percentage
    const profanityRate = (profanity / totalReviews * 100).toFixed(1);
    const insultsRate = (insults / totalReviews * 100).toFixed(1);
    const slursRate = (slurs / totalReviews * 100).toFixed(1);
    const banterRate = (banter / totalReviews * 100).toFixed(1);
    const complaintsRate = (complaints / totalReviews * 100).toFixed(1);

    const labels = [
        `Slurs (${slursRate}%)`,
        `Profanity (${profanityRate}%)`,
        `Insults (${insultsRate}%)`,
        `Complaints (${complaintsRate}%)`,
        `Banter (${banterRate}%)`,
    ];
    const data = [slurs, profanity, insults, complaints, banter];
    const colors = ['#7c3aed', '#f59e0b', '#ef4444', '#f97316', '#06b6d4'];

    if (!languageChart) {
        languageChart = new Chart(document.getElementById('language-chart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    } else {
        languageChart.data.labels = labels;
        languageChart.data.datasets[0].data = data;
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
    window.addEventListener('resize', resizeTimeline);

    timelineCanvas.addEventListener('mousedown', onTimelineMouseDown);
    window.addEventListener('mousemove', onTimelineMouseMove);
    window.addEventListener('mouseup', onTimelineMouseUp);
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

// Map tag IDs to their CSS variable colors
const tagColorMap = {
    'HEALTHY': '#4ade80',
    'HONEST': '#22c55e',
    'EXTRACTIVE': '#f97316',
    'PREDATORY': '#ef4444',
    'STOCKHOLM': '#a855f7',
    'DIVISIVE': '#eab308',
    'FLOP': '#dc2626',
    'TROUBLED': '#f59e0b',
    'REFUND_TRAP': '#be123c',
    'DEAD': '#6b7280',
    'CULT': '#8b5cf6',
    'HONEYMOON': '#fbbf24',
    'REDEMPTION': '#34d399',
    'ENSHITTIFIED': '#b45309',
    'PHOENIX': '#10b981',
    'PRESS_F': '#9ca3af',
    'ZOMBIE': '#84cc16',
    '180': '#22d3ee',
    'HOPELESS': '#64748b',
    'PLAGUE': '#991b1b',
    'CURSED': '#7f1d1d',
    'ADDICTIVE': '#e879f9',
    'RUGPULL': '#c2410c',
    'HORNY': '#ec4899',
    'LOW_DATA': '#9ca3af',
    'CORRUPTED': '#71717a',
    'REVIEW_BOMBED': '#f43f5e',
    'SURGE': '#06b6d4'
};

function drawTimeline() {
    const w = timelineCanvas.width;
    const h = timelineCanvas.height;
    const colors = getColors();

    timelineCtx.clearRect(0, 0, w, h);

    if (timelineData.months.length === 0) return;

    const tagStripH = tagTimelineData.length > 0 ? 8 : 0;
    const chartH = h - 20 - tagStripH;
    const barW = w / timelineData.months.length;

    for (let i = 0; i < timelineData.months.length; i++) {
        const month = timelineData.months[i];
        const pos = timelineData.positive[month] || 0;
        const neg = timelineData.negative[month] || 0;
        const uncPos = timelineData.uncertainPos[month] || 0;
        const uncNeg = timelineData.uncertainNeg[month] || 0;
        const total = pos + neg + uncPos + uncNeg;

        if (total === 0) continue;

        const totalH = (total / timelineData.maxVolume) * chartH;
        const posH = (pos / total) * totalH;
        const uncPosH = (uncPos / total) * totalH;
        const negH = (neg / total) * totalH;
        const uncNegH = (uncNeg / total) * totalH;

        let y = chartH;

        // negative on bottom
        timelineCtx.fillStyle = colors.negative;
        timelineCtx.fillRect(i * barW, y - negH, barW - 1, negH);
        y -= negH;

        // uncertain negative
        timelineCtx.fillStyle = colors.uncertain;
        timelineCtx.fillRect(i * barW, y - uncNegH, barW - 1, uncNegH);
        y -= uncNegH;

        // uncertain positive
        timelineCtx.fillStyle = colors.uncertain;
        timelineCtx.fillRect(i * barW, y - uncPosH, barW - 1, uncPosH);
        y -= uncPosH;

        // positive on top
        timelineCtx.fillStyle = colors.positive;
        timelineCtx.fillRect(i * barW, y - posH, barW - 1, posH);
    }

    // Draw tag strip below chart
    if (tagTimelineData.length > 0) {
        const stripY = chartH + 2;

        for (const entry of tagTimelineData) {
            const monthIdx = timelineData.months.indexOf(entry.month);
            if (monthIdx < 0) continue;

            const x = (monthIdx / timelineData.months.length) * w;

            // Draw primary tag color (first non-data-quality tag)
            const significantTags = entry.tags.filter(t =>
                !['LOW_DATA', 'CORRUPTED', 'HORNY'].includes(t)
            );
            const primaryTag = significantTags[0] || entry.tags[0];
            const color = tagColorMap[primaryTag] || '#666';

            timelineCtx.fillStyle = color;
            timelineCtx.fillRect(x, stripY, barW, tagStripH - 2);
        }
    }

    // selection outline
    const selX = timelineSelection.start * w;
    const selW = (timelineSelection.end - timelineSelection.start) * w;

    timelineCtx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
    timelineCtx.lineWidth = 2;
    timelineCtx.strokeRect(selX, 0, selW, chartH + tagStripH);

    // handles
    timelineCtx.fillStyle = '#8b0000';
    timelineCtx.fillRect(selX - 4, 0, 8, chartH + tagStripH);
    timelineCtx.fillRect(selX + selW - 4, 0, 8, chartH + tagStripH);

    // year labels
    timelineCtx.fillStyle = '#666';
    timelineCtx.font = '10px Verdana';
    timelineCtx.textAlign = 'center';

    const years = [...new Set(timelineData.months.map(m => m.split('-')[0]))];
    for (const year of years) {
        const juneIdx = timelineData.months.indexOf(`${year}-06`);
        if (juneIdx < 0) continue;
        const x = (juneIdx / timelineData.months.length) * w;
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
    if (!window.Metrics) return;

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
        const preliminaryIcon = loadingMessageCount++ % 2 == 0 ? '⌛' : '⏳';
        const preliminaryWarning = isStreaming && convergenceScore < 0.8
            ? `<div class="loading">${preliminaryIcon} ${loadingMsg}</div>`
            : isStreaming
                ? `<div class="loading">✅ ${loadingMsg}</div>`
                : '';
        metricsEl.innerHTML = `
            ${preliminaryWarning}
            <div class="verdict-tags">
                ${tagPills || '<span class="tag-pill" style="background:#666">NEUTRAL</span>'}
            </div>
            <ul class="reasons">
                ${v.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
            <div class="metrics-raw">
                Median ratio: ${currentMetrics.medianRatio.toFixed(2)} |
                Refund honesty: ${currentMetrics.refundNegRate !== null ? Math.round(currentMetrics.refundNegRate * 100) + '%' : 'N/A (F2P)'} |
                Stockholm: ${currentMetrics.stockholmIndex.toFixed(2)}x |
                Confidence: ${Math.round(convergenceScore * 100)}%
            </div>
        `;
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
    if (!window.setEyeExpression) return;

    const tags = metrics.verdict.tags.map(t => t.id);

    // Pupil dilation for addictive games
    if (window.setEyeDilation) {
        window.setEyeDilation(tags.includes('ADDICTIVE') ? 1 : 0);
    }

    // Priority-based expression
    if (tags.includes('PREDATORY') || tags.includes('REFUND_TRAP')) {
        window.setEyeExpression('angry');
    } else if (tags.includes('EXTRACTIVE') || tags.includes('STOCKHOLM')) {
        window.setEyeExpression('suspicious');
    } else if (tags.includes('FLOP') || tags.includes('DEAD')) {
        window.setEyeExpression('mocking');
    } else if (tags.includes('HEALTHY') || tags.includes('HONEST')) {
        window.setEyeExpression('neutral');
    } else {
        window.setEyeExpression('neutral');
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
