// SFX - public API for game sounds
// Routes through Audio manager

// === BEAM CHARGE SOUND SYSTEM ===
const BeamCharge = (() => {
    let ctx = null;
    let osc1 = null;
    let osc2 = null;
    let gainNode = null;
    let lfoGain = null;
    let lfo = null;
    let active = false;
    let level = 1;
    
    // Frequency bands per tier
    const tierFreqs = [
        { base: 220, max: 440 },   // Tier 1: A3 -> A4
        { base: 440, max: 660 },   // Tier 2: A4 -> E5
        { base: 660, max: 880 },   // Tier 3: E5 -> A5
        { base: 880, max: 1100 },  // Tier 4: A5 -> C#6
        { base: 1100, max: 1320 }, // Tier 5: C#6 -> E6
    ];
    
    const detuneAmount = 15;  // cents of detune for wobble
    
    function start(beamLevel = 1) {
        if (active) return;
        
        level = Math.min(beamLevel, tierFreqs.length);
        
        ctx = Audio.getContext('sfx').ctx;
        if (!ctx) return;
        
        // Two oscillators slightly detuned for beating/wobble
        osc1 = ctx.createOscillator();
        osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = tierFreqs[0].base;
        osc2.frequency.value = tierFreqs[0].base;
        osc2.detune.value = detuneAmount;
        
        // LFO for vibrato - starts slow, speeds up
        lfo = ctx.createOscillator();
        lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 4;  // 4hz vibrato
        lfoGain.gain.value = 10;  // 10 cents of vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.detune);
        lfoGain.connect(osc2.detune);
        
        // Main gain
        gainNode = ctx.createGain();
        gainNode.gain.value = 0;
        
        // Connect
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Start
        osc1.start();
        osc2.start();
        lfo.start();
        
        // Fade in
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.1);
        
        active = true;
    }
    
    function update(chargePercent, ready) {
        if (!active || !ctx) return;
        
        const now = ctx.currentTime;
        
        // Scale charge across all tiers
        // chargePercent 0-1 maps across level tiers
        const scaledProgress = chargePercent * level;
        const currentTier = Math.min(Math.floor(scaledProgress), level - 1);
        const tierProgress = scaledProgress - currentTier;  // 0-1 within current tier
        
        // Get frequency range for current tier
        const tier = tierFreqs[currentTier] || tierFreqs[tierFreqs.length - 1];
        const freq = tier.base + (tier.max - tier.base) * Math.min(1, tierProgress);
        
        osc1.frequency.setTargetAtTime(freq, now, 0.05);
        osc2.frequency.setTargetAtTime(freq, now, 0.05);
        
        // Detune: wobbles during rise, locks at tier boundaries
        const atTierBoundary = tierProgress > 0.85 || tierProgress < 0.15;
        const detune = atTierBoundary ? 3 : detuneAmount * (1 - tierProgress * 0.5);
        osc2.detune.setTargetAtTime(detune, now, 0.05);
        
        // LFO rate increases within each tier, resets at boundaries
        const baseLfoRate = 4 + currentTier * 4;  // Higher tiers = faster base
        const lfoRate = baseLfoRate + tierProgress * 8;
        lfo.frequency.setTargetAtTime(lfoRate, now, 0.05);
        
        // Vibrato depth - intense during rise, calm at lock
        const vibDepth = atTierBoundary ? 5 : 15 + tierProgress * 25;
        lfoGain.gain.setTargetAtTime(vibDepth, now, 0.05);
        
        // Volume increases with tiers
        const vol = 0.06 + currentTier * 0.02 + tierProgress * 0.04;
        gainNode.gain.setTargetAtTime(Math.min(0.18, vol), now, 0.05);
    }
    
    function stop(fireBeam = false) {
        if (!active || !ctx) return;
        
        const now = ctx.currentTime;
        
        if (fireBeam) {
            // BWAAAH - pitch drops, volume spikes then cuts
            // Drop is more dramatic with higher levels
            const dropFreq = 55 - level * 10;  // Lower drop for higher levels
            osc1.frequency.setValueAtTime(osc1.frequency.value, now);
            osc1.frequency.exponentialRampToValueAtTime(Math.max(30, dropFreq), now + 0.15);
            osc2.frequency.setValueAtTime(osc2.frequency.value, now);
            osc2.frequency.exponentialRampToValueAtTime(Math.max(30, dropFreq), now + 0.15);
            
            // Volume spike scales with level
            const spikeVol = 0.15 + level * 0.05;
            gainNode.gain.setValueAtTime(Math.min(0.3, spikeVol), now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            
            // Stop after the BWAAAH
            setTimeout(() => cleanup(), 250);
        } else {
            // Cancelled - quick fade out
            gainNode.gain.setTargetAtTime(0, now, 0.05);
            setTimeout(() => cleanup(), 100);
        }
    }
    
    function cleanup() {
        if (osc1) { try { osc1.stop(); } catch(e) {} osc1 = null; }
        if (osc2) { try { osc2.stop(); } catch(e) {} osc2 = null; }
        if (lfo) { try { lfo.stop(); } catch(e) {} lfo = null; }
        gainNode = null;
        lfoGain = null;
        active = false;
    }
    
    return { start, update, stop, get active() { return active; } };
})();

const sfx = {
    play: (id) => Audio.play(id, 'sfx'),
    
    // Named shortcuts for common sounds
    secret: () => Audio.play('zelda_secret', 'sfx'),
    achievement: () => Audio.play('achievement', 'sfx'),
    death: () => Audio.play('death', 'sfx'),
    preDeath: (callback) => {
        Audio.play('pre_death', 'sfx');
        if (callback) setTimeout(callback, 500);
    },
    pow: () => Audio.play('pow', 'sfx'),
    splash: () => Audio.play('splash', 'sfx'),
    tear: () => Audio.play('tear', 'sfx'),
    screenshot: () => Audio.play('screenshot', 'sfx'),
    shame: () => Audio.play('shame', 'sfx'),
    fame: () => Audio.play('fame', 'sfx'),
    error: () => Audio.play('error', 'sfx'),
    quit: () => {
        const jingles = ['zelda_secret', 'achievement', 'fame'];
        Audio.play(jingles[Math.floor(Math.random() * jingles.length)], 'sfx');
    },
};

// Music - for looping background tracks
const music = {
    play: (id, layer = 'default', opts) => Audio.playLoop(id, 'music', layer, opts),
    stop: (layer) => Audio.stop('music', layer),
    stopAll: () => Audio.stop('music'),
    isPlaying: (layer = 'default') => Audio.isPlaying('music', layer),
    
    // Named shortcuts
    danger: () => Audio.playLoop('low_hp', 'music', 'danger'),
    stopDanger: () => Audio.stop('music', 'danger'),
};

// === GLOBAL ALIASES ===
// For backward compatibility

function playZeldaSecretJingle() { sfx.secret(); }
function playAchievementSound() { sfx.achievement(); }
function playDeathSound() { sfx.death(); }
function playPreDeathSound(cb) { sfx.preDeath(cb); }
function playPostDeathSound() { sfx.death(); }
function playPowSound() { sfx.pow(); }
function playScreenshotSound() { sfx.screenshot(); }
function playRandomJingle() { sfx.quit(); }
function playPickupSound() { sfx.pow(); }
function playItemPickupSound() { sfx.fame(); }
function playPedestalSound() { sfx.secret(); }

Audio.registerInstrument('tracker', Tracker);
