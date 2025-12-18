// Note helper - N('C', 4) returns frequency for C4
const NOTE_OFFSETS = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 };
function N(note, octave) {
    const semitone = NOTE_OFFSETS[note] + (octave - 4) * 12;
    return 261.63 * Math.pow(2, semitone / 12); // C4 = 261.63 Hz
}

// Sound library - unlocked sounds for the audio panel
const SOUND_LIBRARY = {
    achievement: { name: 'Achievement', icon: '🏆', play: playAchievementSound },
    screenshot: { name: 'Screenshot', icon: '📸', play: playScreenshotSound },
    pow: { name: 'Pow', icon: '💥', play: playPowSound },
    preDeath: { name: 'Fatal', icon: '💀', play: playPreDeathSound },
    death: { name: 'Death', icon: '🪦', play: playDeathSound },
    quit: { name: 'Quit', icon: '🚪', play: playRandomJingle },
    secret: { name: 'Secret', icon: '✨', play: playZeldaSecretJingle },
};

let unlockedSounds = {};

function loadUnlockedSounds() {
    const saved = localStorage.getItem('unlockedSounds');
    if (saved) unlockedSounds = JSON.parse(saved);
}

function saveUnlockedSounds() {
    localStorage.setItem('unlockedSounds', JSON.stringify(unlockedSounds));
}

function unlockSound(id) {
    if (!unlockedSounds[id]) {
        unlockedSounds[id] = Date.now();
        saveUnlockedSounds();
    }
}

function getUnlockedSounds() {
    return Object.keys(SOUND_LIBRARY).map(id => ({
        id,
        ...SOUND_LIBRARY[id],
        unlocked: !!unlockedSounds[id]
    }));
}

loadUnlockedSounds();

const scales = {
    pentatonic: [0, 2, 4, 7, 9],           // safe, alien, star control
    blues: [0, 3, 5, 6, 7, 10],            // swagger, attitude
    dorian: [0, 2, 3, 5, 7, 9, 10],        // melancholy but moving
    locrian: [0, 1, 3, 5, 6, 8, 10],       // cursed. unstable. zelda dungeon.
    majorPentatonic: [0, 2, 4, 7, 9],      // happy healthy games
    minorPentatonic: [0, 3, 5, 7, 10],     // sad but dignified
    phrygian: [0, 1, 3, 5, 7, 8, 10],      // spanish/metal evil
    wholeTone: [0, 2, 4, 6, 8, 10],        // dreamy, floaty, unsettling
};

const sfx = {
    quit: playRandomJingle,
    secret: playZeldaSecretJingle,
    shame: () => playJingle({ scale: 'locrian', baseFreq: N('E', 3), tempo: 0.7 }),  // hall of shame entry
    fame: () => playJingle({ scale: 'majorPentatonic', baseFreq: N('A', 4), tempo: 1.3 }), // hall of fame
    error: () => playJingle({ scale: 'wholeTone', baseFreq: N('G', 3), tempo: 0.5 }), // API failed, dreamy dissolution
};

function playJingle(opts = {}) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const scale = scales[opts.scale] || scales.pentatonic;
    const baseFreq = opts.baseFreq || 220 + Math.random() * 220;
    const tempoMult = opts.tempo || 1;
    const waves = opts.waves || ['sine', 'triangle', 'square', 'sawtooth'];
    const noteCount = opts.notes || 4 + Math.floor(Math.random() * 9);

    // Delay setup
    const delay = ctx.createDelay();
    const delayGain = ctx.createGain();
    delay.delayTime.value = 0.1 + Math.random() * 0.1;
    delayGain.gain.value = 0.25;
    delay.connect(delayGain);
    delayGain.connect(ctx.destination);

    const baseNoteLength = (0.08 + Math.random() * 0.2) / tempoMult;
    const wave = waves[Math.floor(Math.random() * waves.length)];

    let time = ctx.currentTime;

    for (let i = 0; i < noteCount; i++) {
        const interval = scale[Math.floor(Math.random() * scale.length)];
        const octave = Math.floor(Math.random() * 2) * 12;
        const freq = baseFreq * Math.pow(2, (interval + octave) / 12);

        // Syncopation - randomly shorten or lengthen gaps
        let noteLength = baseNoteLength;
        if (Math.random() < 0.3) {
            // 30% chance of syncopation
            noteLength *= Math.random() < 0.5 ? 0.5 : 1.5; // half or 1.5x
        }

        // Occasional rest
        if (Math.random() < 0.15 && i > 0) {
            time += noteLength * 0.5; // skip a half beat
        }

        // Panner - ping pong
        const panner = ctx.createStereoPanner();
        panner.pan.value = (i % 2 === 0) ? -0.6 : 0.6;

        // Main osc
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
        panner.connect(delay);

        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + noteLength * 0.9);

        osc.start(time);
        osc.stop(time + noteLength);

        time += noteLength;
    }
}

function playRandomJingle() {
    unlockSound('quit');
    playJingle();
}

function playZeldaSecretJingle() {
    unlockSound('secret');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Delay setup
    const delay = ctx.createDelay();
    const delayGain = ctx.createGain();
    delay.delayTime.value = 0.15; // 150ms
    delayGain.gain.value = 0.3; // 30% wet
    delay.connect(delayGain);
    delayGain.connect(ctx.destination);

    const notes = [
        N('G', 5), N('F#', 5), N('Eb', 4), N('A', 4),
        N('G#', 4), N('E', 5), N('G#', 5), N('C', 6),
    ];

    const noteLength = 0.12;

    notes.forEach((freq, i) => {
        const startTime = ctx.currentTime + i * noteLength;

        // Panner - ping pong L/R
        const panner = ctx.createStereoPanner();
        panner.pan.value = (i % 2 === 0) ? -0.6 : 0.6; // alternating L/R

        // Body - triangle
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.value = freq;
        osc1.connect(gain1);
        gain1.connect(panner);
        panner.connect(ctx.destination);
        panner.connect(delay); // also feed delay

        gain1.gain.setValueAtTime(0.18, startTime);
        gain1.gain.setValueAtTime(0.18, startTime + noteLength * 0.75);
        gain1.gain.exponentialRampToValueAtTime(0.01, startTime + noteLength * 5.1);
        osc1.start(startTime);
        osc1.stop(startTime + noteLength * 1.2);

        // Sparkle - saw octave up
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.value = freq;
        osc2.connect(gain2);
        gain2.connect(panner);

        gain2.gain.setValueAtTime(0.04, startTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + noteLength * 0.9);
        osc2.start(startTime);
        osc2.stop(startTime + noteLength);
    });
}

function playAchievementSound() {
    unlockSound('achievement');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
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
        let k = i == 2 ? 0.5 : 1;
        osc.stop(startTime + noteLength * k);
    };
    
    melody1.forEach((freq, i) => {
        const startTime = ctx.currentTime + i * noteLength;
        const volume = 0.2 - (i * 0.03);
        if (freq) playNote(freq, startTime, volume, i);
    });
    
    melody2.forEach((freq, i) => {
        const startTime = ctx.currentTime + i * noteLength;
        const volume = 0.12 - (i * 0.02); // quieter harmony
        if (freq) playNote(freq, startTime, volume, i);
    });
}

function playDeathSound() {
    unlockSound('death');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // SMB death jingle - Right Hand: B F F F E D C e e c
    const rightHand = [
        { freq: N('B', 4), time: 0, dur: 0.15 },
        { freq: N('F', 5), time: 0.18, dur: 0.25 },
        { freq: N('F', 5), time: 0.48, dur: 0.15 },
        { freq: N('F', 5), time: 0.60, dur: 0.15 },
        { freq: N('E', 5), time: 0.78, dur: 0.15 },
        { freq: N('D', 5), time: 0.96, dur: 0.15 },
        { freq: N('C', 5), time: 1.14, dur: 0.2 },
        { freq: N('E', 5), time: 1.38, dur: 0.15 },
        { freq: N('E', 5), time: 1.56, dur: 0.15 },
        { freq: N('C', 5), time: 1.74, dur: 0.4 },
    ];
    
    // Left Hand: G G G A B C G C
    const leftHand = [
        { freq: N('G', 3), time: 0, dur: 0.15 },
        { freq: N('G', 3), time: 0.18, dur: 0.25 },
        { freq: N('G', 3), time: 0.48, dur: 0.15 },
        { freq: N('A', 3), time: 0.60, dur: 0.15 },
        { freq: N('B', 3), time: 0.78, dur: 0.15 },
        { freq: N('C', 4), time: 0.96, dur: 0.2 },
        { freq: N('G', 3), time: 1.38, dur: 0.15 },
        { freq: N('C', 4), time: 1.74, dur: 0.4 },
    ];
    
    playDeathNotes(ctx, rightHand, 0.15);
    playDeathNotes(ctx, leftHand, 0.10);
}

function playPreDeathSound(callback) {
    unlockSound('preDeath');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Fast C Db D - the "hit" sound before death
    const notes = [
        { freq: N('C', 5), time: 0, dur: 0.08 },
        { freq: N('Db', 5), time: 0.08, dur: 0.08 },
        { freq: N('D', 5), time: 0.16, dur: 0.3 },
    ];
    
    playDeathNotes(ctx, notes, 0.15);
    
    // Callback after pre-death jingle
    if (callback) setTimeout(callback, 1000);
}

function playPostDeathSound() {
    unlockSound('death');
    playDeathSound();
}

function playPowSound() {
    unlockSound('pow');

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // NES-style POW - noise burst with pitch envelope
    const noise = ctx.createBufferSource();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    
    // Bitcrushed noise - reduce bit depth
    const bitDepth = 4; // NES-style crunch
    const levels = Math.pow(2, bitDepth);
    for (let i = 0; i < data.length; i++) {
        let sample = Math.random() * 2 - 1;
        sample = Math.round(sample * levels) / levels; // quantize
        data[i] = sample;
    }
    noise.buffer = noiseBuffer;
    
    // Bandpass filter that sweeps down for that "pow" character
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
    
    // Add a low thump - higher pitched
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'square'; // more NES-like
    thump.frequency.setValueAtTime(300, ctx.currentTime);
    thump.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);
    
    thumpGain.gain.setValueAtTime(0.25, ctx.currentTime);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start();
    thump.stop(ctx.currentTime + 0.15);
}

function playDeathNotes(ctx, notes, volume = 0.15) {
    notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = note.freq;
        
        gain.gain.setValueAtTime(volume, ctx.currentTime + note.time);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + note.time + note.dur);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + note.time);
        osc.stop(ctx.currentTime + note.time + note.dur + 0.1);
    });
}

function playScreenshotSound() {
    unlockSound('screenshot');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Click transient - short noise burst
    const noise = ctx.createBufferSource();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = noiseBuffer;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.015);
    
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    
    // Rising tone layer 1 - fundamental
    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'sine';
    sweep.frequency.setValueAtTime(1600, ctx.currentTime);
    sweep.frequency.exponentialRampToValueAtTime(2100, ctx.currentTime + 0.12);
    sweepGain.gain.setValueAtTime(0.15, ctx.currentTime);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);
    sweep.start();
    sweep.stop(ctx.currentTime + 0.45);
    
    // Rising tone layer 2 - ~2nd harmonic
    const sweep2 = ctx.createOscillator();
    const sweep2Gain = ctx.createGain();
    sweep2.type = 'triangle';
    sweep2.frequency.setValueAtTime(3300, ctx.currentTime);
    sweep2.frequency.exponentialRampToValueAtTime(3700, ctx.currentTime + 0.12);
    sweep2Gain.gain.setValueAtTime(0.1, ctx.currentTime);
    sweep2Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    sweep2.connect(sweep2Gain);
    sweep2Gain.connect(ctx.destination);
    sweep2.start();
    sweep2.stop(ctx.currentTime + 0.45);

    // Rising tone layer 3 - ~4th harmonic
    const sweep3 = ctx.createOscillator();
    const sweep3Gain = ctx.createGain();
    sweep3.type = 'sawtooth';
    sweep3.frequency.setValueAtTime(6500, ctx.currentTime);
    sweep3.frequency.exponentialRampToValueAtTime(7200, ctx.currentTime + 0.12);
    sweep3Gain.gain.setValueAtTime(0.06, ctx.currentTime);
    sweep3Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    sweep3.connect(sweep3Gain);
    sweep3Gain.connect(ctx.destination);
    sweep3.start();
    sweep3.stop(ctx.currentTime + 0.45);

    // Rising tone layer 4 - ~5th harmonic
    const sweep4 = ctx.createOscillator();
    const sweep4Gain = ctx.createGain();
    sweep4.type = 'sawtooth';
    sweep4.frequency.setValueAtTime(9900, ctx.currentTime);
    sweep4.frequency.exponentialRampToValueAtTime(10700, ctx.currentTime + 0.12);
    sweep4Gain.gain.setValueAtTime(0.02, ctx.currentTime);
    sweep4Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    sweep4.connect(sweep4Gain);
    sweep4Gain.connect(ctx.destination);
    sweep4.start();
    sweep4.stop(ctx.currentTime + 0.45);
}

