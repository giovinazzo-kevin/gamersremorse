// SFX - public API for game sounds
// Routes through Audio manager

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
