/* Eye - The soul of the application
 * 
 * PHILOSOPHY:
 * - State lives here, systems read from it
 * - Expressions are data (lerp targets), not procedures
 * - Eye owns its health; Items delegates to Eye, not vice versa
 * - No defensive typeof checks - load order is guaranteed
 * - Comments explain WHY, not WHAT
 */

window.svg = document.getElementById('eye');
const frameInterval = 1000 / 15;
let t = 0;
let lastFrame = 0;
let numBlinks = 0;

const state = {
    // Health (source of truth)
    health: 12,          // current health (in half-hearts)
    maxHealth: 12,       // max health
    maxContainers: 24,   // max possible (12 full hearts)
    
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

    // Lids - LIVE values (now with shapes array)
    top: {
        shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }],
        maxHeight: 0.3
    },
    bottom: {
        shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }],
        maxHeight: 0.3
    },
    lashMultiplier: 1,

    // Lerp targets (set by setExpression)
    targetTop: {
        shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }],
        maxHeight: 0.3
    },
    targetBottom: {
        shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }],
        maxHeight: 0.3
    },
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
    lastInteraction: 0,
    canBlink: true,
    nextBlinkTime: 0,
    pendingDoubleBlink: false,

    // Expression
    currentExpr: 'neutral',
    targetExpr: 'neutral',
    exprProgress: 0,

    // Dilation/Blush
    dilation: 0,
    targetDilation: 0,
    blush: 0,
    targetBlush: 0,

    // Behavior flags
    dead: false,
    deathCount: 0,
    awake: false,
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
    attentionThreshold: 100,
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

    fromLerp: null,
    targetLerp: null,

    // Impulses - traveling waves independent of expressions
    impulses: {
        top: [],
        bottom: []
    },
    impulseBounds: {
        top: { left: 'wrap', right: 'wrap' },
        bottom: { left: 'wrap', right: 'wrap' }
    },
    impulseMultiplier: 1,
    targetImpulseMultiplier: 1,
};

function addImpulse(lid, { amplitude = 0.5, width = 0.3, velocity = 0.5, decay = 0.95, phase = null }) {
    state.impulses[lid].push({
        offset: phase ?? (velocity > 0 ? -1 : 1),
        amplitude,
        width,
        velocity,
        decay
    });
}

function updateImpulses(dt) {
    for (const lid of ['top', 'bottom']) {
        const bounds = state.impulseBounds[lid];

        state.impulses[lid] = state.impulses[lid].filter(imp => {
            imp.offset += imp.velocity * dt;

            // right boundary
            if (imp.offset > 1) {
                if (bounds.right === 'reflect') { imp.offset = 2 - imp.offset; imp.velocity *= -1; }
                else if (bounds.right === 'kill') return false;
                else if (bounds.right === 'clamp') imp.offset = 1;
                // wrap: do nothing, handled at sample time
            }

            // left boundary
            if (imp.offset < -1) {
                if (bounds.left === 'reflect') { imp.offset = -2 - imp.offset; imp.velocity *= -1; }
                else if (bounds.left === 'kill') return false;
                else if (bounds.left === 'clamp') imp.offset = -1;
                // wrap: do nothing, handled at sample time
            }

            const decayFactor = Math.pow(imp.decay, dt * 60);
            imp.amplitude *= decayFactor;
            imp.width *= decayFactor;

            return imp.amplitude > 0.01 && imp.width > 0.05;
        });
    }
}

// Shape functions - all use 'width' param, guaranteed 0 at edges
const shapeFunctions = {
    // classic gaussian - NOT zero at edges but close enough, natural falloff
    gaussian: (x, params) => {
        const width = params.width ?? 2;
        const sigma = width / 6;  // 3 sigma on each side ≈ 99.7% of curve
        return Math.exp(-(x * x) / (2 * sigma * sigma));
    },
    // smooth cosine bump: 0 at edges, 1 at center
    bump: (x, params) => {
        const width = params.width ?? 2;
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return 0;
        return (Math.cos((x / halfW) * Math.PI) + 1) / 2;
    },
    // flat top with smooth cosine falloff at edges
    flat: (x, params) => {
        const width = params.width ?? 2;
        const plateau = params.plateau ?? 0.5; // fraction of width that's flat
        const halfW = width / 2;
        const flatHalf = halfW * plateau;
        const abs = Math.abs(x);
        if (abs >= halfW) return 0;
        if (abs <= flatHalf) return 1;
        const t = (abs - flatHalf) / (halfW - flatHalf);
        return (Math.cos(t * Math.PI) + 1) / 2;
    },
    // bump with a base level (never goes to 0)
    raised: (x, params) => {
        const width = params.width ?? 2;
        const base = params.base ?? 0.3;
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return base;
        const bump = (Math.cos((x / halfW) * Math.PI) + 1) / 2;
        return base + (1 - base) * bump;
    },
    // O.O
    semicircle: (x, params) => {
        const width = params.width ?? 2;
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return 0;
        const normalized = x / halfW;  // -1 to 1
        return Math.sqrt(1 - normalized * normalized);  // semicircle formula
    },
    // asymmetric bump, peak shifted
    skewed: (x, params) => {
        const width = params.width ?? 2;
        const skew = params.skew ?? 0;  // -1 to 1
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return 0;

        const peakX = skew * halfW;

        if (x < peakX) {
            // left side: from -halfW to peakX
            const leftWidth = peakX + halfW;
            if (leftWidth === 0) return 0;
            const t = (x + halfW) / leftWidth;  // 0 at left edge, 1 at peak
            return (Math.cos((1 - t) * Math.PI) + 1) / 2;
        } else {
            // right side: from peakX to +halfW
            const rightWidth = halfW - peakX;
            if (rightWidth === 0) return 0;
            const t = (x - peakX) / rightWidth;  // 0 at peak, 1 at right edge
            return (Math.cos(t * Math.PI) + 1) / 2;
        }
    },
    // convenience aliases
    skewedLeft: (x, params) => shapeFunctions.skewed(x, { ...params, skew: -(params.skew ?? 0.3) }),
    skewedRight: (x, params) => shapeFunctions.skewed(x, { ...params, skew: params.skew ?? 0.3 }),
    // valley shape: high at edges, low in middle
    vShape: (x, params) => {
        const width = params.width ?? 2;
        const depth = params.depth ?? 0.5; // how deep the valley goes
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return 1;
        const bump = (Math.cos((x / halfW) * Math.PI) + 1) / 2;
        return 1 - bump * depth;
    },
    // inverse valley: low at edges, high in middle (alias for bump basically)
    peak: (x, params) => {
        const width = params.width ?? 2;
        const halfW = width / 2;
        if (Math.abs(x) >= halfW) return 0;
        return (Math.cos((x / halfW) * Math.PI) + 1) / 2;
    },
};

// Expression DEFINITIONS - lerp for smooth transitions, snap for immediate values
const expressions = {
    neutral: {
        lerp: {
            top: { shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }], maxHeight: 0.45 },
            bottom: { shapes: [{ type: 'gaussian', params: { width: 2 }, offset: 0, amplitude: 1 }], maxHeight: 0.45 },
            irisRadius: 0.15,
            irisDilation: 0,
            irisXOffset: 0,
            irisYOffset: 0,
            lashMultiplier: 1,
            gapRatio: 0.2,
            topSampleSpeed: -0.1,
            bottomSampleSpeed: 0.1,
            targetWidthRatio: 1.2,
            driftStrength: 0.005,
            dilation: 0,
        },

        snap: {
            noiseTop: 0,
            noiseBottom: 0,
            shy: false,
            engrossed: false,
            peeved: false,
            targetBlush: 0,
            impulseBounds: {
                top: { left: 'wrap', right: 'wrap' },
                bottom: { left: 'wrap', right: 'wrap' }
            }
        },
        update: (dt) => { },
    },
    disappointed: {
        lerp: {
            top: { shapes: [{ type: 'flat', params: { width: 2, plateau: 0.6 }, offset: 0, amplitude: 1 }], maxHeight: 0.12 },
            bottom: { shapes: [{ type: 'bump', params: { width: 2.5 }, offset: 0, amplitude: 0.8 }], maxHeight: 0.3 },
            irisRadius: 0.11,
            irisYOffset: 0.05,
            irisXOffset: 0,
            lashMultiplier: 1.3,
            targetWidthRatio: 1.2,
            driftStrength: 0.005,
        },
        snap: {},
        update: (dt) => { },
    },
    reading: {
        lerp: {
            top: { shapes: [{ type: 'gaussian', params: { width: 2.2 }, offset: 0, amplitude: 1 }], maxHeight: 0.35 },
            bottom: { shapes: [{ type: 'gaussian', params: { width: 2.2 }, offset: 0, amplitude: 1 }], maxHeight: 0.35 },
            gapRatio: 0,
            irisRadius: 0.22,
            irisYOffset: 0,
            irisXOffset: 0,
            lashMultiplier: 2,
            topSampleSpeed: 0.6,
            bottomSampleSpeed: -0.2,
            targetWidthRatio: 1,
            driftStrength: 0.15,
        },
        snap: {
            impulseBounds: {
                top: { left: 'reflect', right: 'reflect' },
                bottom: { left: 'reflect', right: 'reflect' }
            }
        },
        onEnter: () => {
            addImpulse('bottom', { amplitude: 0.15, width: 0.4, velocity: 0.8, decay: 1, phase: 1 });
            addImpulse('top', { amplitude: 0.15, width: 0.4, velocity: -0.8, decay: 1, phase: 0 });
        },
        onExit: () => {
            state.impulses.bottom.forEach(imp => imp.decay = 0.1);
            state.impulses.top.forEach(imp => imp.decay = 0.1);
        },
        update: (dt) => {
            const lfo0 = Math.sin(Math.pow(Math.cos(t / 20), 2));
            const lfo1 = Math.sin(t / 4);
            const lfo2 = Math.cos(t / 4);

            let progress = Math.pow((lfo0 + 1) / 2, 3);

            const raw = Math.max(0, Math.min(1, (progress - 0.45) / 0.1));
            const blend = raw * raw * (3 - 2 * raw);
            const scanWeight = 1 - blend;

            state.dilation = -lfo2 / 4 - progress;

            state.irisX = lfo1 * scanWeight * 0.5;
            state.irisY = lfo2 * scanWeight * 0.5;

            state.lashMultiplier = lerp(0.6, 2, blend);
            state.top.maxHeight = lerp(0.40, 0.10, blend);
            state.bottom.maxHeight = lerp(0.45, 0.10, blend);

            state.driftStrength = blend / 4;
            state.noiseTop = Math.floor(lfo0 * 10) + 10;
            state.noiseBottom = Math.floor(lfo2 * 10) + 10;
            state.gapRatio = (lfo2 + 1) / 2 + 0.25;
            state.targetImpulseMultiplier = 1-blend;
        },
    },
    addicted: {
        lerp: {
            top: { shapes: [{ type: 'bump', params: { width: 2.5 }, offset: 0, amplitude: 1 }], maxHeight: 0.25 },
            bottom: { shapes: [{ type: 'bump', params: { width: 2.5 }, offset: 0, amplitude: 1 }], maxHeight: 0.25 },
            irisRadius: 0.22,
            irisYOffset: 0,
            irisXOffset: 0,
            lashMultiplier: 1,
            targetWidthRatio: 1,
            driftStrength: 0.005,
            topSampleSpeed: 0.1,
            bottomSampleSpeed: -0.1,
        },
        snap: {},
        update: (dt) => { },
    },
    shocked: {
        lerp: {
            top: { shapes: [{ type: 'semicircle', params: { width: 1 }, offset: 0, amplitude: 1 }], maxHeight: 0.4 },
            bottom: { shapes: [{ type: 'semicircle', params: { width: 1 }, offset: 0, amplitude: 1 }], maxHeight: 0.4 },
            irisRadius: 0.14,
            irisYOffset: 0,
            irisXOffset: 0,
            lashMultiplier: 0.5,
            targetWidthRatio: 1,
            driftStrength: 0.005,
            topSampleSpeed: 0.1,
            bottomSampleSpeed: -0.9,
        },
        snap: {
            impulseBounds: {
                top: { left: 'reflect', right: 'reflect' },
                bottom: { left: 'reflect', right: 'reflect' }
            },
        },
        update: (dt) => { },
    },
    angry: {
        lerp: {
            top: { shapes: [{ type: 'skewedLeft', params: { width: 2, skew: 0.4 }, offset: 0, amplitude: 1 }], maxHeight: 0.2 },
            bottom: { shapes: [{ type: 'skewedRight', params: { width: 2.2, skew: 0.3 }, offset: 0, amplitude: 1 }], maxHeight: 0.26 },
            irisRadius: 0.14,
            irisYOffset: -0.05,
            irisXOffset: 0.75,
            lashMultiplier: 1.2,
            driftStrength: 0.005,
            topSampleSpeed: -0.1,
            bottomSampleSpeed: 0.9,
        },
        snap: {},
        update: (dt) => { },
    },
    sad: {
        lerp: {
            top: { shapes: [{ type: 'bump', params: { width: 2 }, offset: 0, amplitude: 1 }], maxHeight: 0.22 },
            bottom: { shapes: [{ type: 'bump', params: { width: 2.4 }, offset: 0, amplitude: 1 }], maxHeight: 0.15 },
            irisRadius: 0.25,
            irisYOffset: 0.7,
            irisXOffset: 0,
            lashMultiplier: 1,
            driftStrength: 0.005,
            topSampleSpeed: -0.1,
            bottomSampleSpeed: 0.1,
        },
        snap: {
            peeved: true,
            targetX: 0,
            targetY: 0,
        },
        update: (dt) => {
            state.top.shapes[0].params.width = 2 + Math.cos(t * 40) / 10;
            state.bottom.shapes[0].params.width = 2.4 + Math.cos(t * 10) / 10;
        },
    },
    mocking: {
        lerp: {
            top: { shapes: [{ type: 'skewedLeft', params: { width: 1, skew: 0.4 }, offset: 0, amplitude: 1 }], maxHeight: 0.4 },
            bottom: {
                shapes: [
                    { type: 'vShape', params: { width: 2, depth: 0.5 }, offset: 0, amplitude: 1 },
                ],
                maxHeight: 0.10
            },
            irisRadius: 0.14,
            lashMultiplier: 1.3,
            topSampleSpeed: 0.4,
            bottomSampleSpeed: -0.1,
            irisYOffset: 0.08,
            irisXOffset: 0.18,
            driftStrength: 0.05,
        },
        snap: {
            peeved: true,
            targetX: 0,
            targetY: 0,
        },
        onEnter: () => {
            addImpulse('bottom', { amplitude: 0.5, width: 1, velocity: -4.5, decay: 1 });
        },
        onExit: () => {
            state.impulses.bottom.forEach(imp => imp.decay = 0.9);
        },
        update: (dt) => {
            state.top.shapes[0].params.width = 2 + Math.cos(t * 40) / 10;
            state.bottom.shapes[0].params.depth = 0.3 + Math.sin(t * 10) / 5;
        },
    },
    flustered: {
        lerp: {
            top: { shapes: [{ type: 'gaussian', params: { width: 1.8 }, offset: 0, amplitude: 1 }], maxHeight: 0.10 },
            bottom: { shapes: [{ type: 'gaussian', params: { width: 1.8 }, offset: 0, amplitude: 1 }], maxHeight: 0.10 },
            irisRadius: 0.08,
            irisYOffset: 0.08,
            irisXOffset: 0,
            lashMultiplier: 2.0,
            driftStrength: 0.15,
        },
        snap: {
            shy: true,
            engrossed: false,
            corneredTime: 0,
            targetBlush: 1,
        },
        onExit: () => {
            enableBlinking();
        },
        update: (dt) => {
            if (state.lookingAtGraph) {
                state.corneredTime += dt * 1000;

                if (state.corneredTime >= 3000) {
                    setAchievementFlag('wasForcedToLook', true);
                    setExpression('addicted');
                    state.engrossed = true;
                    state.targetBlush = 1;
                    state.targetDilation = 0.8;
                    disableBlinking();
                    return;
                }
            }

            if (state.beingCornered) {
                state.targetDilation = Math.min(1.5, state.targetDilation + dt * 2);
                state.top.maxHeight = 0.25;
                state.bottom.maxHeight = 0.25;
                state.driftStrength = 0;
                state.topSampleSpeed = -0.3;
                state.bottomSampleSpeed = 0.4;
                state.irisRadius = 0.16;
            } else if (state.lookingAtGraph) {
                state.targetDilation = 1;
                state.top.maxHeight = 0.4;
                state.bottom.maxHeight = 0.4;
                state.topSampleSpeed = (state.corneredTime / 3000 + 0.3);
                state.bottomSampleSpeed = -(state.corneredTime / 3000 + 0.3);
                state.targetDilation = (state.corneredTime / 3000) * 0.8 + 0.16;
            } else {
                state.targetDilation = 0;
                state.top.maxHeight = 0.10;
                state.bottom.maxHeight = 0.10;
                state.driftStrength = 0.15;
                state.topSampleSpeed = 0.1;
                state.bottomSampleSpeed = -0.3;
            }
        },
    },
};

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getCurrentLerpValues() {
    const neutral = expressions['neutral'];
    const result = {};
    for (const key of Object.keys(neutral.lerp)) {
        if (key === 'top' || key === 'bottom') {
            result[key] = deepCopy(state[key]);
        } else {
            result[key] = state[key];
        }
    }
    return result;
}

function setExpression(name, reset = true) {
    if (!expressions[name]) return;
    if (state.targetExpr === name && state.exprProgress > 0) return;

    const expr = expressions[name];
    const neutral = expressions['neutral'];

    // Exit hook for old expression
    if (expressions[state.targetExpr]?.onExit) {
        expressions[state.targetExpr].onExit();
    }

    // Capture current state as "from"
    state.fromLerp = getCurrentLerpValues();

    // Build target: start with neutral lerp, overlay expression lerp
    const targetLerp = deepCopy(neutral.lerp);
    if (expr.lerp) {
        for (const key of Object.keys(expr.lerp)) {
            if (key === 'top' || key === 'bottom') {
                targetLerp[key] = deepCopy(expr.lerp[key]);
            } else {
                targetLerp[key] = expr.lerp[key];
            }
        }
    }
    state.targetLerp = targetLerp;

    // Apply snaps: neutral first, then expression
    if (reset) {
        if (neutral.snap) Object.assign(state, neutral.snap);
        if (expr.snap) Object.assign(state, expr.snap);
    }

    // Enter hook for new expression
    if (expr.onEnter) {
        expr.onEnter();
    }

    state.currentExpr = state.targetExpr;
    state.targetExpr = name;
    state.exprProgress = 0;
}

function enableBlinking() {
    state.canBlink = true;
    scheduleNextBlink();
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

function lerpShapes(from, to, t) {
    const maxLen = Math.max(from.length, to.length);
    const result = [];

    for (let i = 0; i < maxLen; i++) {
        const f = from[i] || { ...to[i], amplitude: 0 };
        const g = to[i] || { ...from[i], amplitude: 0 };

        result.push({
            type: t < 0.5 ? f.type : g.type,
            params: lerpParams(f.params, g.params, t),
            offset: lerp(f.offset, g.offset, t),
            amplitude: lerp(f.amplitude, g.amplitude, t)
        });
    }
    return result;
}

function updateExpression(dt) {
    if (state.exprProgress < 1 && state.fromLerp && state.targetLerp) {
        state.exprProgress = Math.min(1, state.exprProgress + state.expressionSpeed * dt);

        const progress = easeInOut(state.exprProgress);

        for (const key of Object.keys(state.targetLerp)) {
            if (key === 'top' || key === 'bottom') {
                state[key].maxHeight = lerp(state.fromLerp[key].maxHeight, state.targetLerp[key].maxHeight, progress);
                state[key].shapes = lerpShapes(state.fromLerp[key].shapes, state.targetLerp[key].shapes, progress);
            } else {
                state[key] = lerp(state.fromLerp[key], state.targetLerp[key], progress);
            }
        }
    }
    const dilationSpeed = 2;
    state.dilation += (state.targetDilation - state.dilation) * dilationSpeed * dt;
    const blushSpeed = 3;
    state.blush += (state.targetBlush - state.blush) * blushSpeed * dt;
    const impulseMultSpeed = 3;
    state.impulseMultiplier += (state.targetImpulseMultiplier - state.impulseMultiplier) * impulseMultSpeed * dt;
    // Run update for target expression
    if (expressions[state.targetExpr]?.update) {
        expressions[state.targetExpr].update(dt);
    }
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

// Compute shape value by summing all shapes plus impulses
function computeShapeValue(shapes, normalizedX, impulses = [], bounds = { left: 'wrap', right: 'wrap' }) {
    let sum = shapes.reduce((s, shape) => {
        const fn = shapeFunctions[shape.type];
        if (!fn) return s;
        return s + fn(normalizedX - shape.offset, shape.params) * shape.amplitude;
    }, 0);

    for (const imp of impulses) {
        let sampleDist = normalizedX - imp.offset;

        // Only wrap samples for wrap mode
        if (bounds.left === 'wrap' && bounds.right === 'wrap') {
            while (sampleDist > 1) sampleDist -= 2;
            while (sampleDist < -1) sampleDist += 2;
        }
        // reflect/kill/clamp: impulse position is already managed, just sample directly

        sum += shapeFunctions.bump(sampleDist, { width: imp.width }) * imp.amplitude * state.impulseMultiplier;
    }

    return sum;
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

function drawLashTip(x, startHeight, lashLength, direction, color, barWidth, opacity = 1) {
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
    bar.setAttribute('fill-opacity', opacity);
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

    const baseIrisRadius = state.irisRadius;
    const dilationBonus = state.dilation * 0.08;
    const irisRadius = baseIrisRadius + dilationBonus;
    const irisXOffset = state.irisXOffset;
    const irisYOffset = state.irisYOffset;
    const lashMultiplier = state.lashMultiplier;
    const topMaxHeight = state.top.maxHeight;
    const bottomMaxHeight = state.bottom.maxHeight;

    const scaleY = 1 - state.blink;
    const blinkLashMult = 1 + state.blink * 2 * scaleY + 0.5;

    const irisRadiusPx = (irisRadius + state.attention * irisDilation) * svg.clientHeight;
    const maxLashPx = maxLashLength * svg.clientHeight * blinkLashMult * lashMultiplier;
    const maxIrisOffsetXPx = state.maxIrisOffsetX * svg.clientWidth;
    const maxIrisOffsetYPx = state.maxIrisOffsetY * svg.clientHeight;

    const irisXPx = (svg.clientWidth / 2) + (state.irisX + irisXOffset) * maxIrisOffsetXPx;
    const irisYPx = (svg.clientHeight / 2) + (state.irisY + irisYOffset) * maxIrisOffsetYPx * scaleY;

    const totalTargetWidth = svg.clientWidth * targetWidthRatio;
    const spacing = totalTargetWidth / barCount;
    const barWidthPx = spacing * (1 / (1 + gapRatio));
    const startX = (svg.clientWidth - totalTargetWidth) / 2;

    const styles = getComputedStyle(document.documentElement);
    const colorPositive = styles.getPropertyValue('--color-positive').trim();
    const colorNegative = styles.getPropertyValue('--color-negative').trim();
    const navbarBg = styles.getPropertyValue('--color-accent').trim();
    const lashColor = styles.getPropertyValue('--color-uncertain').trim();
    // Stay solid during blink, go transparent when closed (sleeping)
    const lashOpacity = state.blink > 0.8 ? 1 - ((state.blink - 0.8) / 0.2) : 1;
    const currentLashColor = lashColor;

    const blushColor = '#ff6b9d';
    const blushAmount = state.blush * 0.4;
    const tintedPositive = lerpColor(colorPositive, blushColor, blushAmount);
    const tintedNegative = lerpColor(colorNegative, blushColor, blushAmount);

    for (let i = 0; i < barCount; i++) {
        const topBarPosition = (i - (barCount - 1) / 2) + state.topSampleOffset;
        const bottomBarPosition = (i - (barCount - 1) / 2) + state.bottomSampleOffset;

        const wrappedTopPosition = ((topBarPosition % barCount) + barCount) % barCount - (barCount - 1) / 2;
        const wrappedBottomPosition = ((bottomBarPosition % barCount) + barCount) % barCount - (barCount - 1) / 2;

        const topX = startX + (wrappedTopPosition + barCount / 2) * spacing + spacing / 2;
        const bottomX = startX + (wrappedBottomPosition + barCount / 2) * spacing + spacing / 2;

        const topNormalizedX = wrappedTopPosition / (barCount / 2);
        const bottomNormalizedX = wrappedBottomPosition / (barCount / 2);

        // Use shape summing with impulses
        const topShape = computeShapeValue(state.top.shapes, topNormalizedX, state.impulses.top, state.impulseBounds.top);
        const bottomShape = computeShapeValue(state.bottom.shapes, bottomNormalizedX, state.impulses.bottom, state.impulseBounds.bottom);

        const topNoise = state.noiseTop * Math.random() * (1 - scaleY);
        const botNoise = state.noiseBottom * Math.random() * (1 - scaleY);

        const topHeight = topShape * topMaxHeight * svg.clientHeight * scaleY - topNoise * scaleY;
        const bottomHeight = bottomShape * bottomMaxHeight * svg.clientHeight * scaleY - botNoise * scaleY;

        const lashLengthTop = topShape * maxLashPx;
        const lashLengthBottom = bottomShape * maxLashPx;

        drawBar(topX, topHeight, 'up', tintedPositive, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawBar(bottomX, bottomHeight, 'down', tintedNegative, barWidthPx, irisXPx, irisYPx, irisRadiusPx);
        drawLashTip(topX, topHeight, lashLengthTop, 'up', currentLashColor, barWidthPx, lashOpacity);
        drawLashTip(bottomX, bottomHeight, lashLengthBottom, 'down', currentLashColor, barWidthPx, lashOpacity);
    }
}

function updateCursorTracking() {
    if (!state.awake) return;
    if (state.cursorTrackingEnabled === false) return;

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
    if (!chart || !eye) return { x: 0.5, y: 1 };

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
    const refElement = state.trackingElement || svg;
    const rect = refElement.getBoundingClientRect();
    state.cursorX = e.clientX - rect.left;
    state.cursorY = e.clientY - rect.top;
    state.svgWidth = rect.width;
    state.svgHeight = rect.height;
}

function setTrackingElement(el) {
    state.trackingElement = el;
}

function clearTrackingElement() {
    state.trackingElement = null;
}

function setSleepEnabled(enabled) {
    state.sleepEnabled = enabled;
    if (!enabled && !state.awake) {
        wake();
    }
}

function setCursorTrackingEnabled(enabled) {
    state.cursorTrackingEnabled = enabled;
    if (!enabled) {
        state.targetX = 0;
        state.targetY = 0;
    }
}

function isCursorTrackingEnabled() {
    return state.cursorTrackingEnabled !== false;
}

function isSleepEnabled() {
    return state.sleepEnabled !== false;
}

function isBlinkingEnabled() {
    return state.canBlink;
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
    if (state.awake && state.sleepEnabled !== false && idleTime > state.sleepTimeout) {
        snooze();
    }

    if (dt >= frameInterval / 1000) {
        updateImpulses(dt);
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
        Combat.update(dt);
        Combat.render();
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

function setBarDensity(numBars = 50, gapRatio = 0.2) {
    state.gapRatio = gapRatio;
    state.barCount = numBars;
    setAchievementFlag('barCount', numBars);
    checkAchievements();
}

// === DEATH ANIMATIONS ===
const deathAnimations = {
    explode: doExplode,
    fall: doFall,
};

function killEye(animation = 'fall') {
    const eyeEl = document.getElementById('eye');
    if (!eyeEl) return;
    if (state.dead) return;

    state.dead = true;

    // Stare at player and play pre-death jingle
    setExpression('shocked');
    setPeeved(true, false, false, 0, 0, 10);
    
    const animFn = deathAnimations[animation] || deathAnimations.explode;
    if (animation == 'fall') {
        playPreDeathSound(() => animFn(eyeEl));
    }
    else {
        animFn(eyeEl);
    }
}

// For backwards compatibility
function explodeEye() {
    killEye('explode');
}

function onDied() {
    setAchievementFlag('deathCount', ++state.deathCount);
    checkAchievements();
}

function doFall(eyeEl) {
    const eyeContainer = document.getElementById('eye-container') || eyeEl.parentElement;
    
    // Play post-death sound
     playPostDeathSound();
    
    // Hide overflow to prevent scrollbar
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // Mario death jump - up then down
    let y = 0;
    let vy = -4; // smaller jump
    const gravity = 0.25;
    let hangFrames = 20;
    
    eyeContainer.style.position = 'relative';
    
    function animateFall() {
        if (hangFrames > 0 && vy >= 0) {
            hangFrames--;
        } else {
            vy += gravity;
            y += vy;
        }
        
        eyeEl.style.transform = `translateY(${y}px)`;
        
        if (y < window.innerHeight) {
            requestAnimationFrame(animateFall);
            onDied();
        } else {
            eyeEl.style.visibility = 'hidden';
            eyeEl.style.transform = '';
            document.body.style.overflow = originalOverflow;
            showRespawnTimer(eyeContainer, eyeEl);
        }
    }
    
    requestAnimationFrame(animateFall);
}

function doExplode(eyeEl) {
    const eyeContainer = document.getElementById('eye-container') || eyeEl.parentElement;
    
    // Get all the parts
    const parts = eyeEl.querySelectorAll('circle, ellipse, path, rect, line');
    const particles = [];
    
    // Get eye's bounding rect for positioning
    const eyeRect = eyeEl.getBoundingClientRect();
    const containerRect = eyeContainer.getBoundingClientRect();
    
    // Create explosion particles from each element
    parts.forEach((part, i) => {
        const clone = part.cloneNode(true);
        const bbox = part.getBBox();
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        
        // Random velocity away from center
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 15;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const vr = (Math.random() - 0.5) * 30; // rotation velocity
        
        particles.push({ el: clone, x: cx, y: cy, vx, vy, vr, rotation: 0, opacity: 1 });
    });
    
    // Hide original
    eyeEl.style.visibility = 'hidden';
    
    // Create explosion container
    const container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.setAttribute('viewBox', eyeEl.getAttribute('viewBox'));
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'visible';
    container.id = 'eye-explosion';
    
    particles.forEach(p => container.appendChild(p.el));
    eyeContainer.style.position = 'relative';
    eyeContainer.style.overflow = 'visible';
    eyeContainer.appendChild(container);
    
    // Animate explosion
    let frame = 0;
    const maxFrames = 60;
    
    function animateExplosion() {
        frame++;
        const progress = frame / maxFrames;
        
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // gravity
            p.rotation += p.vr;
            p.opacity = 1 - progress;
            
            p.el.setAttribute('transform', `translate(${p.x}, ${p.y}) rotate(${p.rotation})`);
            p.el.style.opacity = p.opacity;
        });
        
        if (frame < maxFrames) {
            requestAnimationFrame(animateExplosion);
        } else {
            container.remove();
            showRespawnTimer(eyeContainer, eyeEl);
        }
    }
    
    // Play pow + post-death sound
     playPowSound();
     playPostDeathSound();
    onDied();

    requestAnimationFrame(animateExplosion);
}

function showRespawnTimer(container, eyeEl) {
    const timer = document.createElement('div');
    timer.id = 'respawn-timer';
    timer.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: monospace;
        font-size: 48px;
        color: #ff4444;
        text-shadow: 0 0 10px #ff0000;
        z-index: 100;
    `;
    container.appendChild(timer);
    
    let seconds = 10;
    timer.textContent = seconds;
    
    const countdown = setInterval(() => {
        seconds--;
        timer.textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(countdown);
            timer.remove();
            eyeEl.style.visibility = 'visible';
            state.dead = false;
            
            // Reset blink state
            state.blink = 0;
            state.blinkTarget = 0;
            enableBlinking();
            
            // Disappointed reaction with timeout
            const reaction = Date.now();
            state.lastReaction = reaction;
            setExpression('disappointed');
            setTimeout(() => {
                if (state.lastReaction === reaction) {
                    setExpression('neutral');
                }
            }, 5000);
        }
    }, 1000);
}

// === EYE API ===
// Single source of truth for eye entity state
const Eye = {
    // Health accessors
    get health() { return state.health; },
    set health(v) { state.health = v; },
    get maxHealth() { return state.maxHealth; },
    set maxHealth(v) { state.maxHealth = v; },
    get maxContainers() { return state.maxContainers; },
    
    // Status accessors
    get dead() { return state.dead; },
    get awake() { return state.awake; },
    
    // Health manipulation
    damage(halfHearts = 1, anim = 'fall', source = 'unknown') {
        if (source === 'player') {
            setAchievementFlag('tookDumbDamage');
        }
        state.health = Math.max(0, state.health - halfHearts);
        this.renderHealthBar();
        this.save();
        
        if (state.health <= 0) {
            this.kill(anim);
        }
    },
    
    heal(halfHearts = 1) {
        state.health = Math.min(state.maxHealth, state.health + halfHearts);
        this.renderHealthBar();
        this.save();
    },
    
    addContainer() {
        if (state.maxHealth < state.maxContainers) {
            state.maxHealth += 2;
            this.renderHealthBar();
            this.save();
        }
    },
    
    kill(anim = 'fall') {
        killEye(anim);
        setAchievementFlag('yasd');
        
        // Clear inventory on death
        Items.inventory = [];
        Items.activeEffects = {};
        Items.saveInventory();
        
        // Reset health after respawn
        setTimeout(() => {
            state.health = state.maxHealth = 12;
            this.renderHealthBar();
            this.save();
        }, 11000);
    },
    
    // Health bar rendering
    renderHealthBar() {
        const bar = document.getElementById('health-bar');
        if (!bar) return;
        
        // Hidden until tookDamage achievement unlocked
        const hasUnlocked = achievementState?.unlocked?.kill_eye;
        if (!hasUnlocked) {
            bar.innerHTML = '';
            return;
        }
        
        bar.innerHTML = '';
        
        const containers = Math.ceil(state.maxHealth / 2);
        const fullHearts = Math.floor(state.health / 2);
        const hasHalf = state.health % 2 === 1;
        
        const row1 = document.createElement('div');
        row1.className = 'health-row';
        const row2 = document.createElement('div');
        row2.className = 'health-row';
        
        for (let i = 0; i < containers; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            
            if (i < fullHearts) {
                heart.classList.add('full');
                heart.textContent = '❤️';
            } else if (i === fullHearts && hasHalf) {
                heart.classList.add('half');
                heart.textContent = '❤️';
            } else {
                heart.classList.add('empty');
                heart.textContent = '❤️';
            }
            
            if (i < 6) row1.appendChild(heart);
            else row2.appendChild(heart);
        }
        
        bar.appendChild(row1);
        if (containers > 6) bar.appendChild(row2);
    },
    
    // Persistence
    save() {
        localStorage.setItem('eyeState', JSON.stringify({
            health: state.health,
            maxHealth: state.maxHealth,
            deathCount: state.deathCount
        }));
    },
    
    load() {
        const saved = localStorage.getItem('eyeState');
        if (saved) {
            const data = JSON.parse(saved);
            state.health = data.health ?? 12;
            state.maxHealth = data.maxHealth ?? 12;
            state.deathCount = data.deathCount ?? 0;
            
            // Don't start dead
            if (state.health <= 0) state.health = state.maxHealth;
        }
        this.renderHealthBar();
    }
};

// Expose globally
window.Eye = Eye;

// === ITEM EFFECTS INTERPRETER ===
// Takes merged effects from Items system, applies to eye state
function applyItemEffects(effects) {
    if (effects.dilation !== undefined) state.targetDilation = effects.dilation;
    if (effects.pupilSize) state.targetIrisRadius = 0.15 * effects.pupilSize;
    if (effects.giant) state.targetIrisRadius = 0.3;
    if (effects.jitter) state.driftStrength = 0.02;
    if (effects.flustered) setExpression('flustered');
    if (effects.tearsUp) state.blinkInterval = 2; // blink more
    if (effects.blinkRate) state.blinkInterval = 4 / effects.blinkRate;
    // Tint could be applied via CSS vars if needed
    // if (effects.tint) document.documentElement.style.setProperty('--eye-tint', effects.tint);
}

window.applyItemEffects = applyItemEffects;

// Load state on init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Eye.load());
} else {
    Eye.load();
}

document.addEventListener('mousemove', onMouseMove);
svg.addEventListener('click', () => {
    if (state.awake && !state.dead) {
        blink();
        playPowSound();
        state.poked = true;
        state.attentionThreshold *= state.patience;
        
        // Take damage from poking
        Eye.damage(1, 'fall', 'player');

        if (state.attentionThreshold < 2) {
            // Too annoyed - snap shut briefly then reset
            state.blink = 1;
            state.blinkTarget = 0; // Will open back up
            state.attentionThreshold = 100;
            enableBlinking();
        } else if (state.attentionThreshold < 5) {
            setExpression('sad');
        } else if (state.attentionThreshold < 10) {
            setExpression('angry');
        } else if (state.attentionThreshold < 50) {
            setExpression('disappointed');
        }
    }
});

requestAnimationFrame(tick);
scheduleNextBlink();
setExpression('neutral');
