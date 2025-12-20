// Audio - THE audio system
// Owns all contexts, routes to instruments (Tracker, Sampler, etc.)

const Audio = (() => {
    // === CONTEXTS ===
    // Each context is an isolated audio graph with its own master + analyser
    const contexts = new Map();
    
    function createContext(name) {
        if (contexts.has(name)) return contexts.get(name);
        
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        
        master.connect(analyser);
        analyser.connect(ctx.destination);
        
        const context = {
            ctx,
            master,
            analyser,
            layers: new Map(), // layer name → { gain, current, loopTimeout }
            volume: 1,
        };
        
        contexts.set(name, context);
        return context;
    }
    
    function getContext(name) {
        return contexts.get(name) || createContext(name);
    }
    
    // === LAYERS ===
    // Within a context, layers allow multiple concurrent sounds with crossfade
    
    function getOrCreateLayer(contextName, layerName = 'default') {
        const context = getContext(contextName);
        
        if (!context.layers.has(layerName)) {
            const gain = context.ctx.createGain();
            gain.connect(context.master);
            context.layers.set(layerName, {
                gain,
                current: null,
                loopTimeout: null,
                loopInterval: null,
            });
        }
        
        return context.layers.get(layerName);
    }
    
    // === INSTRUMENTS ===
    // Registry of sound sources
    
    const instruments = {
        tracker: null, // Set when Tracker loads
        sampler: null, // Future
    };
    
    function registerInstrument(name, instrument) {
        instruments[name] = instrument;
    }
    
    // === SOUND REGISTRY ===
    // Maps sound IDs to instruments
    // For now, everything is tracker. Later can add samples.
    
    function resolveSound(id) {
        // Future: check a registry, file extension, etc.
        // For now: if Tracker has it, use Tracker
        if (instruments.tracker?.getLibraryItem(id)) {
            return { type: 'tracker', id };
        }
        // Future: sampler
        // if (id.endsWith('.wav') || id.endsWith('.mp3')) {
        //     return { type: 'sampler', file: id };
        // }
        return null;
    }
    
    // === PLAYBACK ===
    
    function play(id, contextName = 'sfx', layerName = 'default') {
        const sound = resolveSound(id);
        if (!sound) {
            console.warn(`Audio: unknown sound "${id}"`);
            return false;
        }
        
        const context = getContext(contextName);
        const layer = getOrCreateLayer(contextName, layerName);
        
        if (sound.type === 'tracker' && instruments.tracker) {
            instruments.tracker.playLibraryItem(sound.id, context.ctx, layer.gain);
            return true;
        }
        
        // Future: sampler
        // if (sound.type === 'sampler' && instruments.sampler) {
        //     instruments.sampler.play(sound.file, context.ctx, layer.gain);
        //     return true;
        // }
        
        return false;
    }
    
    function playLoop(id, contextName = 'music', layerName = 'default', { fadeIn = 0 } = {}) {
        const sound = resolveSound(id);
        if (!sound) {
            console.warn(`Audio: unknown sound "${id}"`);
            return false;
        }
        
        const context = getContext(contextName);
        const layer = getOrCreateLayer(contextName, layerName);
        
        // Already playing this?
        if (layer.current === id) return true;
        
        // Stop current loop on this layer
        stopLayer(contextName, layerName, { fadeOut: fadeIn });
        
        layer.current = id;
        
        // Fade in
        if (fadeIn > 0) {
            layer.gain.gain.setValueAtTime(0, context.ctx.currentTime);
            layer.gain.gain.linearRampToValueAtTime(1, context.ctx.currentTime + fadeIn);
        } else {
            layer.gain.gain.setValueAtTime(1, context.ctx.currentTime);
        }
        
        // Get duration from tracker
        const item = instruments.tracker?.getLibraryItem(id);
        if (!item) return false;
        
        const durationSec = calculateDuration(item) / 1000;
        
        // Schedule loops using Web Audio time (sample-accurate)
        // We schedule ahead and use setTimeout only to trigger the next scheduling pass
        const scheduleAhead = 0.1; // Schedule 100ms ahead
        const scheduleInterval = 50; // Check every 50ms
        
        let nextStartTime = context.ctx.currentTime;
        
        function scheduleLoop() {
            if (layer.current !== id) return; // Stopped
            
            // Schedule loops until we're scheduleAhead seconds into the future
            while (nextStartTime < context.ctx.currentTime + scheduleAhead) {
                // Play at exact scheduled time
                if (sound.type === 'tracker' && instruments.tracker) {
                    instruments.tracker.playLibraryItem(sound.id, context.ctx, layer.gain, nextStartTime);
                }
                nextStartTime += durationSec;
            }
            
            // Schedule next check
            layer.loopTimeout = setTimeout(scheduleLoop, scheduleInterval);
        }
        
        // Start the scheduling loop
        scheduleLoop();
        
        return true;
    }
    
    function calculateDuration(item) {
        if (!item.patterns || !item.sequence) return 1000;
        
        const bpm = item.bpm || 150;
        const speed = item.speed || 6;
        const msPerRow = (speed * 2500) / bpm;
        
        let totalRows = 0;
        for (const patId of item.sequence) {
            const pat = item.patterns[patId];
            if (pat) totalRows += pat.length;
        }
        
        return totalRows * msPerRow;
    }
    
    function stopLayer(contextName, layerName = 'default', { fadeOut = 0 } = {}) {
        const context = contexts.get(contextName);
        if (!context) return;
        
        const layer = context.layers.get(layerName);
        if (!layer) return;
        
        // Clear loop
        if (layer.loopInterval) {
            clearInterval(layer.loopInterval);
            layer.loopInterval = null;
        }
        if (layer.loopTimeout) {
            clearTimeout(layer.loopTimeout);
            layer.loopTimeout = null;
        }
        
        // Fade out
        if (fadeOut > 0) {
            layer.gain.gain.linearRampToValueAtTime(0, context.ctx.currentTime + fadeOut);
            setTimeout(() => { layer.current = null; }, fadeOut * 1000);
        } else {
            layer.gain.gain.setValueAtTime(0, context.ctx.currentTime);
            layer.current = null;
        }
    }
    
    function stop(contextName, layerName) {
        if (layerName) {
            stopLayer(contextName, layerName);
        } else {
            // Stop all layers in context
            const context = contexts.get(contextName);
            if (context) {
                for (const name of context.layers.keys()) {
                    stopLayer(contextName, name);
                }
            }
        }
    }
    
    function stopAll() {
        for (const name of contexts.keys()) {
            stop(name);
        }
    }
    
    // === VOLUME ===
    
    function setVolume(contextName, volume) {
        const context = contexts.get(contextName);
        if (context) {
            context.volume = volume;
            context.master.gain.setValueAtTime(volume, context.ctx.currentTime);
        }
    }
    
    function setLayerVolume(contextName, layerName, volume) {
        const context = contexts.get(contextName);
        if (context) {
            const layer = context.layers.get(layerName);
            if (layer) {
                layer.gain.gain.setValueAtTime(volume, context.ctx.currentTime);
            }
        }
    }
    
    // === ANALYSER ACCESS ===
    // For oscilloscope/spectrogram
    
    function getAnalyser(contextName) {
        const context = contexts.get(contextName);
        return context?.analyser || null;
    }
    
    // === QUERIES ===
    
    function isPlaying(contextName, layerName = 'default') {
        const context = contexts.get(contextName);
        if (!context) return null;
        const layer = context.layers.get(layerName);
        return layer?.current || null;
    }
    
    return {
        // Context management
        createContext,
        getContext,
        
        // Instrument registration
        registerInstrument,
        
        // Playback
        play,
        playLoop,
        stop,
        stopAll,
        
        // Volume
        setVolume,
        setLayerVolume,
        
        // Analysis
        getAnalyser,
        
        // Queries
        isPlaying,
    };
})();
