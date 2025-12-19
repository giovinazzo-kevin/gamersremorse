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