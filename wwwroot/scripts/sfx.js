// SFX - public API for game sounds
// Routes through Audio manager

// === BEAM CHARGE SOUND SYSTEM ===
// R-TYPE style layered charge sound
// Tier 1: Synth sweep (octave rise) → plateau with vibrato
// Tier 2+: Noise layer with swish joins
// Tier 3+: Brief synth on top of swish
const BeamCharge = (() => {
    let ctx = null;
    let active = false;
    let maxTier = 1;
    let lastCompletedTier = -1;
    
    // Synth layer
    let osc1 = null;
    let osc2 = null;
    let synthGain = null;
    let lfo = null;
    let lfoGain = null;
    
    // Noise layer (tier 2+)
    let noiseNode = null;
    let noiseFilter = null;
    let noiseGain = null;
    let noiseLfo = null;  // For swish AM
    let noiseLfoGain = null;
    
    let masterGain = null;
    
    // Base frequency for synth (will rise one octave per tier)
    const baseFreq = 110;  // A2
    const maxDetune = 30;
    
    function createNoiseBuffer(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
    
    function start(beamLevel = 1) {
        if (active) return;
        
        maxTier = Math.min(beamLevel, 5);
        lastCompletedTier = 0;
        
        ctx = Audio.getContext('sfx').ctx;
        if (!ctx) return;
        
        masterGain = ctx.createGain();
        masterGain.gain.value = 0;
        masterGain.connect(ctx.destination);
        
        // === SYNTH LAYER ===
        osc1 = ctx.createOscillator();
        osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = baseFreq;
        osc2.frequency.value = baseFreq;
        osc1.detune.value = -maxDetune;
        osc2.detune.value = maxDetune;
        
        // Vibrato LFO for plateau
        lfo = ctx.createOscillator();
        lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 4;
        lfoGain.gain.value = 0;  // Off until plateau
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.detune);
        lfoGain.connect(osc2.detune);
        
        synthGain = ctx.createGain();
        synthGain.gain.value = 0.5;
        osc1.connect(synthGain);
        osc2.connect(synthGain);
        synthGain.connect(masterGain);
        
        osc1.start();
        osc2.start();
        lfo.start();
        
        // === NOISE LAYER (created but silent until tier 2) ===
        noiseNode = ctx.createBufferSource();
        noiseNode.buffer = createNoiseBuffer(ctx);
        noiseNode.loop = true;
        
        noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 200;
        noiseFilter.Q.value = 1;
        
        // Swish LFO (amplitude modulation)
        noiseLfo = ctx.createOscillator();
        noiseLfoGain = ctx.createGain();
        noiseLfo.type = 'sine';
        noiseLfo.frequency.value = 1.5;  // Swish rate
        noiseLfoGain.gain.value = 0;
        
        noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;  // Silent until tier 2
        
        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseLfo.connect(noiseLfoGain);
        noiseLfoGain.connect(noiseGain.gain);  // AM on noise
        noiseGain.connect(masterGain);
        
        noiseNode.start();
        noiseLfo.start();
        
        active = true;
    }
    
    function update({ completedTier, tierProgress, isHolding, flashRate, maxTier: max }) {
        if (!active || !ctx) return;
        
        const now = ctx.currentTime;
        maxTier = max;
        
        // Which tier are we charging toward?
        const chargingToward = completedTier + 1;
        
        if (isHolding && completedTier > 0) {
            // === PLATEAU ===
            // Don't set frequency - we're already there from the sweep
            // Just maintain vibrato and keep detune tight
            
            // Detune converges but not to zero - keep some movement
            osc1.detune.setTargetAtTime(-5, now, 0.15);
            osc2.detune.setTargetAtTime(5, now, 0.15);
            
            // Vibrato on (gradual)
            lfo.frequency.setTargetAtTime(flashRate, now, 0.1);
            lfoGain.gain.setTargetAtTime(15, now, 0.15);
            
            // Master volume steady
            masterGain.gain.setTargetAtTime(0.12, now, 0.1);
            
            // Tier 2+: noise swish active
            if (completedTier >= 2) {
                synthGain.gain.setTargetAtTime(0, now, 0.1);  // Synth stays off
                noiseGain.gain.setTargetAtTime(0.4, now, 0.1);  // Noise louder
                noiseLfoGain.gain.setTargetAtTime(0.25, now, 0.1);  // AM depth
                noiseFilter.frequency.setTargetAtTime(1000, now, 0.1);
            }
            
        } else {
            // === SWEEP ===
            const fromFreq = baseFreq * Math.pow(2, completedTier);
            const toFreq = baseFreq * Math.pow(2, chargingToward);
            const freq = fromFreq + (toFreq - fromFreq) * tierProgress;
            
            // Tier 1: slow synth sweep
            // Tier 2: fast noise sweep (synth fades)
            // Tier 3+: brief synth on top of swish
            
            if (chargingToward === 1) {
                // Tier 1: Pure synth sweep
                osc1.frequency.setTargetAtTime(freq, now, 0.03);
                osc2.frequency.setTargetAtTime(freq, now, 0.03);
                
                const detune = maxDetune * (1 - tierProgress);
                osc1.detune.setTargetAtTime(-detune, now, 0.05);
                osc2.detune.setTargetAtTime(detune, now, 0.05);
                
                lfoGain.gain.setTargetAtTime(0, now, 0.1);  // No vibrato during sweep
                synthGain.gain.setTargetAtTime(0.5, now, 0.05);
                masterGain.gain.setTargetAtTime(tierProgress * 0.12, now, 0.03);
                
            } else if (chargingToward === 2) {
                // Tier 2: Noise sweep, synth fades OUT
                synthGain.gain.setTargetAtTime(0, now, 0.2);  // Synth fades out
                
                // Noise filter sweep - louder
                const filterFreq = 200 + tierProgress * 800;
                noiseFilter.frequency.setTargetAtTime(filterFreq, now, 0.03);
                noiseGain.gain.setTargetAtTime(0.1 + tierProgress * 0.4, now, 0.03);  // Much louder
                noiseLfoGain.gain.setTargetAtTime(0, now, 0.05);  // No swish during sweep
                
                masterGain.gain.setTargetAtTime(0.14, now, 0.05);
                
            } else {
                // Tier 3+: Brief synth sweep on top of swish
                osc1.frequency.setTargetAtTime(freq, now, 0.02);
                osc2.frequency.setTargetAtTime(freq, now, 0.02);
                
                const detune = maxDetune * (1 - tierProgress);
                osc1.detune.setTargetAtTime(-detune, now, 0.03);
                osc2.detune.setTargetAtTime(detune, now, 0.03);
                
                synthGain.gain.setTargetAtTime(0.3, now, 0.03);  // Synth back
                
                // Swish continues underneath
                noiseGain.gain.setTargetAtTime(0.15, now, 0.05);
                noiseLfoGain.gain.setTargetAtTime(0.1, now, 0.05);
                
                masterGain.gain.setTargetAtTime(0.14, now, 0.05);
            }
        }
        
        // Tier completion - no audio snap, visual handles it
        if (completedTier > lastCompletedTier) {
            lastCompletedTier = completedTier;
        }
    }
    
    function stop(fireBeam = false) {
        if (!active || !ctx) return;
        
        const now = ctx.currentTime;
        
        if (fireBeam) {
            // BWAAAH
            const dropFreq = 55;
            osc1.frequency.setValueAtTime(osc1.frequency.value, now);
            osc1.frequency.exponentialRampToValueAtTime(dropFreq, now + 0.12);
            osc2.frequency.setValueAtTime(osc2.frequency.value, now);
            osc2.frequency.exponentialRampToValueAtTime(dropFreq, now + 0.12);
            
            // Noise drops too
            noiseFilter.frequency.setValueAtTime(noiseFilter.frequency.value, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.15);
            
            lfoGain.gain.setValueAtTime(0, now);
            noiseLfoGain.gain.setValueAtTime(0, now);
            
            masterGain.gain.setValueAtTime(0.25, now);
            masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            
            setTimeout(() => cleanup(), 280);
        } else {
            // Cancelled
            osc1.frequency.exponentialRampToValueAtTime(60, now + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(60, now + 0.1);
            masterGain.gain.setTargetAtTime(0, now, 0.06);
            setTimeout(() => cleanup(), 180);
        }
    }
    
    function cleanup() {
        [osc1, osc2, lfo, noiseNode, noiseLfo].forEach(node => {
            if (node) try { node.stop(); } catch(e) {}
        });
        osc1 = osc2 = lfo = noiseNode = noiseLfo = null;
        synthGain = noiseGain = noiseFilter = masterGain = null;
        lfoGain = noiseLfoGain = null;
        active = false;
        lastCompletedTier = 0;
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
