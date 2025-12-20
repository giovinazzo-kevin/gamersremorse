const ScreenShake = {
    intensity: 0,
    decay: 0.9,
    multiplier: 1,

    shake(amount = 10) {
        this.intensity = Math.max(this.intensity, amount * this.multiplier);

        if (this.multiplier >= 100) {
            setAchievementFlag('maxScreenShake');
        }
    },

    update(dt) {
        if (this.intensity < 0.5) {
            this.intensity = 0;
            document.body.style.transform = '';
            document.body.style.overflow = '';
            return;
        }

        const x = (Math.random() - 0.5) * this.intensity;
        const y = (Math.random() - 0.5) * this.intensity;
        document.body.style.transform = `translate(${x}px, ${y}px)`;
        document.body.style.overflow = 'hidden';
        this.intensity *= this.decay;
    }
}

const DepthOfField = {
    overlay: null,
    intensity: 0,
    clearRadius: 0,
    blurRadius: 0,
    eyeX: 0,
    eyeY: 0,

    init() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'dof-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 998;
        `;
        document.body.appendChild(this.overlay);

        window.addEventListener('resize', () => this.update());
    },

    update() {
        if (this.intensity === 0) {
            this.overlay.style.backdropFilter = 'none';
            this.overlay.style.webkitBackdropFilter = 'none';
            this.clearRadius = Infinity;
            this.blurRadius = Infinity;
            return;
        }

        const svg = document.getElementById('eye');
        if (!svg) return;

        const rect = svg.getBoundingClientRect();
        this.eyeX = rect.left + rect.width / 2;
        this.eyeY = rect.top + rect.height / 2;

        const maxRadius = Math.max(window.innerWidth, window.innerHeight);
        this.clearRadius = maxRadius * (1 - this.intensity * 0.7);
        this.blurRadius = this.clearRadius + maxRadius * 0.3;

        const blur = this.intensity * 12;

        this.overlay.style.backdropFilter = `blur(${blur}px)`;
        this.overlay.style.webkitBackdropFilter = `blur(${blur}px)`;
        this.overlay.style.maskImage = `radial-gradient(circle at ${this.eyeX}px ${this.eyeY}px, 
            transparent 0%, 
            transparent ${this.clearRadius}px, 
            black ${this.blurRadius}px)`;
        this.overlay.style.webkitMaskImage = this.overlay.style.maskImage;
    },

    getBlur(x, y) {
        if (this.intensity === 0) return 0;

        const dist = Math.sqrt((x - this.eyeX) ** 2 + (y - this.eyeY) ** 2);

        if (dist < this.clearRadius) return 0;
        if (dist < this.blurRadius) {
            const t = (dist - this.clearRadius) / (this.blurRadius - this.clearRadius);
            const smooth = t * t * (3 - 2 * t);
            return smooth * this.intensity * 12;
        }
        return this.intensity * 12;
    },

    setIntensity(val) {
        this.intensity = val;
        this.update();
    }
};

const HitFlash = {
    intensity: 0,
    decay: 0.7,  // fast fade

    trigger(amount = 1) {
        this.intensity = Math.min(1, this.intensity + amount);
    },

    update(dt) {
        if (this.intensity < 0.01) {
            this.intensity = 0;
            return;
        }
        this.intensity *= this.decay;
    },

    // Returns 0-1 for canvas overlay alpha
    getIntensity() {
        return this.intensity;
    }
}

const Atmosphere = {
    carnage: 0,           // 0-1, spikes on kills, decays
    carnageDecay: 0.4,    // per second (~2.5 sec to fully decay)
    
    // Power: rolling DPS window
    damageHistory: [],    // [{time, amount}, ...]
    POWER_WINDOW: 1.0,    // 1 second rolling window
    
    // Page elements to desaturate (cached on init)
    pageWrapper: null,
    
    init() {
        // Create wrapper for page content that gets desaturated
        // Combat canvas is z-index 1001, outside this filter
        this.pageWrapper = document.getElementById('main-content') || document.body;
        
        // Create SVG filter for red-preserving desaturation
        this.createCarnageFilter();
    },
    
    createCarnageFilter() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
        svg.innerHTML = `
            <defs>
                <filter id="carnage-filter" color-interpolation-filters="sRGB">
                    <!-- Pass 1: Greyscale version -->
                    <feColorMatrix type="saturate" in="SourceGraphic" values="0" result="grey"/>
                    
                    <!-- Pass 2: Red dominance -> alpha channel -->
                    <feColorMatrix type="matrix" in="SourceGraphic" result="redMask"
                        values="0 0 0 0 0
                                0 0 0 0 0
                                0 0 0 0 0
                                2 -1 -1 0 0"/>
                    
                    <!-- Pass 3: Use red mask alpha to blend original over grey -->
                    <feComposite in="SourceGraphic" in2="redMask" operator="in" result="redParts"/>
                    <feComposite in="redParts" in2="grey" operator="over" result="carnageResult"/>
                    
                    <!-- Pass 4: Blend between original and carnage result -->
                    <feComposite id="carnage-mix" in="carnageResult" in2="SourceGraphic" operator="arithmetic"
                        k1="0" k2="1" k3="0" k4="0"/>
                </filter>
            </defs>
        `;
        document.body.appendChild(svg);
        this.filterSvg = svg;
        this.carnageMix = document.getElementById('carnage-mix');
    },
    
    spikeCarnage(amount = 0.3) {
        this.carnage = Math.min(1, this.carnage + amount);
    },
    
    addDamage(amount) {
        this.damageHistory.push({
            time: performance.now() / 1000,
            amount
        });
    },
    
    getDPS() {
        const now = performance.now() / 1000;
        this.damageHistory = this.damageHistory.filter(d => now - d.time < this.POWER_WINDOW);
        return this.damageHistory.reduce((sum, d) => sum + d.amount, 0) / this.POWER_WINDOW;
    },
    
    update(dt) {
        // Decay carnage
        if (this.carnage > 0) {
            this.carnage = Math.max(0, this.carnage - this.carnageDecay * dt);
        }
        
        // Apply page desaturation
        this.updatePageFilter();
    },
    
    updatePageFilter() {
        if (!this.pageWrapper) return;
        
        const c = this.carnage;
        
        if (c > 0.01) {
            // Update SVG filter blend
            // Color stays full desat until carnage drops below threshold, then snaps back
            const colorBlend = c > 0.15 ? 1 : c / 0.15;  // full grey until last 15%, then fade
            if (this.carnageMix) {
                this.carnageMix.setAttribute('k2', colorBlend);
                this.carnageMix.setAttribute('k3', 1 - colorBlend);
            }
            // Contrast fades normally
            this.pageWrapper.style.filter = `url(#carnage-filter) contrast(${1 + c * 0.5})`;
        } else {
            this.pageWrapper.style.filter = '';
        }
    },
    
    // Removed - now inline in updatePageFilter
    // updateCarnageMatrix() { ... }
    
    // Multipliers for combat effects based on DPS
    getShakeMultiplier() {
        const dps = this.getDPS();
        if (dps < 10) return 1;
        return 1 + Math.log10(dps);  // DPS 10 = 2x, DPS 100 = 3x, DPS 1000 = 4x
    },
    
    getParticleMultiplier() {
        const dps = this.getDPS();
        if (dps < 10) return 1;
        return 1 + Math.log10(dps) * 0.5;  // DPS 10 = 1.5x, DPS 100 = 2x, DPS 1000 = 2.5x
    },
};

const LowHPOverlay = {
    currentHP: 6,
    maxHP: 6,
    pulse: 0,  // 0 to 2π, loops
    
    // Sync to low_hp pattern: bpm 100, speed 6, 4 rows = 600ms loop
    // 2π / 0.6s ≈ 10.47 rad/s
    pulseSpeed: (2 * Math.PI) / 0.6,

    update(dt) {
        const hpRatio = this.currentHP / this.maxHP;
        if (hpRatio > LOW_HP_THRESHOLD || this.currentHP == 0) {
            this.pulse = 0;
            return;
        }
        
        this.pulse += this.pulseSpeed * dt;
    },

    setHP(current, max) {
        this.currentHP = current;
        this.maxHP = max;
    },

    // Returns 0-1 for red vignette alpha
    getIntensity() {
        const hpRatio = this.currentHP / this.maxHP;
        if (hpRatio > LOW_HP_THRESHOLD || this.currentHP == 0) return 0;
        const normalizedRatio = hpRatio / LOW_HP_THRESHOLD; // 1 at threshold, 0 at 0hp
        const base = 1 - normalizedRatio;  // 0 at threshold, 1 at 0hp
        const pulse = (Math.sin(this.pulse) + 1) / 2;  // 0-1
        return base * 0.3 + pulse * 0.2;  // subtle base + pulse
    }
}

// Export to global scope
window.Atmosphere = Atmosphere;