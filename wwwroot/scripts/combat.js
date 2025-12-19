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
    enemies: [],
    enemyImages: {}, // cache loaded images

    config: {
        tearStyle: 'fancy',
        shadows: 'high',  // 'off' | 'low' | 'medium' | 'high'
        splash: true,
        screenShake: 1,  // 0 to 1
        depthOfField: 0,
    },

    init() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'combat-canvas';
        this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;';
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
        ScreenShake.multiplier = this.config.screenShake ?? 1;
        DepthOfField.init();
        DepthOfField.setIntensity(this.config.depthOfField ?? 0);
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

    spawnEnemy(appId, headerImage) {
        if (!getAchievementFlag('tookDumbDamage')) return null;

        // Spawn from bottom-right quadrant edges only
        // Either right edge (bottom half) or bottom edge (right half)

        const w = window.innerWidth;
        const h = window.innerHeight;

        let x, y;

        if (Math.random() < 0.5) {
            // Right edge, bottom half
            x = w + 230;
            y = h * 0.5 + Math.random() * h * 0.5;
        } else {
            // Bottom edge, right half
            x = w * 0.5 + Math.random() * w * 0.5;
            y = h + 107;
        }

        const enemy = Enemy(appId, headerImage, x, y);
        this.enemies.push(enemy);

        // Preload image
        if (!this.enemyImages[appId]) {
            const img = new Image();
            img.src = headerImage;
            this.enemyImages[appId] = img;
        }

        return enemy;
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

        // Update enemies
        for (const e of this.enemies) {
            if (this.tutorialTriggered && !getAchievementFlag('combatUnlocked')) continue;

            e.x += e.direction.x * e.speed * dt;
            e.y += e.direction.y * e.speed * dt;

            if (!getAchievementFlag('combatUnlocked')) {
                const pupil = this.getPupilPosition();
                const dist = Math.sqrt((pos.x - pupil.x) ** 2 + (pos.y - pupil.y) ** 2);

                if (dist < 1200 && !this.tutorialTriggered) {
                    this.tutorialTriggered = true;
                    showObjectivePopup();
                }
            }

            if (e.reachedEye) {
                Eye.damage(2, 'fall', 'enemy');
                e.health = 0; // remove after hit
            }
        }

        this.enemies = this.enemies.filter(e => !e.dead);

        // Check tear-enemy collisions
        for (const t of this.tears) {
            if (t.done) continue;
            const pos = t.position;

            for (const e of this.enemies) {
                const hit = pos.x > e.hitbox.left &&
                    pos.x < e.hitbox.right &&
                    pos.y > e.hitbox.top &&
                    pos.y < e.hitbox.bottom;

                if (hit) {
                    e.health -= t.damage;
                    t.elapsed = t.duration; // kill the tear
                    this.splash(pos, t.size, t.color); // splash on hit

                    if (e.dead) {
                        // TODO: drop loot, play sound, explosion
                    }
                    break;
                }
            }
        }
    },


    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const pupil = this.getPupilPosition();
        const maxDist = Math.max(window.innerWidth, window.innerHeight) * 0.5;
        const dofIntensity = typeof DepthOfField !== 'undefined' ? DepthOfField.intensity : 0;


        // Shadows (if enabled)
        if (this.config.shadows !== 'off') {
            for (const t of this.tears) {
                const pos = t.position;
                const size = t.size;
                const arc = Math.sin(t.progress * Math.PI);
                const shadowOffset = arc * 15;

                const blur = DepthOfField.getBlur(pos.x, pos.y);
                this.ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

                this.ctx.beginPath();
                this.ctx.arc(pos.x + shadowOffset, pos.y + shadowOffset, size, 0, Math.PI * 2);

                if (this.config.shadows === 'low') {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    this.ctx.fill();
                } else if (this.config.shadows === 'medium') {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    this.ctx.fill();
                } else if (this.config.shadows === 'high') {
                    const gradient = this.ctx.createRadialGradient(
                        pos.x + shadowOffset, pos.y + shadowOffset, 0,
                        pos.x + shadowOffset, pos.y + shadowOffset, size
                    );
                    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
                    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    this.ctx.fillStyle = gradient;
                    this.ctx.fill();
                }
            }
        }

        this.ctx.filter = 'none';

        // Tears
        for (const t of this.tears) {
            const pos = t.position;
            const size = t.size;

            const blur = DepthOfField.getBlur(pos.x, pos.y);
            this.ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

            if (this.config.tearStyle === 'fancy') {
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

                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size - 0.5, 0, Math.PI * 2);
                this.ctx.strokeStyle = t.color;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

            } else if (this.config.tearStyle === 'simple') {
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = t.color + 'aa';
                this.ctx.fill();

                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size - 0.5, 0, Math.PI * 2);
                this.ctx.strokeStyle = t.color;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

            } else {
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = t.color;
                this.ctx.fill();
            }
        }

        this.ctx.filter = 'none';

        // Splashes (if enabled)
        if (this.config.splash) {
            for (const s of this.splashes) {
                const progress = s.elapsed / s.duration;
                const radius = s.size * (1 + progress * 2);
                const alpha = 1 - progress;

                const blur = DepthOfField.getBlur(s.x, s.y);
                this.ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

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

        this.ctx.filter = 'none';

        // Enemies
        for (const e of this.enemies) {
            const img = this.enemyImages[e.appId];
            if (img && img.complete) {
                const blur = DepthOfField.getBlur(e.x, e.y);
                this.ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

                this.ctx.drawImage(
                    img,
                    e.x - e.width / 2,
                    e.y - e.height / 2,
                    e.width,
                    e.height
                );
            }
        }

        this.ctx.filter = 'none';
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


const Enemy = (appId, headerImage, x, y) => ({
    appId,
    headerImage,
    x,
    y,
    width: 230,  // half size
    height: 107,
    speed: 50,   // pixels per second
    health: 10,

    get target() {
        return Combat.getPupilPosition();
    },

    get direction() {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { x: dx / dist, y: dy / dist };
    },

    get hitbox() {
        return {
            left: this.x - this.width / 2,
            right: this.x + this.width / 2,
            top: this.y - this.height / 2,
            bottom: this.y + this.height / 2,
        };
    },

    get dead() {
        return this.health <= 0;
    },

    get reachedEye() {
        const pupil = this.target;
        const dist = Math.sqrt((this.x - pupil.x) ** 2 + (this.y - pupil.y) ** 2);
        return dist < 50; // contact range
    },
});

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