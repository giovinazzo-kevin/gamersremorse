// ============================================================
// CHARTS - Histogram, velocity, and language chart rendering
// ============================================================

const Charts = (() => {
    // Private state - chart instances
    let chart = null;
    let velocityChart = null;
    let languageChart = null;

    // Dependencies injected from app.js
    let deps = {
        getSnapshot: () => null,
        getGameInfo: () => null,
        getMetrics: () => null,
        getSelectedMonths: () => null,
        filterBucket: (bucket) => bucket,
        isStreaming: () => false
    };

    function init(dependencies) {
        deps = { ...deps, ...dependencies };
    }

    // ============================================================
    // MAIN HISTOGRAM
    // ============================================================

    function updateChart(snapshot) {
        const gameInfo = deps.getGameInfo();
        const showTotal = document.getElementById('showTotalTime')?.checked ?? false;
        const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;

        const labels = buckets.map(() => '');
        const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
        
        if (hidePrediction && typeof getAchievementFlag === 'function' && !getAchievementFlag('hidPrediction')) {
            setAchievementFlag('hidPrediction');
        }

        const hideAnnotations = document.getElementById('hideAnnotations')?.checked ?? false;

        // Calculate projection multipliers from sample rates
        const posRate = snapshot.positiveSampleRate ?? 1;
        const negRate = snapshot.negativeSampleRate ?? 1;
        const posMultiplier = posRate > 0 ? 1 / posRate : 1;
        const negMultiplier = negRate > 0 ? 1 / negRate : 1;

        // Check exhaustion
        const posExhausted = snapshot.positiveExhausted ?? false;
        const negExhausted = snapshot.negativeExhausted ?? false;

        // Build datasets: sampled (solid) and projected (faded)
        // OVERLAY approach: projected as full height behind, sampled on top (separate stacks)
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
            const filtered = deps.filterBucket(b);

            // Sampled values
            sampledPos.push(filtered.pos);
            sampledUncPos.push(filtered.uncPos);
            sampledNeg.push(-filtered.neg);
            sampledUncNeg.push(-filtered.uncNeg);

            // Projected values (extra on top of sampled, for stacking)
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
        
        if (!gameInfo?.isFree) {
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
                        // Projected extra (faded, stacked on top)
                        { label: '👍 (proj)', data: projectedPos, backgroundColor: hexToRgba(colors.positive, 0.35), stack: 'stack' },
                        { label: '👍* (proj)', data: projectedUncPos, backgroundColor: hexToRgba(colors.uncertain, 0.35), stack: 'stack' },
                        { label: '👎 (proj)', data: projectedNeg, backgroundColor: hexToRgba(colors.negative, 0.35), stack: 'stack' },
                        { label: '👎* (proj)', data: projectedUncNeg, backgroundColor: hexToRgba(colors.uncertain, 0.35), stack: 'stack' },
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
                                    const snapshot = deps.getSnapshot();
                                    const showTotal = document.getElementById('showTotalTime')?.checked ?? false;
                                    const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;
                                    const bucket = buckets[idx];
                                    return `${formatPlaytime(bucket.minPlaytime)} - ${formatPlaytime(bucket.maxPlaytime)}`;
                                },
                                label: function (context) {
                                    const value = Math.abs(context.raw);
                                    const label = context.dataset.label;
                                    if (value === 0) return null;
                                    if (label.includes('(proj)')) {
                                        return `${label.replace(' (proj)', '')} projected: ${Math.round(value)}`;
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
            // Sampled (indices 0-3)
            chart.data.datasets[0].data = sampledPos;
            chart.data.datasets[0].backgroundColor = hexToRgba(colors.positive, 0.8);
            chart.data.datasets[1].data = sampledUncPos;
            chart.data.datasets[1].backgroundColor = hexToRgba(colors.uncertain, 0.8);
            chart.data.datasets[2].data = sampledNeg;
            chart.data.datasets[2].backgroundColor = hexToRgba(colors.negative, 0.8);
            chart.data.datasets[3].data = sampledUncNeg;
            chart.data.datasets[3].backgroundColor = hexToRgba(colors.uncertain, 0.8);
            // Projected extra (indices 4-7)
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

    // ============================================================
    // VELOCITY CHART
    // ============================================================

    function updateVelocityChart(snapshot) {
        const labels = ['~1x', '1.25x', '1.5x', '2x', '3x+'];
        const colors = getColors();

        const positive = snapshot.velocityBuckets.map(b => {
            const filtered = deps.filterBucket(b);
            return filtered.pos;
        });
        const uncertainPos = snapshot.velocityBuckets.map(b => {
            const filtered = deps.filterBucket(b);
            return filtered.uncPos;
        });
        const negative = snapshot.velocityBuckets.map(b => {
            const filtered = deps.filterBucket(b);
            return -filtered.neg;
        });
        const uncertainNeg = snapshot.velocityBuckets.map(b => {
            const filtered = deps.filterBucket(b);
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

    // ============================================================
    // LANGUAGE CHART
    // ============================================================

    function updateLanguageChart(snapshot) {
        const stats = snapshot.languageStats;
        if (!stats) return;

        const range = deps.getSelectedMonths();
        const hideSpikes = document.getElementById('hideSpikes')?.checked ?? false;
        const metrics = deps.getMetrics();
        const excludeMonths = hideSpikes && metrics?.excludedMonths ? new Set(metrics.excludedMonths) : new Set();

        // Use snapshot.months directly (typed array format)
        const allMonths = snapshot.months || [];
        const monthlyTotals = snapshot.monthlyTotals;

        if (allMonths.length < 2) return;

        // Filter months by range and exclusions, collect indices
        const filteredIndices = [];
        const filteredMonths = [];
        for (let i = 0; i < allMonths.length; i++) {
            const m = allMonths[i];
            if (excludeMonths.has(m)) continue;
            if (range && (m < range.from || m > range.to)) continue;
            filteredIndices.push(i);
            filteredMonths.push(m);
        }

        if (filteredMonths.length < 2) return;

        // Build time series using typed array indices
        const series = {
            slurs: filteredIndices.map(i => {
                const reviews = (monthlyTotals.pos[i] + monthlyTotals.neg[i] + monthlyTotals.uncPos[i] + monthlyTotals.uncNeg[i]) || 1;
                return ((stats.slurs?.[i] || 0) / reviews) * 100;
            }),
            profanity: filteredIndices.map(i => {
                const reviews = (monthlyTotals.pos[i] + monthlyTotals.neg[i] + monthlyTotals.uncPos[i] + monthlyTotals.uncNeg[i]) || 1;
                return ((stats.profanity?.[i] || 0) / reviews) * 100;
            }),
            insults: filteredIndices.map(i => {
                const reviews = (monthlyTotals.pos[i] + monthlyTotals.neg[i] + monthlyTotals.uncPos[i] + monthlyTotals.uncNeg[i]) || 1;
                return ((stats.insults?.[i] || 0) / reviews) * 100;
            }),
            complaints: filteredIndices.map(i => {
                const reviews = (monthlyTotals.pos[i] + monthlyTotals.neg[i] + monthlyTotals.uncPos[i] + monthlyTotals.uncNeg[i]) || 1;
                return ((stats.complaints?.[i] || 0) / reviews) * 100;
            }),
            banter: filteredIndices.map(i => {
                const reviews = (monthlyTotals.pos[i] + monthlyTotals.neg[i] + monthlyTotals.uncPos[i] + monthlyTotals.uncNeg[i]) || 1;
                return ((stats.banter?.[i] || 0) / reviews) * 100;
            }),
        };

        const colors = getColors();

        // Generate distinct line colors by hue-rotating from base colors
        const lineColors = {
            slurs: colors.negative,
            profanity: rotateHue(colors.negative, -40),
            insults: rotateHue(colors.negative, -80),
            complaints: rotateHue(colors.positive, 50),
            banter: colors.positive,
        };

        if (!languageChart) {
            languageChart = new Chart(document.getElementById('language-chart'), {
                type: 'line',
                data: {
                    labels: filteredMonths,
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
            languageChart.data.labels = filteredMonths;
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

    // ============================================================
    // STATS BAR
    // ============================================================

    function updateStats(snapshot) {
        const showTotal = document.getElementById('showTotalTime')?.checked ?? false;
        const buckets = showTotal ? snapshot.bucketsByTotalTime : snapshot.bucketsByReviewTime;

        const posMedian = computeMedian(buckets, 'positive');
        const negMedian = computeMedian(buckets, 'negative');

        let totalPos = 0, totalNeg = 0;
        for (const bucket of buckets) {
            const filtered = deps.filterBucket(bucket);
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
        const isStreaming = deps.isStreaming();
        const samplingInfo = isStreaming
            ? `<strong>Sampling:</strong> ${sampled.toLocaleString()} / ${target.toLocaleString()} (${coveragePct}% of total) |`
            : `<strong>Sampled:</strong> ${sampled.toLocaleString()} (${coveragePct}%) |`;

        document.getElementById('stats').innerHTML = `
            ${samplingInfo}
            <strong>Game:</strong> ${snapshot.gameTotalPositive.toLocaleString()} 👍 / ${snapshot.gameTotalNegative.toLocaleString()} 👎 (${gameRatio}% positive) |
            <strong>Median:</strong> ${formatPlaytime(posMedian)} 👍 / ${formatPlaytime(negMedian)} 👎
        `;
    }

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================

    function computeMedian(buckets, type) {
        const values = [];

        for (const bucket of buckets) {
            const filtered = deps.filterBucket(bucket);
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
        if (!container || !chart) return;
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

    // ============================================================
    // LIFECYCLE
    // ============================================================

    function destroyAll() {
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
    }

    function getMainChart() {
        return chart;
    }

    // Public API
    return {
        init,
        updateChart,
        updateVelocityChart,
        updateLanguageChart,
        updateStats,
        computeMedian,
        formatPlaytime,
        destroyAll,
        getMainChart
    };
})();
