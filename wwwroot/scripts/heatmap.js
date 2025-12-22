// ============================================================
// EDIT HEATMAP
// X = when posted, Y = when edited, color = sentiment
// ============================================================

const Heatmap = (function() {
    let canvas = null;
    let ctx = null;
    let getSnapshot = null;
    let getSelectedMonths = null;

    function init(options) {
        getSnapshot = options.getSnapshot;
        getSelectedMonths = options.getSelectedMonths;
        
        canvas = document.getElementById('edit-heatmap');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', () => {
            document.getElementById('heatmap-tooltip').style.display = 'none';
        });
    }

    function update(snapshot) {
        if (!canvas) {
            init({ getSnapshot: () => snapshot, getSelectedMonths });
            if (!canvas) return;
        }
        
        if (!snapshot.editHeatmap) return;
        
        const heatmap = snapshot.editHeatmap;
        let months = heatmap.months || [];
        let cells = heatmap.cells || {};
        
        // Apply timeline filter
        const range = getSelectedMonths ? getSelectedMonths() : null;
        if (range) {
            months = months.filter(m => m >= range.from && m <= range.to);
            
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
        
        // Aggregate if too many months
        if (months.length > 96) {
            const aggregated = aggregateToYears(months, cells);
            months = aggregated.periods;
            cells = aggregated.cells;
        } else if (months.length > 48) {
            const aggregated = aggregateToQuarters(months, cells);
            months = aggregated.periods;
            cells = aggregated.cells;
        }
        
        if (months.length < 2) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = isDarkMode() ? '#666' : '#999';
            ctx.font = '12px Verdana';
            ctx.textAlign = 'center';
            ctx.fillText('Not enough edit data', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Resize canvas to container
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width - 20;
        canvas.height = rect.height - 20;
        
        const w = canvas.width;
        const h = canvas.height;
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
        canvas._layout = { months, cells, padding, cellW, cellH, n };
        
        // Clear
        ctx.clearRect(0, 0, w, h);
        
        // Draw cells
        for (let xi = 0; xi < n; xi++) {
            for (let yi = 0; yi < n; yi++) {
                const postedMonth = months[xi];
                const editedMonth = months[yi];
                
                if (editedMonth < postedMonth) continue;
                
                const key = `${postedMonth}|${editedMonth}`;
                const cell = cells[key];
                
                const x = padding.left + xi * cellW;
                const y = padding.top + (n - 1 - yi) * cellH;
                
                if (cell) {
                    const total = cell.positive + cell.negative;
                    const intensity = Math.sqrt(total / maxCount);
                    const negRatio = total > 0 ? cell.negative / total : 0;
                    
                    const colors = getColors();
                    const color = negRatio > 0.5 
                        ? hexToRgba(colors.negative, 0.3 + intensity * 0.7)
                        : hexToRgba(colors.positive, 0.3 + intensity * 0.7);
                    
                    ctx.fillStyle = color;
                } else {
                    ctx.fillStyle = postedMonth === editedMonth ? 'rgba(100,100,100,0.1)' : 'rgba(0,0,0,0.02)';
                }
                
                ctx.fillRect(x, y, cellW - 1, cellH - 1);
            }
        }
        
        // Draw diagonal line
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + chartH);
        ctx.lineTo(padding.left + chartW, padding.top);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // X axis labels
        ctx.fillStyle = isDarkMode() ? '#888' : '#666';
        ctx.font = '9px Verdana';
        ctx.textAlign = 'center';
        const labelStep = Math.ceil(n / 10);
        for (let i = 0; i < n; i += labelStep) {
            const x = padding.left + i * cellW + cellW / 2;
            ctx.fillText(months[i], x, h - padding.bottom + 15);
        }
        
        // Y axis labels
        ctx.textAlign = 'right';
        for (let i = 0; i < n; i += labelStep) {
            const y = padding.top + (n - 1 - i) * cellH + cellH / 2 + 3;
            ctx.fillText(months[i], padding.left - 5, y);
        }
        
        // Axis titles
        ctx.fillStyle = isDarkMode() ? '#aaa' : '#333';
        ctx.font = '10px Verdana';
        ctx.textAlign = 'center';
        ctx.fillText('Posted', padding.left + chartW / 2, h - 5);
        
        ctx.save();
        ctx.translate(12, padding.top + chartH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Edited', 0, 0);
        ctx.restore();
    }

    function onMouseMove(e) {
        const layout = canvas._layout;
        if (!layout) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const { months, cells, padding, cellW, cellH, n } = layout;
        
        const xi = Math.floor((x - padding.left) / cellW);
        const yi = n - 1 - Math.floor((y - padding.top) / cellH);
        
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

    function monthToQuarter(month) {
        const [year, mo] = month.split('-');
        const q = Math.ceil(parseInt(mo) / 3);
        return `${year}-Q${q}`;
    }

    function aggregateToYears(months, cells) {
        const yearSet = new Set();
        const newCells = {};
        
        for (const month of months) {
            yearSet.add(month.split('-')[0]);
        }
        
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

    function aggregateToQuarters(months, cells) {
        const quarterSet = new Set();
        const newCells = {};
        
        for (const month of months) {
            quarterSet.add(monthToQuarter(month));
        }
        
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

    return {
        init,
        update
    };
})();
