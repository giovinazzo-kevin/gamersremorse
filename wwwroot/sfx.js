// SFX - hooks into Tracker for all sounds

const sfx = {
    secret: () => Tracker.playLibraryItem('zelda_secret'),
    achievement: () => Tracker.playLibraryItem('achievement'),
    death: () => Tracker.playLibraryItem('death'),
    preDeath: (callback) => {
        Tracker.playLibraryItem('pre_death');
        if (callback) setTimeout(callback, 500);
    },
    pow: () => Tracker.playLibraryItem('pow'),
    screenshot: () => Tracker.playLibraryItem('screenshot'),
    
    // Random jingle for quit, etc - pick from unlocked library
    quit: () => {
        // For now just play zelda secret, later can randomize
        Tracker.playLibraryItem('zelda_secret');
    },
    
    // Mood-based jingles for verdicts (TODO: add these to library)
    shame: () => Tracker.playLibraryItem('death'),  // placeholder
    fame: () => Tracker.playLibraryItem('achievement'),  // placeholder
    error: () => Tracker.playLibraryItem('pow'),  // placeholder
};

// Legacy functions for compatibility
function playZeldaSecretJingle() { sfx.secret(); }
function playAchievementSound() { sfx.achievement(); }
function playDeathSound() { sfx.death(); }
function playPreDeathSound(cb) { sfx.preDeath(cb); }
function playPowSound() { sfx.pow(); }
function playScreenshotSound() { sfx.screenshot(); }
function playRandomJingle() { sfx.quit(); }

// Sound library for UI panels (deprecated - use Tracker.library)
const SOUND_LIBRARY = {
    achievement: { name: 'Achievement', icon: '🏆', play: sfx.achievement },
    screenshot: { name: 'Screenshot', icon: '📸', play: sfx.screenshot },
    pow: { name: 'Pow', icon: '💥', play: sfx.pow },
    preDeath: { name: 'Fatal', icon: '💢', play: sfx.preDeath },
    death: { name: 'Death', icon: '💀', play: sfx.death },
    quit: { name: 'Quit', icon: '🚪', play: sfx.quit },
    secret: { name: 'Secret', icon: '✨', play: sfx.secret },
};

// Unlock tracking now handled by Tracker
function unlockSound(id) {
    const trackerIds = {
        'achievement': 'achievement',
        'screenshot': 'screenshot', 
        'pow': 'pow',
        'preDeath': 'pre_death',
        'death': 'death',
        'quit': 'zelda_secret',
        'secret': 'zelda_secret',
    };
    if (trackerIds[id]) {
        Tracker.unlockLibraryItem(trackerIds[id]);
    }
}

function getUnlockedSounds() {
    // Deprecated - use Tracker library directly
    return Object.keys(SOUND_LIBRARY).map(id => ({
        id,
        ...SOUND_LIBRARY[id],
        unlocked: true // All considered unlocked for legacy compat
    }));
}
