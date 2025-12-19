// SFX - public API for all sounds
// ONE SOURCE OF TRUTH: Tracker library

const sfx = {
    play: (id) => Tracker.playLibraryItem(id),
    unlock: (id) => Tracker.unlockLibraryItem(id),
    isUnlocked: (id) => Tracker.getLibrary().find(s => s.id === id)?.unlocked ?? false,
    getLibrary: () => Tracker.getLibrary(),
    
    // Named shortcuts for common sounds
    secret: () => Tracker.playLibraryItem('zelda_secret'),
    achievement: () => Tracker.playLibraryItem('achievement'),
    death: () => Tracker.playLibraryItem('death'),
    preDeath: (callback) => {
        Tracker.playLibraryItem('pre_death');
        if (callback) setTimeout(callback, 500);
    },
    pow: () => Tracker.playLibraryItem('pow'),
    screenshot: () => Tracker.playLibraryItem('screenshot'),
    shame: () => Tracker.playLibraryItem('shame'),
    fame: () => Tracker.playLibraryItem('fame'),
    error: () => Tracker.playLibraryItem('error'),
    quit: () => {
        const jingles = ['zelda_secret', 'achievement', 'fame'];
        Tracker.playLibraryItem(jingles[Math.floor(Math.random() * jingles.length)]);
    },
};

// === GLOBAL ALIASES ===
// For backward compatibility with code that calls these directly
// All these just delegate to sfx

function playZeldaSecretJingle() { sfx.secret(); }
function playAchievementSound() { sfx.achievement(); }
function playDeathSound() { sfx.death(); }
function playPreDeathSound(cb) { sfx.preDeath(cb); }
function playPostDeathSound() { sfx.death(); }
function playPowSound() { sfx.pow(); }
function playScreenshotSound() { sfx.screenshot(); }
function playRandomJingle() { sfx.quit(); }
function playPickupSound() { sfx.pow(); } // TODO: add dedicated pickup sound
function playItemPickupSound() { sfx.fame(); } // TODO: add dedicated item pickup sound
function playPedestalSound() { sfx.secret(); } // TODO: add dedicated pedestal sound
