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

const LowHPOverlay = {
    currentHP: 6,
    maxHP: 6,
    pulse: 0,  // 0 to 2π, loops

    update(dt) {
        // Pulse speed increases as HP drops
        const hpRatio = this.currentHP / this.maxHP;
        if (hpRatio > 0.5 || this.currentHP == 0) {
            this.pulse = 0;
            return;
        }

        // 0.5 = slow throb, 0.16 (1hp/6) = frantic
        const speed = (1 - hpRatio * 2) * 8;  // 0-8 rads/sec
        this.pulse += speed * dt;
    },

    setHP(current, max) {
        this.currentHP = current;
        this.maxHP = max;
    },

    // Returns 0-1 for red vignette alpha
    getIntensity() {
        if (this.currentHP / this.maxHP > 0.5 || this.currentHP == 0) return 0;
        const base = 1 - (this.currentHP / this.maxHP * 2);  // 0-1
        const pulse = (Math.sin(this.pulse) + 1) / 2;  // 0-1
        return base * 0.3 + pulse * 0.2;  // subtle base + pulse
    }
}