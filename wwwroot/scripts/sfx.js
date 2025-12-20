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
    let generation = 0;  // Tracks which "instance" is active
    
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
        // If already active, force cleanup of old sound first
        if (active) {
            cleanupImmediate();
        }
        
        generation++;  // New instance
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
    
    function stop(fireBeam = false, tier = 1, onFire = null) {
        if (!active || !ctx) return;
        
        const myGeneration = generation;  // Capture for closure
        active = false;  // Immediately allow restart
        const now = ctx.currentTime;
        
        if (fireBeam) {
            // PEW sequence: riser → pause → click → pause → BWAAAH
            const riserTime = 0.10;   // 100ms
            const pauseTime = 0.06;   // 60ms
            const clickDur = 0.008;
            
            // Fade charge sound during riser
            synthGain.gain.setTargetAtTime(0.1, now, riserTime * 0.3);
            noiseGain.gain.setTargetAtTime(0.05, now, riserTime * 0.3);
            
            // === RISER: saw C6→C7 + noise sweep ===
            const riserOsc = ctx.createOscillator();
            riserOsc.type = 'sawtooth';
            riserOsc.frequency.setValueAtTime(1046.5, now);  // C6
            riserOsc.frequency.exponentialRampToValueAtTime(2093, now + riserTime);  // C7
            
            const riserGain = ctx.createGain();
            riserGain.gain.setValueAtTime(0, now);
            riserGain.gain.linearRampToValueAtTime(0.12, now + riserTime * 0.1);
            riserGain.gain.setValueAtTime(0.12, now + riserTime * 0.9);
            riserGain.gain.linearRampToValueAtTime(0, now + riserTime);
            
            riserOsc.connect(riserGain);
            riserGain.connect(masterGain);
            riserOsc.start(now);
            riserOsc.stop(now + riserTime + 0.01);
            
            // Riser noise sweep
            const riserNoise = ctx.createBufferSource();
            riserNoise.buffer = createNoiseBuffer(ctx);
            const riserNoiseFilter = ctx.createBiquadFilter();
            riserNoiseFilter.type = 'bandpass';
            riserNoiseFilter.frequency.setValueAtTime(800, now);
            riserNoiseFilter.frequency.exponentialRampToValueAtTime(4000, now + riserTime);
            riserNoiseFilter.Q.value = 2;
            const riserNoiseGain = ctx.createGain();
            riserNoiseGain.gain.setValueAtTime(0, now);
            riserNoiseGain.gain.linearRampToValueAtTime(0.08, now + riserTime * 0.2);
            riserNoiseGain.gain.setValueAtTime(0.08, now + riserTime * 0.8);
            riserNoiseGain.gain.linearRampToValueAtTime(0, now + riserTime);
            
            riserNoise.connect(riserNoiseFilter);
            riserNoiseFilter.connect(riserNoiseGain);
            riserNoiseGain.connect(masterGain);
            riserNoise.start(now);
            riserNoise.stop(now + riserTime + 0.01);
            
            // === CLICK: short transient at riser + pause ===
            const clickTime = now + riserTime + pauseTime;
            const clickOsc = ctx.createOscillator();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(1200, clickTime);
            clickOsc.frequency.exponentialRampToValueAtTime(200, clickTime + clickDur);
            
            const clickGain = ctx.createGain();
            clickGain.gain.setValueAtTime(0, clickTime);
            clickGain.gain.linearRampToValueAtTime(0.3, clickTime + 0.001);
            clickGain.gain.exponentialRampToValueAtTime(0.01, clickTime + clickDur);
            
            clickOsc.connect(clickGain);
            clickGain.connect(masterGain);
            clickOsc.start(clickTime);
            clickOsc.stop(clickTime + clickDur + 0.01);
            
            // === BWAAAH: at riser + pause + click + pause ===
            const bwaaahTime = now + riserTime + pauseTime + clickDur + pauseTime;
            const dropFreq = 55;
            
            // Schedule frequency drops
            osc1.frequency.setValueAtTime(osc1.frequency.value, bwaaahTime);
            osc1.frequency.exponentialRampToValueAtTime(dropFreq, bwaaahTime + 0.12);
            osc2.frequency.setValueAtTime(osc2.frequency.value, bwaaahTime);
            osc2.frequency.exponentialRampToValueAtTime(dropFreq, bwaaahTime + 0.12);
            
            // Noise drops too
            noiseFilter.frequency.setValueAtTime(noiseFilter.frequency.value, bwaaahTime);
            noiseFilter.frequency.exponentialRampToValueAtTime(100, bwaaahTime + 0.15);
            
            // Boost for BWAAAH then fade
            synthGain.gain.setValueAtTime(0.5, bwaaahTime);
            noiseGain.gain.setValueAtTime(0.3, bwaaahTime);
            lfoGain.gain.setValueAtTime(0, bwaaahTime);
            noiseLfoGain.gain.setValueAtTime(0, bwaaahTime);
            
            masterGain.gain.setValueAtTime(0.25, bwaaahTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, bwaaahTime + 0.2);
            
            // Callback when beam should fire (at BWAAAH)
            const totalDelayMs = (riserTime + pauseTime + clickDur + pauseTime) * 1000;
            if (onFire) {
                setTimeout(onFire, totalDelayMs);
            }
            
            // Cleanup after everything finishes
            const cleanupDelay = totalDelayMs + 280;
            setTimeout(() => cleanupIfSameGeneration(myGeneration), cleanupDelay);
        } else {
            // Cancelled - sad whine
            osc1.frequency.exponentialRampToValueAtTime(60, now + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(60, now + 0.1);
            masterGain.gain.setTargetAtTime(0, now, 0.06);
            setTimeout(() => cleanupIfSameGeneration(myGeneration), 180);
        }
    }
    
    function cleanupIfSameGeneration(gen) {
        // Only cleanup if no new sound has started
        if (generation !== gen) return;
        cleanupImmediate();
    }
    
    function cleanupImmediate() {
        // Stop all oscillators/sources
        [osc1, osc2, lfo, noiseNode, noiseLfo].forEach(node => {
            if (node) try { node.stop(); } catch(e) {}
        });
        // Disconnect all nodes from graph
        [osc1, osc2, lfo, noiseNode, noiseLfo, synthGain, noiseGain, noiseFilter, masterGain, lfoGain, noiseLfoGain].forEach(node => {
            if (node) try { node.disconnect(); } catch(e) {}
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

// === BEAM SUSTAIN SOUND (WHIRR) ===
// Low pulsing drone while beam is active - polyphonic for stacked beams
const BeamSustain = (() => {
    let ctx = null;
    const voices = new Map();  // beamId -> voice nodes
    let nextId = 0;
    
    let masterGain = null;
    
    const baseFreq = 65;  // Low C2-ish
    const lfoRate = 6;    // womm womm rate (hz)
    
    // High layer frequencies by tier (major thirds from C4)
    const tierFreqs = [
        262,   // Tier 1: C4
        330,   // Tier 2: E4
        415,   // Tier 3: G#4
        523,   // Tier 4: C5
        659,   // Tier 5: E5
    ];
    
    function ensureMaster() {
        if (!ctx) {
            ctx = Audio.getContext('sfx').ctx;
            if (!ctx) return false;
        }
        if (!masterGain || !masterGain.context) {
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.25;
            masterGain.connect(ctx.destination);
        }
        return true;
    }
    
    function start(tier = 1) {
        if (!ensureMaster()) return -1;
        
        const now = ctx.currentTime;
        const id = nextId++;
        
        const voice = {
            osc: null,
            oscGain: null,
            lfo: null,
            lfoGain: null,
            oscHi: null,
            oscHiGain: null,
            lfoHi: null,
            lfoHiGain: null,
            voiceGain: null,
        };
        
        // Voice gain for this beam
        voice.voiceGain = ctx.createGain();
        voice.voiceGain.gain.setValueAtTime(0, now);
        voice.voiceGain.gain.linearRampToValueAtTime(1, now + 0.05);
        voice.voiceGain.connect(masterGain);
        
        // === LOW LAYER ===
        voice.osc = ctx.createOscillator();
        voice.osc.type = 'sawtooth';
        voice.osc.frequency.value = baseFreq;
        
        voice.oscGain = ctx.createGain();
        voice.oscGain.gain.value = 0.5;
        
        voice.lfo = ctx.createOscillator();
        voice.lfo.type = 'sine';
        voice.lfo.frequency.value = lfoRate;
        
        voice.lfoGain = ctx.createGain();
        voice.lfoGain.gain.value = 0.4;
        
        voice.lfo.connect(voice.lfoGain);
        voice.lfoGain.connect(voice.oscGain.gain);
        
        voice.osc.connect(voice.oscGain);
        voice.oscGain.connect(voice.voiceGain);
        
        voice.osc.start(now);
        voice.lfo.start(now);
        
        // === HIGH LAYER (pitch by tier, double LFO rate) ===
        const hiFreq = tierFreqs[Math.min(tier, tierFreqs.length) - 1];
        
        voice.oscHi = ctx.createOscillator();
        voice.oscHi.type = 'sawtooth';
        voice.oscHi.frequency.value = hiFreq;
        
        voice.oscHiGain = ctx.createGain();
        voice.oscHiGain.gain.value = 0.5;
        
        voice.lfoHi = ctx.createOscillator();
        voice.lfoHi.type = 'sine';
        voice.lfoHi.frequency.value = lfoRate * 2;
        
        voice.lfoHiGain = ctx.createGain();
        voice.lfoHiGain.gain.value = 0.35;
        
        voice.lfoHi.connect(voice.lfoHiGain);
        voice.lfoHiGain.connect(voice.oscHiGain.gain);
        
        voice.oscHi.connect(voice.oscHiGain);
        voice.oscHiGain.connect(voice.voiceGain);
        
        voice.oscHi.start(now);
        voice.lfoHi.start(now);
        
        voices.set(id, voice);
        return id;
    }
    
    function stop(id) {
        if (id === undefined) {
            // Stop all voices
            for (const [vid, voice] of voices) {
                stopVoice(vid, voice);
            }
            return;
        }
        
        const voice = voices.get(id);
        if (!voice) return;
        stopVoice(id, voice);
    }
    
    function stopVoice(id, voice) {
        if (!ctx) return;
        
        const now = ctx.currentTime;
        
        // Quick fade out
        voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, now);
        voice.voiceGain.gain.linearRampToValueAtTime(0, now + 0.08);
        
        setTimeout(() => {
            [voice.osc, voice.lfo, voice.oscHi, voice.lfoHi].forEach(node => {
                if (node) try { node.stop(); } catch(e) {}
            });
            [voice.osc, voice.lfo, voice.oscGain, voice.lfoGain, 
             voice.oscHi, voice.lfoHi, voice.oscHiGain, voice.lfoHiGain,
             voice.voiceGain].forEach(node => {
                if (node) try { node.disconnect(); } catch(e) {}
            });
            voices.delete(id);
        }, 100);
    }
    
    return { start, stop, get active() { return voices.size > 0; } };
})();

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
