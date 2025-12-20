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

    // Beam charge state (R-TYPE style: hold at each tier before next unlocks)
    completedTier: 0,      // tier you GET if you release now
    tierProgress: 0,       // 0-1 progress toward next tier
    holdTime: 0,           // time spent at completed tier
    baseHoldTime: 1.2,     // base seconds to hold before next tier unlocks
    holdTimePerTier: 0.4,  // additional hold time per tier
    beams: [],
    isCharging: false,
    beamLevel: 0,          // max tier (from brimstone stacks)
    
    // Flash rate scales with tier (hz)
    getFlashRate(tier) {
        return 2 + tier * 0.8;  // 2.8hz, 3.6hz, 4.4hz, etc.
    },
    
    // Hold threshold scales with tier
    getHoldThreshold(tier) {
        return this.baseHoldTime + tier * this.holdTimePerTier;
    },

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
        carnage: 1,
        powerScaling: 1,
        damageNumbers: true,
        damageNumberSize: 1,
    },

    init() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'combat-canvas';
        this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1001;';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loadConfig();
        this.frameEffects = Items.getMergedEffects();
        Atmosphere.init();
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

    getEyeCenter() {
        const svg = document.getElementById('eye');
        if (!svg) return { x: 0, y: 0 };

        const rect = svg.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
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
        // Start charging if we have brimstone (level > 0)
        const beamLevel = this.frameEffects.laserCharge || 0;
        if (beamLevel > 0) {
            this.isCharging = true;
            this.completedTier = 0;
            this.tierProgress = 0;
            this.holdTime = 0;
            this.beamLevel = beamLevel;
            BeamCharge.start(beamLevel);
            setExpression('charging');
        }
    },

    stopFiring() {
        // Fire beam if at least tier 1 completed
        if (this.isCharging && this.completedTier > 0 && this.target) {
            const tier = this.completedTier;
            const target = { x: this.target.x, y: this.target.y };  // Copy target
            
            // PEW sequence -> callback fires beam
            BeamCharge.stop(true, tier, () => {
                this.fireBeam(target.x, target.y, tier);
            });
            // Don't reset expression yet - ignition sequence playing
        } else if (this.isCharging) {
            BeamCharge.stop(false);  // cancelled
            setExpression('neutral');
        }
        this.holding = false;
        this.isCharging = false;
        this.completedTier = 0;
        this.tierProgress = 0;
        this.holdTime = 0;
    },

    get chargePercent() {
        // For beam power scaling: completed tiers + partial progress
        if (!this.isCharging) return 0;
        return this.completedTier / this.beamLevel;
    },

    get chargeReady() {
        return this.completedTier > 0;
    },

    fireBeam(targetX, targetY, tier) {
        const start = this.getPupilPosition();
        const dx = targetX - start.x;
        const dy = targetY - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Scale beam properties by tier
        // Duration: +25% per tier (base from item, default 0.5s)
        const baseDuration = this.frameEffects.laserDuration || 0.5;
        const duration = baseDuration * Math.pow(1.25, tier - 1);
        // Damage: +50% per tier (base 3)
        const damage = 3 * Math.pow(1.5, tier - 1);
        // Width: from item (default 25px), doubles at tier 5 (capped)
        const baseWidth = this.frameEffects.laserWidth || 25;
        const widthMultiplier = 1 + Math.min(1, (tier - 1) / 4);  // 1 at tier 1, 2 at tier 5
        const width = baseWidth * widthMultiplier;
        // Hue: keep red, will use filter for saturation/contrast
        
        const length = Math.max(window.innerWidth, window.innerHeight) * 1.5;

        this.beams.push({
            startX: start.x,
            startY: start.y,
            dirX,
            dirY,
            width,
            damage,  // DPS
            length,
            elapsed: 0,
            duration,
            tier,
            tickAccum: new Map(),  // enemy -> time since last damage tick
        });

        Eye.blink();
        // Sound handled by BeamCharge (PEW -> BWAAAH sequence)
        const sustainId = BeamSustain.start(tier);  // WHIRR while beam active, pitch by tier
        
        // Store sustain ID on the beam for cleanup
        this.beams[this.beams.length - 1].sustainId = sustainId;
        
        // Lock gaze while firing
        setExpression('firing');
        
        // Track beam DPS for power system
        // (actual damage tracked per-tick in update)
        
        // Initial screen shake
        ScreenShake.shake(20 + tier * 15);
        
        // White flash on release
        HitFlash.trigger(tier * 3);
        
        // Schedule periodic shakes during beam (2 per second)
        const shakeInterval = 500;  // ms
        const numShakes = Math.floor(duration * 1000 / shakeInterval);
        for (let i = 1; i <= numShakes; i++) {
            setTimeout(() => {
                ScreenShake.shake(10 + tier * 5);
            }, i * shakeInterval);
        }

        // Achievement
        if (!getAchievementFlag('firedBeam')) {
            setAchievementFlag('firedBeam');
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
        
        // Update atmosphere (carnage/power decay, page filter)
        Atmosphere.update(dt);
        
        // Update particles
        Particles.update(dt);

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
                // R-TYPE charge: fill tier, hold, then next tier unlocks
                const tierFillTime = this.frameEffects.laserFillTime || 1.0;
                
                if (this.completedTier >= this.beamLevel) {
                    // Max tier reached, just hold
                    this.holdTime += dt;
                } else if (this.tierProgress < 1) {
                    // Filling current tier
                    this.tierProgress += dt / tierFillTime;
                    if (this.tierProgress >= 1) {
                        this.tierProgress = 1;
                        this.completedTier++;
                        this.holdTime = 0;
                    }
                } else {
                    // Tier complete, holding before next unlocks
                    this.holdTime += dt;
                    const threshold = this.getHoldThreshold(this.completedTier);
                    if (this.holdTime >= threshold && this.completedTier < this.beamLevel) {
                        // Unlock next tier
                        this.tierProgress = 0;
                        this.holdTime = 0;
                    }
                }
                
                // Update charge sound with phase info
                const isHolding = this.tierProgress >= 1 || this.completedTier >= this.beamLevel;
                const flashRate = this.getFlashRate(this.completedTier);
                BeamCharge.update({
                    completedTier: this.completedTier,
                    tierProgress: this.tierProgress,
                    isHolding: isHolding,
                    flashRate: flashRate,
                    maxTier: this.beamLevel
                });
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
        const hadBeams = this.beams.length > 0;
        for (const b of this.beams) {
            b.elapsed += dt;
            
            // Damage tick: high frequency, low damage per tick
            const tickRate = 20;  // hits per second
            const tickInterval = 1 / tickRate;
            const damagePerTick = b.damage / tickRate;
            
            for (const e of this.enemies) {
                if (this.beamHitsEnemy({ x: b.startX, y: b.startY }, b.dirX, b.dirY, b.length, b.width, e)) {
                    const accum = (b.tickAccum.get(e) || 0) + dt;
                    
                    if (accum >= tickInterval) {
                        const ticks = Math.floor(accum / tickInterval);
                        e.health -= damagePerTick * ticks;
                        b.tickAccum.set(e, accum - ticks * tickInterval);
                        
                        // Track damage for power system
                        Atmosphere.addDamage(damagePerTick * ticks);
                        
                        // Damage number
                        if (this.config.damageNumbers !== false) {
                            const style = getComputedStyle(document.documentElement);
                            const color = style.getPropertyValue('--color-negative').trim() || '#c80064';
                            spawnDamageNumber(e.x, e.y - e.height / 2, Math.round(damagePerTick * ticks * 10) / 10, color);
                        }
                        
                        // Light feedback per tick
                        HitFlash.trigger(damagePerTick * 0.5);
                        sfx.pow();
                        
                        // Continuous knockback push
                        e.knockbackVX = b.dirX * 80;
                        e.knockbackVY = b.dirY * 80;
                        
                        if (e.dead) {
                            Atmosphere.spikeCarnage(0.25);
                            ScreenShake.shake(b.damage * 10);
                            this.hitstop(4);
                        }
                    } else {
                        b.tickAccum.set(e, accum);
                    }
                } else {
                    // Enemy left beam, reset accumulator
                    b.tickAccum.delete(e);
                }
            }
        }
        // Stop sustain sounds for expired beams
        for (const b of this.beams) {
            if (b.elapsed >= b.duration && b.sustainId !== undefined) {
                BeamSustain.stop(b.sustainId);
                b.sustainId = undefined;  // Don't stop twice
            }
        }
        this.beams = this.beams.filter(b => b.elapsed < b.duration);
        
        // Reset expression when all beams finish
        if (hadBeams && this.beams.length === 0) {
            setExpression('neutral');
        }

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
                        // Track damage for power system
                        Atmosphere.addDamage(t.damage);
                        
                        // Damage number
                        if (this.config.damageNumbers !== false) {
                            const style = getComputedStyle(document.documentElement);
                            const color = style.getPropertyValue('--color-positive').trim() || '#54bebe';
                            spawnDamageNumber(pos.x, pos.y, t.damage, color);
                        }
                        
                        ScreenShake.shake(t.damage * 4 * Atmosphere.getShakeMultiplier());
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
                            Atmosphere.spikeCarnage(0.3);
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
            // Update beam origin to current iris position
            const currentStart = this.getPupilPosition();
            b.startX = currentStart.x;
            b.startY = currentStart.y;
            
            const progress = b.elapsed / b.duration;
            const alpha = 1 - progress * 0.5;  // fade slightly
            const baseWidth = b.width * (1 + progress * 0.3);  // expand over lifetime
            const tier = b.tier || 1;
            const time = Date.now() / 1000;
            
            // Spread: beam widens along its length (cone factor)
            const spreadRate = 0.15 + tier * 0.05;  // how much it spreads per 100px
            
            // Dancing frequencies for each layer (different speeds)
            const outerDance = Math.sin(time * 8) * 0.05;
            const midDance = Math.sin(time * 12 + 1);  // -1 to 1 for wobble range
            const coreDance = Math.sin(time * 18 + 2) * 0.1;
            
            // Mid ratio wobbles between 0.25 and 0.75 of outer beam
            const midRatio = 0.5 + midDance * 0.25;  // 0.25 to 0.75
            const outerRatio = 1 + outerDance;
            
            // Get actual iris diameter from eye state
            const eyeSvg = document.getElementById('eye');
            const baseIrisRadius = state.irisRadius;
            const dilationBonus = state.dilation * 0.08;
            const actualIrisRadius = baseIrisRadius + dilationBonus + state.attention * state.irisDilation;
            const irisDiameter = eyeSvg ? actualIrisRadius * eyeSvg.clientHeight * 2 * 0.60 : 60;
            
            // Perpendicular vector for offset effects
            const perpX = -b.dirY;
            const perpY = b.dirX;
            
            // Draw beam as segments to allow width variation along length
            // OUTER BEAM: Segments scroll BACKWARD (aftershock rings)
            // INNER BEAM: Fixed width = iris diameter (energy channel)
            const segments = 25;
            const segmentLength = b.length / segments;
            const scrollSpeed = 400;  // pixels per second backward
            const scrollPhase = (time * scrollSpeed / segmentLength) % 1;
            
            const coneLength = segmentLength * 1.5;  // cone zone before cylindrical beam
            const fullBeamWidth = baseWidth * outerRatio;
            const coneStartWidth = irisDiameter / 0.60 * 0.85;  // cone starts at 85% of actual iris
            
            // Shared variables for cone/cylinder loops
            const coneSegments = 8;
            const coneScrollPhase = (time * scrollSpeed / coneLength) % 1;
            const innerWidthMult = 1 + (tier - 1) * 0.25;  // 1x at tier 1, 2x at tier 5
            const innerWidth = irisDiameter * innerWidthMult * (1 + coreDance * 0.1);
            
            // Use additive blending for laser effect
            this.ctx.globalCompositeOperation = 'lighter';
            
            // === LAYER 1: INNER WHITE (scrolling wave, center core) ===
            const waveSpeed = 800;  // px/s forward
            const waveLength = 80;  // px per cycle
            const wavePhase = time * waveSpeed;
            const stepSize = 8;  // px per segment
            
            for (let d = 0; d < b.length; d += stepSize) {
                const wave = (d - wavePhase) / waveLength * Math.PI * 2;
                const alphaMod = Math.sin(wave);
                const colorMod = Math.cos(wave);
                
                const segAlpha = alpha * (0.7 + alphaMod * 0.3) * 0.5;
                
                const r = 255;
                const g = Math.floor(230 + colorMod * 25);
                const b_ = Math.floor(200 + colorMod * 55);
                
                const x0 = b.startX + b.dirX * d;
                const y0 = b.startY + b.dirY * d;
                const x1 = b.startX + b.dirX * Math.min(d + stepSize, b.length);
                const y1 = b.startY + b.dirY * Math.min(d + stepSize, b.length);
                
                this.ctx.beginPath();
                this.ctx.moveTo(x0, y0);
                this.ctx.lineTo(x1, y1);
                this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b_}, ${segAlpha})`;
                this.ctx.lineWidth = innerWidth;
                this.ctx.lineCap = 'round';
                this.ctx.stroke();
            }
            
            // === LAYER 2: MIDDLE ORANGE (cone + cylinder) ===
            // Cone middle
            for (let i = -1; i <= coneSegments; i++) {
                const scrolledI = i - coneScrollPhase;
                const t0 = scrolledI / coneSegments;
                const t1 = (scrolledI + 1) / coneSegments;
                
                if (t1 < 0 || t0 > 1) continue;
                
                const clampedT0 = Math.max(0, t0);
                const clampedT1 = Math.min(1, t1);
                if (clampedT1 - clampedT0 < 0.01) continue;
                
                const dist0 = clampedT0 * coneLength;
                const dist1 = clampedT1 * coneLength;
                
                const width0 = coneStartWidth + (fullBeamWidth - coneStartWidth) * clampedT0;
                const width1 = coneStartWidth + (fullBeamWidth - coneStartWidth) * clampedT1;
                const avgWidth = (width0 + width1) / 2 * (1 + outerDance);
                
                const x0 = b.startX + b.dirX * dist0;
                const y0 = b.startY + b.dirY * dist0;
                const x1 = b.startX + b.dirX * dist1;
                const y1 = b.startY + b.dirY * dist1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x0, y0);
                this.ctx.lineTo(x1, y1);
                this.ctx.strokeStyle = `rgba(255, 150, 50, ${alpha * 0.5})`;
                this.ctx.lineWidth = avgWidth * midRatio;
                this.ctx.stroke();
            }
            
            // Cylinder middle
            for (let i = 0; i < segments; i++) {
                const scrolledI = i - scrollPhase;
                const t0 = scrolledI / segments;
                const t1 = (scrolledI + 1) / segments;
                
                const dist0 = coneLength + t0 * (b.length - coneLength);
                const dist1 = coneLength + t1 * (b.length - coneLength);
                
                if (dist1 < coneLength || dist0 > b.length) continue;
                
                const clampedDist0 = Math.max(coneLength, dist0);
                const clampedDist1 = Math.min(b.length, dist1);
                if (clampedDist1 - clampedDist0 < 1) continue;
                
                const beamWidth0 = fullBeamWidth * (1 + clampedDist0 * spreadRate / 1000);
                const beamWidth1 = fullBeamWidth * (1 + clampedDist1 * spreadRate / 1000);
                const avgWidth = (beamWidth0 + beamWidth1) / 2 * (1 + outerDance);
                
                const x0 = b.startX + b.dirX * clampedDist0;
                const y0 = b.startY + b.dirY * clampedDist0;
                const x1 = b.startX + b.dirX * clampedDist1;
                const y1 = b.startY + b.dirY * clampedDist1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x0, y0);
                this.ctx.lineTo(x1, y1);
                this.ctx.strokeStyle = `rgba(255, 150, 50, ${alpha * 0.5})`;
                this.ctx.lineWidth = avgWidth * midRatio;
                this.ctx.stroke();
            }
            
            // === LAYER 3: PULSES ===
            const pulseCount = 4 + tier * 2;
            const pulseSpeed = 1400;  // pixels per second
            for (let p = 0; p < pulseCount; p++) {
                const pulseOffset = (p / pulseCount);
                const pulsePos = ((time * pulseSpeed / b.length + pulseOffset) % 1);
                const pulseDist = pulsePos * b.length;
                
                const pulseX = b.startX + b.dirX * pulseDist;
                const pulseY = b.startY + b.dirY * pulseDist;
                
                const pulseWidth = baseWidth * 0.3 * (1 + Math.sin(time * 25 + p) * 0.2);
                const pulseAlpha = alpha * 0.9 * (1 - pulsePos * 0.3);
                
                const gradient = this.ctx.createRadialGradient(
                    pulseX, pulseY, 0,
                    pulseX, pulseY, pulseWidth
                );
                gradient.addColorStop(0, `rgba(255, 255, 255, ${pulseAlpha})`);
                gradient.addColorStop(0.6, `rgba(255, 230, 180, ${pulseAlpha * 0.6})`);
                gradient.addColorStop(1, `rgba(255, 200, 100, 0)`);
                
                this.ctx.beginPath();
                this.ctx.arc(pulseX, pulseY, pulseWidth, 0, Math.PI * 2);
                this.ctx.fillStyle = gradient;
                this.ctx.fill();
            }
            
            // Width falloff: sharp drop in last 25% of beam duration
            const timeProgress = b.elapsed / b.duration;  // 0 to 1 over lifetime
            const falloffStart = 0.75;
            let widthFalloff = 1;
            if (timeProgress > falloffStart) {
                const falloffT = (timeProgress - falloffStart) / (1 - falloffStart);  // 0 to 1 in falloff zone
                widthFalloff = 1 - falloffT * falloffT;  // quadratic dropoff
            }
            
            // === LAYER 4: OUTER RED (cone + cylinder, drawn last = on top) ===
            // Cone outer
            for (let i = -1; i <= coneSegments; i++) {
                const scrolledI = i - coneScrollPhase;
                const t0 = scrolledI / coneSegments;
                const t1 = (scrolledI + 1) / coneSegments;
                
                if (t1 < 0 || t0 > 1) continue;
                
                const clampedT0 = Math.max(0, t0);
                const clampedT1 = Math.min(1, t1);
                if (clampedT1 - clampedT0 < 0.01) continue;
                
                const dist0 = clampedT0 * coneLength;
                const dist1 = clampedT1 * coneLength;
                
                const width0 = coneStartWidth + (fullBeamWidth - coneStartWidth) * clampedT0;
                const width1 = coneStartWidth + (fullBeamWidth - coneStartWidth) * clampedT1;
                // Apply falloff to cone width
                const falloffWidth0 = innerWidth + (width0 - innerWidth) * widthFalloff;
                const falloffWidth1 = innerWidth + (width1 - innerWidth) * widthFalloff;
                const avgWidth = (falloffWidth0 + falloffWidth1) / 2 * (1 + outerDance);
                
                const x0 = b.startX + b.dirX * dist0;
                const y0 = b.startY + b.dirY * dist0;
                const x1 = b.startX + b.dirX * dist1;
                const y1 = b.startY + b.dirY * dist1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x0, y0);
                this.ctx.lineTo(x1, y1);
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha * 0.5})`;
                this.ctx.lineWidth = avgWidth;
                this.ctx.lineCap = 'round';
                this.ctx.stroke();
            }
            
            // Cylinder outer
            for (let i = 0; i < segments; i++) {
                const scrolledI = i - scrollPhase;
                const t0 = scrolledI / segments;
                const t1 = (scrolledI + 1) / segments;
                
                const dist0 = coneLength + t0 * (b.length - coneLength);
                const dist1 = coneLength + t1 * (b.length - coneLength);
                
                if (dist1 < coneLength || dist0 > b.length) continue;
                
                const clampedDist0 = Math.max(coneLength, dist0);
                const clampedDist1 = Math.min(b.length, dist1);
                if (clampedDist1 - clampedDist0 < 1) continue;
                
                const baseBeamWidth = fullBeamWidth * (1 + clampedDist0 * spreadRate / 1000);
                const targetWidth = innerWidth;  // fall off toward inner beam width
                const beamWidth0 = targetWidth + (baseBeamWidth - targetWidth) * widthFalloff;
                const beamWidth1 = targetWidth + (baseBeamWidth - targetWidth) * widthFalloff;
                const avgWidth = (beamWidth0 + beamWidth1) / 2 * (1 + outerDance);
                
                const x0 = b.startX + b.dirX * clampedDist0;
                const y0 = b.startY + b.dirY * clampedDist0;
                const x1 = b.startX + b.dirX * clampedDist1;
                const y1 = b.startY + b.dirY * clampedDist1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x0, y0);
                this.ctx.lineTo(x1, y1);
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha * 0.5})`;
                this.ctx.lineWidth = avgWidth;
                this.ctx.lineCap = 'round';
                this.ctx.stroke();
            }
            
            // Reset blend mode
            this.ctx.globalCompositeOperation = 'source-over';
        }

        // Charge circle on cursor (R-TYPE style: two circles)
        if (this.isCharging && this.target) {
            const cx = this.target.x;
            const cy = this.target.y;
            const radius = 30;
            
            // Tier colors: black → orange → red → magenta → purple → white
            const tierColors = ['#333333', '#ff8800', '#ff2200', '#ff00aa', '#aa00ff', '#ffffff'];
            const getTierColor = (tier) => tierColors[Math.min(tier, tierColors.length - 1)];
            
            const completedTier = this.completedTier;
            const tierProgress = this.tierProgress;
            const isHolding = tierProgress >= 1 || completedTier >= this.beamLevel;
            const nextTier = Math.min(completedTier + 1, this.beamLevel);
            
            // Background circle: completed tier color (full circle)
            const bgColor = getTierColor(completedTier);
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = bgColor;
            this.ctx.lineWidth = 4;
            this.ctx.stroke();
            
            // Foreground circle: next tier color (filling arc)
            if (completedTier < this.beamLevel && tierProgress > 0 && tierProgress < 1) {
                const fgColor = getTierColor(nextTier);
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + (Math.PI * 2 * tierProgress);
                
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius, startAngle, endAngle);
                this.ctx.strokeStyle = fgColor;
                this.ctx.lineWidth = 4;
                this.ctx.stroke();
            }
            
            // Flash when tier is complete and holding
            if (completedTier > 0) {
                const flashFreq = this.getFlashRate(completedTier);
                const flash = Math.sin(Date.now() / 1000 * Math.PI * 2 * flashFreq) > 0;
                
                // Pulse intensity scales with tier
                const pulseFreq = 1 + completedTier * 0.3;
                const pulse = (Math.sin(Date.now() / 1000 * Math.PI * 2 * pulseFreq) + 1) / 2;
                const pulseIntensity = 0.1 + pulse * 0.2 * completedTier;
                
                // Flash ring
                if (isHolding && flash) {
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
                
                // Pulse fill
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
                this.ctx.fill();
            }
            
            // Level indicator in center (shows completed tier)
            if (completedTier > 0) {
                this.ctx.font = 'bold 16px monospace';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(completedTier.toString(), cx, cy);
            }
        }

        // Particles
        Particles.render(this.ctx);
        
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