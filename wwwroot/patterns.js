/**
 * Generates a crosshatch pattern canvas for use with chart.js
 * Density controls how many lines are drawn (0 = none, 1 = dense)
 */
function createCrosshatchPattern(baseColor, density, size = 16) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // fill with base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    if (density <= 0) return canvas;
    
    // crosshatch line settings
    // density 0-1 maps to line spacing: dense = tight spacing, sparse = wide spacing
    const minSpacing = 3;
    const maxSpacing = size;
    const spacing = maxSpacing - (maxSpacing - minSpacing) * Math.min(1, density);
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    
    // diagonal lines: top-left to bottom-right
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += spacing) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
    }
    ctx.stroke();
    
    // diagonal lines: top-right to bottom-left (crosshatch)
    if (density > 0.3) {
        ctx.beginPath();
        for (let i = -size; i < size * 2; i += spacing) {
            ctx.moveTo(i + size, 0);
            ctx.lineTo(i, size);
        }
        ctx.stroke();
    }
    
    return canvas;
}

/**
 * Attempt 2: Bayer matrix ordered dithering
 * Creates a more structured, less noisy pattern
 */
function createBayerPattern(baseColor, density, size = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // fill with base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    if (density <= 0) return canvas;
    
    // 8x8 bayer matrix (normalized 0-1)
    const bayer8x8 = [
        [ 0/64,  32/64,  8/64, 40/64,  2/64, 34/64, 10/64, 42/64],
        [48/64, 16/64, 56/64, 24/64, 50/64, 18/64, 58/64, 26/64],
        [12/64, 44/64,  4/64, 36/64, 14/64, 46/64,  6/64, 38/64],
        [60/64, 28/64, 52/64, 20/64, 62/64, 30/64, 54/64, 22/64],
        [ 3/64, 35/64, 11/64, 43/64,  1/64, 33/64,  9/64, 41/64],
        [51/64, 19/64, 59/64, 27/64, 49/64, 17/64, 57/64, 25/64],
        [15/64, 47/64,  7/64, 39/64, 13/64, 45/64,  5/64, 37/64],
        [63/64, 31/64, 55/64, 23/64, 61/64, 29/64, 53/64, 21/64]
    ];
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const threshold = bayer8x8[y % 8][x % 8];
            if (density > threshold) {
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    
    return canvas;
}

/**
 * Attempt 3: Stipple pattern - random but seeded dots
 * More organic look
 */
function createStipplePattern(baseColor, density, size = 16) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // fill with base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    if (density <= 0) return canvas;
    
    // simple seeded random for consistency
    const seed = (baseColor.charCodeAt(1) || 0) * 1000;
    const random = (i) => {
        const x = Math.sin(seed + i * 9999) * 10000;
        return x - Math.floor(x);
    };
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    
    const numDots = Math.floor(density * size * size * 0.5);
    for (let i = 0; i < numDots; i++) {
        const x = Math.floor(random(i * 2) * size);
        const y = Math.floor(random(i * 2 + 1) * size);
        ctx.fillRect(x, y, 1, 1);
    }
    
    return canvas;
}

// test all three
function testPatterns() {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 20px; padding: 20px; background: #333;';
    
    const densities = [0, 0.25, 0.5, 0.75, 1.0];
    const baseColor = '#4ade80';
    
    for (const density of densities) {
        const col = document.createElement('div');
        col.innerHTML = `<div style="color:white;text-align:center;margin-bottom:5px;">${density}</div>`;
        
        // crosshatch
        const ch = createCrosshatchPattern(baseColor, density);
        ch.style.cssText = 'width:64px;height:64px;margin:5px;';
        col.appendChild(ch);
        
        // bayer
        const by = createBayerPattern(baseColor, density);
        by.style.cssText = 'width:64px;height:64px;margin:5px;image-rendering:pixelated;';
        col.appendChild(by);
        
        // stipple
        const st = createStipplePattern(baseColor, density);
        st.style.cssText = 'width:64px;height:64px;margin:5px;image-rendering:pixelated;';
        col.appendChild(st);
        
        container.appendChild(col);
    }
    
    document.body.appendChild(container);
}

// export for use
window.createCrosshatchPattern = createCrosshatchPattern;
window.createBayerPattern = createBayerPattern;
window.createStipplePattern = createStipplePattern;
window.testPatterns = testPatterns;
