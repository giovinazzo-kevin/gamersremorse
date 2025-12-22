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

        // Get projected monthly data from single source of truth
        const projectedMonthly = snapshot.projectedMonthly || [];
        
        // Filter out excluded months and build render data
        const monthData = projectedMonthly
            .filter(m => !excludeMonths.has(m.month))
            .map(m => ({
                ...m,
                // Override extras if cursor exhausted
                extraPos: posExhausted ? 0 : m.extraPos,
                extraNeg: negExhausted ? 0 : m.extraNeg
            }));

        if (monthData.length === 0) return;

        const tagStripH = tagData.length > 0 ? 8 : 0;
        const chartH = h - 20 - tagStripH;
        const midY = chartH / 2;
        const barW = w / monthData.length;

        // Find max and median for adaptive scale normalization
        // Compute exponent so median value fills ~50% of chart height
        let maxPos = 1, maxNeg = 1;
        const posValues = [], negValues = [];
        for (const m of monthData) {
            const totalPos = hidePrediction ? m.sampledPos : m.projectedPos;
            const totalNeg = hidePrediction ? m.sampledNeg : m.projectedNeg;
            maxPos = Math.max(maxPos, totalPos);
            maxNeg = Math.max(maxNeg, totalNeg);
            if (totalPos > 0) posValues.push(totalPos);
            if (totalNeg > 0) negValues.push(totalNeg);
        }
        
        // Get median
        posValues.sort((a, b) => a - b);
        negValues.sort((a, b) => a - b);
        const medianPos = posValues.length > 0 ? posValues[Math.floor(posValues.length / 2)] : 1;
        const medianNeg = negValues.length > 0 ? negValues[Math.floor(negValues.length / 2)] : 1;
        
        // Compute exponent: (median/max)^exp = 0.5 => exp = log(0.5) / log(median/max)
        const posRatio = medianPos / maxPos;
        const negRatio = medianNeg / maxNeg;
        const expPos = posRatio < 1 ? Math.log(0.5) / Math.log(posRatio) : 1;
        const expNeg = negRatio < 1 ? Math.log(0.5) / Math.log(negRatio) : 1;
        // Clamp to reasonable range
        const clampedExpPos = Math.max(0.1, Math.min(1, expPos));
        const clampedExpNeg = Math.max(0.1, Math.min(1, expNeg));

        // Draw bars - centered, pos up, neg down
        // OVERLAY approach: ghost at full height, then solid on top
        for (let i = 0; i < monthData.length; i++) {
            const m = monthData[i];
            const x = i * barW;

            if (hidePrediction) {
                // Just draw sampled data, no ghosts
                const posH = Math.pow(m.sampledPos / maxPos, clampedExpPos) * midY;
                const negH = Math.pow(m.sampledNeg / maxNeg, clampedExpNeg) * midY;

                // Positive (up from midline)
                if (posH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, midY - posH, barW - 1, posH);
                }

                // Negative (down from midline)
                if (negH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, midY, barW - 1, negH);
                }
            } else {
                // OVERLAY: Draw projected (ghost) first, then observed (solid) on top
                const projPosH = Math.pow(m.projectedPos / maxPos, clampedExpPos) * midY;
                const projNegH = Math.pow(m.projectedNeg / maxNeg, clampedExpNeg) * midY;
                const sampPosH = Math.pow(m.sampledPos / maxPos, clampedExpPos) * midY;
                const sampNegH = Math.pow(m.sampledNeg / maxNeg, clampedExpNeg) * midY;

                // === POSITIVE (going UP from midline) ===
                // Ghost layer (projected) at 50% alpha
                if (projPosH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, midY - projPosH, barW - 1, projPosH);
                }
                // Solid layer (sampled) at 100% alpha on top
                if (sampPosH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, midY - sampPosH, barW - 1, sampPosH);
                }

                // === NEGATIVE (going DOWN from midline) ===
                // Ghost layer (projected) at 50% alpha
                if (projNegH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, midY, barW - 1, projNegH);
                }
                // Solid layer (sampled) at 100% alpha on top
                if (sampNegH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, midY, barW - 1, sampNegH);
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
