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
    let currentInstrument = 0;
    
    let bpm = DEFAULT_BPM;
    let speed = DEFAULT_SPEED;
    let playing = false;
    let playInterval = null;
    let sustainedNotes = [];
    let audioCtx = null;
    
    let editMode = false; // Start NOT in edit mode (FamiTracker style)
    let followMode = true;
    let loopMode = false; // Off by default - stop at end
    
    // Selection (for Shift+arrows)
    let selection = null; // { startRow, startCh, startCol, endRow, endCh, endCol }
    
    let trackerElement = null;
    let patternElement = null;
    
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
            bpm: 400,
            speed: 6,
            delay: { time: 0.08, feedback: 0.5 },
            patterns: {
                0: createPatternFromNotes([
                    // Melody
                    { row: 0, ch: 'pulse1', note: 'A#', octave: 4, inst: 3, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'A-', octave: 5, inst: 3, vol: 14 },
                    { row: 2, ch: 'pulse1', note: 'C-', octave: 6, inst: 3, vol: 13 },
                    // Harmony
                    { row: 0, ch: 'triangle', note: 'C-', octave: 4, inst: 3, vol: 12 },
                    { row: 1, ch: 'triangle', note: 'C-', octave: 5, inst: 3, vol: 11 },
                    { row: 2, ch: 'triangle', note: 'C-', octave: 7, inst: 3, vol: 10 },
                ], 4)
            },
            sequence: [0]
        },
        'death': {
            name: 'Death',
            icon: '💀',
            bpm: 333,
            speed: 6,
            patterns: {
                0: createPatternFromNotes([
                    // Right hand: B F F F E D C _ E E C
                    { row: 0, ch: 'pulse1', note: 'B-', octave: 4, inst: 0, vol: 15 },
                    { row: 1, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 15 },
                    { row: 4, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 14 },
                    { row: 5, ch: 'pulse1', note: 'F-', octave: 5, inst: 0, vol: 14 },
                    { row: 6, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 13 },
                    { row: 8, ch: 'pulse1', note: 'D-', octave: 5, inst: 0, vol: 13 },
                    { row: 9, ch: 'pulse1', note: 'C-', octave: 5, inst: 0, vol: 12 },
                    { row: 11, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 12 },
                    { row: 13, ch: 'pulse1', note: 'E-', octave: 5, inst: 0, vol: 11 },
                    { row: 14, ch: 'pulse1', note: 'C-', octave: 5, inst: 0, vol: 11 },
                    // Left hand: G G G A B C _ G C
                    { row: 0, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 12 },
                    { row: 1, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 12 },
                    { row: 4, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 11 },
                    { row: 5, ch: 'triangle', note: 'A-', octave: 3, inst: 3, vol: 11 },
                    { row: 6, ch: 'triangle', note: 'B-', octave: 3, inst: 3, vol: 11 },
                    { row: 8, ch: 'triangle', note: 'C-', octave: 4, inst: 3, vol: 11 },
                    { row: 11, ch: 'triangle', note: 'G-', octave: 3, inst: 3, vol: 10 },
                    { row: 14, ch: 'triangle', note: 'C-', octave: 4, inst: 3, vol: 10 },
                ], 18)
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
            bpm: 240,
            speed: 6,
            patterns: {
                0: createPatternFromNotes([
                    { row: 0, ch: 'noise', note: 'C-', octave: 4, inst: 5, vol: 15 },
                ], 2)
            },
            sequence: [0]
        },
        'screenshot': {
            name: 'Screenshot',
            icon: '📸',
            bpm: 300,
            speed: 6,
            patterns: {
                0: createPatternFromNotes([
                    // Click + rising sweep
                    { row: 0, ch: 'noise', note: 'C-', octave: 4, inst: 5, vol: 10 },
                    { row: 0, ch: 'pulse1', note: 'G-', octave: 6, inst: 2, vol: 12 },
                    { row: 1, ch: 'pulse1', note: 'A-', octave: 6, inst: 2, vol: 11 },
                    { row: 2, ch: 'pulse1', note: 'B-', octave: 6, inst: 2, vol: 10 },
                ], 4)
            },
            sequence: [0]
        },
    };
    
    // Unlocked library items (by id)
    let unlockedLibrary = new Set(['zelda_secret']); // Start with one unlocked
    
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
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
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
        
        const inst = instruments[cell.inst || 0] || instruments[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        
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
            noise.connect(gain);
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
        osc.type = (channel === 'triangle' || inst.type === 'triangle') ? 'triangle' : 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
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
    
    function updateLibraryDisplay() {
        const list = trackerElement?.querySelector('#tracker-library-list');
        if (!list) return;
        
        let html = '';
        for (const [id, item] of Object.entries(library)) {
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
        list.innerHTML = html;
    }
    
    // === INSTRUMENTS ===
    const instruments = [
        { name: '50% Pulse', type: 'pulse', duty: 0.5, attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 },
        { name: '25% Pulse', type: 'pulse', duty: 0.25, attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.05 },
        { name: '12.5% Pulse', type: 'pulse', duty: 0.125, attack: 0.005, decay: 0.05, sustain: 0.6, release: 0.1 },
        { name: 'Triangle', type: 'triangle', attack: 0.001, decay: 0, sustain: 1, release: 0.05 },
        { name: 'Long Noise', type: 'noise', attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.2 },
        { name: 'Short Noise', type: 'noise', attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        { name: 'Zelda Lead', type: 'triangle', attack: 0.001, decay: 0.4, sustain: 0.9, release: 0.5 },
    ];
    
    // === INIT ===
    function init() {
        patterns[0] = createEmptyPattern();
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        loadUnlockedLibrary();
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
        const inst = instruments[cell.inst || 0] || instruments[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        const now = audioCtx.currentTime;
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 0.5;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            const gain = audioCtx.createGain();
            noise.buffer = buffer;
            noise.connect(gain);
            gain.connect(audioCtx.destination);
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
        osc.type = (channel === 'triangle' || inst.type === 'triangle') ? 'triangle' : 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
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
        const inst = instruments[cell.inst || 0] || instruments[0];
        const volume = (cell.vol !== null ? cell.vol : 15) / 15 * 0.15;
        const now = audioCtx.currentTime;
        const gain = audioCtx.createGain();
        
        if (channel === 'noise' || inst.type === 'noise') {
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack);
            noise.start(now);
            sustainedNotes.push({ noise, gain });
            return;
        }
        
        const osc = audioCtx.createOscillator();
        osc.type = (channel === 'triangle' || inst.type === 'triangle') ? 'triangle' : 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * inst.sustain, now + inst.attack);
        osc.start(now);
        sustainedNotes.push({ osc, gain });
    }
    
    function previewNote(note, octave) {
        const cell = { note, octave, inst: currentInstrument, vol: 15 };
        playNote(CHANNELS[currentChannel], cell);
    }
    
    // === EDITING ===
    function insertNote(note, octave) {
        if (!editMode) {
            previewNote(note, octave);
            return;
        }
        const pattern = patterns[sequence[currentPattern]];
        if (!pattern) return;
        const row = pattern.rows[currentRow];
        const ch = CHANNELS[currentChannel];
        row[ch].note = note;
        row[ch].octave = octave;
        row[ch].inst = currentInstrument;
        if (row[ch].vol === null) row[ch].vol = 15;
        previewNote(note, octave);
        currentRow = (currentRow + 1) % pattern.length;
        updateDisplay();
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
                        <div class="help-row"><span class="help-key">+ / -</span> Octave up/down</div>
                    </div>
                    <button class="tracker-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
                </div>
            </div>
        `;
        trackerElement.insertAdjacentHTML('beforeend', helpHtml);
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
                    <span class="tracker-param" data-param="inst" title="Click to change, scroll to adjust">Inst: <span id="tracker-inst">${currentInstrument.toString(16).toUpperCase().padStart(2, '0')}</span></span>
                </div>
                <button class="tracker-help-btn" id="tracker-help" title="Keyboard shortcuts">?</button>
                <button class="tracker-close" id="tracker-close">×</button>
            </div>
            <div class="tracker-body">
                <div class="tracker-library">
                    <div class="library-header">LIBRARY</div>
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
            </div>
            <div class="tracker-footer">
                <div class="tracker-controls">
                    <button class="tracker-btn" id="tracker-play">▶</button>
                    <button class="tracker-btn" id="tracker-stop">■</button>
                </div>
                <span class="edit-indicator ${editMode ? 'active' : ''}">EDIT</span>
                <span>Oct: ${currentOctave} [+/-]</span>
                <span>Inst: ${currentInstrument.toString(16).toUpperCase().padStart(2, '0')}</span>
            </div>
        `;
        
        patternElement = trackerElement.querySelector('#tracker-pattern-grid');
        
        // Event listeners
        trackerElement.querySelector('#tracker-play').onclick = () => play();
        trackerElement.querySelector('#tracker-stop').onclick = () => stop();
        
        const closeBtn = trackerElement.querySelector('#tracker-close');
        if (closeBtn) {
            closeBtn.onclick = () => { if (typeof closeTracker === 'function') closeTracker(); };
        }
        
        // Help button
        const helpBtn = trackerElement.querySelector('#tracker-help');
        if (helpBtn) {
            helpBtn.onclick = () => showHelp();
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
                        else if (param === 'inst') currentInstrument = Math.max(0, Math.min(instruments.length - 1, val));
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
                else if (param === 'inst') currentInstrument = Math.max(0, Math.min(instruments.length - 1, currentInstrument + delta));
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
        
        trackerElement.tabIndex = 0;
        trackerElement.addEventListener('keydown', handleKeyDown);
        
        updateDisplay();
        updateLibraryDisplay();
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
                    
                    html += `<span class="${cellClass}" data-row="${r}" data-channel="${c}" data-column="${col}" onclick="Tracker.selectCell(${r}, ${c}, ${col})">${formatCell(cell, col)}</span>`;
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
        if (octEl) octEl.textContent = currentOctave;
        if (bpmEl) bpmEl.textContent = bpm;
        if (patEl) patEl.textContent = currentPattern;
        
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
                    <button class="tracker-btn ${loopMode ? 'active' : ''}" id="tracker-loop" title="Loop">⟳</button>
                </div>
                <span class="edit-indicator ${editMode ? 'active' : ''}">EDIT</span>
                <span>Oct: ${currentOctave} [+/-]</span>
                <span>Inst: ${currentInstrument.toString(16).toUpperCase().padStart(2, '0')}</span>
                ${hasSustained ? '<span class="sustain-indicator">♫ SUSTAIN</span>' : ''}
            `;
            footer.querySelector('#tracker-play').onclick = () => { if (playing) pause(); else play(); };
            footer.querySelector('#tracker-stop').onclick = () => stop();
            footer.querySelector('#tracker-loop').onclick = () => { loopMode = !loopMode; updateDisplay(); };
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
            if (typeof closeTracker === 'function') closeTracker();
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
        
        // Octave
        if (key === '+' || key === '=') {
            e.preventDefault();
            currentOctave = Math.min(7, currentOctave + 1);
            updateDisplay();
            return;
        }
        if (key === '-' || key === '_') {
            e.preventDefault();
            currentOctave = Math.max(0, currentOctave - 1);
            updateDisplay();
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
                insertNote(noteData.note, noteData.octave);
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
    
    // === SAVE/LOAD ===
    function exportSong() {
        return JSON.stringify({ patterns, sequence, bpm, speed, instruments });
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
    
    return {
        selectCell,
        createUI,
        play,
        pause,
        stop,
        loadFromLibrary,
        playLibraryItem,
        unlockLibraryItem,
        exportSong,
        importSong,
        get playing() { return playing; },
        get currentRow() { return currentRow; },
        get currentPattern() { return currentPattern; },
        setOctave: (o) => { currentOctave = Math.max(0, Math.min(7, o)); updateDisplay(); },
        setBPM: (b) => { bpm = Math.max(30, Math.min(300, b)); updateDisplay(); },
    };
})();
