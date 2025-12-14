const svg = document.getElementById('eye');
const width = svg.clientWidth;
const height = svg.clientHeight;
const centerX = width / 2;
const centerY = height / 2;
const frameInterval = 1000 / 15;
let lastFrame = 0;

const config = {
    barCount: 51,
    barWidthMin: 0.01,
    barWidthMax: 0.02,
    gapRatio: 0.8,
    maxLashLength: 0.04,
    maxIrisOffsetX: 0.26,
    maxIrisOffsetY: 0.12,
    irisDilation: 0.03,
    driftStrength: 0.0005,
    damping: 0.01,
    boredDamping: 0.5,
    attentionDecay: 0.99,
    attentionGain: 0.01,
    attentionThreshold: 300,
    patience: 0.9,
    boredThreshold: 0.5,
    blinkSpeed: 30,
    openSpeed: 3,
    sleepTimeout: 10,
    dozeSpeed: 0.5,
    blinkInterval: 4,
    blinkVariance: 2,
    doubleBlinkChance: 0.2,
    expressionSpeed: 2,
};

// Shape functions - each returns 0-1 for a given normalized x position
const shapeFunctions = {
    gaussian: (x, params) => {
        const sigma = params.sigma ?? 1;
        return Math.exp(-(x * x) / (2 * sigma * sigma));
    },
    flat: (x, params) => {
        const falloff = params.falloff ?? 0.3;
        const abs = Math.abs(x);
        return abs < 2 ? 1 : Math.max(0, 1 - (abs - 2) * falloff);
    },
    raised: (x, params) => {
        const sigma = params.sigma ?? 1.2;
        const base = params.base ?? 0.3;
        return base + (1 - base) * Math.exp(-(x * x) / (2 * sigma * sigma));
    },
    skewedLeft: (x, params) => {
        const sigma = params.sigma ?? 1;
        const skew = params.skew ?? 0.3;
        return Math.exp(-((x + skew) * (x + skew)) / (2 * sigma * sigma));
    },
    skewedRight: (x, params) => {
        const sigma = params.sigma ?? 1;
        const skew = params.skew ?? 0.3;
        return Math.exp(-((x - skew) * (x - skew)) / (2 * sigma * sigma));
    },
    vShape: (x, params) => {
        const intensity = params.intensity ?? 0.3;
        const base = params.base ?? 0.7;
        const gaussian = Math.exp(-(x * x) / 2);
        return base + (1 - gaussian) * intensity;
    },
};

const expressions = {
    neutral: {
        top: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
        bottom: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
        irisRadius: 0.15,
        irisYOffset: 0,
        lashMultiplier: 1,
    },
    suspicious: {
        top: { shape: 'flat', params: { falloff: 0.2 }, maxHeight: 0.12 },
        bottom: { shape: 'raised', params: { sigma: 1.2, base: 0.6 }, maxHeight: 0.32 },
        irisRadius: 0.11,
        irisYOffset: 0.05,
        lashMultiplier: 1.3,
    },
    shocked: {
        top: { shape: 'gaussian', params: { sigma: 1.3 }, maxHeight: 0.45 },
        bottom: { shape: 'gaussian', params: { sigma: 1.3 }, maxHeight: 0.45 },
        irisRadius: 0.22,
        irisYOffset: 0,
        lashMultiplier: 0.5,
    },
    angry: {
        top: { shape: 'vShape', params: { intensity: 0.5, base: 0.5 }, maxHeight: 0.22 },
        bottom: { shape: 'flat', params: { falloff: 0.3 }, maxHeight: 0.18 },
        irisRadius: 0.1,
        irisYOffset: -0.05,
        lashMultiplier: 1.2,
    },
    sad: {
        top: { shape: 'skewedRight', params: { sigma: 0.8, skew: 0.6 }, maxHeight: 0.22 },
        bottom: { shape: 'gaussian', params: { sigma: 1.4 }, maxHeight: 0.35 },
        irisRadius: 0.18,
        irisYOffset: 0.12,
        lashMultiplier: 1,
    },
    mocking: {
        top: { shape: 'skewedLeft', params: { sigma: 0.9, skew: 0.5 }, maxHeight: 0.2 },
        bottom: { shape: 'skewedRight', params: { sigma: 1.1, skew: 0.4 }, maxHeight: 0.26 },
        irisRadius: 0.12,
        irisYOffset: -0.08,
        lashMultiplier: 1.3,
    },
};

const state = {
    irisX: 0,
    irisY: 0,
    targetX: 0,
    targetY: 0,
    attention: 0,
    cursorX: undefined,
    cursorY: undefined,
    lastCursorX: undefined,
    lastCursorY: undefined,
    blink: 1,
    blinkTarget: 1,
    awake: false,
    lastInteraction: Date.now(),
    nextBlinkTime: 0,
    pendingDoubleBlink: false,
    busy: false,
    poked: false,
    // Expression state
    currentExpr: 'neutral',
    targetExpr: 'neutral',
    exprProgress: 1,
    // Cached lerped values for smooth transitions
    lerpedExpr: null,
    // Dilation state (0-1, 0=normal, 1=dilated)
    dilation: 0,
    targetDilation: 0,
};

const savedThreshold = localStorage.getItem('eyeThreshold');
if (savedThreshold) {
    config.attentionThreshold = parseFloat(savedThreshold);
}

function setExpression(name) {
    if (expressions[name] && name !== state.targetExpr) {
        state.currentExpr = state.targetExpr;
        state.targetExpr = name;
        state.exprProgress = 0;
    }
}

function setDilation(value) {
    state.targetDilation = Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function updateExpression(dt) {
    if (state.exprProgress < 1) {
        state.exprProgress = Math.min(1, state.exprProgress + config.expressionSpeed * dt);
    }
    // Smooth dilation
    const dilationSpeed = 2;
    state.dilation += (state.targetDilation - state.dilation) * dilationSpeed * dt;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function setLoading(loading) {
    state.busy = loading;
    config.driftStrength = loading ? 0.2 : 0.0005;
    if (loading) {
        setExpression('shocked');
    } else {
        setExpression('neutral');
    }
}

function wake() {
    if (!state.awake) {
        state.awake = true;
        state.blinkTarget = 0;
        if (config.attentionThreshold < 10) {
            setExpression('angry');
        }
    }
}

function blink() {
    if (!state.awake) return;
    state.blinkTarget = 1;
}

function scheduleNextBlink() {
    const variance = (Math.random() - 0.5) * 2 * config.blinkVariance;
    state.nextBlinkTime = Date.now() + (config.blinkInterval + variance) * 1000;
    state.pendingDoubleBlink = Math.random() < config.doubleBlinkChance;
}

function updateBlink(dt) {
    let speed;

    if (state.blinkTarget === 1 && !state.awake) {
        speed = config.dozeSpeed;
    } else if (state.blinkTarget === 0) {
        speed = config.openSpeed;
    } else {
        speed = config.blinkSpeed;
    }

    if (state.blink < state.blinkTarget) {
        state.blink = Math.min(state.blink + speed * dt, state.blinkTarget);
    } else if (state.blink > state.blinkTarget) {
        state.blink = Math.max(state.blink - speed * dt, state.blinkTarget);
    }

    if (state.awake && state.blinkTarget === 1 && state.blink >= 0.95) {
        state.blinkTarget = 0;
    }
}

function drawBar(x, barHeight, direction, color, barWidth, irisX, irisY, irisRadius) {
    const dx = Math.abs(x - irisX);
    const up = direction === 'up';

    let y, h;

    if (dx < irisRadius) {
        const circleYOffset = Math.sqrt(irisRadius * irisRadius - dx * dx);
        if (up) {
            const irisTop = irisY - circleYOffset;
            y = centerY - barHeight;
            h = irisTop - y;
        } else {
            const irisBottom = irisY + circleYOffset;
            y = irisBottom;
            h = (centerY + barHeight) - irisBottom;
        }
    } else {
        y = up ? centerY - barHeight : centerY;
        h = barHeight;
    }

    if (h <= 0) return;

    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', x - barWidth / 2);
    bar.setAttribute('y', y);
    bar.setAttribute('width', barWidth);
    bar.setAttribute('height', h);
    bar.setAttribute('fill', color);
    bar.setAttribute('rx', 2);
    svg.appendChild(bar);
}

function drawLashTip(x, startHeight, lashLength, direction, color, barWidth) {
    const up = direction === 'up';

    let y, h;
    h = lashLength;

    if (up) {
        y = centerY - startHeight - lashLength;
    } else {
        y = centerY + startHeight;
    }

    if (h <= 0) return;

    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', x - barWidth / 2);
    bar.setAttribute('y', y);
    bar.setAttribute('width', barWidth);
    bar.setAttribute('height', h);
    bar.setAttribute('fill', color);
    bar.setAttribute('rx', 2);
    svg.appendChild(bar);
}

function lerpColor(color1, color2, t) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `rgb(${r}, ${g}, ${b})`;
}

function draw() {
    svg.innerHTML = '';

    const { barCount, barWidthMin, barWidthMax, gapRatio, maxLashLength, irisDilation } = config;
    
    const currentExpr = expressions[state.currentExpr];
    const targetExpr = expressions[state.targetExpr];
    const t = easeInOut(state.exprProgress);

    // Lerp scalar values
    const baseIrisRadius = lerp(currentExpr.irisRadius, targetExpr.irisRadius, t);
    const dilationBonus = state.dilation * 0.08; // up to 0.08 extra radius when dilated
    const irisRadius = baseIrisRadius + dilationBonus;
    const irisYOffset = lerp(currentExpr.irisYOffset, targetExpr.irisYOffset, t);
    const lashMultiplier = lerp(currentExpr.lashMultiplier, targetExpr.lashMultiplier, t);
    const topMaxHeight = lerp(currentExpr.top.maxHeight, targetExpr.top.maxHeight, t);
    const bottomMaxHeight = lerp(currentExpr.bottom.maxHeight, targetExpr.bottom.maxHeight, t);

    // Blink affects scale
    const scaleY = 1 - state.blink;
    const blinkLashMult = 1 + state.blink * 2 * scaleY + 0.5;

    // Convert to pixels
    const irisRadiusPx = (irisRadius + state.attention * irisDilation) * height;
    const maxLashPx = maxLashLength * height * blinkLashMult * lashMultiplier;
    const maxIrisOffsetXPx = config.maxIrisOffsetX * width;
    const maxIrisOffsetYPx = config.maxIrisOffsetY * height;

    const irisXPx = centerX + state.irisX * maxIrisOffsetXPx;
    const irisYPx = centerY + (state.irisY + irisYOffset) * maxIrisOffsetYPx * scaleY;

    // Bar spacing
    const minBarPx = barWidthMin * width;
    const maxBarPx = barWidthMax * width;
    const avgBarWidth = (minBarPx + maxBarPx) / 2;
    const spacing = avgBarWidth * (1 + gapRatio);
    const totalWidth = barCount * spacing;
    const startX = centerX - totalWidth / 2;

    const styles = getComputedStyle(document.documentElement);
    const colorPositive = styles.getPropertyValue('--color-positive').trim();
    const colorNegative = styles.getPropertyValue('--color-negative').trim();
    const navbarBg = styles.getPropertyValue('--color-accent').trim();
    const lashColor = styles.getPropertyValue('--color-uncertain').trim();
    const currentLashColor = lerpColor(navbarBg, lashColor, 1 - state.blink);

    for (let i = 0; i < barCount; i++) {
        const x = startX + i * spacing + spacing / 2;
        const normalizedX = (i - barCount / 2) / (barCount / 6);

        // Bar width still uses gaussian for thickness variation
        const barWidthPx = minBarPx + Math.exp(-(normalizedX * normalizedX) / 2) * (maxBarPx - minBarPx);

        // Get shape values from current and target expressions, then lerp
        const currentTopShape = shapeFunctions[currentExpr.top.shape](normalizedX, currentExpr.top.params);
        const targetTopShape = shapeFunctions[targetExpr.top.shape](normalizedX, targetExpr.top.params);
        const topShape = lerp(currentTopShape, targetTopShape, t);

        const currentBottomShape = shapeFunctions[currentExpr.bottom.shape](normalizedX, currentExpr.bottom.params);
        const targetBottomShape = shapeFunctions[targetExpr.bottom.shape](normalizedX, targetExpr.bottom.params);
        const bottomShape = lerp(currentBottomShape, targetBottomShape, t);

        const topHeight = topShape * topMaxHeight * height * scaleY;
        const bottomHeight = bottomShape * bottomMaxHeight * height * scaleY;

        // Lash length based on shape
        const lashLengthTop = topShape * maxLashPx;
        const lashLengthBottom = bottomShape * maxLashPx;

        drawBar(x, topHeight, 'up', colorPositive, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawBar(x, bottomHeight, 'down', colorNegative, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawLashTip(x, topHeight, lashLengthTop, 'up', currentLashColor, barWidthPx);
        drawLashTip(x, bottomHeight, lashLengthBottom, 'down', currentLashColor, barWidthPx);
    }
}

function updateCursorTracking() {
    if (!state.awake) return;

    const vel = distance(state.cursorX || 0, state.cursorY || 0, state.lastCursorX || 0, state.lastCursorY || 0);
    let noticed = state.lastCursorX !== undefined && vel >= config.attentionThreshold;

    if (state.busy)
        state.attention = 0;
    else if (state.poked) {
        state.attention = 1;
        state.poked = false;
    }

    if (state.attention != 0 || (noticed && !state.busy)) {
        state.lastInteraction = Date.now();
        if (vel > config.attentionThreshold) {
            state.attention = Math.min(1, state.attention + vel * config.attentionGain);
        } else {
            state.attention *= config.attentionDecay;
        }

        if (state.attention < config.boredThreshold) state.attention = 0;

        const dx = state.cursorX - centerX;
        const dy = state.cursorY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const maxDist = Math.min(width, height) / 2;
            const normalized = Math.min(dist / maxDist, 1);
            state.targetX = (dx / dist) * normalized;
            state.targetY = (dy / dist) * normalized;
        }
    }
    state.lastCursorX = state.cursorX;
    state.lastCursorY = state.cursorY;
}

function updateIrisPosition(dt) {
    if (!state.awake) return;

    const goalX = state.targetX * state.attention;
    const goalY = state.targetY * state.attention;

    const lerpSpeed = 1.5;
    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);

    state.irisX += (goalX - state.irisX) * lerpFactor;
    state.irisY += (goalY - state.irisY) * lerpFactor;

    const drift = (1 - state.attention) * config.driftStrength * dt * 60;
    state.irisX += (Math.random() - 0.5) * drift;
    state.irisY += (Math.random() - 0.5) * drift;

    if (state.attention < config.boredThreshold) {
        state.irisX *= (1 - config.boredDamping);
        state.irisY *= (1 - config.boredDamping);
    } else {
        state.irisX *= (1 - config.damping);
        state.irisY *= (1 - config.damping);
    }

    state.irisX = clamp(state.irisX, -1, 1);
    state.irisY = clamp(state.irisY, -1, 1);
}

function onMouseMove(e) {
    const rect = svg.getBoundingClientRect();
    state.cursorX = e.clientX - rect.left;
    state.cursorY = e.clientY - rect.top;
}

function tick(timestamp) {
    if (lastFrame === 0) lastFrame = timestamp;
    const dt = (timestamp - lastFrame) / 1000;

    const idleTime = (Date.now() - state.lastInteraction) / 1000;
    if (state.awake && idleTime > config.sleepTimeout) {
        state.awake = false;
        state.blinkTarget = 1;
        setExpression('neutral');
    }

    if (dt >= frameInterval / 1000) {
        updateExpression(dt);
        updateBlink(dt);

        if (state.awake && !state.busy && state.blink < 0.05 && Date.now() > state.nextBlinkTime) {
            blink();
            if (state.pendingDoubleBlink) {
                state.nextBlinkTime = Date.now() + 150;
                state.pendingDoubleBlink = false;
            } else {
                scheduleNextBlink();
            }
        }

        updateCursorTracking(dt);
        updateIrisPosition(dt);
        draw();
        lastFrame = timestamp;
    }
    requestAnimationFrame(tick);
}

document.addEventListener('mousemove', onMouseMove);
svg.addEventListener('click', () => {
    if (state.awake) {
        blink();
        state.poked = true;
        config.attentionThreshold *= config.patience;
        localStorage.setItem('eyeThreshold', config.attentionThreshold);
        
        // Get progressively more suspicious/angry as you poke
        if (config.attentionThreshold < 10) {
            setExpression('angry');
        } else if (config.attentionThreshold < 50) {
            setExpression('suspicious');
        }
    }
});
document.addEventListener('click', () => {
    state.lastInteraction = Date.now();
    wake();
});

requestAnimationFrame(tick);
scheduleNextBlink();

// Expose for other modules
window.setEyeExpression = setExpression;
window.setEyeDilation = setDilation;
window.setEyeLoading = setLoading;
