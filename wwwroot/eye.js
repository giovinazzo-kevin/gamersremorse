window.svg = document.getElementById('eye');
const frameInterval = 1000 / 15;
let t = 0;
let lastFrame = 0;
let numBlinks = 0;

const state = {
    // Iris
    irisX: 0,
    irisY: 0,
    targetX: 0,
    targetY: 0,
    irisRadius: 0.15,
    irisXOffset: 0,
    irisYOffset: 0,

    // Gaze
    attention: 0,
    gazeSpeed: 1.5,

    // Lids - LIVE values
    top: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
    bottom: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
    lashMultiplier: 1,

    // Lerp targets (set by setExpression)
    targetTop: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
    targetBottom: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
    targetIrisRadius: 0.15,
    targetIrisXOffset: 0,
    targetIrisYOffset: 0,
    targetLashMultiplier: 1,

    // Wave
    topSampleOffset: 0,
    bottomSampleOffset: 0,
    topSampleSpeed: 0.1,
    bottomSampleSpeed: -0.1,

    // Cursor
    cursorX: undefined,
    cursorY: undefined,
    lastCursorX: undefined,
    lastCursorY: undefined,
    svgWidth: 0,
    svgHeight: 0,

    // Blink
    blink: 1,
    blinkTarget: 1,
    awake: false,
    lastInteraction: 0,
    canBlink: true,
    nextBlinkTime: 0,
    pendingDoubleBlink: false,

    // Expression
    currentExpr: 'neutral',
    targetExpr: 'neutral',
    exprProgress: 1,

    // Dilation/Blush
    dilation: 0,
    targetDilation: 0,
    blush: 0,
    targetBlush: 0,

    // Behavior flags
    busy: false,
    poked: false,
    shy: false,
    engrossed: false,
    peeved: false,
    unhinged: false,
    corneredTime: 0,
    lookingAtGraph: false,
    beingCornered: false,

    // Visual params
    barCount: 20,
    gapRatio: 0.2,
    targetWidthRatio: 1.2,
    maxLashLength: 0.04,
    maxIrisOffsetX: 0.26,
    maxIrisOffsetY: 0.12,
    irisDilation: 0.03,
    noiseTop: 0,
    noiseBottom: 0,

    // Behavior params
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
    sleepTimeout: 30,
    dozeSpeed: 0.5,
    blinkInterval: 4,
    blinkVariance: 2,
    doubleBlinkChance: 0.2,
    expressionSpeed: 2,
};

// Shape functions
const shapeFunctions = {
    gaussian: (x, params) => {
        const sigma = params.sigma ?? 1;
        return Math.exp(-(x * x) / (2 * sigma * sigma)) + (params.c ?? 0);
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
    vShape2: (x, params) => {
        const intensity = params.intensity ?? 0.3;
        const base = params.base ?? 0.7;
        const gaussian = Math.exp(-(x * x) / 2);
        return base + (gaussian) * intensity;
    },
};

// Expression DEFINITIONS - just data, applied via setExpression
const expressions = {
    neutral: {
        top: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
        bottom: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.3 },
        barCount: 20,
        gapRatio: 0.2,
        irisRadius: 0.15,
        irisYOffset: 0,
        irisXOffset: 0,
        lashMultiplier: 1,
        topSampleSpeed: -0.1,
        bottomSampleSpeed: 0.1,
        targetWidthRatio: 1.2,
        driftStrength: 0.005,
        shy: false,
        engrossed: false,
        corneredTime: 0,
        targetBlush: 0,
        update: (dt) => { },
    },
    suspicious: {
        top: { shape: 'flat', params: { falloff: 0.7 }, maxHeight: 0.12 },
        bottom: { shape: 'raised', params: { sigma: 1.2, base: 0.6 }, maxHeight: 0.32 },
        irisRadius: 0.11,
        irisYOffset: 0.05,
        irisXOffset: 0,
        lashMultiplier: 1.3,
        targetWidthRatio: 1.2,
        driftStrength: 0.005,
        update: (dt) => { },
    },
    reading: {
        top: { shape: 'gaussian', params: { sigma: 1.3 }, maxHeight: 0.15 },
        bottom: { shape: 'gaussian', params: { sigma: 1.3 }, maxHeight: 0.15 },
        barCount: 20,
        gapRatio: 0,
        irisRadius: 0.22,
        irisYOffset: 0,
        irisXOffset: 0,
        lashMultiplier: 2,
        topSampleSpeed: 0.6,
        bottomSampleSpeed: -0.2,
        targetWidthRatio: 1,
        noiseBottom: 1,
        driftStrength: 0.15,
        update: (dt) => {
            const lfo0 = Math.sin(Math.pow(Math.cos(t / 20), 2));
            const lfo1 = Math.sin(t / 4);
            const lfo2 = Math.cos(t / 4);

            let progress = Math.pow((lfo0 + 1) / 2, 3);

            const raw = Math.max(0, Math.min(1, (progress - 0.45) / 0.1));
            const blend = raw * raw * (3 - 2 * raw);
            const scanWeight = 1 - blend;

            state.dilation = -lfo2 / 4 - progress;

            state.irisX = lfo1 * scanWeight;
            state.irisY = lfo2 * scanWeight;

            state.lashMultiplier = lerp(0.3, 2, blend);
            state.top.maxHeight = lerp(0.40, 0.10, blend);
            state.bottom.maxHeight = lerp(0.45, 0.10, blend);

            state.driftStrength = blend / 4;
            state.barCount = Math.floor(lfo1 * 10) + 30;
            state.gapRatio = (lfo2 + 1) / 2;
        },
    },
    addicted: {
        top: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.2 },
        bottom: { shape: 'gaussian', params: { sigma: 1 }, maxHeight: 0.2 },
        irisRadius: 0.22,
        irisYOffset: 0,
        irisXOffset: 0,
        lashMultiplier: 1,
        targetWidthRatio: 1,
        driftStrength: 0.005,
        update: (dt) => { },
    },
    shocked: {
        top: { shape: 'gaussian', params: { sigma: 1.2 }, maxHeight: 0.5 },
        bottom: { shape: 'gaussian', params: { sigma: 1.2 }, maxHeight: 0.5 },
        irisRadius: 0.22,
        irisYOffset: 0,
        irisXOffset: 0,
        lashMultiplier: 0.5,
        targetWidthRatio: 1,
        driftStrength: 0.005,
        update: (dt) => { },
    },
    angry: {
        top: { shape: 'skewedLeft', params: { sigma: 0.9, skew: 0.5 }, maxHeight: 0.2 },
        bottom: { shape: 'skewedRight', params: { sigma: 1.1, skew: 0.4 }, maxHeight: 0.26 },
        irisRadius: 0.1,
        irisYOffset: -0.05,
        irisXOffset: 0,
        lashMultiplier: 1.2,
        driftStrength: 0.005,
        update: (dt) => { },
    },
    sad: {
        top: { shape: 'skewedRight', params: { sigma: 0.8, skew: 0.6 }, maxHeight: 0.22 },
        bottom: { shape: 'gaussian', params: { sigma: 1.4 }, maxHeight: 0.35 },
        irisRadius: 0.18,
        irisYOffset: 0.12,
        irisXOffset: 0,
        lashMultiplier: 1,
        driftStrength: 0.005,
        update: (dt) => { },
    },
    mocking: {
        top: { shape: 'skewedLeft', params: { sigma: 0.9, skew: 0.5 }, maxHeight: 0.4 },
        bottom: { shape: 'vShape', params: { intensity: 0.5, base: 0.5 }, maxHeight: 0.1 },
        irisRadius: 0.14,
        irisYOffset: -0.08,
        irisXOffset: -0.18,
        lashMultiplier: 1.3,
        topSampleSpeed: -0.1,
        bottomSampleSpeed: -0.1,
        driftStrength: 0.05,
        update: (dt) => {
            state.bottom.params.intensity = Math.sin(t * 10) / 5;
            state.bottom.params.base = (Math.sin(t * 16) + 1) / 4 + 0.25;
        },
    },
    flustered: {
        top: { shape: 'gaussian', params: { sigma: 0.8 }, maxHeight: 0.10 },
        bottom: { shape: 'gaussian', params: { sigma: 0.8 }, maxHeight: 0.10 },
        irisRadius: 0.08,
        irisYOffset: 0.08,
        irisXOffset: 0,
        lashMultiplier: 2.0,
        driftStrength: 0.5,
        shy: true,
        engrossed: false,
        corneredTime: 0,
        targetBlush: 1,
        update: (dt) => {
            if (state.beingCornered) {
                state.corneredTime += dt * 1000;

                if (state.corneredTime >= 5000) {
                    state.shy = false;
                    state.engrossed = true;
                    state.targetBlush = 0.3;
                    state.targetDilation = 0.8;
                    setExpression('neutral');
                    return;
                }
            }

            if (state.beingCornered) {
                state.targetDilation = Math.min(1.5, state.targetDilation + dt * 2);
                setExpression('shocked');
            } else if (state.lookingAtGraph) {
                state.targetDilation = 1;
                setExpression('shocked');
            } else {
                state.targetDilation = 0;
            }
        },
    },
};

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function setExpression(name) {
    if (!expressions[name]) return;
    if (state.targetExpr === name && state.exprProgress > 0.5) return; // already going there

    // Store current state as "from" values
    state.fromTop = deepCopy(state.top);
    state.fromBottom = deepCopy(state.bottom);
    state.fromIrisRadius = state.irisRadius;
    state.fromIrisXOffset = state.irisXOffset;
    state.fromIrisYOffset = state.irisYOffset;
    state.fromLashMultiplier = state.lashMultiplier;

    state.currentExpr = state.targetExpr;
    state.targetExpr = name;
    state.exprProgress = 0;

    // Apply non-lerped properties immediately from neutral first, then expression
    const applyImmediate = (expr) => {
        for (const key of Object.keys(expr)) {
            if (key === 'top' || key === 'bottom' || key === 'update') continue;
            if (key === 'irisRadius' || key === 'irisXOffset' || key === 'irisYOffset' || key === 'lashMultiplier') continue;
            if (key in state) {
                state[key] = expr[key];
            }
        }
    };

    applyImmediate(expressions['neutral']);
    if (name !== 'neutral') {
        applyImmediate(expressions[name]);
    }

    // Set lerp targets
    const expr = expressions[name];
    state.targetTop = deepCopy(expr.top);
    state.targetBottom = deepCopy(expr.bottom);
    state.targetIrisRadius = expr.irisRadius;
    state.targetIrisXOffset = expr.irisXOffset;
    state.targetIrisYOffset = expr.irisYOffset;
    state.targetLashMultiplier = expr.lashMultiplier;
}

function enableBlinking() {
    state.canBlink = true;
    state.nextBlinkTime = 0;
}

function disableBlinking() {
    state.canBlink = false;
    state.blinkTarget = 0;
    state.nextBlinkTime = Number.MAX_VALUE;
}

function setDilation(value) {
    state.targetDilation = Math.max(-1, Math.min(1, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpParams(from, to, t) {
    const result = {};
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const key of allKeys) {
        const a = from[key] ?? 0;
        const b = to[key] ?? 0;
        result[key] = lerp(a, b, t);
    }
    return result;
}

function updateExpression(dt) {
    if (state.exprProgress < 1) {
        state.exprProgress = Math.min(1, state.exprProgress + state.expressionSpeed * dt);

        const t = easeInOut(state.exprProgress);

        // Lerp scalar values
        state.irisRadius = lerp(state.fromIrisRadius, state.targetIrisRadius, t);
        state.irisXOffset = lerp(state.fromIrisXOffset, state.targetIrisXOffset, t);
        state.irisYOffset = lerp(state.fromIrisYOffset, state.targetIrisYOffset, t);
        state.lashMultiplier = lerp(state.fromLashMultiplier, state.targetLashMultiplier, t);

        // Lerp lid heights
        state.top.maxHeight = lerp(state.fromTop.maxHeight, state.targetTop.maxHeight, t);
        state.bottom.maxHeight = lerp(state.fromBottom.maxHeight, state.targetBottom.maxHeight, t);

        // Lerp shape params
        state.top.params = lerpParams(state.fromTop.params, state.targetTop.params, t);
        state.bottom.params = lerpParams(state.fromBottom.params, state.targetBottom.params, t);

        // Shape names snap at halfway
        if (t >= 0.5) {
            state.top.shape = state.targetTop.shape;
            state.bottom.shape = state.targetBottom.shape;
        }
    }

    const dilationSpeed = 2;
    state.dilation += (state.targetDilation - state.dilation) * dilationSpeed * dt;
    const blushSpeed = 3;
    state.blush += (state.targetBlush - state.blush) * blushSpeed * dt;

    expressions[state.targetExpr].update(dt);
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function setLoading(loading) {
    state.peeved = false;
    state.busy = loading;
    if (loading) {
        setExpression('reading');
    } else {
        setExpression('neutral');
    }
}

function wake() {
    if (!state.awake) {
        setRandomTagline(numBlinks);
        state.awake = true;
        state.blinkTarget = 0;
        setExpression('neutral');
        if (state.attentionThreshold < 10) {
            setExpression('angry');
        }
    }
}

function blink() {
    if (!state.awake) return;
    state.blinkTarget = 1;
}

function scheduleNextBlink() {
    const variance = (Math.random() - 0.5) * 2 * state.blinkVariance;
    state.nextBlinkTime = Date.now() + (state.blinkInterval + variance) * 1000;
    state.pendingDoubleBlink = Math.random() < state.doubleBlinkChance;
}

function updateBlink(dt) {
    let speed;

    if (state.blinkTarget === 1 && !state.awake) {
        speed = state.dozeSpeed;
    } else if (state.blinkTarget === 0) {
        speed = state.openSpeed;
    } else {
        speed = state.blinkSpeed;
    }

    if (state.blink < state.blinkTarget) {
        state.blink = Math.min(state.blink + speed * dt, state.blinkTarget);
    } else if (state.blink > state.blinkTarget) {
        state.blink = Math.max(state.blink - speed * dt, state.blinkTarget);
    }

    if (state.awake && state.canBlink && state.blinkTarget === 1 && state.blink >= 0.95) {
        state.blinkTarget = 0;
        setRandomTagline(numBlinks++);
    }

    if (tagline) tagline.style.opacity = 1 - state.blink;
}

function drawBar(x, barHeight, direction, color, barWidth, irisX, irisY, irisRadius) {
    const dx = Math.abs(x - irisX);
    const up = direction === 'up';

    let y, h;

    if (dx < irisRadius) {
        const circleYOffset = Math.sqrt(irisRadius * irisRadius - dx * dx);
        if (up) {
            const irisTop = irisY - circleYOffset;
            y = (svg.clientHeight / 2) - barHeight;
            h = irisTop - y;
        } else {
            const irisBottom = irisY + circleYOffset;
            y = irisBottom;
            h = ((svg.clientHeight / 2) + barHeight) - irisBottom;
        }
    } else {
        y = up ? (svg.clientHeight / 2) - barHeight : (svg.clientHeight / 2);
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
        y = (svg.clientHeight / 2) - startHeight - lashLength;
    } else {
        y = (svg.clientHeight / 2) + startHeight;
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

    const { barCount, gapRatio, maxLashLength, irisDilation, targetWidthRatio } = state;

    // All values come from state now
    const baseIrisRadius = state.irisRadius;
    const dilationBonus = state.dilation * 0.08;
    const irisRadius = baseIrisRadius + dilationBonus;
    const irisXOffset = state.irisXOffset;
    const irisYOffset = state.irisYOffset;
    const lashMultiplier = state.lashMultiplier;
    const topMaxHeight = state.top.maxHeight;
    const bottomMaxHeight = state.bottom.maxHeight;

    // Blink affects scale
    const scaleY = 1 - state.blink;
    const blinkLashMult = 1 + state.blink * 2 * scaleY + 0.5;

    // Convert to pixels
    const irisRadiusPx = (irisRadius + state.attention * irisDilation) * svg.clientHeight;
    const maxLashPx = maxLashLength * svg.clientHeight * blinkLashMult * lashMultiplier;
    const maxIrisOffsetXPx = state.maxIrisOffsetX * svg.clientWidth;
    const maxIrisOffsetYPx = state.maxIrisOffsetY * svg.clientHeight;

    const irisXPx = (svg.clientWidth / 2) + (state.irisX + irisXOffset) * maxIrisOffsetXPx;
    const irisYPx = (svg.clientHeight / 2) + (state.irisY + irisYOffset) * maxIrisOffsetYPx * scaleY;

    // Bar spacing
    const totalTargetWidth = svg.clientWidth * targetWidthRatio;
    const spacing = totalTargetWidth / barCount;
    const barWidthPx = spacing * (1 / (1 + gapRatio));
    const startX = (svg.clientWidth - totalTargetWidth) / 2;

    const styles = getComputedStyle(document.documentElement);
    const colorPositive = styles.getPropertyValue('--color-positive').trim();
    const colorNegative = styles.getPropertyValue('--color-negative').trim();
    const navbarBg = styles.getPropertyValue('--color-accent').trim();
    const lashColor = styles.getPropertyValue('--color-uncertain').trim();
    const currentLashColor = lerpColor(navbarBg, lashColor, 1 - state.blink);

    // Blush tints the colors pink
    const blushColor = '#ff6b9d';
    const blushAmount = state.blush * 0.4;
    const tintedPositive = lerpColor(colorPositive, blushColor, blushAmount);
    const tintedNegative = lerpColor(colorNegative, blushColor, blushAmount);

    for (let i = 0; i < barCount; i++) {
        const topBarPosition = (i - barCount / 2) + state.topSampleOffset;
        const bottomBarPosition = (i - barCount / 2) + state.bottomSampleOffset;

        const wrappedTopPosition = ((topBarPosition % barCount) + barCount) % barCount - barCount / 2;
        const wrappedBottomPosition = ((bottomBarPosition % barCount) + barCount) % barCount - barCount / 2;

        const topX = startX + (wrappedTopPosition + barCount / 2) * spacing + spacing / 2;
        const bottomX = startX + (wrappedBottomPosition + barCount / 2) * spacing + spacing / 2;

        const topNormalizedX = wrappedTopPosition / (barCount / 6);
        const bottomNormalizedX = wrappedBottomPosition / (barCount / 6);

        // Use state.top and state.bottom directly
        const topShape = shapeFunctions[state.top.shape](topNormalizedX, state.top.params);
        const bottomShape = shapeFunctions[state.bottom.shape](bottomNormalizedX, state.bottom.params);

        const topNoise = state.noiseTop * Math.random();
        const botNoise = state.noiseBottom * Math.random();

        const topHeight = topShape * topMaxHeight * svg.clientHeight * scaleY - topNoise * scaleY;
        const bottomHeight = bottomShape * bottomMaxHeight * svg.clientHeight * scaleY - botNoise * scaleY;

        const lashLengthTop = topShape * maxLashPx;
        const lashLengthBottom = bottomShape * maxLashPx;

        drawBar(topX, topHeight, 'up', tintedPositive, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawBar(bottomX, bottomHeight, 'down', tintedNegative, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawLashTip(topX, topHeight, lashLengthTop, 'up', currentLashColor, barWidthPx);
        drawLashTip(bottomX, bottomHeight, lashLengthBottom, 'down', currentLashColor, barWidthPx);
    }
}

function updateCursorTracking() {
    if (!state.awake) return;

    const vel = distance(state.cursorX || 0, state.cursorY || 0, state.lastCursorX || 0, state.lastCursorY || 0);
    let noticed = state.lastCursorX !== undefined && vel >= state.attentionThreshold;

    if (state.busy)
        state.attention = 0;
    else if (state.poked) {
        state.attention = 1;
        state.poked = false;
    }

    if (!state.peeved && (state.attention != 0 || (noticed && !state.busy))) {
        state.lastInteraction = Date.now();
        if (vel > state.attentionThreshold) {
            state.attention = Math.min(1, state.attention + vel * state.attentionGain);
        } else if (!state.beingCornered) {
            state.attention *= state.attentionDecay;
        }

        if (state.attention < state.boredThreshold && !state.beingCornered) state.attention = 0;

        const w = state.svgWidth || svg.clientWidth;
        const h = state.svgHeight || svg.clientHeight;
        const dx = state.cursorX - (w / 2);
        const dy = state.cursorY - (h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const maxDist = Math.min(svg.clientWidth, svg.clientHeight) / 2;
            const normalized = Math.min(dist / maxDist, 1);
            state.targetX = (dx / dist) * normalized;
            state.targetY = (dy / dist) * normalized;
        }
    }
    state.lastCursorX = state.cursorX;
    state.lastCursorY = state.cursorY;
}

function getGraphCenter() {
    const chart = document.getElementById('chart');
    const eye = document.getElementById('eye');
    if (!chart || !eye) return { x: 0, y: 0.2 };

    const chartRect = chart.getBoundingClientRect();
    const eyeRect = eye.getBoundingClientRect();

    const chartCenterX = chartRect.left + chartRect.width / 2;
    const chartCenterY = chartRect.top + chartRect.height / 2;
    const eyeCenterX = eyeRect.left + eyeRect.width / 2;
    const eyeCenterY = eyeRect.top + eyeRect.height / 2;

    const dx = chartCenterX - eyeCenterX;
    const dy = chartCenterY - eyeCenterY;

    const maxDist = Math.max(window.innerWidth, window.innerHeight) / 2;
    return {
        x: Math.max(-1, Math.min(1, dx / maxDist)),
        y: Math.max(-1, Math.min(1, dy / maxDist))
    };
}

function updateIrisPosition(dt) {
    if (!state.awake) return;

    const lerpSpeed = state.gazeSpeed;
    const lerpFactor = 1 - Math.exp(-lerpSpeed * dt);

    if (state.engrossed) {
        const graphPos = getGraphCenter();
        state.irisX += (graphPos.x - state.irisX) * lerpFactor;
        state.irisY += (graphPos.y - state.irisY) * lerpFactor;
        return;
    }

    if (state.peeved) {
        state.irisX += (state.targetX - state.irisX) * lerpFactor;
        state.irisY += (state.targetY - state.irisY) * lerpFactor;
        return;
    }

    const shyMultiplier = state.shy ? -1 : 1;
    const goalX = state.targetX * state.attention * shyMultiplier;
    const goalY = state.targetY * state.attention * shyMultiplier;

    const graphPos = getGraphCenter();
    const eyeToGraph = { x: graphPos.x - state.irisX, y: graphPos.y - state.irisY };
    const cursorPushDir = { x: -state.targetX, y: -state.targetY };
    const pushTowardGraph = eyeToGraph.x * cursorPushDir.x + eyeToGraph.y * cursorPushDir.y;
    state.beingCornered = state.shy && state.attention > 0.3 && pushTowardGraph > 0;

    const distToGraph = Math.sqrt((state.irisX - graphPos.x) ** 2 + (state.irisY - graphPos.y) ** 2);
    state.lookingAtGraph = state.shy && distToGraph < 0.3;

    state.irisX += (goalX - state.irisX) * lerpFactor;
    state.irisY += (goalY - state.irisY) * lerpFactor;

    const nervousDrift = state.shy && state.attention < state.boredThreshold;
    const corneredJitter = state.beingCornered ? 0.08 : 0;
    const driftAmount = nervousDrift ? 0.02 : (1 - state.attention) * state.driftStrength + corneredJitter;
    const drift = driftAmount * dt * 60;
    state.irisX += (Math.random() - 0.5) * drift;
    state.irisY += (Math.random() - 0.5) * drift;

    if (state.attention < state.boredThreshold) {
        const dampingAmount = state.shy ? state.damping : state.boredDamping;
        state.irisX *= (1 - dampingAmount);
        state.irisY *= (1 - dampingAmount);
    } else {
        state.irisX *= (1 - state.damping);
        state.irisY *= (1 - state.damping);
    }

    state.irisX = clamp(state.irisX, -1, 1);
    state.irisY = clamp(state.irisY, -1, 1);
}

function onMouseMove(e) {
    const rect = svg.getBoundingClientRect();
    state.cursorX = e.clientX - rect.left;
    state.cursorY = e.clientY - rect.top;
    state.svgWidth = rect.width;
    state.svgHeight = rect.height;
}

function snooze() {
    clearTagline();
    state.awake = false;
    state.blinkTarget = 1;
    setExpression('neutral');
}

function tick(timestamp) {
    if (lastFrame === 0) lastFrame = timestamp;
    const dt = (timestamp - lastFrame) / 1000;
    t += dt;
    state.topSampleOffset += state.topSampleSpeed * dt;
    state.bottomSampleOffset += state.bottomSampleSpeed * dt;

    const idleTime = (Date.now() - state.lastInteraction) / 1000;
    if (state.awake && idleTime > state.sleepTimeout) {
        snooze();
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

function onPageClick() {
    const idleTime = (Date.now() - state.lastInteraction) / 1000;
    if (idleTime > 1) {
        wake();
        state.attention = 1;
    }
    state.lastInteraction = Date.now();
}

document.addEventListener('mousemove', onMouseMove);
svg.addEventListener('click', () => {
    if (state.awake && state.canBlink) {
        blink();
        state.poked = true;
        state.attentionThreshold *= state.patience;

        if (state.attentionThreshold < 10) {
            setPeeved(true, true, false, 0, -0.4);
            setExpression('angry');
        } else if (state.attentionThreshold < 50) {
            setPeeved(true, false, true, 0, -0.2);
            setExpression('suspicious');
        }
    }
});

requestAnimationFrame(tick);
scheduleNextBlink();

function setPeeved(isPeeved, snap, canBlink, targetX = 0, targetY = 0, gazeSpeed = 1.5) {
    state.peeved = isPeeved;
    if (isPeeved && !canBlink) {
        disableBlinking();
    }
    else if (!canBlink) {
        enableBlinking();
    }
    if (isPeeved) {
        if (snap) {
            state.irisX = targetX;
            state.irisY = targetY;
        }
        state.targetX = targetX;
        state.targetY = targetY;
        state.gazeSpeed = gazeSpeed;
    }
    else {
        state.gazeSpeed = 1.5;
        state.targetX = 0;
        state.targetY = 0;
    }
}

function setUnhinged(isUnhinged) {
    state.unhinged = isUnhinged;
}

function isUnhinged() {
    return state.unhinged || false;
}

function setBarDensity(numBars = 51, gapRatio = 0.2) {
    state.gapRatio = gapRatio;
    state.barCount = numBars;
}
