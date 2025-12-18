/* Achievements System - Steam-style unlocks */

const ACHIEVEMENTS = {
    // === BASIC PROGRESSION ===
    first_analysis: {
        id: 'first_analysis',
        title: 'Under the Microscope',
        description: 'Analyze your first game',
        icon: '🔬',
        hidden: false,
        check: (state) => state.analyzedGame
    },
    
    screenshot: {
        id: 'screenshot',
        title: 'Eye of the Beholder',
        description: 'Take a screenshot',
        icon: '📸',
        hidden: false,
        check: (state) => state.triedScreenshot
    },
    
    // === CUSTOMIZATION ===
    dark_mode: {
        id: 'dark_mode',
        title: 'Embrace the Void',
        description: 'Enable dark mode',
        icon: '🌙',
        hidden: false,
        check: (state) => state.darkModeEnabled
    },
    customize_eye: {
        id: 'customize_eye',
        title: 'Accessorizing',
        description: 'Change the eye colors',
        icon: '🎨',
        hidden: false,
        check: (state) => state.customizedEye
    },
    custom_tagline: {
        id: 'custom_tagline',
        title: 'Words in Her Mouth',
        description: 'Set a custom tagline',
        icon: '💬',
        hidden: false,
        check: (state) => state.customTaglineSet
    },
    
    // === SECRET ACHIEVEMENTS ===
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
};

// === PERSISTENCE ===
function loadAchievementState() {
    const saved = localStorage.getItem('achievementState');
    if (saved) {
        const parsed = JSON.parse(saved);
        achievementState = { ...achievementState, ...parsed };
    }
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
    
    // Play sound if available
    if (typeof playAchievementSound === 'function') {
        playAchievementSound();
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

// Check for "checked early" achievement
function onAchievementsViewed() {
    if (Object.keys(achievementState.unlocked).length === 0) {
        achievementState.checkedEarly = true;
        checkAchievements();
    }
}
