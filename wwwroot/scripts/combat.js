/* Combat System
 *
 * PHILOSOPHY:
 * - Projectiles are intensional: defined by trajectory, not state
 * - Properties computed from this.frameEffects, not stored
 * - One source of truth: Items defines effects, Combat queries them
 * - Eye.js calls update(dt) and render() in the shame loop
 */

const Combat = {
    canvas: null,
    ctx: null,
    tears: [],
    holding: false,
    lastFire: 0,
    splashes: [],
    config: {
        tearStyle: 'fancy',
        shadows: true,
        splash: true,
    },

    init() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'combat-canvas';
        this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loadConfig();
        this.frameEffects = Items.getMergedEffects();
    },

    loadConfig() {
        const saved = localStorage.getItem('combatConfig');
        if (saved) Object.assign(this.config, JSON.parse(saved));
    },

    saveConfig() {
        localStorage.setItem('combatConfig', JSON.stringify(this.config));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    getPupilPosition() {
        const svg = document.getElementById('eye');
        if (!svg) return { x: 0, y: 0 };

        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        // Offset by iris position (state.irisX/Y are -1 to 1)
        const offsetX = state.irisX * state.maxIrisOffsetX * rect.width;
        const offsetY = state.irisY * state.maxIrisOffsetY * rect.height;

        return { x: cx + offsetX, y: cy + offsetY };
    },

    fire(targetX, targetY) {
        const start = this.getPupilPosition();
        this.tears.push(Tear(start, { x: targetX, y: targetY }));
        Eye.blink();
        sfx.tear();
        state.lastShot = Date.now();
    },

    get fireRate() {
        const base = 1; // shots per second
        return base * (this.frameEffects.tearRate || 1);
    },

    get fireInterval() {
        return 1000 / this.fireRate;
    },

    startFiring() {
        this.holding = true;
        state.attention = 1;
    },

    stopFiring() {
        this.holding = false;
    },

    splash(pos, size, color) {
        this.splashes.push({
            x: pos.x,
            y: pos.y,
            size,
            color,
            elapsed: 0,
            duration: 0.2,
        });
        sfx.pow();
    },

    update(dt) {
        this.frameEffects = Items.getMergedEffects();
        if (this.holding) {
            state.attention = 1;
        }

        // Fire while holding
        if (this.holding && this.target) {
            const now = Date.now();
            if (now - this.lastFire >= this.fireInterval) {
                this.fire(this.target.x, this.target.y);
                this.lastFire = now;
            }
        }

        // Update tears
        for (const t of this.tears) {
            t.elapsed += dt;
            if (t.done && !t.splashed) {
                t.splashed = true;
                this.splash(t.end, t.size, t.color);
            }
        }
        this.tears = this.tears.filter(t => !t.done);

        // Update splashes
        for (const s of this.splashes) {
            s.elapsed += dt;
        }
        this.splashes = this.splashes.filter(s => s.elapsed < s.duration);
    },

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Shadows (if enabled)
        if (this.config.shadows) {
            for (const t of this.tears) {
                const pos = t.position;
                const size = t.size;
                const arc = Math.sin(t.progress * Math.PI);
                const shadowOffset = arc * 15;

                this.ctx.beginPath();
                this.ctx.arc(pos.x + shadowOffset, pos.y + shadowOffset, size, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                this.ctx.fill();
            }
        }

        // Tears
        for (const t of this.tears) {
            const pos = t.position;
            const size = t.size;

            if (this.config.tearStyle === 'fancy') {
                // Gradient bubble
                const gradient = this.ctx.createRadialGradient(
                    pos.x, pos.y, 0,
                    pos.x, pos.y, size
                );
                gradient.addColorStop(0, t.color + '00');
                gradient.addColorStop(0.6, t.color + '88');
                gradient.addColorStop(1, t.color + 'cc');

                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();

                // Highlight
                const highlightX = pos.x - size * 0.3;
                const highlightY = pos.y - size * 0.3;
                const highlightSize = size * 0.25;

                const highlightGradient = this.ctx.createRadialGradient(
                    highlightX, highlightY, 0,
                    highlightX, highlightY, highlightSize
                );
                highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                this.ctx.beginPath();
                this.ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2);
                this.ctx.fillStyle = highlightGradient;
                this.ctx.fill();

                // Rim
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size - 0.5, 0, Math.PI * 2);
                this.ctx.strokeStyle = t.color;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

            } else if (this.config.tearStyle === 'simple') {
                // Solid fill
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = t.color + 'aa';
                this.ctx.fill();

                // Rim
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size - 0.5, 0, Math.PI * 2);
                this.ctx.strokeStyle = t.color;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

            } else {
                // Minimal - solid only
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = t.color;
                this.ctx.fill();
            }
        }

        // Splashes (if enabled)
        if (this.config.splash) {
            for (const s of this.splashes) {
                const progress = s.elapsed / s.duration;
                const radius = s.size * (1 + progress * 2);
                const alpha = 1 - progress;

                const gradient = this.ctx.createRadialGradient(
                    s.x, s.y, 0,
                    s.x, s.y, radius
                );
                gradient.addColorStop(0, s.color + '00');
                gradient.addColorStop(0.6, s.color + Math.floor(alpha * 100).toString(16).padStart(2, '0'));
                gradient.addColorStop(1, s.color + Math.floor(alpha * 200).toString(16).padStart(2, '0'));

                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();
            }
        }
    },
};

const Tear = (start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return {
        start,
        end,
        distance,
        elapsed: 0,

        get effects() {
            return Combat.frameEffects;
        },

        get speed() {
            const base = 400; // pixels per second
            return base * (this.effects.tearRate || 1);
        },

        get duration() {
            return this.distance / this.speed;
        },

        get progress() {
            return Math.min(1, this.elapsed / this.duration);
        },

        get done() {
            return this.progress >= 1;
        },
        get color() {
            if (this.effects.demonic) return '#ff4444';
            if (this.effects.bloody) return '#aa0000';
            return '#88ccff';
        },

        get arcHeight() {
            return this.distance * 0.2;
        },

        get position() {
            const t = this.progress;
            const x = this.start.x + (this.end.x - this.start.x) * t;
            const y = this.start.y + (this.end.y - this.start.y) * t;
            return { x, y };
        },

        get size() {
            const base = this.effects.giant ? 16 : 8;
            const arc = Math.sin(this.progress * Math.PI); // 0 -> 1 -> 0
            return base * (1 + arc * 0.5); // grows 50% at midpoint
        },

        get piercing() {
            return this.effects.piercing || false;
        },

        get homing() {
            return this.effects.homing || false;
        },

        get bouncing() {
            return this.effects.bouncing || false;
        },

        get damage() {
            let d = 1;
            if (this.effects.giant) d *= 2;
            if (this.effects.demonic) d *= 1.5;
            return d;
        },
    };
};

// Click handler - fire on non-interactive clicks
document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, a, select, .modal, .options-modal, #eye')) return;
    if (!Eye.awake || Eye.dead) return;
    // Gate: need to unlock combat first
    if (!getAchievementFlag('combatUnlocked')) return;

    Combat.target = { x: e.clientX, y: e.clientY };
    Combat.startFiring();
});

document.addEventListener('mousemove', (e) => {
    if (Combat.holding) {
        Combat.target = { x: e.clientX, y: e.clientY };
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    Combat.stopFiring();
});

window.Combat = Combat;