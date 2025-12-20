
// === CONSTANTS ===
const LOW_HP_THRESHOLD = 0.25;

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 24-color palette for human-readable color names
const COLOR_NAMES = {
    '#000000': 'Black',
    '#FFFFFF': 'White',
    '#808080': 'Gray',
    '#C0C0C0': 'Silver',
    '#FF0000': 'Red',
    '#800000': 'Maroon',
    '#FFFF00': 'Yellow',
    '#808000': 'Olive',
    '#00FF00': 'Lime',
    '#008000': 'Green',
    '#00FFFF': 'Cyan',
    '#008080': 'Teal',
    '#0000FF': 'Blue',
    '#000080': 'Navy',
    '#FF00FF': 'Magenta',
    '#800080': 'Purple',
    '#FFA500': 'Orange',
    '#A52A2A': 'Brown',
    '#FFC0CB': 'Pink',
    '#FFD700': 'Gold',
    '#F0E68C': 'Khaki',
    '#E6E6FA': 'Lavender',
    '#40E0D0': 'Turquoise',
    '#FF7F50': 'Coral',
    '#DC143C': 'Crimson',
    '#FF1493': 'Deep Pink',
    '#C71585': 'Violet'
};

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) {
        return { r: 128, g: 128, b: 128 };  // fallback gray
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r: r || 0, g: g || 0, b: b || 0 };
}

function getColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
        positive: styles.getPropertyValue('--color-positive').trim(),
        negative: styles.getPropertyValue('--color-negative').trim(),
        uncertain: styles.getPropertyValue('--color-uncertain').trim()
    };
}

function colorDistance(c1, c2) {
    // Weighted Euclidean distance (human eye is more sensitive to green)
    const rDiff = c1.r - c2.r;
    const gDiff = c1.g - c2.g;
    const bDiff = c1.b - c2.b;
    return Math.sqrt(2 * rDiff * rDiff + 4 * gDiff * gDiff + 3 * bDiff * bDiff);
}

function getColorName(hex) {
    const target = hexToRgb(hex);
    let closest = 'Unknown';
    let minDist = Infinity;

    for (const [paletteHex, name] of Object.entries(COLOR_NAMES)) {
        const palette = hexToRgb(paletteHex);
        const dist = colorDistance(target, palette);
        if (dist < minDist) {
            minDist = dist;
            closest = name;
        }
    }
    return closest;
}


function updateColorLegend() {
    const legend = document.getElementById('color-legend');
    if (!legend) return;

    const colors = getColors();
    const posName = getColorName(colors.positive);
    const negName = getColorName(colors.negative);
    const uncName = getColorName(colors.uncertain);

    legend.innerHTML = `
        <strong style="color: var(--color-positive)">${posName}</strong> = positive.
        <strong style="color: var(--color-negative)">${negName}</strong> = negative.
        <strong style="color: var(--color-uncertain)">${uncName}</strong> = edited after a week (fence-sitters).
    `;
}

function showObjectivePopup() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.background = 'rgba(0, 0, 0, 0.8)';

    const popup = document.createElement('div');
    popup.className = 'objective-popup';
    popup.innerHTML = `
        <div class="objective-header">OBJECTIVE UPDATED</div>
        <div class="objective-text">Don't die</div>
        <button class="modal-btn objective-close">OK</button>
    `;

    popup.querySelector('.objective-close').onclick = () => {
        overlay.remove();
        setAchievementFlag('combatUnlocked', true);
        setAchievementFlag('gamingJournalist');
        checkAchievements();
    };

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}

function setSelectionEnabled(enabled, saveToStorage = true) {
    selectionDisabled = !enabled;
    document.body.style.userSelect = enabled ? '' : 'none';
    if (saveToStorage) {
        const saved = localStorage.getItem('eyeSettings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.selectionDisabled = !enabled;
        localStorage.setItem('eyeSettings', JSON.stringify(settings));
    }
}
function isSelectionEnabled() {
    return document.body.style.userSelect !== 'none';
}