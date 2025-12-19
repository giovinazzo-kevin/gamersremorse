/* Achievements System - Steam-style unlocks */

const ACHIEVEMENTS = {
    // === BASIC PROGRESSION ===
    first_achievement: {
        id: 'first_achievement',
        title: 'Yo Dawg',
        description: 'Get any achievement',
        icon: '🥈',
        hidden: true,
        check: (state) => state.anyAchievement
    },
    first_analysis: {
        id: 'first_analysis',
        title: 'I',
        description: 'Analyze your first game',
        icon: '🔬',
        hidden: false,
        check: (state) => state.analyzedGame
    },
    screenshot: {
        id: 'screenshot',
        title: 'You Have To Install CS:S',
        description: 'Take a screenshot',
        icon: '📸',
        hidden: false,
        check: (state) => state.triedScreenshot
    },
    pervert: {
        id: 'pervert',
        title: 'Hide This Game',
        description: 'Look up your favorite genre',
        icon: '🍆',
        hidden: false,
        check: (state) => state.baka
    },
    dead_game: {
        id: 'dead_game',
        title: 'Consolation Prize',
        description: 'Pay respects',
        icon: '🫡',
        hidden: false,
        check: (state) => state.paidRespects
    },
    // === CUSTOMIZATION ===
    dark_mode: {
        id: 'dark_mode',
        title: 'Big Apple, 3AM',
        description: 'Enable dark mode',
        icon: '🍎',
        hidden: false,
        check: (state) => state.darkModeEnabled
    },
    customize_eye: {
        id: 'customize_eye',
        title: 'Noob Check',
        description: 'Change the eye colors',
        icon: '🎨',
        hidden: false,
        check: (state) => state.customizedEye
    },
    lores: {
        id: 'lores',
        title: 'Low Poly Aesthetics',
        description: 'Decrease the LOD',
        icon: '🔍',
        hidden: false,
        check: (state) => state.barCount !== undefined && state.barCount < 15
    },
    hires: {
        id: 'hires',
        title: 'Super Ultra Resolution',
        description: 'Turn the LOD up to 11',
        icon: '🔎',
        hidden: false,
        check: (state) => state.barCount !== undefined && state.barCount > 50
    },
    custom_tagline: {
        id: 'custom_tagline',
        title: 'Mic Spammer',
        description: 'Set a custom tagline',
        icon: '💬',
        hidden: false,
        check: (state) => state.customTaglineSet
    },
    opened_tracker: {
        id: 'opened_tracker',
        title: 'Chiptune Enjoyer',
        description: 'Open the tracker',
        icon: '🎹',
        hidden: false,
        check: (state) => state.openedTracker
    },
    bloody_tears: {
        id: 'bloody_tears',
        title: 'Bloody Tears',
        description: 'Use a sawtooth instrument',
        icon: '🪚',
        hidden: true,
        check: (state) => state.playedSawtooth
    },
    do_not_steal: {
        id: 'do_not_steal',
        title: 'Going By Ear',
        description: 'Create a custom instrument',
        icon: '👂',
        hidden: false,
        check: (state) => state.createdCustomInstrument
    },
    kill_eye: {
        id: 'kill_eye',
        title: 'Dumb Damage',
        description: 'Why would you do that',
        icon: '💢',
        hidden: false,
        check: (state) => state.tookDumbDamage
    },
    yasd: {
        id: 'yasd',
        title: 'YASD',
        description: 'Kill A-Eye',
        icon: '💀',
        hidden: false,
        check: (state) => state.yasd
    },
    // === SECRET ACHIEVEMENTS ===
    gaming_journalist: {
        id: 'gaming_journalist',
        title: 'Gaming Journalist Disclaimer',
        description: 'Press left click to shoot',
        icon: '🎮',
        hidden: true,
        check: (state) => state.gamingJournalist,
    },
    sausages: {
        id: 'sausages',
        title: 'Daddy Would You Like Some Sausages',
        description: 'Discover your latent creative power',
        icon: '🌭',
        hidden: true,
        check: (state) => state.polyphonyOverload
    },
    coomer: {
        id: 'coomer',
        title: 'Eye Play It For The Plot',
        description: 'Make a VERY compelling argument',
        icon: '💦',
        hidden: true,
        check: (state) => state.wasForcedToLook
    },
    sv_cheats: {
        id: 'sv_cheats',
        title: 'Developer Mode',
        description: 'Enable sv_cheats',
        icon: '🔧',
        hidden: true,
        check: (state) => state.svCheatsEnabled
    },
    konami: {
        id: 'konami',
        title: 'The Old Ways',
        description: '↑↑↓↓←→←→BA',
        icon: '🕹️',
        hidden: true,
        check: (state) => state.konamiEntered
    },
    iddqd: {
        id: 'iddqd',
        title: 'God Mode',
        description: 'IDDQD',
        icon: '💀',
        hidden: true,
        check: (state) => state.iddqdEntered
    },
    idkfa: {
        id: 'idkfa',
        title: 'Very Happy Ammo Added',
        description: 'IDKFA',
        icon: '🔫',
        hidden: true,
        check: (state) => state.idkfaEntered
    },
    xyzzy: {
        id: 'xyzzy',
        title: 'Nothing Happens',
        description: 'XYZZY',
        icon: '✨',
        hidden: true,
        check: (state) => state.xyzzyEntered
    },
    impulse_101: {
        id: 'impulse_101',
        title: 'All Weapons',
        description: 'impulse 101',
        icon: '🔶',
        hidden: true,
        check: (state) => state.impulse101
    },
    
    // === META ===
    check_early: {
        id: 'check_early',
        title: 'Checking Early',
        description: 'View achievements with none unlocked',
        icon: '👀',
        hidden: true,
        check: (state) => state.checkedEarly
    },
    completionist: {
        id: 'completionist',
        title: 'Completionist',
        description: 'Unlock all non-secret achievements',
        icon: '🏆',
        hidden: false,
        check: (state) => {
            const nonSecret = Object.values(ACHIEVEMENTS).filter(a => !a.hidden && a.id !== 'completionist' && a.id !== 'true_completionist');
            return nonSecret.every(a => state.unlocked[a.id]);
        }
    },
    true_completionist: {
        id: 'true_completionist',
        title: 'True Completionist',
        description: 'Unlock ALL achievements',
        icon: '👑',
        hidden: true,
        check: (state) => {
            const all = Object.values(ACHIEVEMENTS).filter(a => a.id !== 'true_completionist');
            return all.every(a => state.unlocked[a.id]);
        }
    },
};

// === STATE ===
let achievementState = {
    unlocked: {},           // id -> timestamp
    analyzedGame: false,
    triedScreenshot: false,
    darkModeEnabled: false,
    customizedEye: false,
    customTaglineSet: false,
    svCheatsEnabled: false,
    konamiEntered: false,
    iddqdEntered: false,
    idkfaEntered: false,
    xyzzyEntered: false,
    impulse101: false,
    checkedEarly: false,
    deathCount: 0,
    // barCount intentionally not set - only set when user changes it
};

// === PERSISTENCE ===
function loadAchievementState() {
    const saved = localStorage.getItem('achievementState');
    if (saved) {
        const parsed = JSON.parse(saved);
        achievementState = { ...achievementState, ...parsed };
    }
}

function resetAchievements() {
    const count = Object.keys(achievementState.unlocked).length;
    for (const key in achievementState) {
        if (key === 'unlocked') {
            achievementState.unlocked = {};
        } else {
            achievementState[key] = undefined;
        }
    }
    saveAchievementState();
}

function saveAchievementState() {
    localStorage.setItem('achievementState', JSON.stringify(achievementState));
}

// === UNLOCK LOGIC ===
function checkAchievements() {
    let newUnlocks = [];
    
    for (const achievement of Object.values(ACHIEVEMENTS)) {
        if (achievementState.unlocked[achievement.id]) continue;
        
        if (achievement.check(achievementState)) {
            achievementState.unlocked[achievement.id] = Date.now();
            newUnlocks.push(achievement);
        }
    }
    
    if (newUnlocks.length > 0) {
        saveAchievementState();
        for (const achievement of newUnlocks) {
            showAchievementToast(achievement);
        }
    }
    
    return newUnlocks;
}

function forceUnlock(id) {
    if (!ACHIEVEMENTS[id]) return false;
    if (achievementState.unlocked[id]) return false;
    
    achievementState.unlocked[id] = Date.now();
    saveAchievementState();
    showAchievementToast(ACHIEVEMENTS[id]);
    return true;
}

function unlockAll() {
    const newlyUnlocked = [];
    for (const achievement of Object.values(ACHIEVEMENTS)) {
        if (!achievementState.unlocked[achievement.id]) {
            achievementState.unlocked[achievement.id] = Date.now();
            newlyUnlocked.push(achievement);
        }
    }
    saveAchievementState();
    
    // Show toasts with staggered timing
    newlyUnlocked.forEach((achievement, i) => {
        setTimeout(() => showAchievementToast(achievement), i * 300);
    });
    
    return newlyUnlocked.length;
}

// === TOAST NOTIFICATION ===
let activeToasts = [];

function showAchievementToast(achievement) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
        <div class="achievement-toast-icon">
            <div class="achievement-toast-icon-inner">${achievement.icon}</div>
        </div>
        <div class="achievement-toast-text">
            <div class="achievement-toast-header">Achievement Unlocked!</div>
            <div class="achievement-toast-title">${achievement.title}</div>
        </div>
    `;
    
    // Stack above existing toasts
    const offset = activeToasts.length * 90; // toast height + gap
    toast.style.bottom = `${20 + offset}px`;
    
    activeToasts.push(toast);
    document.body.appendChild(toast);

    playAchievementSound();

    if (!achievementState.anyAchievement) {
        setTimeout(() => {
            setAchievementFlag('anyAchievement', true);
        }, 500);
    }

    // Remove after display time
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
            activeToasts = activeToasts.filter(t => t !== toast);
            // Reposition remaining toasts
            activeToasts.forEach((t, i) => {
                t.style.bottom = `${20 + i * 90}px`;
            });
        }, 400);
    }, 4000);
}

// === STATE SETTERS (call these from other systems) ===
function setAchievementFlag(flag, value = true) {
    if (achievementState[flag] !== value) {
        achievementState[flag] = value;
        checkAchievements();
    }
}

function getAchievementFlag(flag) {
    return achievementState[flag] || false;
}

// === UI ===
function getAchievementStats() {
    const total = Object.keys(ACHIEVEMENTS).length;
    const unlocked = Object.keys(achievementState.unlocked).length;
    const visible = Object.values(ACHIEVEMENTS).filter(a => !a.hidden || achievementState.unlocked[a.id]).length;
    return { total, unlocked, visible };
}

function getAchievementList() {
    const list = [];
    
    for (const achievement of Object.values(ACHIEVEMENTS)) {
        const isUnlocked = !!achievementState.unlocked[achievement.id];
        const showHidden = achievement.hidden && !isUnlocked;
        
        if (showHidden) {
            // Show as locked/hidden
            list.push({
                id: achievement.id,
                title: '???',
                description: 'Hidden achievement',
                icon: '🔒',
                hidden: true,
                unlocked: false,
                unlockedAt: null,
                progress: null,
            });
        } else {
            const progress = achievement.progress ? achievement.progress(achievementState) : null;
            list.push({
                id: achievement.id,
                title: achievement.title,
                description: achievement.description,
                icon: achievement.icon,
                hidden: achievement.hidden,
                unlocked: isUnlocked,
                unlockedAt: achievementState.unlocked[achievement.id] || null,
                progress,
            });
        }
    }
    
    // Sort: unlocked first, then by title
    list.sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return a.title.localeCompare(b.title);
    });
    
    return list;
}

// === IMPULSE 101 ===
function impulse101() {
    if (!achievementState.impulse101) {
        achievementState.impulse101 = true;
        saveAchievementState();
    }
    
    // Unlock all achievements
    const count = unlockAll();
    return count;
}

// === INIT ===
loadAchievementState();
checkAchievements();

// Check for "checked early" achievement
function onAchievementsViewed() {
    if (Object.keys(achievementState.unlocked).length === 0) {
        achievementState.checkedEarly = true;
        checkAchievements();
    }
}
