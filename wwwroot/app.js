let chart = null;
let currentSnapshot = null;

async function analyze() {
    const input = document.getElementById('appId').value;
    const appId = extractAppId(input);
    if (!appId) return alert('Invalid App ID');
    
    // fetch game info
    const infoRes = await fetch(`/game/${appId}`);
    if (infoRes.ok) {
        const info = await infoRes.json();
        document.getElementById('game-title').textContent = info.name;
    }
    
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/game/${appId}`);
    
    ws.onmessage = (e) => {
        const snapshot = JSON.parse(e.data);
        updateChart(snapshot);
        updateStats(snapshot);
    };
    
    ws.onclose = () => console.log('Analysis complete');
}

function extractAppId(input) {
    const match = input.match(/app\/(\d+)/) || input.match(/^(\d+)$/);
    return match ? match[1] : null;
}

function updateChart(snapshot) {
    currentSnapshot = snapshot;

    const labels = snapshot.buckets.map(() => '');
    const positive = snapshot.buckets.map(b => b.positiveCount);
    const negative = snapshot.buckets.map(b => -b.negativeCount);
    
    const annotations = buildMedianAnnotations(snapshot);
    annotations.refundLine = {
        type: 'line',
        xMin: findExactPosition(snapshot.buckets, 120),
        xMax: findExactPosition(snapshot.buckets, 120),
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

    if (!chart) {
        chart = new Chart(document.getElementById('chart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Positive', data: positive, backgroundColor: 'rgba(59, 130, 246, 0.7)' },  // blue
                    { label: 'Negative', data: negative, backgroundColor: 'rgba(249, 115, 22, 0.7)' }   // orange
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
                    annotation: { annotations },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const idx = context[0].dataIndex;
                                const bucket = currentSnapshot.buckets[idx];
                                return `${formatPlaytime(bucket.minPlaytime)} - ${formatPlaytime(bucket.maxPlaytime)}`;
                            },
                            label: function(context) {
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
        chart.data.datasets[1].data = negative;
        chart.options.plugins.annotation.annotations = annotations;
        chart.update();
    }
    
    addCustomLabels(snapshot);
}

function addCustomLabels(snapshot) {
    const container = document.getElementById('labels-container');
    container.innerHTML = '';
    
    const buckets = snapshot.buckets;
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

function buildMedianAnnotations(snapshot) {
    return {
        posMedian: {
            type: 'line',
            xMin: findExactPosition(snapshot.buckets, snapshot.positiveMedian),
            xMax: findExactPosition(snapshot.buckets, snapshot.positiveMedian),
            borderColor: 'rgba(59, 130, 246, 0.9)',  // blue
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Positive: ${formatPlaytime(snapshot.positiveMedian)}`,
                position: 'end',
                yAdjust: 30,
                backgroundColor: 'rgba(30, 64, 175, 0.7)',  // darker blue
                color: 'white'
            }
        },
        negMedian: {
            type: 'line',
            xMin: findExactPosition(snapshot.buckets, snapshot.negativeMedian),
            xMax: findExactPosition(snapshot.buckets, snapshot.negativeMedian),
            borderColor: 'rgba(249, 115, 22, 0.9)',  // orange
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `Negative: ${formatPlaytime(snapshot.negativeMedian)}`,
                position: 'start',
                yAdjust: -30,
                backgroundColor: 'rgba(154, 52, 18, 0.7)',  // darker orange
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
            // interpolate within the bucket
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
    document.getElementById('stats').innerHTML = `
        <strong>Total:</strong> ${snapshot.totalPositive + snapshot.totalNegative} reviews |
        <strong>Positive median:</strong> ${formatPlaytime(snapshot.positiveMedian)} |
        <strong>Negative median:</strong> ${formatPlaytime(snapshot.negativeMedian)}
    `;
}