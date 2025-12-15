/**
 * Chart.js plugin that draws review length distribution as horizontal lines
 * Each REVIEW is one line, width = review length
 * Sorted by length, spaced vertically within the bar
 */
const DitherPlugin = {
    id: 'dither',
    
    // Global flag - set to true when streaming is complete
    enabled: false,
    
    afterDatasetDraw(chart, args) {
        // Check if enabled and checkbox is checked
        if (!this.enabled) return;
        const checkbox = document.getElementById('showVerbosity');
        if (!checkbox || !checkbox.checked) return;
        
        const { ctx } = chart;
        const meta = args.meta;
        const lengthsData = chart.data.datasets[args.index]?.lengths;
        
        if (!lengthsData) return;
        
        // find p95 length for normalization (cache it)
        if (!chart._maxLength) {
            const allLengths = chart.data.datasets
                .flatMap(ds => ds.lengths || [])
                .flat()
                .filter(l => l > 0)
                .sort((a, b) => a - b);
            const p95Idx = Math.floor(allLengths.length * 0.95);
            chart._maxLength = allLengths[p95Idx] || 1;
        }
        const maxLength = chart._maxLength;
        
        for (let i = 0; i < meta.data.length; i++) {
            const bar = meta.data[i];
            const lengths = lengthsData[i];
            
            if (!lengths || lengths.length === 0) continue;
            
            const { x, y, width, height, base } = bar.getProps(['x', 'y', 'width', 'height', 'base']);
            
            const left = Math.floor(x - width / 2);
            const top = Math.floor(Math.min(y, base));
            const w = Math.ceil(width);
            const h = Math.ceil(Math.abs(y - base));
            
            if (w <= 0 || h <= 0) continue;
            
            const isNegative = y > base;
            const bgColors = chart.data.datasets[args.index]?.backgroundColor;
            const barColor = Array.isArray(bgColors) ? bgColors[i] : bgColors;
            const label = chart.data.datasets[args.index]?.label || '';
            const isEdited = label.toLowerCase().includes('edited');
            
            this.drawLines(ctx, left, top, w, h, lengths, maxLength, isNegative, barColor, isEdited);
        }
    },
    
    adjustColor(color, lightnessShift, saturationBoost, hueShift) {
        // parse rgba(r, g, b, a) or rgb(r, g, b)
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return color;
        
        let r = parseInt(match[1]) / 255;
        let g = parseInt(match[2]) / 255;
        let b = parseInt(match[3]) / 255;
        const a = match[4] ? parseFloat(match[4]) : 1;
        
        // RGB to HSL
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        
        // adjust - hue shift toward blue (0.66) for shadows
        h = (h + hueShift + 1) % 1;
        l = Math.max(0, Math.min(1, l + lightnessShift));
        s = Math.max(0, Math.min(1, s + saturationBoost));
        
        // HSL to RGB
        let r2, g2, b2;
        if (s === 0) {
            r2 = g2 = b2 = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r2 = hue2rgb(p, q, h + 1/3);
            g2 = hue2rgb(p, q, h);
            b2 = hue2rgb(p, q, h - 1/3);
        }
        
        return `rgba(${Math.round(r2 * 255)}, ${Math.round(g2 * 255)}, ${Math.round(b2 * 255)}, ${a})`;
    },
    
    drawLines(ctx, x, y, w, h, lengths, maxLength, isNegative, barColor, isEdited) {
        const numReviews = lengths.length;
        if (numReviews === 0) return;
        
        // slightly darker, more saturated, shifted toward blue
        ctx.fillStyle = this.adjustColor(barColor, -0.08, 0.1, 0.03);
        
        // space reviews evenly across bar height
        const spacing = h / numReviews;
        
        for (let i = 0; i < numReviews; i++) {
            const reviewLength = lengths[i]; // already sorted ascending
            // power law scaling to spread out shorter reviews
            const normalized = Math.min(reviewLength / maxLength, 1);
            const lineWidth = Math.max(1, Math.pow(normalized, 0.3) * w);
            
            // position: for normal bars, long at base, short at tip
            // for edited bars, invert: short at base, long at tip
            let lineY;
            if (isEdited) {
                // inverted: short at base, long at tip
                if (isNegative) {
                    lineY = y + ((i + 1) * spacing) - spacing;
                } else {
                    lineY = y + h - ((i + 1) * spacing);
                }
            } else {
                // normal: long at base, short at tip
                if (isNegative) {
                    lineY = y + h - ((i + 1) * spacing);
                } else {
                    lineY = y + (i * spacing);
                }
            }
            
            // center horizontally
            const lineX = x + (w - lineWidth) / 2;
            
            // draw 1px line
            ctx.fillRect(lineX, lineY, lineWidth, 1);
        }
    }
};

// register plugin
Chart.register(DitherPlugin);

window.DitherPlugin = DitherPlugin;
