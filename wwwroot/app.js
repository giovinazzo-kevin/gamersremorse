let chart = null;
let velocityChart = null;
let currentSnapshot = null;
let currentGameInfo = null;
let timelineCanvas = null;
let timelineCtx = null;
let timelineData = { months: [], positive: {}, negative: {}, uncertainPos: {}, uncertainNeg: {}, volume: [], maxVolume: 0 };
let timelineSelection = { start: 0, end: 1 };
let timelineDrag = null;
let isFirstSnapshot = true;

document.getElementById('hideAnomalies')?.addEventListener('change', () => {
    if (currentSnapshot) updateChart(currentSnapshot);
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

    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        currentGameInfo = await infoRes.json();
        document.getElementById('game-title').textContent = currentGameInfo.name;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/game/${appId}`);

    ws.onmessage = (e) => {
        const snapshot = JSON.parse(e.data);
        updateChart(snapshot);
        updateTimelineData(snapshot, isFirstSnapshot);
        updateVelocityChart(snapshot);
        updateStats(snapshot);
        isFirstSnapshot = false;
    };

    isFirstSnapshot = true;
    ws.onclose = () => console.log('Analysis complete');
}

function extractAppId(input) {
    const match = input.match(/app\/(\d+)/) || input.match(/^(\d+)$/);
    return match ? match[1] : null;
}

function updateChart(snapshot) {
    currentSnapshot = snapshot;

    const showTotal = document.getElementById('showTotalTime').checked;
    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;
    const posMedian = showTotal ? snapshot.positiveMedianTotal : snapshot.positiveMedianReview;
    const negMedian = showTotal ? snapshot.negativeMedianTotal : snapshot.negativeMedianReview;

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

    const positiveColors = buckets.map((_, i) =>
        anomalySet.has(i) ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.7)'
    );
    const uncertainPosColors = buckets.map((_, i) =>
        anomalySet.has(i) ? 'rgba(120, 120, 120, 0.3)' : 'rgba(120, 120, 120, 0.7)'
    );
    const negativeColors = buckets.map((_, i) =>
        anomalySet.has(i) ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.7)'
    );
    const uncertainNegColors = buckets.map((_, i) =>
        anomalySet.has(i) ? 'rgba(120, 120, 120, 0.3)' : 'rgba(120, 120, 120, 0.7)'
    );

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
                    { label: 'Positive', data: positive, backgroundColor: positiveColors, stack: 'stack' },
                    { label: 'Uncertain (Positive)', data: uncertainPos, backgroundColor: uncertainPosColors, stack: 'stack' },
                    { label: 'Negative', data: negative, backgroundColor: negativeColors, stack: 'stack' },
                    { label: 'Uncertain (Negative)', data: uncertainNeg, backgroundColor: uncertainNegColors, stack: 'stack' }
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
    const labels = ['Quit', '<25%', '25-50%', '50-100%', '2x', '3x+'];

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
                    { label: 'Positive', data: positive, backgroundColor: 'rgba(59, 130, 246, 0.7)', stack: 'stack' },
                    { label: 'Uncertain (Positive)', data: uncertainPos, backgroundColor: 'rgba(120, 120, 120, 0.7)', stack: 'stack' },
                    { label: 'Negative', data: negative, backgroundColor: 'rgba(249, 115, 22, 0.7)', stack: 'stack' },
                    { label: 'Uncertain (Negative)', data: uncertainNeg, backgroundColor: 'rgba(120, 120, 120, 0.7)', stack: 'stack' }
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
        velocityChart.data.datasets[1].data = uncertainPos;
        velocityChart.data.datasets[2].data = negative;
        velocityChart.data.datasets[3].data = uncertainNeg;
        velocityChart.update();
    }
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
    return {
        posMedian: {
            type: 'line',
            xMin: findExactPosition(buckets, posMedian),
            xMax: findExactPosition(buckets, posMedian),
            borderColor: 'rgba(59, 130, 246, 0.9)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Positive: ${formatPlaytime(posMedian)}`,
                position: 'end',
                yAdjust: 30,
                backgroundColor: 'rgba(30, 64, 175, 0.7)',
                color: 'white'
            }
        },
        negMedian: {
            type: 'line',
            xMin: findExactPosition(buckets, negMedian),
            xMax: findExactPosition(buckets, negMedian),
            borderColor: 'rgba(249, 115, 22, 0.9)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Negative: ${formatPlaytime(negMedian)}`,
                position: 'start',
                yAdjust: -30,
                backgroundColor: 'rgba(154, 52, 18, 0.7)',
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
    const posMedian = showTotal ? snapshot.positiveMedianTotal : snapshot.positiveMedianReview;
    const negMedian = showTotal ? snapshot.negativeMedianTotal : snapshot.negativeMedianReview;

    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;
    let totalPos = 0, totalNeg = 0;
    for (const bucket of buckets) {
        const filtered = filterBucketByTime(bucket);
        totalPos += filtered.pos + filtered.uncPos;
        totalNeg += filtered.neg + filtered.uncNeg;
    }

    document.getElementById('stats').innerHTML = `
        <strong>Total:</strong> ${totalPos + totalNeg} reviews |
        <strong>Positive median:</strong> ${formatPlaytime(posMedian)} |
        <strong>Negative median:</strong> ${formatPlaytime(negMedian)}
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

function drawTimeline() {
    const w = timelineCanvas.width;
    const h = timelineCanvas.height;

    timelineCtx.clearRect(0, 0, w, h);

    if (timelineData.months.length === 0) return;

    const chartH = h - 20;
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

        // blue on bottom (positive)
        timelineCtx.fillStyle = 'rgba(59, 130, 246, 0.7)';
        timelineCtx.fillRect(i * barW, y - posH, barW - 1, posH);
        y -= posH;

        // gray (uncertain positive)
        timelineCtx.fillStyle = 'rgba(120, 120, 120, 0.7)';
        timelineCtx.fillRect(i * barW, y - uncPosH, barW - 1, uncPosH);
        y -= uncPosH;

        // gray (uncertain negative)
        timelineCtx.fillStyle = 'rgba(120, 120, 120, 0.7)';
        timelineCtx.fillRect(i * barW, y - uncNegH, barW - 1, uncNegH);
        y -= uncNegH;

        // orange on top (negative)
        timelineCtx.fillStyle = 'rgba(249, 115, 22, 0.7)';
        timelineCtx.fillRect(i * barW, y - negH, barW - 1, negH);
    }

    // selection outline
    const selX = timelineSelection.start * w;
    const selW = (timelineSelection.end - timelineSelection.start) * w;

    timelineCtx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
    timelineCtx.lineWidth = 2;
    timelineCtx.strokeRect(selX, 0, selW, chartH);

    // handles
    timelineCtx.fillStyle = '#8b0000';
    timelineCtx.fillRect(selX - 4, 0, 8, chartH);
    timelineCtx.fillRect(selX + selW - 4, 0, 8, chartH);

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
    if (!range) return {
        pos: bucket.positiveCount,
        neg: bucket.negativeCount,
        uncPos: bucket.uncertainPositiveCount,
        uncNeg: bucket.uncertainNegativeCount
    };

    let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
    for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
        if (month >= range.from && month <= range.to) pos += count;
    }
    for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
        if (month >= range.from && month <= range.to) neg += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
        if (month >= range.from && month <= range.to) uncPos += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
        if (month >= range.from && month <= range.to) uncNeg += count;
    }
    return { pos, neg, uncPos, uncNeg };
}

function filterVelocityBucketByTime(bucket) {
    const range = getSelectedMonths();
    if (!range) return {
        pos: bucket.positiveCount,
        neg: bucket.negativeCount,
        uncPos: bucket.uncertainPositiveCount,
        uncNeg: bucket.uncertainNegativeCount
    };

    let pos = 0, neg = 0, uncPos = 0, uncNeg = 0;
    for (const [month, count] of Object.entries(bucket.positiveByMonth)) {
        if (month >= range.from && month <= range.to) pos += count;
    }
    for (const [month, count] of Object.entries(bucket.negativeByMonth)) {
        if (month >= range.from && month <= range.to) neg += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainPositiveByMonth)) {
        if (month >= range.from && month <= range.to) uncPos += count;
    }
    for (const [month, count] of Object.entries(bucket.uncertainNegativeByMonth)) {
        if (month >= range.from && month <= range.to) uncNeg += count;
    }
    return { pos, neg, uncPos, uncNeg };
}