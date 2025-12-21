/**
 * Pattern generators for visualizing projection confidence
 * Crosshatch density indicates how much of the bar is extrapolated vs sampled
 */

/**
 * Creates a crosshatch pattern canvas
 * @param {string} baseColor - rgba or hex color
 * @param {number} density - 0 (solid) to 1 (opaque hatch) 
 * @param {number} size - pattern tile size
 * @returns {HTMLCanvasElement}
 */
function createCrosshatchPattern(baseColor, density, size = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // fill with base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    if (density <= 0.05) return canvas; // below threshold, just solid
    
    // Fixed spacing, variable opacity
    const spacing = 4;
    const alpha = density * 0.5; // max 50% opacity at full density
    
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = 1;
    
    // diagonal lines: top-left to bottom-right
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += spacing) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
    }
    ctx.stroke();
    
    // diagonal lines: top-right to bottom-left (always crosshatch)
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += spacing) {
        ctx.moveTo(i + size, 0);
        ctx.lineTo(i, size);
    }
    ctx.stroke();
    
    return canvas;
}

// Cache for created patterns (avoid recreating every frame)
const patternCache = new Map();

/**
 * Get or create a pattern for a given color and density
 * @param {CanvasRenderingContext2D} ctx - context to create pattern on
 * @param {string} baseColor - base color
 * @param {number} density - projection density (0 = all sampled, 1 = all projected)
 * @returns {CanvasPattern|string} - pattern or solid color
 */
function getProjectionPattern(ctx, baseColor, density) {
    // Round density to avoid cache explosion
    const roundedDensity = Math.round(density * 20) / 20;
    
    if (roundedDensity <= 0.05) return baseColor; // solid
    
    const key = `${baseColor}|${roundedDensity}`;
    
    if (!patternCache.has(key)) {
        const patternCanvas = createCrosshatchPattern(baseColor, roundedDensity);
        const pattern = ctx.createPattern(patternCanvas, 'repeat');
        patternCache.set(key, pattern);
    }
    
    return patternCache.get(key);
}

/**
 * Clear pattern cache (call on color theme change)
 */
function clearPatternCache() {
    patternCache.clear();
}

// Export
window.createCrosshatchPattern = createCrosshatchPattern;
window.getProjectionPattern = getProjectionPattern;
window.clearPatternCache = clearPatternCache;
