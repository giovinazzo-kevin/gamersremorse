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
    enemyImages: {},
    hitstopFrames: 0,
    flashingEnemies: new Set(),

    // Beam charge state
    chargeTime: 0,
    chargeThreshold: 0.5,  // seconds to minimum beam
    maxCharge: 2.0,        // seconds to DEATH LAUSR
    beams: [],
    isCharging: false,

    config: {
        tearStyle: 'fancy',
        shadows: 'high',
        splash: true,
        screenShake: 1,
        depthOfField: 0,
        hitstop: 1,
        hitflash: true,
        hitFlash: 0.5,
        lowHPOverlay: 1,
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

        const offsetX = state.irisX * state.maxIrisOffsetX * rect.width;
        const offsetY = state.irisY * state.maxIrisOffsetY * rect.height;

        return { x: cx + offsetX, y: cy + offsetY };
    },

    spawnEnemy(appId, headerImage) {
        if (!getAchievementFlag('tookDumbDamage')) return null;

        const w = window.innerWidth;
        const h = window.innerHeight;

        let x, y;
        if (Math.random() < 0.5) {
            x = w + 230;
            y = h * 0.5 + Math.random() * h * 0.5;
        } else {
            x = w * 0.5 + Math.random() * w * 0.5;
            y = h + 107;
        }

        const enemy = Enemy(appId, headerImage, x, y);
        this.enemies.push(enemy);

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

    hitstop(frames, enemy = null) {
        const scaled = frames * this.config.hitstop;
        this.hitstopFrames = Math.max(this.hitstopFrames, scaled);
        if (enemy && this.config.hitflash) {
            this.flashingEnemies.add(enemy);
        }
    },

    get fireRate() {
        const base = 1;
        return base * (this.frameEffects.tearRate || 1);
    },

    get fireInterval() {
        return 1000 / this.fireRate;
    },

    startFiring() {
        this.holding = true;
        state.attention = 1;
        // Start charging if we have brimstone
        if (this.frameEffects.laserCharge) {
            this.isCharging = true;
            this.chargeTime = 0;
        }
    },

    stopFiring() {
        // Fire beam if charged enough
        if (this.isCharging && this.chargeTime >= this.chargeThreshold && this.target) {
            this.fireBeam(this.target.x, this.target.y);
        }
        this.holding = false;
        this.isCharging = false;
        this.chargeTime = 0;
        state.charging = false;
        state.chargePercent = 0;
    },

    get chargePercent() {
        if (!this.isCharging) return 0;
        return Math.min(1, (this.chargeTime - this.chargeThreshold) / (this.maxCharge - this.chargeThreshold));
    },

    get chargeReady() {
        return this.chargeTime >= this.chargeThreshold;
    },

    fireBeam(targetX, targetY) {
        const start = this.getPupilPosition();
        const dx = targetX - start.x;
        const dy = targetY - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Scale beam properties by charge
        const chargePercent = this.chargePercent;
        const width = 20 + chargePercent * 60;  // 20-80px
        const damage = 3 + chargePercent * 7;   // 3-10 damage
        const length = Math.max(window.innerWidth, window.innerHeight) * 1.5;

        this.beams.push({
            startX: start.x,
            startY: start.y,
            dirX,
            dirY,
            width,
            damage,
            length,
            elapsed: 0,
            duration: 0.15,  // beam visible duration
            chargePercent,
        });

        // Hit all enemies in beam path
        for (const e of this.enemies) {
            if (this.beamHitsEnemy(start, dirX, dirY, length, width, e)) {
                e.health -= damage;
                ScreenShake.shake(damage * 6);
                HitFlash.trigger(damage);
                this.hitstop(3, e);
                sfx.pow();

                e.knockbackVX = dirX * 300;
                e.knockbackVY = dirY * 300;

                if (e.dead) {
                    ScreenShake.shake(damage * 20);
                    this.hitstop(6);
                }
            }
        }

        Eye.blink();
        sfx.beam?.() || sfx.pow();  // beam sound or fallback
        ScreenShake.shake(20 + chargePercent * 40);

        // Achievement
        if (!getAchievementFlag('firedBeam')) {
            setAchievementFlag('firedBeam');
            // IMMA FIRIN MAH LAZER achievement handled in achievements.js
        }
    },

    beamHitsEnemy(start, dirX, dirY, length, width, enemy) {
        // Project enemy center onto beam line
        const ex = enemy.x - start.x;
        const ey = enemy.y - start.y;
        const projection = ex * dirX + ey * dirY;

        // Behind or beyond beam
        if (projection < 0 || projection > length) return false;

        // Perpendicular distance from beam
        const perpX = ex - projection * dirX;
        const perpY = ey - projection * dirY;
        const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);

        // Hit if within beam width + enemy size
        return perpDist < (width / 2 + enemy.width / 2);
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
        sfx.splash();
    },

    update(dt) {
        this.frameEffects = Items.getMergedEffects();

        if (this.holding) {
            state.attention = 1;
        }

        const frozen = this.hitstopFrames > 0;

        if (frozen) {
            this.hitstopFrames -= dt * 1000 / state.frameInterval;
            if (this.hitstopFrames <= 0) {
                this.flashingEnemies.clear();
            }
        }

        // Charge beam or fire tears
        if (!frozen && this.holding && this.target) {
            if (this.isCharging) {
                // Accumulate charge
                this.chargeTime += dt;
                state.charging = true;
                state.chargePercent = Math.min(1, this.chargeTime / this.maxCharge);
            } else {
                // Normal tear firing
                const now = Date.now();
                if (now - this.lastFire >= this.fireInterval) {
                    this.fire(this.target.x, this.target.y);
                    this.lastFire = now;
                }
            }
        }

        // Update beams
        for (const b of this.beams) {
            b.elapsed += dt;
        }
        this.beams = this.beams.filter(b => b.elapsed < b.duration);

        if (!frozen) {
            for (const t of this.tears) {
                t.elapsed += dt;
                if (t.done && !t.splashed) {
                    t.splashed = true;
                    this.splash(t.end, t.size, t.color);
                }
            }
            this.tears = this.tears.filter(t => !t.done);
        }

        if (!frozen) {
            for (const s of this.splashes) {
                s.elapsed += dt;
            }
            this.splashes = this.splashes.filter(s => s.elapsed < s.duration);
        }

        for (const e of this.enemies) {
            if (e.knockbackVX || e.knockbackVY) {
                e.x += e.knockbackVX * dt;
                e.y += e.knockbackVY * dt;
                e.knockbackVX *= 0.85;
                e.knockbackVY *= 0.85;
                if (Math.abs(e.knockbackVX) < 1) e.knockbackVX = 0;
                if (Math.abs(e.knockbackVY) < 1) e.knockbackVY = 0;
            }

            if (!frozen) {
                if (this.tutorialTriggered && !getAchievementFlag('combatUnlocked')) continue;

                e.x += e.direction.x * e.speed * dt;
                e.y += e.direction.y * e.speed * dt;

                if (!getAchievementFlag('combatUnlocked')) {
                    const pupil = this.getPupilPosition();
                    const dist = Math.sqrt((e.x - pupil.x) ** 2 + (e.y - pupil.y) ** 2);

                    if (dist < 1200 && !this.tutorialTriggered) {
                        this.tutorialTriggered = true;
                        showObjectivePopup();
                    }
                }

                if (e.reachedEye) {
                    Eye.damage(2, 'fall', 'enemy');
                    e.health = 0;
                }
            }
        }

        if (!frozen) {
            this.enemies = this.enemies.filter(e => !e.dead);
        }

        if (!frozen) {
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
                        t.elapsed = t.duration;

                        this.splash(pos, t.size, t.color);
                        ScreenShake.shake(t.damage * 4);
                        HitFlash.trigger(t.damage);
                        this.hitstop(1, e);
                        sfx.pow();

                        const dx = t.end.x - t.start.x;
                        const dy = t.end.y - t.start.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const dirX = dx / dist;
                        const dirY = dy / dist;

                        e.x += dirX * 10;
                        e.y += dirY * 10;

                        e.knockbackVX = dirX * 150;
                        e.knockbackVY = dirY * 150;

                        if (e.dead) {
                            ScreenShake.shake(t.damage * 40);
                            this.hitstop(4);
                        }
                        break;
                    }
                }
            }
        }
    },

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Shadows
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
                } else if (this.config.shadows === 'medium') {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                } else {
                    const gradient = this.ctx.createRadialGradient(
                        pos.x + shadowOffset, pos.y + shadowOffset, 0,
                        pos.x + shadowOffset, pos.y + shadowOffset, size
                    );
                    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
                    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.2)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    this.ctx.fillStyle = gradient;
                }
                this.ctx.fill();
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
                const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size);
                gradient.addColorStop(0, t.color + '00');
                gradient.addColorStop(0.6, t.color + '88');
                gradient.addColorStop(1, t.color + 'cc');

                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();

                const hlX = pos.x - size * 0.3;
                const hlY = pos.y - size * 0.3;
                const hlSize = size * 0.25;

                const hlGradient = this.ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlSize);
                hlGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                hlGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                this.ctx.beginPath();
                this.ctx.arc(hlX, hlY, hlSize, 0, Math.PI * 2);
                this.ctx.fillStyle = hlGradient;
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

        // Splashes
        if (this.config.splash) {
            for (const s of this.splashes) {
                const progress = s.elapsed / s.duration;
                const radius = s.size * (1 + progress * 2);
                const alpha = 1 - progress;

                const blur = DepthOfField.getBlur(s.x, s.y);
                this.ctx.filter = blur > 0.5 ? `blur(${blur}px)` : 'none';

                const gradient = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
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
            if (!img || !img.complete) continue;

            // Flash white if in hitstop
            let filter = '';
            const blur = DepthOfField.getBlur(e.x, e.y);
            if (blur > 0.5) filter += `blur(${blur}px) `;
            if (this.flashingEnemies.has(e)) filter += 'brightness(3) ';
            this.ctx.filter = filter || 'none';

            this.ctx.drawImage(
                img,
                e.x - e.width / 2,
                e.y - e.height / 2,
                e.width,
                e.height
            );
        }

        this.ctx.filter = 'none';

        // Beams
        for (const b of this.beams) {
            const progress = b.elapsed / b.duration;
            const alpha = 1 - progress * 0.5;  // fade slightly
            const width = b.width * (1 + progress * 0.5);  // expand slightly

            // Main beam
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.moveTo(b.startX, b.startY);
            this.ctx.lineTo(b.startX + b.dirX * b.length, b.startY + b.dirY * b.length);
            this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
            this.ctx.lineWidth = width;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();

            // Inner bright core
            this.ctx.beginPath();
            this.ctx.moveTo(b.startX, b.startY);
            this.ctx.lineTo(b.startX + b.dirX * b.length, b.startY + b.dirY * b.length);
            this.ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`;
            this.ctx.lineWidth = width * 0.4;
            this.ctx.stroke();

            // White hot center
            this.ctx.beginPath();
            this.ctx.moveTo(b.startX, b.startY);
            this.ctx.lineTo(b.startX + b.dirX * b.length, b.startY + b.dirY * b.length);
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            this.ctx.lineWidth = width * 0.15;
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Charge circle on cursor
        if (this.isCharging && this.target) {
            const chargeRatio = this.chargeTime / this.maxCharge;
            const ready = this.chargeTime >= this.chargeThreshold;
            const readyRatio = ready ? (this.chargeTime - this.chargeThreshold) / (this.maxCharge - this.chargeThreshold) : 0;

            const cx = this.target.x;
            const cy = this.target.y;
            const radius = 30;

            // Background ring
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            // Charge arc
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (Math.PI * 2 * chargeRatio);
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, startAngle, endAngle);
            this.ctx.strokeStyle = ready ? '#ff4444' : '#ffaa00';
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            // Flash when ready (2-4hz)
            if (ready) {
                const flashFreq = 3;  // hz
                const flash = Math.sin(Date.now() / 1000 * Math.PI * 2 * flashFreq) > 0;
                if (flash) {
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
                    this.ctx.strokeStyle = 'rgba(255, 68, 68, 0.8)';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }

                // Pulse (1-2hz) - intensity scales with readyRatio
                const pulseFreq = 1.5;
                const pulse = (Math.sin(Date.now() / 1000 * Math.PI * 2 * pulseFreq) + 1) / 2;
                const pulseIntensity = pulse * readyRatio * 0.4;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255, 68, 68, ${pulseIntensity})`;
                this.ctx.fill();
            }
        }

        // Hit flash - white overlay
        const flashIntensity = HitFlash.getIntensity() * this.config.hitFlash;
        if (flashIntensity > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity * 0.6})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        const hpOverlay = LowHPOverlay.getIntensity() * this.config.lowHPOverlay;
        if (hpOverlay > 0) {
            const gradient = this.ctx.createRadialGradient(
                DepthOfField.eyeX, DepthOfField.eyeY, 0,
                DepthOfField.eyeX, DepthOfField.eyeY, Math.max(this.canvas.width, this.canvas.height) * 0.7
            );
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(1, `rgba(255, 0, 0, ${hpOverlay})`);
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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

        get effects() { return Combat.frameEffects; },
        get speed() { return 400 * (this.effects.tearRate || 1); },
        get duration() { return this.distance / this.speed; },
        get progress() { return Math.min(1, this.elapsed / this.duration); },
        get done() { return this.progress >= 1; },

        get color() {
            if (this.effects.demonic) return '#ff4444';
            if (this.effects.bloody) return '#aa0000';
            return '#88ccff';
        },

        get position() {
            const t = this.progress;
            return {
                x: this.start.x + (this.end.x - this.start.x) * t,
                y: this.start.y + (this.end.y - this.start.y) * t,
            };
        },

        get size() {
            const base = this.effects.giant ? 16 : 8;
            const arc = Math.sin(this.progress * Math.PI);
            return base * (1 + arc * 0.5);
        },

        get damage() {
            let d = 1;
            if (this.effects.giant) d *= 2;
            if (this.effects.demonic) d *= 1.5;
            return d;
        },

        get piercing() { return this.effects.piercing || false; },
        get homing() { return this.effects.homing || false; },
        get bouncing() { return this.effects.bouncing || false; },
    };
};

const Enemy = (appId, headerImage, x, y) => ({
    appId,
    headerImage,
    x,
    y,
    width: 230,
    height: 107,
    speed: 50,
    health: 2,
    knockbackX: 0,
    knockbackY: 0,
    get target() { return Combat.getPupilPosition(); },

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

    get dead() { return this.health <= 0; },

    get reachedEye() {
        const pupil = this.target;
        const dist = Math.sqrt((this.x - pupil.x) ** 2 + (this.y - pupil.y) ** 2);
        return dist < 50;
    },
});

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, a, select, .modal, .options-modal, #eye')) return;
    if (!Eye.awake || Eye.dead) return;
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