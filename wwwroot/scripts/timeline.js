// ============================================================
// TIMELINE - Temporal selection and visualization
// ============================================================

const Timeline = (() => {
    // Private state
    let canvas = null;
    let ctx = null;
    let data = { months: [], positive: {}, negative: {}, uncertainPos: {}, uncertainNeg: {}, volume: [], maxVolume: 0 };
    let selection = { start: 0, end: 1 };
    let drag = null;
    let tagData = [];

    // Dependencies injected from app.js (getColors/isDarkMode come from utils.js globals)
    let deps = {
        getSnapshot: () => null,
        getMetrics: () => null,
        onSelectionChange: () => {}
    };

    function init(dependencies) {
        deps = { ...deps, ...dependencies };
        
        canvas = document.getElementById('timeline');
        if (!canvas) return;
        
        ctx = canvas.getContext('2d');
        
        resize();
        addEventListener('resize', resize);
        
        canvas.addEventListener('mousedown', onMouseDown);
        addEventListener('mousemove', onMouseMove);
        addEventListener('mouseup', onMouseUp);
    }

    function resize() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        draw();
    }

    function updateData(snapshot, reset = false) {
        const { months, monthlyTotals } = snapshot;
        
        // Convert typed arrays to dict format
        const positive = {};
        const negative = {};
        const uncertainPos = {};
        const uncertainNeg = {};
        const volume = [];
        
        for (let i = 0; i < months.length; i++) {
            const m = months[i];
            const pos = monthlyTotals.pos[i];
            const neg = monthlyTotals.neg[i];
            const uncPos = monthlyTotals.uncPos[i];
            const uncNeg = monthlyTotals.uncNeg[i];
            
            if (pos > 0) positive[m] = pos;
            if (neg > 0) negative[m] = neg;
            if (uncPos > 0) uncertainPos[m] = uncPos;
            if (uncNeg > 0) uncertainNeg[m] = uncNeg;
            volume.push(pos + neg + uncPos + uncNeg);
        }

        data.months = months;
        data.positive = positive;
        data.negative = negative;
        data.uncertainPos = uncertainPos;
        data.uncertainNeg = uncertainNeg;
        data.volume = volume;
        data.maxVolume = Math.max(...volume, 1);

        if (reset) {
            selection = { start: 0, end: 1 };
        }

        draw();
    }

    function updateTagData(timeline) {
        tagData = timeline;
        draw();
    }

    function reset() {
        data = { months: [], positive: {}, negative: {}, uncertainPos: {}, uncertainNeg: {}, volume: [], maxVolume: 0 };
        selection = { start: 0, end: 1 };
        tagData = [];
        draw();
    }

    function draw() {
        if (!canvas || !ctx) return;
        
        const w = canvas.width;
        const h = canvas.height;
        const colors = getColors(); // from utils.js
        
        ctx.clearRect(0, 0, w, h);
        if (data.months.length === 0) return;
        
        const snapshot = deps.getSnapshot();
        if (!snapshot) return;

        const posExhausted = snapshot?.positiveExhausted ?? false;
        const negExhausted = snapshot?.negativeExhausted ?? false;
        const hidePrediction = document.getElementById('hidePrediction')?.checked ?? false;
        const hideSpikes = document.getElementById('hideSpikes')?.checked ?? false;
        const metrics = deps.getMetrics();
        const excludeMonths = hideSpikes && metrics?.excludedMonths
            ? new Set(metrics.excludedMonths)
            : new Set();

        const gameTotalPos = snapshot?.gameTotalPositive ?? 0;
        const gameTotalNeg = snapshot?.gameTotalNegative ?? 0;
        const gameTotal = gameTotalPos + gameTotalNeg;
        const trueRatio = gameTotal > 0 ? gameTotalPos / gameTotal : 0.5;

        const monthData = [];
        let totalSampled = 0;

        for (const month of data.months) {
            if (excludeMonths.has(month)) continue;

            const pos = (data.positive[month] || 0);
            const neg = (data.negative[month] || 0);
            const uncPos = (data.uncertainPos[month] || 0);
            const uncNeg = (data.uncertainNeg[month] || 0);
            const sampledPos = pos + uncPos;
            const sampledNeg = neg + uncNeg;
            const sampledTotal = sampledPos + sampledNeg;

            totalSampled += sampledTotal;
            monthData.push({ month, pos, neg, uncPos, uncNeg, sampledPos, sampledNeg, sampledTotal });
        }

        if (monthData.length === 0 || totalSampled === 0) return;

        const sampleRate = totalSampled / gameTotal;

        const n = monthData.length;
        for (let i = 0; i < n; i++) {
            const m = monthData[i];
            const positionRatio = i / Math.max(1, n - 1);
            const maxMultiplier = sampleRate > 0 ? 1 / sampleRate : 1;
            const multiplier = Math.pow(maxMultiplier, 1 - positionRatio);
            m.estimatedTrue = m.sampledTotal * multiplier;
        }

        const estimateSum = monthData.reduce((sum, m) => sum + m.estimatedTrue, 0);
        const normalizeFactor = estimateSum > 0 ? gameTotal / estimateSum : 1;

        for (const m of monthData) {
            m.projectedTotal = m.estimatedTrue * normalizeFactor;

            const localRatio = m.sampledTotal > 0 ? m.sampledPos / m.sampledTotal : trueRatio;
            const ratioDiff = localRatio - trueRatio;

            if (ratioDiff >= 0) {
                m.projectedNeg = m.sampledNeg;
                m.projectedPos = Math.max(m.sampledPos, m.projectedTotal - m.projectedNeg);
            } else {
                m.projectedPos = m.sampledPos;
                m.projectedNeg = Math.max(m.sampledNeg, m.projectedTotal - m.projectedPos);
            }

            m.extraPos = posExhausted ? 0 : Math.max(0, m.projectedPos - m.sampledPos);
            m.extraNeg = negExhausted ? 0 : Math.max(0, m.projectedNeg - m.sampledNeg);
        }

        const tagStripH = tagData.length > 0 ? 8 : 0;
        const chartH = h - 20 - tagStripH;
        const midY = chartH / 2;
        const barW = w / monthData.length;

        // Find max for log scale normalization
        let maxPos = 1, maxNeg = 1;
        for (const m of monthData) {
            const totalPos = hidePrediction ? m.sampledPos : (m.sampledPos + m.extraPos);
            const totalNeg = hidePrediction ? m.sampledNeg : (m.sampledNeg + m.extraNeg);
            maxPos = Math.max(maxPos, totalPos);
            maxNeg = Math.max(maxNeg, totalNeg);
        }
        const logMaxPos = Math.log(maxPos + 1);
        const logMaxNeg = Math.log(maxNeg + 1);

        // Draw bars - centered, pos up, neg down
        for (let i = 0; i < monthData.length; i++) {
            const m = monthData[i];

            const totalPos = hidePrediction ? m.sampledPos : (m.sampledPos + m.extraPos);
            const totalNeg = hidePrediction ? m.sampledNeg : (m.sampledNeg + m.extraNeg);

            const posH = (Math.log(totalPos + 1) / logMaxPos) * midY;
            const negH = (Math.log(totalNeg + 1) / logMaxNeg) * midY;

            const sampledPosRatio = totalPos > 0 ? m.pos / totalPos : 0;
            const uncPosRatio = totalPos > 0 ? m.uncPos / totalPos : 0;
            const extraPosRatio = totalPos > 0 ? m.extraPos / totalPos : 0;

            const sampledNegRatio = totalNeg > 0 ? m.neg / totalNeg : 0;
            const uncNegRatio = totalNeg > 0 ? m.uncNeg / totalNeg : 0;
            const extraNegRatio = totalNeg > 0 ? m.extraNeg / totalNeg : 0;

            const x = i * barW;

            // === POSITIVE (going UP from midline) ===
            let y = midY;

            ctx.globalAlpha = 1;
            const sampledPosH = sampledPosRatio * posH;
            if (sampledPosH > 0) {
                ctx.fillStyle = colors.positive;
                ctx.fillRect(x, y - sampledPosH, barW - 1, sampledPosH);
                y -= sampledPosH;
            }

            const uncPosH = uncPosRatio * posH;
            if (uncPosH > 0) {
                ctx.fillStyle = colors.uncertain;
                ctx.fillRect(x, y - uncPosH, barW - 1, uncPosH);
                y -= uncPosH;
            }

            if (!hidePrediction) {
                const extraPosH = extraPosRatio * posH;
                if (extraPosH > 0) {
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, y - extraPosH, barW - 1, extraPosH);
                    y -= extraPosH;
                }
            }

            // === NEGATIVE (going DOWN from midline) ===
            y = midY;
            ctx.globalAlpha = 1;

            const sampledNegH = sampledNegRatio * negH;
            if (sampledNegH > 0) {
                ctx.fillStyle = colors.negative;
                ctx.fillRect(x, y, barW - 1, sampledNegH);
                y += sampledNegH;
            }

            const uncNegH = uncNegRatio * negH;
            if (uncNegH > 0) {
                ctx.fillStyle = colors.uncertain;
                ctx.fillRect(x, y, barW - 1, uncNegH);
                y += uncNegH;
            }

            if (!hidePrediction) {
                const extraNegH = extraNegRatio * negH;
                if (extraNegH > 0) {
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, y, barW - 1, extraNegH);
                    y += extraNegH;
                }
            }
        }

        ctx.globalAlpha = 1;

        // Draw midline
        ctx.strokeStyle = isDarkMode() ? '#444' : '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();

        // Draw tag strip below chart
        if (tagData.length > 0) {
            const stripY = chartH + 2;
            for (const entry of tagData) {
                const monthIdx = monthData.findIndex(m => m.month === entry.month);
                if (monthIdx < 0) continue;
                const x = (monthIdx / monthData.length) * w;
                const significantTags = entry.tags.filter(t =>
                    !['LOW_DATA', 'CORRUPTED', 'HORNY'].includes(t)
                );
                const primaryTag = significantTags[0] || entry.tags[0];
                const color = getTagColor(primaryTag);
                ctx.fillStyle = color;
                ctx.fillRect(x, stripY, barW, tagStripH - 2);
            }
        }

        // Selection outline
        const selX = selection.start * w;
        const selW = (selection.end - selection.start) * w;
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(selX, 0, selW, chartH + tagStripH);

        // Handles
        ctx.fillStyle = '#8b0000';
        ctx.fillRect(selX - 4, 0, 8, chartH + tagStripH);
        ctx.fillRect(selX + selW - 4, 0, 8, chartH + tagStripH);

        // Year labels
        ctx.fillStyle = isDarkMode() ? '#888' : '#666';
        ctx.font = '10px Verdana';
        ctx.textAlign = 'center';
        const years = [...new Set(monthData.map(m => m.month.split('-')[0]))];
        for (const year of years) {
            const juneMonth = `${year}-06`;
            const juneIdx = monthData.findIndex(m => m.month === juneMonth);
            if (juneIdx < 0) continue;
            const x = (juneIdx / monthData.length) * w;
            ctx.fillText(year, x, h - 5);
        }

        updateLabel();
    }

    function updateLabel() {
        const el = document.getElementById('timeline-range');
        if (!el) return;
        
        if (data.months.length === 0) {
            el.textContent = '';
            return;
        }

        const startIdx = Math.floor(selection.start * (data.months.length - 1));
        const endIdx = Math.floor(selection.end * (data.months.length - 1));
        const startMonth = data.months[startIdx];
        const endMonth = data.months[endIdx];

        el.textContent = `${startMonth} → ${endMonth}`;
    }

    function onMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;

        const handleSize = 0.02;
        const nearStart = Math.abs(x - selection.start) < handleSize;
        const nearEnd = Math.abs(x - selection.end) < handleSize;
        const inside = x >= selection.start && x <= selection.end;

        if (nearStart && !nearEnd) {
            drag = 'start';
        } else if (nearEnd && !nearStart) {
            drag = 'end';
        } else if (inside) {
            drag = { type: 'middle', offsetStart: x - selection.start, offsetEnd: selection.end - x };
        }
    }

    function onMouseMove(e) {
        if (!drag || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (drag === 'start') {
            selection.start = Math.min(x, selection.end - 0.02);
        } else if (drag === 'end') {
            selection.end = Math.max(x, selection.start + 0.02);
        } else if (drag.type === 'middle') {
            const width = selection.end - selection.start;
            let newStart = x - drag.offsetStart;
            let newEnd = x + drag.offsetEnd;

            if (newStart < 0) { newStart = 0; newEnd = width; }
            if (newEnd > 1) { newEnd = 1; newStart = 1 - width; }

            selection.start = newStart;
            selection.end = newEnd;
        }

        draw();
    }

    function onMouseUp() {
        if (drag) {
            drag = null;
            deps.onSelectionChange();
        }
    }

    function getSelectedMonths() {
        if (data.months.length === 0) return null;

        const startIdx = Math.floor(selection.start * (data.months.length - 1));
        const endIdx = Math.floor(selection.end * (data.months.length - 1));

        return {
            from: data.months[startIdx],
            to: data.months[endIdx]
        };
    }

    function getSelection() {
        return { ...selection };
    }

    function setSelection(start, end) {
        selection.start = start;
        selection.end = end;
        draw();
    }

    // Public API
    return {
        init,
        updateData,
        updateTagData,
        reset,
        draw,
        getSelectedMonths,
        getSelection,
        setSelection
    };
})();
