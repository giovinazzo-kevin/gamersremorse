// FamiTracker-style tracker
// Channels: Pulse1, Pulse2, Triangle, Noise

const Tracker = (() => {
    // === CONSTANTS ===
    const CHANNELS = ['pulse1', 'pulse2', 'triangle', 'noise'];
    const CHANNEL_NAMES = { pulse1: 'Pulse 1', pulse2: 'Pulse 2', triangle: 'Triangle', noise: 'Noise' };
    const COLUMNS_PER_CHANNEL = 4; // note, instrument, volume, effect
    const COL_NOTE = 0;
    const COL_INST = 1;
    const COL_VOL = 2;
    const COL_FX = 3;
    const DEFAULT_ROWS = 64;
    const DEFAULT_BPM = 150;
    const DEFAULT_SPEED = 6;
    
    const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const NOTE_OFFSETS = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
    
    // Keyboard to note mapping
    const KEY_MAP = {
        'z': { note: 'C', octave: 0 }, 's': { note: 'C#', octave: 0 },
        'x': { note: 'D', octave: 0 }, 'd': { note: 'D#', octave: 0 },
        'c': { note: 'E', octave: 0 },
        'v': { note: 'F', octave: 0 }, 'g': { note: 'F#', octave: 0 },
        'b': { note: 'G', octave: 0 }, 'h': { note: 'G#', octave: 0 },
        'n': { note: 'A', octave: 0 }, 'j': { note: 'A#', octave: 0 },
        'm': { note: 'B', octave: 0 },
        'q': { note: 'C', octave: 1 }, '2': { note: 'C#', octave: 1 },
        'w': { note: 'D', octave: 1 }, '3': { note: 'D#', octave: 1 },
        'e': { note: 'E', octave: 1 },
        'r': { note: 'F', octave: 1 }, '5': { note: 'F#', octave: 1 },
        't': { note: 'G', octave: 1 }, '6': { note: 'G#', octave: 1 },
        'y': { note: 'A', octave: 1 }, '7': { note: 'A#', octave: 1 },
        'u': { note: 'B', octave: 1 },
        'i': { note: 'C', octave: 2 }, '9': { note: 'C#', octave: 2 },
        'o': { note: 'D', octave: 2 }, '0': { note: 'D#', octave: 2 },
        'p': { note: 'E', octave: 2 },
    };
    
    // === STATE ===
    let patterns = {};
    let sequence = [0];
    let currentPattern = 0;
    let currentRow = 0;
    let currentChannel = 0;
    let currentColumn = 0; // 0=note, 1=inst, 2=vol, 3=fx
    let currentOctave = 4;
    let currentInstrument = null; // null = master mode, number = specific instrument
    
    let bpm = DEFAULT_BPM;
    let speed = DEFAULT_SPEED;
    let playing = false;
    let playInterval = null;
    let sustainedNotes = [];
    let audioCtx = null;
    let masterAnalyser = null;
    let instrumentAnalyser = null;
    let animationFrameId = null;
    
    function createBitcrusher(ctx) {
        // 8-bit quantization via waveshaper
        const crusher = ctx.createWaveShaper();
        const bits = 8;
        const levels = Math.pow(2, bits);
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2 / samples) - 1;
            curve[i] = Math.round(x * levels) / levels;
        }
        crusher.curve = curve;
        crusher.oversample = 'none';
        return crusher;
    }
    
    let editMode = false; // Start NOT in edit mode (FamiTracker style)
    let followMode = true;
    let loopMode = false; // Off by default - stop at end
    
    // Selection (for Shift+arrows)
    let selection = null; // { startRow, startCh, startCol, endRow, endCh, endCol }
    let isDragging = false;
    
    // Held notes for proper ADSR (key → {osc/noise, gain, inst})
    const heldNotes = new Map();
    
    let trackerElement = null;
    let patternElement = null;
    let libraryTab = 'patterns'; // 'patterns' or 'instruments'
    let isMaximized = false;
    
    // === LIBRARY ===
    // Pre-made patterns/songs that can be loaded
    const library = {
        'zelda_secret': {
            name: 'Zelda Secret',
            icon: '✨',
            bpm: 333,
            speed: 6,
            delay: { time: 0.15, feedback: 0.3 },
            pan: 'alternate',
            patterns: {
                0: createPatternFromNotes([
                    { row: 0, ch: 'pulse1', note: 'G-', octave: 5, inst: 6, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'F#', octave: 5, inst: 6, vol: 15 },
                    { row: 2, ch: 'pulse1', note: 'D#', octave: 5, inst: 6, vol: 15 },
                    { row: 3, ch: 'pulse1', note: 'A-', octave: 4, inst: 6, vol: 15 },
                    { row: 4, ch: 'pulse1', note: 'G#', octave: 4, inst: 6, vol: 15 },
                    { row: 5, ch: 'pulse1', note: 'E-', octave: 5, inst: 6, vol: 15 },
                    { row: 6, ch: 'pulse1', note: 'G#', octave: 5, inst: 6, vol: 15 },
                    { row: 7, ch: 'pulse1', note: 'C-', octave: 6, inst: 6, vol: 15 },
                ], 8)
            },
            sequence: [0]
        },
        'achievement': {
            name: 'Achievement',
            icon: '🏆',
            synth: (ctx) => {
                const N = (note, octave) => {
                    const offsets = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };
                    return 261.63 * Math.pow(2, (offsets[note] + (octave - 4) * 12) / 12);
                };
                
                const melody1 = [N('A#', 4), N('A', 5), N('C', 6)];
                const melody2 = [N('C', 4), N('C', 5), N('C', 7)];
                const noteLength = 0.1;
                
                // 50% volume delay
                const delay = ctx.createDelay();
                const delayGain = ctx.createGain();
                delay.delayTime.value = 0.08;
                delayGain.gain.value = 0.5;
                delay.connect(delayGain);
                delayGain.connect(ctx.destination);
                
                const playNote = (freq, startTime, vol, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.value = freq;
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    gain.connect(delay);
                    gain.gain.setValueAtTime(vol, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteLength * 2);
                    osc.start(startTime);
                    osc.stop(startTime + noteLength * (i === 2 ? 0.5 : 1));
                };
                
                melody1.forEach((freq, i) => playNote(freq, ctx.currentTime + i * noteLength, 0.2 - i * 0.03, i));
                melody2.forEach((freq, i) => playNote(freq, ctx.currentTime + i * noteLength, 0.12 - i * 0.02, i));
            }
        },
        'death': {
            name: 'Death',
            icon: '💀',
            bpm: 280,
            speed: 6,
            patterns: {
                // SMB death ~1.74s. At 280bpm speed 6: ~143ms per row
                0: createPatternFromNotes([
                    // Right hand: B F F F E D C E E C
                    { row: 0, ch: 'pulse1', note: 'B-', octave: 4, inst: 0, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 15 },
                    { row: 3, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 14 },
                    { row: 4, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 14 },
                    { row: 5, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 13 },
                    { row: 6, ch: 'pulse1', note: 'D-', octave: 5, inst: 0, vol: 13 },
                    { row: 8, ch: 'pulse1', note: 'C-', octave: 5, inst: 0, vol: 12 },
                    { row: 10, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 12 },
                    { row: 11, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 11 },
                    { row: 12, ch: 'pulse1', note: 'C-', octave: 5, inst: 0, vol: 11 },
                    // Left hand: G G G A B C G C
                    { row: 0, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 12 },
                    { row: 1, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 12 },
                    { row: 3, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 11 },
                    { row: 4, ch: 'triangle', note: 'A-', octave: 3, inst: 3, vol: 11 },
                    { row: 5, ch: 'triangle', note: 'B-', octave: 3, inst: 3, vol: 11 },
                    { row: 6, ch: 'triangle', note: 'C-', octave: 4, inst: 3, vol: 11 },
                    { row: 10, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 10 },
                    { row: 12, ch: 'triangle', note: 'C-', octave: 4, inst: 3, vol: 10 },
                ], 14)
            },
            sequence: [0]
        },
        'pre_death': {
            name: 'Fatal',
            icon: '💢',
            bpm: 500,
            speed: 6,
            patterns: {
                0: createPatternFromNotes([
                    { row: 0, ch: 'pulse1', note: 'C-', octave: 5, inst: 0, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'C#', octave: 5, inst: 0, vol: 15 },
                    { row: 2, ch: 'pulse1', note: 'D-', octave: 5, inst: 0, vol: 15 },
                ], 6)
            },
            sequence: [0]
        },
        'pow': {
            name: 'Pow',
            icon: '💥',
            synth: (ctx) => {
                // NES-style POW - bitcrushed noise burst with filter sweep + square thump
                const noise = ctx.createBufferSource();
                const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
                const data = noiseBuffer.getChannelData(0);
                
                // 4-bit bitcrushed noise
                const levels = Math.pow(2, 4);
                for (let i = 0; i < data.length; i++) {
                    let sample = Math.random() * 2 - 1;
                    data[i] = Math.round(sample * levels) / levels;
                }
                noise.buffer = noiseBuffer;
                
                // Bandpass filter sweep 2000→200 Hz
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(2000, ctx.currentTime);
                filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
                filter.Q.value = 5;
                
                const noiseGain = ctx.createGain();
                noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
                noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
                
                noise.connect(filter);
                filter.connect(noiseGain);
                noiseGain.connect(ctx.destination);
                noise.start();
                
                // Square thump 300→80 Hz
                const thump = ctx.createOscillator();
                const thumpGain = ctx.createGain();
                thump.type = 'square';
                thump.frequency.setValueAtTime(300, ctx.currentTime);
                thump.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);
                thumpGain.gain.setValueAtTime(0.25, ctx.currentTime);
                thumpGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                thump.connect(thumpGain);
                thumpGain.connect(ctx.destination);
                thump.start();
                thump.stop(ctx.currentTime + 0.15);
            }
        },
        'screenshot': {
            name: 'Screenshot',
            icon: '📸',
            synth: (ctx) => {
                // Click transient - short noise burst
                const noise = ctx.createBufferSource();
                const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
                const data = noiseBuffer.getChannelData(0);
                for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                noise.buffer = noiseBuffer;
                const noiseGain = ctx.createGain();
                noiseGain.gain.setValueAtTime(0.15, ctx.currentTime);
                noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.015);
                noise.connect(noiseGain);
                noiseGain.connect(ctx.destination);
                noise.start();
                
                // 4 harmonic layers gliding up ~30% over 120ms
                const layers = [
                    { freq: [1600, 2100], type: 'sine', vol: 0.15 },
                    { freq: [3300, 3700], type: 'triangle', vol: 0.10 },
                    { freq: [6500, 7200], type: 'sawtooth', vol: 0.06 },
                    { freq: [9900, 10700], type: 'sawtooth', vol: 0.02 },
                ];
                
                layers.forEach(layer => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = layer.type;
                    osc.frequency.setValueAtTime(layer.freq[0], ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(layer.freq[1], ctx.currentTime + 0.12);
                    gain.gain.setValueAtTime(layer.vol, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.45);
                });
            }
        },
        'shame': {
            name: 'Shame',
            icon: '😔',
            bpm: 200,
            speed: 6,
            patterns: {
                // Locrian scale - cursed, unstable
                0: createPatternFromNotes([
                    { row: 0, ch: 'pulse1', note: 'E-', octave: 3, inst: 1, vol: 12 },
                    { row: 2, ch: 'pulse1', note: 'F-', octave: 3, inst: 1, vol: 11 },
                    { row: 4, ch: 'pulse1', note: 'G-', octave: 3, inst: 1, vol: 10 },
                    { row: 6, ch: 'pulse1', note: 'A#', octave: 3, inst: 1, vol: 9 },
                    { row: 8, ch: 'pulse1', note: 'C-', octave: 3, inst: 1, vol: 8 },
                ], 12)
            },
            sequence: [0]
        },
        'fame': {
            name: 'Fame',
            icon: '⭐',
            bpm: 350,
            speed: 6,
            delay: { time: 0.1, feedback: 0.4 },
            patterns: {
                // Major pentatonic - bright and happy
                0: createPatternFromNotes([
                    { row: 0, ch: 'pulse1', note: 'A-', octave: 4, inst: 3, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'B-', octave: 4, inst: 3, vol: 14 },
                    { row: 2, ch: 'pulse1', note: 'C#', octave: 5, inst: 3, vol: 14 },
                    { row: 3, ch: 'pulse1', note: 'E-', octave: 5, inst: 3, vol: 13 },
                    { row: 4, ch: 'pulse1', note: 'A-', octave: 5, inst: 3, vol: 15 },
                    // Harmony
                    { row: 0, ch: 'triangle', note: 'A-', octave: 3, inst: 3, vol: 10 },
                    { row: 2, ch: 'triangle', note: 'E-', octave: 3, inst: 3, vol: 10 },
                    { row: 4, ch: 'triangle', note: 'A-', octave: 3, inst: 3, vol: 10 },
                ], 6)
            },
            sequence: [0]
        },
        'error': {
            name: 'Error',
            icon: '⚠️',
            bpm: 250,
            speed: 6,
            patterns: {
                // Whole tone - dreamy, unsettling
                0: createPatternFromNotes([
                    { row: 0, ch: 'pulse1', note: 'G-', octave: 3, inst: 1, vol: 12 },
                    { row: 2, ch: 'pulse1', note: 'A-', octave: 3, inst: 1, vol: 11 },
                    { row: 4, ch: 'pulse1', note: 'B-', octave: 3, inst: 1, vol: 10 },
                    { row: 6, ch: 'pulse1', note: 'C#', octave: 4, inst: 1, vol: 9 },
                    { row: 8, ch: 'pulse1', note: 'D#', octave: 4, inst: 1, vol: 8 },
                ], 12)
            },
            sequence: [0]
        },
    };
    
    // Unlocked library items (by id)
    let unlockedLibrary = new Set(['zelda_secret']); // Start with one unlocked
    
    // Custom user-created songs
    let customLibrary = {};
    
    function createPatternFromNotes(notes, length = 16) {
        const rows = [];
        for (let i = 0; i < length; i++) {
            rows.push({
                pulse1: { note: null, octave: null, inst: null, vol: null, fx: null },
                pulse2: { note: null, octave: null, inst: null, vol: null, fx: null },
                triangle: { note: null, octave: null, inst: null, vol: null, fx: null },
                noise: { note: null, octave: null, inst: null, vol: null, fx: null },
            });
        }
        for (const n of notes) {
            if (n.row < length) {
                rows[n.row][n.ch] = {
                    note: n.note,
                    octave: n.octave,
                    inst: n.inst ?? 0,
                    vol: n.vol ?? 15,
                    fx: n.fx ?? null
                };
            }
        }
        return { rows, length };
    }
    
    function loadFromLibrary(id) {
        const item = library[id];
        if (!item) return false;
        
        // Deep copy patterns
        patterns = {};
        for (const [key, pat] of Object.entries(item.patterns)) {
            patterns[key] = {
                length: pat.length,
                rows: pat.rows.map(row => ({
                    pulse1: { ...row.pulse1 },
                    pulse2: { ...row.pulse2 },
                    triangle: { ...row.triangle },
                    noise: { ...row.noise },
                }))
            };
        }
        sequence = [...item.sequence];
        bpm = item.bpm || DEFAULT_BPM;
        speed = item.speed || DEFAULT_SPEED;
        currentPattern = 0;
        currentRow = 0;
        updateDisplay();
        return true;
    }
    
    // Play a library item directly (for SFX) without loading into editor
    function playLibraryItem(id) {
        const item = library[id];
        if (!item) return false;
        
        // If item has custom synth function, use that instead of pattern playback
        if (item.synth) {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            item.synth(audioCtx);
            return true;
        }
        
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const itemBpm = item.bpm || DEFAULT_BPM;
        const itemSpeed = item.speed || DEFAULT_SPEED;
        const msPerRow = (60000 / itemBpm) / (itemSpeed / 4);
        
        // Setup effects based on library item
        let delayNode = null;
        let delayGain = null;
        if (item.delay) {
            delayNode = audioCtx.createDelay();
            delayGain = audioCtx.createGain();
            delayNode.delayTime.value = item.delay.time || 0.15;
            delayGain.gain.value = item.delay.feedback || 0.3;
            delayNode.connect(delayGain);
            delayGain.connect(audioCtx.destination);
        }
        
        // Play through all patterns in sequence
        let rowIndex = 0;
        for (const patId of item.sequence) {
            const pat = item.patterns[patId];
            if (!pat) continue;
            
            for (let r = 0; r < pat.length; r++) {
                const row = pat.rows[r];
                const time = audioCtx.currentTime + (rowIndex * msPerRow / 1000);
                
                for (const ch of CHANNELS) {
                    const cell = row[ch];
                    if (cell && cell.note && cell.note !== '---' && cell.note !== '===') {
                        scheduleNote(ch, cell, time, item, delayNode, rowIndex);
                    }
                }
                rowIndex++;
            }
        }
        return true;
    }
    
    function scheduleNote(channel, cell, time, libraryItem, delayNode, rowIndex) {
        const freq = noteToFreq(cell.note, cell.octave);
        if (!freq) return;
        
        const inst = getAllInstruments()[cell.inst || 0] || getAllInstruments()[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        
        // Per-voice bitcrusher for proper 8-bit sound
        const crusher = createBitcrusher(audioCtx);
        
        // Panning - alternate L/R based on row index
        const panner = audioCtx.createStereoPanner();
        if (libraryItem?.pan === 'alternate') {
            panner.pan.value = (rowIndex % 2 === 0) ? -0.6 : 0.6;
        }
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 0.5;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            const gain = audioCtx.createGain();
            noise.buffer = buffer;
            noise.connect(crusher);
            crusher.connect(gain);
            gain.connect(panner);
            panner.connect(audioCtx.destination);
            if (delayNode) panner.connect(delayNode);
            
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(volume, time + inst.attack);
            gain.gain.linearRampToValueAtTime(volume * inst.sustain, time + inst.attack + inst.decay);
            gain.gain.linearRampToValueAtTime(0.001, time + inst.attack + inst.decay + inst.release);
            noise.start(time);
            noise.stop(time + inst.attack + inst.decay + inst.release + 0.1);
            return;
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        // Map instrument type to Web Audio oscillator type
        if (inst.type === 'triangle' || channel === 'triangle') osc.type = 'triangle';
        else if (inst.type === 'sawtooth') osc.type = 'sawtooth';
        else if (inst.type === 'sine') osc.type = 'sine';
        else osc.type = 'square'; // pulse
        osc.frequency.value = freq;
        osc.connect(crusher);
        crusher.connect(gain);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
        if (delayNode) panner.connect(delayNode);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume, time + inst.attack);
        gain.gain.linearRampToValueAtTime(volume * inst.sustain, time + inst.attack + inst.decay);
        gain.gain.linearRampToValueAtTime(0.001, time + inst.attack + inst.decay + inst.release);
        osc.start(time);
        osc.stop(time + inst.attack + inst.decay + inst.release + 0.1);
    }
    
    function unlockLibraryItem(id) {
        if (library[id] && !unlockedLibrary.has(id)) {
            unlockedLibrary.add(id);
            saveUnlockedLibrary();
            updateLibraryDisplay();
            return true;
        }
        return false;
    }
    
    function saveUnlockedLibrary() {
        localStorage.setItem('trackerLibrary', JSON.stringify([...unlockedLibrary]));
    }
    
    function loadUnlockedLibrary() {
        const saved = localStorage.getItem('trackerLibrary');
        if (saved) {
            unlockedLibrary = new Set(JSON.parse(saved));
        }
    }
    
    function saveCustomLibrary() {
        localStorage.setItem('trackerCustomLibrary', JSON.stringify(customLibrary));
    }
    
    function loadCustomLibrary() {
        const saved = localStorage.getItem('trackerCustomLibrary');
        if (saved) {
            customLibrary = JSON.parse(saved);
        }
    }
    
    function saveToCustomLibrary(name, icon = '🎵') {
        const id = 'custom_' + Date.now();
        customLibrary[id] = {
            name,
            icon,
            bpm,
            speed,
            patterns: JSON.parse(JSON.stringify(patterns)),
            sequence: [...sequence]
        };
        saveCustomLibrary();
        updateLibraryDisplay();
        return id;
    }
    
    function deleteCustomSong(id) {
        if (customLibrary[id]) {
            delete customLibrary[id];
            saveCustomLibrary();
            updateLibraryDisplay();
            return true;
        }
        return false;
    }
    
    function loadCustomSong(id) {
        const item = customLibrary[id];
        if (!item) return false;
        
        patterns = JSON.parse(JSON.stringify(item.patterns));
        sequence = [...item.sequence];
        bpm = item.bpm || DEFAULT_BPM;
        speed = item.speed || DEFAULT_SPEED;
        currentPattern = 0;
        currentRow = 0;
        updateDisplay();
        return true;
    }
    
    function promptSaveCustom() {
        const name = prompt('Enter a name for this sound:', 'My Sound');
        if (!name) return;
        const icon = prompt('Enter an emoji icon:', '🎵') || '🎵';
        saveToCustomLibrary(name, icon);
    }
    
    function updateLibraryDisplay() {
        const list = trackerElement?.querySelector('#tracker-library-list');
        if (!list) return;
        
        let html = '';
        
        if (libraryTab === 'patterns') {
            // Built-in patterns
            for (const [id, item] of Object.entries(library)) {
                if (item.synth) continue;
                
                const unlocked = unlockedLibrary.has(id);
                if (unlocked) {
                    html += `<div class="library-item" data-id="${id}" onclick="Tracker.loadFromLibrary('${id}')">
                        <span class="library-icon">${item.icon}</span>
                        <span class="library-name">${item.name}</span>
                    </div>`;
                } else {
                    html += `<div class="library-item locked">
                        <span class="library-icon">🔒</span>
                        <span class="library-name">???</span>
                    </div>`;
                }
            }
            
            // Custom songs
            const customIds = Object.keys(customLibrary);
            if (customIds.length > 0) {
                html += `<div class="library-section-header">CUSTOM</div>`;
                for (const id of customIds) {
                    const item = customLibrary[id];
                    html += `<div class="library-item custom" data-id="${id}">
                        <span class="library-icon">${item.icon}</span>
                        <span class="library-name">${item.name}</span>
                        <span class="library-delete" onclick="event.stopPropagation(); Tracker.deleteCustomSong('${id}')">×</span>
                    </div>`;
                }
            }
        } else if (libraryTab === 'instruments') {
            const allInst = getAllInstruments();
            
            // Built-in section
            html += `<div class="library-section-header">BUILT-IN</div>`;
            for (let i = 0; i < builtInInstruments.length; i++) {
                const inst = allInst[i];
                const isSelected = currentInstrument === i;
                const icon = inst.type === 'noise' ? '🎲' : inst.type === 'triangle' ? '🔺' : inst.type === 'sine' ? '🌊' : inst.type === 'sawtooth' ? '🪚' : '■';
                html += `<div class="library-item ${isSelected ? 'selected' : ''}" data-inst="${i}">
                    <span class="library-icon">${icon}</span>
                    <span class="library-name">${inst.name}</span>
                    <span class="library-inst-num">${i.toString(16).toUpperCase().padStart(2, '0')}</span>
                </div>`;
            }
            
            // Custom section
            html += `<div class="library-section-header">CUSTOM</div>`;
            for (let i = builtInInstruments.length; i < allInst.length; i++) {
                const inst = allInst[i];
                const isSelected = currentInstrument === i;
                const icon = inst.type === 'noise' ? '🎲' : inst.type === 'triangle' ? '🔺' : inst.type === 'sine' ? '🌊' : inst.type === 'sawtooth' ? '🪚' : '■';
                html += `<div class="library-item custom ${isSelected ? 'selected' : ''}" data-inst="${i}">
                    <span class="library-icon">${icon}</span>
                    <span class="library-name">${inst.name}</span>
                    <span class="library-inst-num">${i.toString(16).toUpperCase().padStart(2, '0')}</span>
                    <span class="library-delete" data-delete-inst="${i}">×</span>
                </div>`;
            }
            
            // New button
            html += `<div class="library-item" id="new-instrument-btn" style="justify-content: center; color: #54bebe;">
                <span>+ New Instrument</span>
            </div>`;
        }
        
        list.innerHTML = html;
        
        // Add click handlers for custom songs
        if (libraryTab === 'patterns') {
            list.querySelectorAll('.library-item.custom').forEach(el => {
                el.onclick = (e) => {
                    if (!e.target.classList.contains('library-delete')) {
                        Tracker.loadCustomSong(el.dataset.id);
                    }
                };
            });
        } else if (libraryTab === 'instruments') {
            list.querySelectorAll('.library-item[data-inst]').forEach(el => {
                el.onclick = (e) => {
                    if (e.target.dataset.deleteInst) {
                        deleteCustomInstrument(parseInt(e.target.dataset.deleteInst));
                        return;
                    }
                    currentInstrument = parseInt(el.dataset.inst);
                    updateLibraryDisplay();
                    updateDisplay();
                    updateEditorPanel();
                };
            });
            
            const newBtn = list.querySelector('#new-instrument-btn');
            if (newBtn) {
                newBtn.onclick = () => createCustomInstrument();
            }
        }
    }
    
    // === INSTRUMENTS ===
    // Original built-ins (never mutated, used for reset)
    const builtInInstruments = [
        { name: '50% Pulse', type: 'pulse', duty: 0.5, attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 },
        { name: '25% Pulse', type: 'pulse', duty: 0.25, attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.05 },
        { name: '12.5% Pulse', type: 'pulse', duty: 0.125, attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.1 },
        { name: 'Triangle', type: 'triangle', attack: 0.001, decay: 0, sustain: 1, release: 0.05 },
        { name: 'Long Noise', type: 'noise', attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.2 },
        { name: 'Short Noise', type: 'noise', attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        { name: 'Zelda Lead', type: 'triangle', attack: 0.001, decay: 0.4, sustain: 0.9, release: 0.5 },
        { name: 'Pow Hit', type: 'noise', attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.04 },
        { name: 'Click', type: 'noise', attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
    ];
    
    // Working copy of built-ins (editable for session, resets on reload)
    let workingInstruments = JSON.parse(JSON.stringify(builtInInstruments));
    
    // Custom instruments (persisted to localStorage)
    let customInstruments = [];
    
    // Combined getter - all code uses this
    function getAllInstruments() {
        return [...workingInstruments, ...customInstruments];
    }
    
    function isBuiltInInstrument(index) {
        return index !== null && index < builtInInstruments.length;
    }
    
    function isCustomInstrument(index) {
        return index !== null && index >= builtInInstruments.length;
    }
    
    function saveCustomInstruments() {
        localStorage.setItem('trackerCustomInstruments', JSON.stringify(customInstruments));
    }
    
    function loadCustomInstruments() {
        const saved = localStorage.getItem('trackerCustomInstruments');
        if (saved) customInstruments = JSON.parse(saved);
    }
    
    function createCustomInstrument(sourceIndex = null) {
        let inst;
        if (sourceIndex !== null) {
            inst = JSON.parse(JSON.stringify(getAllInstruments()[sourceIndex]));
            inst.name = inst.name + ' (copy)';
        } else {
            inst = { name: 'New Instrument', type: 'pulse', duty: 0.5, attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 };
        }
        customInstruments.push(inst);
        saveCustomInstruments();
        updateLibraryDisplay();
        currentInstrument = getAllInstruments().length - 1;
        updateEditorPanel();
        
        // Achievement: Do Not Steal
        setAchievementFlag('createdCustomInstrument', true);
        
        return currentInstrument;
    }
    
    function deleteCustomInstrument(index) {
        const customIndex = index - builtInInstruments.length;
        if (customIndex >= 0 && customIndex < customInstruments.length) {
            customInstruments.splice(customIndex, 1);
            saveCustomInstruments();
            if (currentInstrument === index) currentInstrument = null;
            else if (currentInstrument > index) currentInstrument--;
            updateLibraryDisplay();
            updateEditorPanel();
            return true;
        }
        return false;
    }
    
    function resetBuiltInInstrument(index) {
        if (index < builtInInstruments.length) {
            workingInstruments[index] = JSON.parse(JSON.stringify(builtInInstruments[index]));
            updateEditorPanel();
            updateLibraryDisplay();
        }
    }
    
    // === INIT ===
    function init() {
        patterns[0] = createEmptyPattern();
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Master analyser for spectrogram
        masterAnalyser = audioCtx.createAnalyser();
        masterAnalyser.fftSize = 256;
        masterAnalyser.connect(audioCtx.destination);
        
        // Instrument analyser for oscilloscope
        instrumentAnalyser = audioCtx.createAnalyser();
        instrumentAnalyser.fftSize = 2048;
        instrumentAnalyser.connect(masterAnalyser);
        
        loadUnlockedLibrary();
        loadCustomLibrary();
        loadCustomInstruments();
    }
    
    function createEmptyPattern(length = DEFAULT_ROWS) {
        const rows = [];
        for (let i = 0; i < length; i++) {
            rows.push({
                pulse1: { note: null, octave: null, inst: null, vol: null, fx: null },
                pulse2: { note: null, octave: null, inst: null, vol: null, fx: null },
                triangle: { note: null, octave: null, inst: null, vol: null, fx: null },
                noise: { note: null, octave: null, inst: null, vol: null, fx: null },
            });
        }
        return { rows, length };
    }
    
    // === NOTE HELPERS ===
    function noteToFreq(note, octave) {
        if (!note || note === '---') return null;
        const noteIndex = NOTE_NAMES.indexOf(note.length === 2 ? note : note + '-');
        if (noteIndex === -1) return null;
        const a4 = 440;
        const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
        return a4 * Math.pow(2, semitonesFromA4 / 12);
    }
    
    function formatCell(cell, column) {
        if (!cell) {
            if (column === COL_NOTE) return '---';
            if (column === COL_INST) return '--';
            if (column === COL_VOL) return '-';
            if (column === COL_FX) return '---';
        }
        if (column === COL_NOTE) {
            if (!cell.note) return '---';
            if (cell.note === '===') return '==='; // note off
            return cell.note + (cell.octave !== null ? cell.octave : '-');
        }
        if (column === COL_INST) {
            return cell.inst !== null ? cell.inst.toString(16).toUpperCase().padStart(2, '0') : '--';
        }
        if (column === COL_VOL) {
            return cell.vol !== null ? cell.vol.toString(16).toUpperCase() : '-';
        }
        if (column === COL_FX) {
            return cell.fx || '---';
        }
        return '?';
    }
    
    function parseNoteKey(key) {
        const lower = key.toLowerCase();
        if (KEY_MAP[lower]) {
            const mapped = KEY_MAP[lower];
            return {
                note: mapped.note.length === 1 ? mapped.note + '-' : mapped.note,
                octave: currentOctave + mapped.octave
            };
        }
        return null;
    }
    
    // === PLAYBACK ===
    function play() {
        if (playing) return;
        playing = true;
        currentRow = 0;
        currentPattern = 0;
        const msPerRow = (60000 / bpm) / (speed / 4);
        playInterval = setInterval(() => tick(), msPerRow);
        startVisualizerLoop();
        updateDisplay();
    }
    
    function pause() {
        if (!playing) return;
        playing = false;
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
        }
        updateDisplay();
    }
    
    function stop() {
        releaseSustainedNotes();
        playing = false;
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
        }
        currentRow = 0;
        currentPattern = 0;
        // Visualizer loop will auto-stop when audio fades
        updateDisplay();
    }
    
    function quickStop() {
        releaseSustainedNotes();
        if (playing) pause();
        updateDisplay();
    }
    
    function playRowSustained() {
        releaseSustainedNotes();
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const row = pattern.rows[currentRow];
        for (const ch of CHANNELS) {
            const cell = row[ch];
            if (cell && cell.note && cell.note !== '---' && cell.note !== '===') {
                playNoteSustained(ch, cell);
            }
        }
        // Advance by 1
        currentRow = (currentRow + 1) % pattern.length;
        updateDisplay();
    }
    
    function releaseSustainedNotes() {
        const now = audioCtx?.currentTime || 0;
        for (const note of sustainedNotes) {
            if (note.gain) {
                note.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            }
            if (note.osc) note.osc.stop(now + 0.15);
            if (note.noise) note.noise.stop(now + 0.15);
        }
        sustainedNotes = [];
    }
    
    function tick() {
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const row = pattern.rows[currentRow];
        for (const ch of CHANNELS) {
            const cell = row[ch];
            if (cell && cell.note && cell.note !== '---') {
                playNote(ch, cell);
            }
        }
        currentRow++;
        if (currentRow >= pattern.length) {
            currentRow = 0;
            currentPattern++;
            if (currentPattern >= sequence.length) {
                if (loopMode) {
                    currentPattern = 0;
                } else {
                    // Stop at end
                    currentPattern = sequence.length - 1;
                    currentRow = pattern.length - 1;
                    stop();
                    return;
                }
            }
        }
        if (followMode) updateDisplay();
    }
    
    function playNote(channel, cell) {
        if (!audioCtx) return;
        const freq = noteToFreq(cell.note, cell.octave);
        if (!freq) return;
        const inst = getAllInstruments()[cell.inst || 0] || getAllInstruments()[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        const now = audioCtx.currentTime;
        
        // Per-voice bitcrusher
        const crusher = createBitcrusher(audioCtx);
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 0.5;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            const gain = audioCtx.createGain();
            noise.buffer = buffer;
            noise.connect(crusher);
            crusher.connect(gain);
            gain.connect(masterAnalyser); // Route through master analyser
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume, now + inst.attack);
            gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack + inst.decay);
            gain.gain.linearRampToValueAtTime(0, now + inst.attack + inst.decay + inst.release);
            noise.start(now);
            noise.stop(now + inst.attack + inst.decay + inst.release + 0.1);
            return;
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        // Map instrument type to Web Audio oscillator type
        if (inst.type === 'triangle' || channel === 'triangle') osc.type = 'triangle';
        else if (inst.type === 'sawtooth') osc.type = 'sawtooth';
        else if (inst.type === 'sine') osc.type = 'sine';
        else osc.type = 'square'; // pulse
        osc.frequency.value = freq;
        osc.connect(crusher);
        crusher.connect(gain);
        gain.connect(masterAnalyser); // Route through master analyser
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + inst.attack);
        gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack + inst.decay);
        gain.gain.linearRampToValueAtTime(0, now + inst.attack + inst.decay + inst.release);
        osc.start(now);
        osc.stop(now + inst.attack + inst.decay + inst.release + 0.1);
    }
    
    function playNoteSustained(channel, cell) {
        if (!audioCtx) return;
        const freq = noteToFreq(cell.note, cell.octave);
        if (!freq) return;
        const inst = getAllInstruments()[cell.inst || 0] || getAllInstruments()[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        const now = audioCtx.currentTime;
        const gain = audioCtx.createGain();
        
        // Per-voice bitcrusher
        const crusher = createBitcrusher(audioCtx);
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(crusher);
            crusher.connect(gain);
            gain.connect(masterAnalyser); // Route through master analyser
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack);
            noise.start(now);
            sustainedNotes.push({ noise, gain });
            return;
        }
        
        const osc = audioCtx.createOscillator();
        // Map instrument type to Web Audio oscillator type
        if (inst.type === 'triangle' || channel === 'triangle') osc.type = 'triangle';
        else if (inst.type === 'sawtooth') osc.type = 'sawtooth';
        else if (inst.type === 'sine') osc.type = 'sine';
        else osc.type = 'square'; // pulse
        osc.frequency.value = freq;
        osc.connect(crusher);
        crusher.connect(gain);
        gain.connect(masterAnalyser); // Route through master analyser
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack);
        osc.start(now);
        sustainedNotes.push({ osc, gain });
    }
    
    function previewNote(note, octave) {
        const cell = { note, octave, inst: currentInstrument ?? 0, vol: 15 };
        playNote(CHANNELS[currentChannel], cell);
    }
    
    // Start a held note (proper ADSR: A→D→hold at S)
    function startHeldNote(key, note, octave) {
        if (heldNotes.has(key)) return; // Already held
        if (!audioCtx) return;
        
        const channel = CHANNELS[currentChannel];
        const freq = noteToFreq(note, octave);
        if (!freq) return;
        
        const inst = getAllInstruments()[currentInstrument ?? 0] || getAllInstruments()[0];
        const volume = 0.15; // Full volume
        const now = audioCtx.currentTime;
        
        const crusher = createBitcrusher(audioCtx);
        const gain = audioCtx.createGain();
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 4; // Long buffer for sustain
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(crusher);
            crusher.connect(gain);
            gain.connect(instrumentAnalyser); // Route through analyser
            
            // A→D→S (hold at sustain)
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume, now + inst.attack);
            gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack + inst.decay);
            
            noise.start(now);
            heldNotes.set(key, { noise, gain, inst });
            startVisualizerLoop();
            return;
        }
        
        const osc = audioCtx.createOscillator();
        // Map instrument type to Web Audio oscillator type
        if (inst.type === 'triangle' || channel === 'triangle') osc.type = 'triangle';
        else if (inst.type === 'sawtooth') osc.type = 'sawtooth';
        else if (inst.type === 'sine') osc.type = 'sine';
        else osc.type = 'square'; // pulse
        osc.frequency.value = freq;
        osc.connect(crusher);
        crusher.connect(gain);
        gain.connect(instrumentAnalyser); // Route through analyser
        
        // A→D→S (hold at sustain)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + inst.attack);
        gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack + inst.decay);
        
        osc.start(now);
        heldNotes.set(key, { osc, gain, inst });
        startVisualizerLoop();
        
        // Achievement: polyphony overload (7+ simultaneous notes)
        if (heldNotes.size >= 7) {
            setAchievementFlag('polyphonyOverload', true);
        }
        
        // Achievement: Bloody Tears (sawtooth)
        if (inst.type === 'sawtooth') {
            setAchievementFlag('playedSawtooth', true);
        }
    }
    
    // Release a held note (trigger R envelope)
    function releaseHeldNote(key) {
        const held = heldNotes.get(key);
        if (!held) return;
        
        const now = audioCtx?.currentTime || 0;
        const release = held.inst?.release || 0.1;
        
        // Trigger release envelope
        held.gain.gain.cancelScheduledValues(now);
        held.gain.gain.setValueAtTime(held.gain.gain.value, now);
        held.gain.gain.linearRampToValueAtTime(0.001, now + release);
        
        // Stop oscillator/noise after release
        if (held.osc) held.osc.stop(now + release + 0.05);
        if (held.noise) held.noise.stop(now + release + 0.05);
        
        heldNotes.delete(key);
        // Visualizer loop will auto-stop when audio fades
    }
    
    // Release all held notes
    function releaseAllHeldNotes() {
        for (const key of heldNotes.keys()) {
            releaseHeldNote(key);
        }
    }
    
    // === EDITING ===
    function insertNote(note, octave) {
        if (!editMode) {
            previewNote(note, octave);
            return;
        }
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        
        // If selection exists and ALL selected cells are note columns, fill all
        if (selection && isSelectionAllNoteColumns()) {
            const minRow = Math.min(selection.startRow, selection.endRow);
            const maxRow = Math.max(selection.startRow, selection.endRow);
            const minCh = Math.min(selection.startCh, selection.endCh);
            const maxCh = Math.max(selection.startCh, selection.endCh);
            
            for (let r = minRow; r <= maxRow; r++) {
                const row = pattern.rows[r];
                for (let c = minCh; c <= maxCh; c++) {
                    const ch = CHANNELS[c];
                    row[ch].note = note;
                    row[ch].octave = octave;
                    row[ch].inst = currentInstrument ?? 0;
                    if (row[ch].vol === null) row[ch].vol = 15;
                }
            }
            previewNote(note, octave);
            updateDisplay();
            return;
        }
        
        // Otherwise just current cell
        const row = pattern.rows[currentRow];
        const ch = CHANNELS[currentChannel];
        row[ch].note = note;
        row[ch].octave = octave;
        row[ch].inst = currentInstrument ?? 0;
        if (row[ch].vol === null) row[ch].vol = 15;
        previewNote(note, octave);
        currentRow = (currentRow + 1) % pattern.length;
        updateDisplay();
    }
    
    function isSelectionAllNoteColumns() {
        if (!selection) return false;
        const minCol = Math.min(selection.startCol, selection.endCol);
        const maxCol = Math.max(selection.startCol, selection.endCol);
        // All columns must be COL_NOTE (0)
        return minCol === COL_NOTE && maxCol === COL_NOTE;
    }
    
    function deleteNote() {
        if (!editMode) return;
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const row = pattern.rows[currentRow];
        const ch = CHANNELS[currentChannel];
        if (currentColumn === COL_NOTE) {
            row[ch].note = null;
            row[ch].octave = null;
        } else if (currentColumn === COL_INST) {
            row[ch].inst = null;
        } else if (currentColumn === COL_VOL) {
            row[ch].vol = null;
        } else if (currentColumn === COL_FX) {
            row[ch].fx = null;
        }
        updateDisplay();
    }
    
    function insertNoteOff() {
        if (!editMode) return;
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const row = pattern.rows[currentRow];
        const ch = CHANNELS[currentChannel];
        row[ch].note = '===';
        row[ch].octave = null;
        currentRow = (currentRow + 1) % pattern.length;
        updateDisplay();
    }
    
    function transposeCurrentNote(semitones) {
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        
        // If selection exists, transpose all notes in selection
        if (selection) {
            const minRow = Math.min(selection.startRow, selection.endRow);
            const maxRow = Math.max(selection.startRow, selection.endRow);
            const minCh = Math.min(selection.startCh, selection.endCh);
            const maxCh = Math.max(selection.startCh, selection.endCh);
            
            for (let r = minRow; r <= maxRow; r++) {
                const row = pattern.rows[r];
                for (let c = minCh; c <= maxCh; c++) {
                    const ch = CHANNELS[c];
                    const cell = row[ch];
                    transposeCell(cell, semitones);
                }
            }
            updateDisplay();
            return;
        }
        
        // Otherwise transpose single cell
        const row = pattern.rows[currentRow];
        const ch = CHANNELS[currentChannel];
        const cell = row[ch];
        
        if (transposeCell(cell, semitones)) {
            previewNote(cell.note, cell.octave);
        }
        updateDisplay();
    }
    
    function transposeCell(cell, semitones) {
        if (!cell.note || cell.note === '---' || cell.note === '===') return false;
        
        // Get current note index
        const noteIndex = NOTE_NAMES.indexOf(cell.note.length === 2 ? cell.note : cell.note + '-');
        if (noteIndex === -1) return false;
        
        // Calculate new position
        let totalSemitones = (cell.octave * 12) + noteIndex + semitones;
        
        // Clamp to valid range (C-0 to B-7)
        totalSemitones = Math.max(0, Math.min(95, totalSemitones));
        
        const newOctave = Math.floor(totalSemitones / 12);
        const newNoteIndex = totalSemitones % 12;
        
        cell.note = NOTE_NAMES[newNoteIndex];
        cell.octave = newOctave;
        return true;
    }
    
    // === NAVIGATION ===
    function moveCursor(dRow, dChannel, dColumn, shift = false) {
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        
        // Handle selection
        if (shift && !selection) {
            selection = {
                startRow: currentRow, startCh: currentChannel, startCol: currentColumn,
                endRow: currentRow, endCh: currentChannel, endCol: currentColumn
            };
        }
        
        // Move column within channel
        let newCol = currentColumn + dColumn;
        let newCh = currentChannel;
        let newRow = currentRow + dRow;
        
        // Wrap columns to channels
        while (newCol >= COLUMNS_PER_CHANNEL) {
            newCol -= COLUMNS_PER_CHANNEL;
            newCh++;
        }
        while (newCol < 0) {
            newCol += COLUMNS_PER_CHANNEL;
            newCh--;
        }
        
        // Wrap channels
        if (newCh >= CHANNELS.length) newCh = 0;
        if (newCh < 0) newCh = CHANNELS.length - 1;
        
        // Wrap rows
        if (newRow >= pattern.length) newRow = 0;
        if (newRow < 0) newRow = pattern.length - 1;
        
        currentColumn = newCol;
        currentChannel = newCh;
        currentRow = newRow;
        
        // Update selection end
        if (shift && selection) {
            selection.endRow = currentRow;
            selection.endCh = currentChannel;
            selection.endCol = currentColumn;
        } else if (!shift) {
            selection = null;
        }
        
        updateDisplay();
    }
    
    function selectCell(row, channel, column = 0) {
        currentRow = row;
        currentChannel = channel;
        currentColumn = column;
        selection = null;
        updateDisplay();
        if (trackerElement) trackerElement.focus();
    }
    
    function showHelp() {
        const helpHtml = `
            <div class="tracker-help-overlay" onclick="this.remove()">
                <div class="tracker-help-content" onclick="event.stopPropagation()">
                    <h3>Keyboard Shortcuts</h3>
                    <div class="help-section">
                        <h4>Playback</h4>
                        <div class="help-row"><span class="help-key">Enter</span> Play / Stop</div>
                        <div class="help-row"><span class="help-key">Ctrl+Enter</span> Play row sustained + advance</div>
                        <div class="help-row"><span class="help-key">Space</span> Toggle edit mode</div>
                        <div class="help-row"><span class="help-key">Escape</span> Stop + close</div>
                    </div>
                    <div class="help-section">
                        <h4>Navigation</h4>
                        <div class="help-row"><span class="help-key">↑ ↓</span> Move row</div>
                        <div class="help-row"><span class="help-key">← →</span> Move column</div>
                        <div class="help-row"><span class="help-key">Tab</span> Next column (same channel)</div>
                        <div class="help-row"><span class="help-key">Shift+Arrows</span> Select region</div>
                        <div class="help-row"><span class="help-key">PgUp/PgDn</span> Jump 16 rows</div>
                        <div class="help-row"><span class="help-key">Home/End</span> Jump to start/end</div>
                    </div>
                    <div class="help-section">
                        <h4>Editing (in edit mode)</h4>
                        <div class="help-row"><span class="help-key">Z-M, Q-P</span> Notes (piano layout)</div>
                        <div class="help-row"><span class="help-key">1</span> Note off (===)</div>
                        <div class="help-row"><span class="help-key">0-9, A-F</span> Hex entry (inst/vol)</div>
                        <div class="help-row"><span class="help-key">Delete</span> Clear cell</div>
                        <div class="help-row"><span class="help-key">+/-</span> Transpose semitone</div>
                        <div class="help-row"><span class="help-key">Shift +/-</span> Transpose octave</div>
                        <div class="help-row"><span class="help-key">Ctrl +/-</span> Change input octave</div>
                    </div>
                    <button class="tracker-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
                </div>
            </div>
        `;
        trackerElement.insertAdjacentHTML('beforeend', helpHtml);
    }
    
    function toggleMaximize() {
        isMaximized = !isMaximized;
        const container = trackerElement.closest('.tracker-modal') || trackerElement;
        container.classList.toggle('maximized', isMaximized);
        
        const btn = trackerElement.querySelector('#tracker-maximize');
        if (btn) {
            btn.textContent = isMaximized ? '❐' : '⛶';
            btn.title = isMaximized ? 'Restore' : 'Maximize';
        }
    }
    
    // === DISPLAY ===
    function createUI(container) {
        if (container.classList.contains('tracker')) {
            trackerElement = container;
        } else {
            trackerElement = document.createElement('div');
            trackerElement.className = 'tracker';
            container.appendChild(trackerElement);
        }
        
        trackerElement.innerHTML += `
            <div class="tracker-header">
                <div class="tracker-title">TRACKER</div>
                <div class="tracker-status">
                    <span class="tracker-param" data-param="oct" title="Click to change, scroll to adjust">Oct: <span id="tracker-octave">${currentOctave}</span></span>
                    <span class="tracker-param" data-param="bpm" title="Click to change, scroll to adjust">BPM: <span id="tracker-bpm">${bpm}</span></span>
                    <span class="tracker-param" data-param="pat" title="Click to change, scroll to adjust">Pat: <span id="tracker-pattern">${currentPattern}</span></span>
                    <span class="tracker-param" data-param="inst" title="Click to change, scroll to adjust">Inst: <span id="tracker-inst">${currentInstrument !== null ? currentInstrument.toString(16).toUpperCase().padStart(2, '0') : '--'}</span></span>
                </div>
                <button class="tracker-help-btn" id="tracker-help" title="Keyboard shortcuts">?</button>
                <button class="tracker-help-btn" id="tracker-maximize" title="Maximize">⛶</button>
                <button class="tracker-close" id="tracker-close">×</button>
            </div>
            <div class="tracker-body">
                <div class="tracker-library">
                    <div class="library-tabs">
                        <button class="library-tab active" data-tab="patterns">PAT</button>
                        <button class="library-tab" data-tab="instruments">INST</button>
                    </div>
                    <div class="library-list" id="tracker-library-list"></div>
                </div>
                <div class="tracker-main">
                    <div class="tracker-channel-headers">
                        <div class="tracker-rownum-header"></div>
                        ${CHANNELS.map((ch, i) => `
                            <div class="tracker-channel-header ${i === currentChannel ? 'active' : ''}" data-channel="${i}">
                                ${CHANNEL_NAMES[ch]}
                            </div>
                        `).join('')}
                    </div>
                    <div class="tracker-pattern" id="tracker-pattern-grid"></div>
                </div>
                <div class="tracker-editor">
                    <div class="editor-section">
                        <div class="editor-label">OSCILLOSCOPE</div>
                        <canvas id="tracker-oscilloscope" width="200" height="80"></canvas>
                    </div>
                    <div class="editor-section">
                        <div class="editor-label">SPECTROGRAM</div>
                        <canvas id="tracker-spectrogram" width="200" height="60"></canvas>
                    </div>
                    <div class="editor-section">
                        <div class="editor-label">INSTRUMENT</div>
                        <div class="editor-row">
                            <span class="editor-field-label">Name</span>
                            <input type="text" id="editor-inst-name" class="editor-input" />
                        </div>
                        <div class="editor-row">
                            <span class="editor-field-label">Type</span>
                            <select id="editor-inst-type" class="editor-select">
                                <option value="pulse">Pulse</option>
                                <option value="triangle">Triangle</option>
                                <option value="sawtooth">Sawtooth (VRC6)</option>
                                <option value="sine">Sine (VRC7/N163)</option>
                                <option value="noise">Noise</option>
                            </select>
                        </div>
                        <div class="editor-row" id="editor-duty-row">
                            <span class="editor-field-label">Duty</span>
                            <input type="range" id="editor-inst-duty" min="0.125" max="0.5" step="0.125" class="editor-slider" />
                            <span id="editor-duty-value" class="editor-value">50%</span>
                        </div>
                    </div>
                    <div class="editor-section">
                        <div class="editor-label">ENVELOPE</div>
                        <div class="editor-row">
                            <span class="editor-field-label">Attack</span>
                            <input type="range" id="editor-inst-attack" min="0.001" max="1" step="0.001" class="editor-slider" />
                            <span id="editor-attack-value" class="editor-value">0.01</span>
                        </div>
                        <div class="editor-row">
                            <span class="editor-field-label">Decay</span>
                            <input type="range" id="editor-inst-decay" min="0" max="1" step="0.01" class="editor-slider" />
                            <span id="editor-decay-value" class="editor-value">0.1</span>
                        </div>
                        <div class="editor-row">
                            <span class="editor-field-label">Sustain</span>
                            <input type="range" id="editor-inst-sustain" min="0" max="1" step="0.01" class="editor-slider" />
                            <span id="editor-sustain-value" class="editor-value">70%</span>
                        </div>
                        <div class="editor-row">
                            <span class="editor-field-label">Release</span>
                            <input type="range" id="editor-inst-release" min="0.01" max="2" step="0.01" class="editor-slider" />
                            <span id="editor-release-value" class="editor-value">0.1</span>
                        </div>
                    </div>
                    <div class="editor-section" id="editor-actions">
                        <button class="tracker-btn" id="editor-save-as-new" title="Save as new custom instrument">Save As New</button>
                        <button class="tracker-btn" id="editor-reset" title="Reset to default" style="display: none;">Reset</button>
                        <button class="tracker-btn" id="editor-delete" title="Delete custom instrument" style="display: none;">Delete</button>
                    </div>
                </div>
            </div>
            <div class="tracker-footer">
                <div class="tracker-controls">
                    <button class="tracker-btn" id="tracker-play">▶</button>
                    <button class="tracker-btn" id="tracker-stop">■</button>
                    <button class="tracker-btn" id="tracker-save" title="Save to library">💾</button>
                </div>
                <span class="edit-indicator ${editMode ? 'active' : ''}">EDIT</span>
                <span>Oct: ${currentOctave} [+/-]</span>
                <span>Inst: ${currentInstrument !== null ? currentInstrument.toString(16).toUpperCase().padStart(2, '0') : '--'}</span>
            </div>
        `;
        
        patternElement = trackerElement.querySelector('#tracker-pattern-grid');
        
        // Mouse selection handlers
        patternElement.addEventListener('mousedown', (e) => {
            const cell = e.target.closest('.tracker-cell');
            if (!cell) return;
            
            const row = parseInt(cell.dataset.row);
            const channel = parseInt(cell.dataset.channel);
            const column = parseInt(cell.dataset.column);
            
            isDragging = true;
            currentRow = row;
            currentChannel = channel;
            currentColumn = column;
            selection = {
                startRow: row, startCh: channel, startCol: column,
                endRow: row, endCh: channel, endCol: column
            };
            
            // Select instrument from clicked cell (null if cell has no instrument)
            const pattern = patterns[sequence[currentPattern]];
            if (pattern) {
                const cellData = pattern.rows[row]?.[CHANNELS[channel]];
                currentInstrument = (cellData?.inst !== null && cellData?.inst !== undefined) 
                    ? cellData.inst 
                    : null;
                updateEditorPanel();
                updateLibraryDisplay();
            }
            
            updateDisplay();
        });
        
        patternElement.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const cell = e.target.closest('.tracker-cell');
            if (!cell) return;
            
            const row = parseInt(cell.dataset.row);
            const channel = parseInt(cell.dataset.channel);
            const column = parseInt(cell.dataset.column);
            
            if (selection) {
                selection.endRow = row;
                selection.endCh = channel;
                selection.endCol = column;
                currentRow = row;
                currentChannel = channel;
                currentColumn = column;
                updateDisplay();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // If start == end, clear selection (was just a click)
                if (selection && 
                    selection.startRow === selection.endRow && 
                    selection.startCh === selection.endCh && 
                    selection.startCol === selection.endCol) {
                    selection = null;
                    updateDisplay();
                }
                trackerElement?.focus();
            }
        });
        
        // Event listeners
        trackerElement.querySelector('#tracker-play').onclick = () => play();
        trackerElement.querySelector('#tracker-stop').onclick = () => stop();
        trackerElement.querySelector('#tracker-save').onclick = () => promptSaveCustom();
        
        const closeBtn = trackerElement.querySelector('#tracker-close');
        if (closeBtn) {
            closeBtn.onclick = () => { closeTracker(); };
        }
        
        // Help button
        const helpBtn = trackerElement.querySelector('#tracker-help');
        if (helpBtn) {
            helpBtn.onclick = () => showHelp();
        }
        
        // Maximize button
        const maxBtn = trackerElement.querySelector('#tracker-maximize');
        if (maxBtn) {
            maxBtn.onclick = () => toggleMaximize();
        }
        
        // Clickable/scrollable params
        trackerElement.querySelectorAll('.tracker-param').forEach(el => {
            const param = el.dataset.param;
            
            el.addEventListener('click', () => {
                const current = param === 'oct' ? currentOctave : 
                                param === 'bpm' ? bpm : 
                                param === 'pat' ? currentPattern :
                                param === 'inst' ? currentInstrument : 0;
                const input = prompt(`Enter ${param.toUpperCase()}:`, current);
                if (input !== null) {
                    const val = parseInt(input);
                    if (!isNaN(val)) {
                        if (param === 'oct') currentOctave = Math.max(0, Math.min(7, val));
                        else if (param === 'bpm') bpm = Math.max(30, Math.min(300, val));
                        else if (param === 'pat') currentPattern = Math.max(0, Math.min(sequence.length - 1, val));
                        else if (param === 'inst') {
                            currentInstrument = Math.max(0, Math.min(getAllInstruments().length - 1, val));
                            updateEditorPanel();
                        }
                        updateDisplay();
                    }
                }
            });
            
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -1 : 1;
                if (param === 'oct') currentOctave = Math.max(0, Math.min(7, currentOctave + delta));
                else if (param === 'bpm') bpm = Math.max(30, Math.min(300, bpm + delta * 5));
                else if (param === 'pat') currentPattern = Math.max(0, Math.min(sequence.length - 1, currentPattern + delta));
                else if (param === 'inst') {
                    currentInstrument = Math.max(0, Math.min(getAllInstruments().length - 1, (currentInstrument ?? 0) + delta));
                    updateEditorPanel();
                }
                updateDisplay();
            });
        });
        
        trackerElement.querySelectorAll('.tracker-channel-header').forEach(el => {
            el.onclick = () => {
                currentChannel = parseInt(el.dataset.channel);
                currentColumn = 0;
                updateDisplay();
            };
        });
        
        // Library tab handlers
        trackerElement.querySelectorAll('.library-tab').forEach(el => {
            el.onclick = () => {
                libraryTab = el.dataset.tab;
                trackerElement.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
                el.classList.add('active');
                updateLibraryDisplay();
            };
        });
        
        trackerElement.tabIndex = 0;
        trackerElement.addEventListener('keydown', handleKeyDown);
        trackerElement.addEventListener('keyup', handleKeyUp);
        
        updateDisplay();
        updateLibraryDisplay();
        setupEditorHandlers();
        updateEditorPanel();
        return trackerElement;
    }
    
    function updateDisplay() {
        if (!patternElement) return;
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        
        const visibleRows = 32;
        const halfVisible = Math.floor(visibleRows / 2);
        let startRow = Math.max(0, currentRow - halfVisible);
        let endRow = Math.min(pattern.length, startRow + visibleRows);
        if (endRow - startRow < visibleRows) startRow = Math.max(0, endRow - visibleRows);
        
        let html = '';
        for (let r = startRow; r < endRow; r++) {
            const row = pattern.rows[r];
            const isCurrentRow = r === currentRow;
            const rowClass = isCurrentRow ? (editMode ? 'tracker-row current edit' : 'tracker-row current') : 'tracker-row';
            const rowNumClass = r % 16 === 0 ? 'highlight' : (r % 4 === 0 ? 'beat' : '');
            
            html += `<div class="${rowClass}">`;
            html += `<span class="tracker-rownum ${rowNumClass}">${r.toString(16).toUpperCase().padStart(2, '0')}</span>`;
            
            for (let c = 0; c < CHANNELS.length; c++) {
                const ch = CHANNELS[c];
                const cell = row[ch];
                
                html += `<span class="tracker-channel-cells" data-row="${r}" data-channel="${c}">`;
                for (let col = 0; col < COLUMNS_PER_CHANNEL; col++) {
                    const isCurrentCell = isCurrentRow && c === currentChannel && col === currentColumn;
                    const inSelection = isInSelection(r, c, col);
                    let cellClass = 'tracker-cell';
                    if (col === COL_NOTE) cellClass += ' col-note';
                    else if (col === COL_INST) cellClass += ' col-inst';
                    else if (col === COL_VOL) cellClass += ' col-vol';
                    else if (col === COL_FX) cellClass += ' col-fx';
                    if (isCurrentCell) cellClass += ' current';
                    if (inSelection) cellClass += ' selected';
                    
                    html += `<span class="${cellClass}" data-row="${r}" data-channel="${c}" data-column="${col}">${formatCell(cell, col)}</span>`;
                }
                html += `</span>`;
            }
            html += '</div>';
        }
        patternElement.innerHTML = html;
        
        // Update header
        const octEl = trackerElement.querySelector('#tracker-octave');
        const bpmEl = trackerElement.querySelector('#tracker-bpm');
        const patEl = trackerElement.querySelector('#tracker-pattern');
        const instEl = trackerElement.querySelector('#tracker-inst');
        if (octEl) octEl.textContent = currentOctave;
        if (bpmEl) bpmEl.textContent = bpm;
        if (patEl) patEl.textContent = currentPattern;
        if (instEl) instEl.textContent = currentInstrument !== null ? currentInstrument.toString(16).toUpperCase().padStart(2, '0') : '--';
        
        // Update channel headers
        trackerElement.querySelectorAll('.tracker-channel-header').forEach((el, i) => {
            el.classList.toggle('active', i === currentChannel);
        });
        
        // Update footer
        const footer = trackerElement.querySelector('.tracker-footer');
        if (footer) {
            const hasSustained = sustainedNotes.length > 0;
            const playIcon = playing ? '⏸' : '▶';
            footer.innerHTML = `
                <div class="tracker-controls">
                    <button class="tracker-btn" id="tracker-play">${playIcon}</button>
                    <button class="tracker-btn" id="tracker-stop">■</button>
                    <button class="tracker-btn" id="tracker-save" title="Save to library">💾</button>
                    <button class="tracker-btn ${loopMode ? 'active' : ''}" id="tracker-loop" title="Loop">⟳</button>
                </div>
                <span class="edit-indicator ${editMode ? 'active' : ''}">EDIT</span>
                <span>Oct: ${currentOctave} [+/-]</span>
                <span>Inst: ${currentInstrument !== null ? currentInstrument.toString(16).toUpperCase().padStart(2, '0') : '--'}</span>
                ${hasSustained ? '<span class="sustain-indicator">♫ SUSTAIN</span>' : ''}
            `;
            footer.querySelector('#tracker-play').onclick = () => { if (playing) pause(); else play(); };
            footer.querySelector('#tracker-stop').onclick = () => stop();
            footer.querySelector('#tracker-save').onclick = () => promptSaveCustom();
            footer.querySelector('#tracker-loop').onclick = () => { loopMode = !loopMode; updateDisplay(); };
        }
    }
    
    function updateEditorPanel() {
        if (!trackerElement) return;
        
        const editorSection = trackerElement.querySelector('.tracker-editor');
        
        // Master mode - dim instrument controls
        if (currentInstrument === null) {
            if (editorSection) {
                editorSection.querySelectorAll('.editor-section').forEach((section, i) => {
                    // Keep oscilloscope and spectrogram visible, dim instrument/envelope
                    if (i >= 2) section.style.opacity = '0.3';
                });
            }
            drawStaticOscilloscope();
            drawStaticSpectrogram();
            return;
        }
        
        // Restore opacity when instrument selected
        if (editorSection) {
            editorSection.querySelectorAll('.editor-section').forEach(section => {
                section.style.opacity = '1';
            });
        }
        
        const inst = getAllInstruments()[currentInstrument];
        if (!inst) return;
        
        // Update input values
        const nameEl = trackerElement.querySelector('#editor-inst-name');
        const typeEl = trackerElement.querySelector('#editor-inst-type');
        const dutyEl = trackerElement.querySelector('#editor-inst-duty');
        const dutyRow = trackerElement.querySelector('#editor-duty-row');
        const attackEl = trackerElement.querySelector('#editor-inst-attack');
        const decayEl = trackerElement.querySelector('#editor-inst-decay');
        const sustainEl = trackerElement.querySelector('#editor-inst-sustain');
        const releaseEl = trackerElement.querySelector('#editor-inst-release');
        
        if (nameEl) nameEl.value = inst.name || '';
        if (typeEl) typeEl.value = inst.type || 'pulse';
        if (dutyEl) dutyEl.value = inst.duty || 0.5;
        if (attackEl) attackEl.value = inst.attack || 0.01;
        if (decayEl) decayEl.value = inst.decay || 0.1;
        if (sustainEl) sustainEl.value = inst.sustain || 0.7;
        if (releaseEl) releaseEl.value = inst.release || 0.1;
        
        // Show/hide duty row based on type
        if (dutyRow) dutyRow.style.display = inst.type === 'pulse' ? 'flex' : 'none';
        
        // Update value labels
        updateEditorValueLabels();
        
        // Draw static oscilloscope
        drawStaticOscilloscope();
        drawStaticSpectrogram();
        
        // Update action buttons visibility
        const resetBtn = trackerElement?.querySelector('#editor-reset');
        const deleteBtn = trackerElement?.querySelector('#editor-delete');
        const saveAsNewBtn = trackerElement?.querySelector('#editor-save-as-new');
        
        if (resetBtn) resetBtn.style.display = isBuiltInInstrument(currentInstrument) ? 'inline-block' : 'none';
        if (deleteBtn) deleteBtn.style.display = isCustomInstrument(currentInstrument) ? 'inline-block' : 'none';
        if (saveAsNewBtn) saveAsNewBtn.style.display = currentInstrument !== null ? 'inline-block' : 'none';
    }
    
    function updateEditorValueLabels() {
        if (currentInstrument === null) return;
        const inst = getAllInstruments()[currentInstrument];
        if (!inst) return;
        
        const dutyVal = trackerElement?.querySelector('#editor-duty-value');
        const attackVal = trackerElement?.querySelector('#editor-attack-value');
        const decayVal = trackerElement?.querySelector('#editor-decay-value');
        const sustainVal = trackerElement?.querySelector('#editor-sustain-value');
        const releaseVal = trackerElement?.querySelector('#editor-release-value');
        
        if (dutyVal) dutyVal.textContent = Math.round((inst.duty || 0.5) * 100) + '%';
        if (attackVal) attackVal.textContent = (inst.attack || 0.01).toFixed(3);
        if (decayVal) decayVal.textContent = (inst.decay || 0.1).toFixed(2);
        if (sustainVal) sustainVal.textContent = Math.round((inst.sustain || 0.7) * 100) + '%';
        if (releaseVal) releaseVal.textContent = (inst.release || 0.1).toFixed(2);
    }
    
    function drawStaticOscilloscope() {
        const canvas = trackerElement?.querySelector('#tracker-oscilloscope');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const w = canvas.width;
        const h = canvas.height;
        const midY = h / 2;
        
        // Clear
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);
        
        // Master mode - show flat line with label
        if (currentInstrument === null) {
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(0, midY);
            ctx.lineTo(w, midY);
            ctx.stroke();
            
            ctx.fillStyle = '#555';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('MASTER', w / 2, midY - 10);
            return;
        }
        
        const inst = getAllInstruments()[currentInstrument];
        if (!inst) return;
        
        // Draw center line
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        
        // Draw waveform
        ctx.strokeStyle = '#54bebe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const cycles = 3; // Show 3 cycles
        const duty = inst.duty || 0.5;
        
        if (inst.type === 'noise') {
            // Draw random noise pattern (seeded for consistency)
            let seed = 12345;
            const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
            for (let x = 0; x < w; x++) {
                const y = midY + (random() * 2 - 1) * (h * 0.35);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        } else if (inst.type === 'triangle') {
            // Draw triangle wave
            for (let x = 0; x < w; x++) {
                const phase = (x / w) * cycles;
                const t = phase % 1;
                let y;
                if (t < 0.5) {
                    y = midY - (t * 2) * (h * 0.35);
                } else {
                    y = midY - (2 - t * 2) * (h * 0.35);
                }
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        } else if (inst.type === 'sine') {
            // Draw sine wave
            for (let x = 0; x < w; x++) {
                const phase = (x / w) * cycles * Math.PI * 2;
                const y = midY - Math.sin(phase) * (h * 0.35);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        } else if (inst.type === 'sawtooth') {
            // Draw sawtooth wave
            for (let x = 0; x < w; x++) {
                const phase = (x / w) * cycles;
                const t = phase % 1;
                const y = midY - (t * 2 - 1) * (h * 0.35);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        } else {
            // Draw pulse/square wave
            for (let x = 0; x < w; x++) {
                const phase = (x / w) * cycles;
                const t = phase % 1;
                const y = t < duty ? midY - h * 0.35 : midY + h * 0.35;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    function startVisualizerLoop() {
        if (animationFrameId) return; // Already running
        animationFrameId = requestAnimationFrame(visualizerLoop);
    }
    
    function stopVisualizerLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        // Redraw static
        drawStaticOscilloscope();
        drawStaticSpectrogram();
    }
    
    function visualizerLoop() {
        drawLiveOscilloscope();
        drawLiveSpectrogram();
        
        // Check if audio has faded (no playback, no held notes)
        if (!playing && heldNotes.size === 0) {
            const dataArray = new Uint8Array(masterAnalyser.frequencyBinCount);
            masterAnalyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            
            // If essentially silent, stop the loop
            if (sum < 50) {
                stopVisualizerLoop();
                return;
            }
        }
        
        animationFrameId = requestAnimationFrame(visualizerLoop);
    }
    
    function drawLiveOscilloscope() {
        const canvas = trackerElement?.querySelector('#tracker-oscilloscope');
        if (!canvas || !masterAnalyser) return;
        const ctx = canvas.getContext('2d');
        
        // Use instrument analyser when instrument selected and playing held notes, else master
        const analyser = (currentInstrument !== null && heldNotes.size > 0) 
            ? instrumentAnalyser 
            : masterAnalyser;
        
        const w = canvas.width;
        const h = canvas.height;
        const midY = h / 2;
        
        // Get waveform data
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        // Clear
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);
        
        // Draw center line
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        
        // Draw waveform
        ctx.strokeStyle = '#54bebe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const sliceWidth = w / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0; // 0-2 range
            const y = (v * h) / 2;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            x += sliceWidth;
        }
        
        ctx.stroke();
    }
    
    function drawStaticSpectrogram() {
        const canvas = trackerElement?.querySelector('#tracker-spectrogram');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear with dark background
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);
        
        // Draw baseline
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, h - 1);
        ctx.lineTo(w, h - 1);
        ctx.stroke();
    }
    
    function drawLiveSpectrogram() {
        const canvas = trackerElement?.querySelector('#tracker-spectrogram');
        if (!canvas || !masterAnalyser) return;
        const ctx = canvas.getContext('2d');
        
        // Use instrument analyser when instrument selected and playing held notes, else master
        const analyser = (currentInstrument !== null && heldNotes.size > 0) 
            ? instrumentAnalyser 
            : masterAnalyser;
        
        const w = canvas.width;
        const h = canvas.height;
        
        // Get frequency data
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        // Clear
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);
        
        // Draw bars
        const barWidth = w / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * h;
            
            // Color gradient from cyan to magenta based on frequency
            const hue = 180 + (i / bufferLength) * 60; // 180 (cyan) to 240 (blue) to beyond
            const lightness = 40 + (dataArray[i] / 255) * 30;
            ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
            
            ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth;
        }
    }
    
    function setupEditorHandlers() {
        // Name input
        const nameEl = trackerElement?.querySelector('#editor-inst-name');
        if (nameEl) {
            nameEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].name = e.target.value;
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateLibraryDisplay();
            });
            nameEl.addEventListener('blur', () => trackerElement?.focus());
        }
        
        // Type select
        const typeEl = trackerElement?.querySelector('#editor-inst-type');
        if (typeEl) {
            typeEl.addEventListener('change', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].type = e.target.value;
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                const dutyRow = trackerElement?.querySelector('#editor-duty-row');
                if (dutyRow) dutyRow.style.display = e.target.value === 'pulse' ? 'flex' : 'none';
                drawStaticOscilloscope();
                updateLibraryDisplay();
            });
            typeEl.addEventListener('blur', () => trackerElement?.focus());
        }
        
        // Duty slider
        const dutyEl = trackerElement?.querySelector('#editor-inst-duty');
        if (dutyEl) {
            dutyEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].duty = parseFloat(e.target.value);
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateEditorValueLabels();
                drawStaticOscilloscope();
            });
            dutyEl.addEventListener('change', () => trackerElement?.focus());
        }
        
        // ADSR sliders
        const attackEl = trackerElement?.querySelector('#editor-inst-attack');
        if (attackEl) {
            attackEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].attack = parseFloat(e.target.value);
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateEditorValueLabels();
            });
            attackEl.addEventListener('change', () => trackerElement?.focus());
        }
        
        const decayEl = trackerElement?.querySelector('#editor-inst-decay');
        if (decayEl) {
            decayEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].decay = parseFloat(e.target.value);
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateEditorValueLabels();
            });
            decayEl.addEventListener('change', () => trackerElement?.focus());
        }
        
        const sustainEl = trackerElement?.querySelector('#editor-inst-sustain');
        if (sustainEl) {
            sustainEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].sustain = parseFloat(e.target.value);
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateEditorValueLabels();
            });
            sustainEl.addEventListener('change', () => trackerElement?.focus());
        }
        
        const releaseEl = trackerElement?.querySelector('#editor-inst-release');
        if (releaseEl) {
            releaseEl.addEventListener('input', (e) => {
                if (currentInstrument === null) return;
                getAllInstruments()[currentInstrument].release = parseFloat(e.target.value);
                if (isCustomInstrument(currentInstrument)) saveCustomInstruments();
                updateEditorValueLabels();
            });
            releaseEl.addEventListener('change', () => trackerElement?.focus());
        }
        
        // Action buttons
        const saveAsNewBtn = trackerElement?.querySelector('#editor-save-as-new');
        if (saveAsNewBtn) {
            saveAsNewBtn.onclick = () => {
                if (currentInstrument !== null) createCustomInstrument(currentInstrument);
            };
        }
        
        const resetBtn = trackerElement?.querySelector('#editor-reset');
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (isBuiltInInstrument(currentInstrument)) resetBuiltInInstrument(currentInstrument);
            };
        }
        
        const deleteBtn = trackerElement?.querySelector('#editor-delete');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                if (isCustomInstrument(currentInstrument)) deleteCustomInstrument(currentInstrument);
            };
        }
    }
    
    function isInSelection(row, channel, column) {
        if (!selection) return false;
        const minRow = Math.min(selection.startRow, selection.endRow);
        const maxRow = Math.max(selection.startRow, selection.endRow);
        const minCh = Math.min(selection.startCh, selection.endCh);
        const maxCh = Math.max(selection.startCh, selection.endCh);
        if (row < minRow || row > maxRow) return false;
        if (channel < minCh || channel > maxCh) return false;
        // For columns, only check if same channel bounds
        if (channel === minCh && channel === maxCh) {
            const minCol = Math.min(selection.startCol, selection.endCol);
            const maxCol = Math.max(selection.startCol, selection.endCol);
            return column >= minCol && column <= maxCol;
        }
        return true;
    }
    
    function handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.repeat) return;
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const key = e.key;
        
        // Space = toggle edit mode
        if (key === ' ') {
            e.preventDefault();
            editMode = !editMode;
            updateDisplay();
            return;
        }
        
        // Enter = toggle play/stop
        // Ctrl+Enter = play current row sustained and advance
        if (key === 'Enter') {
            e.preventDefault();
            if (e.ctrlKey) {
                playRowSustained();
            } else if (playing || sustainedNotes.length > 0) {
                stop();
            } else {
                play();
            }
            return;
        }
        
        // Escape = close
        if (key === 'Escape') {
            e.preventDefault();
            quickStop();
            closeTracker();
            return;
        }
        
        // Navigation
        if (key === 'ArrowUp') {
            e.preventDefault();
            moveCursor(-1, 0, 0, e.shiftKey);
            return;
        }
        if (key === 'ArrowDown') {
            e.preventDefault();
            moveCursor(1, 0, 0, e.shiftKey);
            return;
        }
        if (key === 'ArrowLeft') {
            e.preventDefault();
            moveCursor(0, 0, -1, e.shiftKey);
            return;
        }
        if (key === 'ArrowRight') {
            e.preventDefault();
            moveCursor(0, 0, 1, e.shiftKey);
            return;
        }
        
        // Tab = next column in same channel
        if (key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                currentColumn = (currentColumn - 1 + COLUMNS_PER_CHANNEL) % COLUMNS_PER_CHANNEL;
            } else {
                currentColumn = (currentColumn + 1) % COLUMNS_PER_CHANNEL;
            }
            updateDisplay();
            return;
        }
        
        // Page navigation
        if (key === 'PageUp') {
            e.preventDefault();
            currentRow = Math.max(0, currentRow - 16);
            updateDisplay();
            return;
        }
        if (key === 'PageDown') {
            e.preventDefault();
            currentRow = Math.min(pattern.length - 1, currentRow + 16);
            updateDisplay();
            return;
        }
        if (key === 'Home') {
            e.preventDefault();
            currentRow = 0;
            updateDisplay();
            return;
        }
        if (key === 'End') {
            e.preventDefault();
            currentRow = pattern.length - 1;
            updateDisplay();
            return;
        }
        
        // Octave (Ctrl+plus/minus)
        if ((key === '+' || key === '=') && e.ctrlKey) {
            e.preventDefault();
            currentOctave = Math.min(7, currentOctave + 1);
            updateDisplay();
            return;
        }
        if ((key === '-' || key === '_') && e.ctrlKey) {
            e.preventDefault();
            currentOctave = Math.max(0, currentOctave - 1);
            updateDisplay();
            return;
        }
        
        // Transpose current note (+/- semitone, Shift+plus/minus octave)
        if ((key === '+' || key === '=') && !e.ctrlKey) {
            e.preventDefault();
            transposeCurrentNote(e.shiftKey ? 12 : 1);
            return;
        }
        if ((key === '-' || key === '_') && !e.ctrlKey) {
            e.preventDefault();
            transposeCurrentNote(e.shiftKey ? -12 : -1);
            return;
        }
        
        // Delete
        if (key === 'Delete' || key === 'Backspace') {
            e.preventDefault();
            deleteNote();
            return;
        }
        
        // Note entry (only on note column)
        if (currentColumn === COL_NOTE) {
            const noteData = parseNoteKey(key);
            if (noteData) {
                e.preventDefault();
                if (editMode) {
                    insertNote(noteData.note, noteData.octave);
                } else {
                    // Preview with proper ADSR hold
                    startHeldNote(key, noteData.note, noteData.octave);
                }
                return;
            }
            
            // Note off with 1
            if (key === '1') {
                e.preventDefault();
                insertNoteOff();
                return;
            }
        }
        
        // Hex entry for inst/vol columns
        if ((currentColumn === COL_INST || currentColumn === COL_VOL) && editMode) {
            const hex = parseInt(key, 16);
            if (!isNaN(hex)) {
                e.preventDefault();
                const row = pattern.rows[currentRow];
                const ch = CHANNELS[currentChannel];
                if (currentColumn === COL_INST) {
                    // Two digit hex, shift in
                    row[ch].inst = ((row[ch].inst || 0) << 4 | hex) & 0xFF;
                } else if (currentColumn === COL_VOL) {
                    row[ch].vol = hex;
                }
                updateDisplay();
                return;
            }
        }
    }
    
    function handleKeyUp(e) {
        // Release held notes on key up
        releaseHeldNote(e.key);
    }
    
    // === SAVE/LOAD ===
    function exportSong() {
        return JSON.stringify({ patterns, sequence, bpm, speed, instruments: getAllInstruments() });
    }
    
    function importSong(json) {
        try {
            const data = JSON.parse(json);
            if (data.patterns) patterns = data.patterns;
            if (data.sequence) sequence = data.sequence;
            if (data.bpm) bpm = data.bpm;
            if (data.speed) speed = data.speed;
            currentPattern = 0;
            currentRow = 0;
            updateDisplay();
            return true;
        } catch (e) {
            console.error('Failed to import song:', e);
            return false;
        }
    }
    
    // === API ===
    init();
    
    // Get library for external display (modal audio tab)
    function getLibrary() {
        const builtIn = Object.entries(library).map(([id, item]) => ({
            id,
            name: item.name,
            icon: item.icon,
            unlocked: unlockedLibrary.has(id),
            hasPatterns: !!item.patterns,
            custom: false,
            play: () => playLibraryItem(id)
        }));
        
        const custom = Object.entries(customLibrary).map(([id, item]) => ({
            id,
            name: item.name,
            icon: item.icon,
            unlocked: true,
            hasPatterns: true,
            custom: true,
            play: () => playCustomSong(id)
        }));
        
        return [...builtIn, ...custom];
    }
    
    function playCustomSong(id) {
        const item = customLibrary[id];
        if (!item) return false;
        
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const itemBpm = item.bpm || DEFAULT_BPM;
        const itemSpeed = item.speed || DEFAULT_SPEED;
        const msPerRow = (60000 / itemBpm) / (itemSpeed / 4);
        
        let rowIndex = 0;
        for (const patId of item.sequence) {
            const pat = item.patterns[patId];
            if (!pat) continue;
            
            for (let r = 0; r < pat.length; r++) {
                const row = pat.rows[r];
                const time = audioCtx.currentTime + (rowIndex * msPerRow / 1000);
                
                for (const ch of CHANNELS) {
                    const cell = row[ch];
                    if (cell && cell.note && cell.note !== '---' && cell.note !== '===') {
                        scheduleNote(ch, cell, time, item, null, rowIndex);
                    }
                }
                rowIndex++;
            }
        }
        return true;
    }

    return {
        selectCell,
        createUI,
        play,
        pause,
        stop,
        loadFromLibrary,
        loadCustomSong,
        playLibraryItem,
        playCustomSong,
        unlockLibraryItem,
        saveToCustomLibrary,
        deleteCustomSong,
        getLibrary,
        exportSong,
        importSong,
        getAllInstruments,
        createCustomInstrument,
        deleteCustomInstrument,
        resetBuiltInInstrument,
        get playing() { return playing; },
        get currentRow() { return currentRow; },
        get currentPattern() { return currentPattern; },
        setOctave: (o) => { currentOctave = Math.max(0, Math.min(7, o)); updateDisplay(); },
        setBPM: (b) => { bpm = Math.max(30, Math.min(300, b)); updateDisplay(); },
    };
})();
