let fpColors = null;

function initFingerprintColors() {
    if (fpColors) return;
    const get = name => {
        const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    };
    fpColors = {
        pos: get('--color-positive'),
        neg: get('--color-negative'),
        unc: get('--color-uncertain')
    };
}

function renderFingerprint(rgba, canvas) {
    initFingerprintColors();
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(120, 100);

    for (let i = 0; i < 120 * 100; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];

        if (r > 0 || g > 0) {
            const color = (r > 0 && g > 0 && Math.abs(r - g) < 10)
                ? fpColors.unc
                : (r > g ? fpColors.pos : fpColors.neg);
            img.data[i * 4] = color[0];
            img.data[i * 4 + 1] = color[1];
            img.data[i * 4 + 2] = color[2];
            img.data[i * 4 + 3] = 255;
        }
    }

    ctx.putImageData(img, 0, 0);
}

function decodeFingerprint(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
