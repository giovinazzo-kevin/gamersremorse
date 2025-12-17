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
    shame: () => playJingle({ scale: 'locrian', baseFreq: 165, tempo: 0.7 }),  // hall of shame entry
    fame: () => playJingle({ scale: 'majorPentatonic', baseFreq: 440, tempo: 1.3 }), // hall of fame
    error: () => playJingle({ scale: 'wholeTone', baseFreq: 200, tempo: 0.5 }), // API failed, dreamy dissolution
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
    playJingle();
}

function playZeldaSecretJingle() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Delay setup
    const delay = ctx.createDelay();
    const delayGain = ctx.createGain();
    delay.delayTime.value = 0.15; // 150ms
    delayGain.gain.value = 0.3; // 30% wet
    delay.connect(delayGain);
    delayGain.connect(ctx.destination);

    const notes = [
        783.99, 739.99, 311.13, 440.00,
        415.30, 659.25, 830.61, 1046.50,
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

