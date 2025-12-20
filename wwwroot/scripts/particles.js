/* Particle System
 * 
 * Struct-of-arrays for efficiency. Each index is one particle.
 * Type behaviors defined in ParticleTypes dict.
 */

const Particles = {
    // Core arrays - every particle has these
    x: [],
    y: [],
    vx: [],
    vy: [],
    elapsed: [],
    lifetime: [],
    type: [],
    
    // Type-specific payload (text for damage, color for blood, etc)
    data: [],
    
    // Type definitions
    types: {},
    
    spawn(type, x, y, vx, vy, lifetime, data = null) {
        this.x.push(x);
        this.y.push(y);
        this.vx.push(vx);
        this.vy.push(vy);
        this.elapsed.push(0);
        this.lifetime.push(lifetime);
        this.type.push(type);
        this.data.push(data);
    },
    
    update(dt) {
        for (let i = this.x.length - 1; i >= 0; i--) {
            this.elapsed[i] += dt;
            
            if (this.elapsed[i] >= this.lifetime[i]) {
                this.remove(i);
                continue;
            }
            
            // Type-specific update
            const typeDef = this.types[this.type[i]];
            if (typeDef?.update) {
                typeDef.update(this, i, dt);
            } else {
                // Default: just apply velocity
                this.x[i] += this.vx[i] * dt;
                this.y[i] += this.vy[i] * dt;
            }
        }
    },
    
    remove(i) {
        const last = this.x.length - 1;
        if (i !== last) {
            this.x[i] = this.x[last];
            this.y[i] = this.y[last];
            this.vx[i] = this.vx[last];
            this.vy[i] = this.vy[last];
            this.elapsed[i] = this.elapsed[last];
            this.lifetime[i] = this.lifetime[last];
            this.type[i] = this.type[last];
            this.data[i] = this.data[last];
        }
        this.x.pop();
        this.y.pop();
        this.vx.pop();
        this.vy.pop();
        this.elapsed.pop();
        this.lifetime.pop();
        this.type.pop();
        this.data.pop();
    },
    
    render(ctx) {
        for (let i = 0; i < this.x.length; i++) {
            const typeDef = this.types[this.type[i]];
            if (typeDef?.render) {
                const progress = this.elapsed[i] / this.lifetime[i];
                typeDef.render(ctx, this.x[i], this.y[i], progress, this.data[i]);
            }
        }
    },
    
    clear() {
        this.x.length = 0;
        this.y.length = 0;
        this.vx.length = 0;
        this.vy.length = 0;
        this.elapsed.length = 0;
        this.lifetime.length = 0;
        this.type.length = 0;
        this.data.length = 0;
    },
    
    get count() {
        return this.x.length;
    }
};

// === Type Definitions ===

Particles.types.damage = {
    update(p, i, dt) {
        // Float up, decelerate
        p.x[i] += p.vx[i] * dt;
        p.y[i] += p.vy[i] * dt;
        p.vy[i] *= 0.95;  // slow down
        p.vx[i] *= 0.9;   // drift less over time
    },
    
    render(ctx, x, y, progress, data) {
        const alpha = 1 - progress;
        const scale = 1 + progress * 0.3;  // grow slightly as fading
        
        const value = data.value;
        const color = data.color || '#ffffff';
        const size = Math.max(14, 12 + value * 2);  // bigger numbers = bigger font
        
        ctx.save();
        ctx.font = `bold ${size * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Shadow/outline for readability
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
        ctx.fillText(value, x + 1, y + 1);
        
        // Main text
        ctx.fillStyle = color.startsWith('rgba') ? color : `rgba(${hexToRgb(color)}, ${alpha})`;
        ctx.fillText(value, x, y);
        
        ctx.restore();
    }
};

// Helper
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '255, 255, 255';
}

// === Convenience spawners ===

function spawnDamageNumber(x, y, value, color = '#ffffff') {
    const vx = (Math.random() - 0.5) * 30;  // slight random drift
    const vy = -60 - Math.random() * 20;    // float up
    const lifetime = 0.8;
    
    Particles.spawn('damage', x, y, vx, vy, lifetime, { value, color });
}

window.Particles = Particles;
window.spawnDamageNumber = spawnDamageNumber;
