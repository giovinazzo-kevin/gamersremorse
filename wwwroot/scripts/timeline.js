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

        const yearLabelH = 20;
        const tagStripH = tagData.length > 0 ? 8 : 0;
        // Chart area is full height minus year labels - tags are INSIDE the selection
        const chartH = h - yearLabelH;
        const midY = (chartH - tagStripH) / 2;
        const barW = w / monthData.length;

        // Find global max for unified scale
        // projectedPos already includes uncertains, so don't add uncPos again
        let maxVal = 1;
        for (const m of monthData) {
            const totalPos = hidePrediction ? (m.pos + m.uncPos) : m.projectedPos;
            const totalNeg = hidePrediction ? (m.neg + m.uncNeg) : m.projectedNeg;
            maxVal = Math.max(maxVal, totalPos, totalNeg);
        }

        // Draw bars - centered, pos up, neg down
        // Certain reviews solid, uncertain reviews lighter (on outside edge)
        for (let i = 0; i < monthData.length; i++) {
            const m = monthData[i];
            const x = i * barW;

            if (hidePrediction) {
                // Just draw sampled data, no ghosts
                // Total height must fit in midY
                const totalPos = m.pos + m.uncPos;
                const totalNeg = m.neg + m.uncNeg;
                
                const posScale = totalPos > 0 ? Math.sqrt(totalPos / maxVal) * midY / totalPos : 0;
                const negScale = totalNeg > 0 ? Math.sqrt(totalNeg / maxVal) * midY / totalNeg : 0;
                
                const posCertainH = m.pos * posScale;
                const negCertainH = m.neg * negScale;
                const posUncOnlyH = m.uncPos * posScale;
                const negUncOnlyH = m.uncNeg * negScale;

                // Positive (up from midline): certain first (inner), then uncertain stacked above (outer)
                let yPos = midY;
                if (posCertainH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, yPos - posCertainH, barW - 1, posCertainH);
                    yPos -= posCertainH;
                }
                if (posUncOnlyH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yPos - posUncOnlyH, barW - 1, posUncOnlyH);
                }

                // Negative (down from midline): certain first (inner), then uncertain stacked below (outer)
                let yNeg = midY;
                if (negCertainH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, yNeg, barW - 1, negCertainH);
                    yNeg += negCertainH;
                }
                if (negUncOnlyH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yNeg, barW - 1, negUncOnlyH);
                }
            } else {
                // Stack order matches chart: certain → proj certain → proj uncertain → sampled uncertain
                // Note: projectedPos already includes uncertains, so total is just projectedPos
                // But we want to show sampled uncertain separately, so:
                // - projectedPos includes projected certain + projected uncertain
                // - We show: sampled certain, then projected extra (proj - sampled), then sampled uncertain
                
                // Total bar height = projectedPos (which is scaled observedPos = pos + uncPos)
                // We DON'T add uncPos again - it's already in projectedPos
                const totalPos = m.projectedPos;
                const totalNeg = m.projectedNeg;
                
                // Heights as proportion of total, scaled to midY
                const posScale = totalPos > 0 ? Math.sqrt(totalPos / maxVal) * midY / totalPos : 0;
                const negScale = totalNeg > 0 ? Math.sqrt(totalNeg / maxVal) * midY / totalNeg : 0;
                
                // Sampled parts
                const posCertainH = m.pos * posScale;
                const negCertainH = m.neg * negScale;
                const posUncOnlyH = m.uncPos * posScale;
                const negUncOnlyH = m.uncNeg * negScale;
                
                // Projected extras (what projection adds beyond sampled)
                // extraPos = projectedPos - observedPos = projectedPos - (pos + uncPos)
                const projExtraPosH = m.extraPos * posScale;
                const projExtraNegH = m.extraNeg * negScale;
                
                // Projected uncertain (proportional to sampled uncertain ratio)
                const uncRatioPos = (m.pos + m.uncPos) > 0 ? m.uncPos / (m.pos + m.uncPos) : 0;
                const uncRatioNeg = (m.neg + m.uncNeg) > 0 ? m.uncNeg / (m.neg + m.uncNeg) : 0;
                const projUncPosH = projExtraPosH * uncRatioPos;
                const projUncNegH = projExtraNegH * uncRatioNeg;
                // Adjust proj extra to only be the certain part
                const projCertainPosH = projExtraPosH - projUncPosH;
                const projCertainNegH = projExtraNegH - projUncNegH;

                // === POSITIVE (going UP from midline) ===
                let yPos = midY;
                // 1. Sampled certain (solid)
                if (posCertainH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, yPos - posCertainH, barW - 1, posCertainH);
                    yPos -= posCertainH;
                }
                // 2. Projected certain extra (faded)
                if (projCertainPosH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.positive;
                    ctx.fillRect(x, yPos - projCertainPosH, barW - 1, projCertainPosH);
                    yPos -= projCertainPosH;
                }
                // 3. Projected uncertain (faded gray)
                if (projUncPosH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yPos - projUncPosH, barW - 1, projUncPosH);
                    yPos -= projUncPosH;
                }
                // 4. Sampled uncertain (solid gray)
                if (posUncOnlyH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yPos - posUncOnlyH, barW - 1, posUncOnlyH);
                }

                // === NEGATIVE (going DOWN from midline) ===
                let yNeg = midY;
                // 1. Sampled certain (solid)
                if (negCertainH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, yNeg, barW - 1, negCertainH);
                    yNeg += negCertainH;
                }
                // 2. Projected certain extra (faded)
                if (projCertainNegH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.negative;
                    ctx.fillRect(x, yNeg, barW - 1, projCertainNegH);
                    yNeg += projCertainNegH;
                }
                // 3. Projected uncertain (faded gray)
                if (projUncNegH > 0) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yNeg, barW - 1, projUncNegH);
                    yNeg += projUncNegH;
                }
                // 4. Sampled uncertain (solid gray)
                if (negUncOnlyH > 0) {
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = colors.uncertain;
                    ctx.fillRect(x, yNeg, barW - 1, negUncOnlyH);
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

        // Draw tag strip at bottom of chart area (above year labels, inside selection)
        if (tagData.length > 0) {
            const stripY = chartH - tagStripH;
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

        // Selection outline - covers chart area (bars + tags)
        const selX = selection.start * w;
        const selW = (selection.end - selection.start) * w;
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(selX, 0, selW, chartH);

        // Handles
        ctx.fillStyle = '#8b0000';
        ctx.fillRect(selX - 4, 0, 8, chartH);
        ctx.fillRect(selX + selW - 4, 0, 8, chartH);

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
