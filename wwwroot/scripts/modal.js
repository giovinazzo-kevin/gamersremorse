/* Modal JS - HTML/CSS Source Engine UI */

let activeModal = null;
let loading = false;

const UI = {
    bg: '#4c5844',
    borderLight: '#889180',
    borderDark: '#282e22',
    text: '#e0e0e0',
    textDim: '#808080',
    accent: '#d4aa00',
};

// Theme system
let darkMode = false;
let consoleEnabled = false;
let selectionDisabled = false;
let keyBindings = {}; // key -> command string

function setDarkMode(enabled, saveToStorage = true) {
    darkMode = enabled;
    document.body.classList.toggle('dark-mode', enabled);
    
    if (enabled) setAchievementFlag('darkModeEnabled');
    
    // Update Chart.js theme
    const textColor = enabled ? '#ccc' : '#666';
    const gridColor = enabled ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;
    Chart.defaults.scale.grid.color = gridColor;
    Chart.defaults.scale.ticks.color = textColor;
    
    if (chart) chart.update();
    if (velocityChart) velocityChart.update();
    if (languageChart) languageChart.update();
    
     drawTimeline();
    
    if (saveToStorage) {
        const saved = localStorage.getItem('eyeSettings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.darkMode = enabled;
        localStorage.setItem('eyeSettings', JSON.stringify(settings));
    }
}

function isDarkMode() {
    return darkMode;
}

function setConsoleEnabled(enabled, saveToStorage = true) {
    consoleEnabled = enabled;
    
    if (saveToStorage) {
        const saved = localStorage.getItem('eyeSettings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.consoleEnabled = enabled;
        localStorage.setItem('eyeSettings', JSON.stringify(settings));
    }
}

function isConsoleEnabled() {
    return consoleEnabled;
}

// Tab content builders
function buildEyeTab(content, refs) {
    const columns = document.createElement('div');
    columns.className = 'modal-columns';
    
    const leftCol = document.createElement('div');
    leftCol.className = 'modal-col-left';
    
    // Blink toggle
    const blinkRow = document.createElement('label');
    blinkRow.className = 'modal-checkbox-row';
    refs.blinkCheckbox = document.createElement('input');
    refs.blinkCheckbox.type = 'checkbox';
    refs.blinkCheckbox.className = 'modal-checkbox';
    refs.blinkCheckbox.checked = isBlinkingEnabled();
    refs.blinkCheckbox.onchange = () => setBlinkingEnabled(refs.blinkCheckbox.checked);
    blinkRow.appendChild(refs.blinkCheckbox);
    blinkRow.appendChild(document.createTextNode(' Enable blinking'));
    leftCol.appendChild(blinkRow);
    
    // Sleep toggle
    const sleepRow = document.createElement('label');
    sleepRow.className = 'modal-checkbox-row';
    refs.sleepCheckbox = document.createElement('input');
    refs.sleepCheckbox.type = 'checkbox';
    refs.sleepCheckbox.className = 'modal-checkbox';
    refs.sleepCheckbox.checked = isSleepEnabled();
    refs.sleepCheckbox.onchange = () => {
         setSleepEnabled(refs.sleepCheckbox.checked);
    };
    sleepRow.appendChild(refs.sleepCheckbox);
    sleepRow.appendChild(document.createTextNode(' Enable sleeping'));
    leftCol.appendChild(sleepRow);
    
    // Cursor tracking toggle
    const trackingRow = document.createElement('label');
    trackingRow.className = 'modal-checkbox-row';
    refs.trackingCheckbox = document.createElement('input');
    refs.trackingCheckbox.type = 'checkbox';
    refs.trackingCheckbox.className = 'modal-checkbox';
    refs.trackingCheckbox.checked = isCursorTrackingEnabled();
    refs.trackingCheckbox.onchange = () => {
         setCursorTrackingEnabled(refs.trackingCheckbox.checked);
    };
    trackingRow.appendChild(refs.trackingCheckbox);
    trackingRow.appendChild(document.createTextNode(' Enable cursor tracking'));
    leftCol.appendChild(trackingRow);
    
    leftCol.appendChild(document.createElement('br'));
    
    // Upper lid color
    const upperRow = document.createElement('div');
    upperRow.className = 'modal-color-row';
    const upperLabel = document.createElement('span');
    upperLabel.textContent = 'Upper lid';
    upperRow.appendChild(upperLabel);
    refs.upperColor = document.createElement('input');
    refs.upperColor.type = 'color';
    refs.upperColor.className = 'modal-color';
    refs.upperColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-positive').trim();
    refs.upperColor.oninput = () => { 
        document.documentElement.style.setProperty('--color-positive', refs.upperColor.value); 
        updateColorLegend(); 
        if (!loading) setAchievementFlag('customizedEye'); 
    };
    upperRow.appendChild(refs.upperColor);
    leftCol.appendChild(upperRow);
    
    // Lower lid color
    const lowerRow = document.createElement('div');
    lowerRow.className = 'modal-color-row';
    const lowerLabel = document.createElement('span');
    lowerLabel.textContent = 'Lower lid';
    lowerRow.appendChild(lowerLabel);
    refs.lowerColor = document.createElement('input');
    refs.lowerColor.type = 'color';
    refs.lowerColor.className = 'modal-color';
    refs.lowerColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-negative').trim();
    refs.lowerColor.oninput = () => { 
        document.documentElement.style.setProperty('--color-negative', refs.lowerColor.value); 
        updateColorLegend(); 
        if (!loading) setAchievementFlag('customizedEye'); 
    };
    lowerRow.appendChild(refs.lowerColor);
    leftCol.appendChild(lowerRow);
    
    // Eyelash color
    const lashRow = document.createElement('div');
    lashRow.className = 'modal-color-row';
    const lashLabel = document.createElement('span');
    lashLabel.textContent = 'Eyelashes';
    lashRow.appendChild(lashLabel);
    refs.lashColor = document.createElement('input');
    refs.lashColor.type = 'color';
    refs.lashColor.className = 'modal-color';
    refs.lashColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-uncertain').trim();
    refs.lashColor.oninput = () => { 
        document.documentElement.style.setProperty('--color-uncertain', refs.lashColor.value); 
        updateColorLegend(); 
        if (!loading) setAchievementFlag('customizedEye'); 
    };
    lashRow.appendChild(refs.lashColor);
    leftCol.appendChild(lashRow);
    
    leftCol.appendChild(document.createElement('br'));
    
    // Bar count slider
    const barRow = document.createElement('div');
    barRow.className = 'modal-slider-row';
    const barLabel = document.createElement('span');
    barLabel.textContent = 'Bar count';
    barRow.appendChild(barLabel);
    refs.barSlider = document.createElement('input');
    refs.barSlider.type = 'range';
    refs.barSlider.className = 'modal-slider';
    refs.barSlider.min = 5;
    refs.barSlider.max = 50;
    refs.barSlider.value = 20;
    refs.barValue = document.createElement('span');
    refs.barValue.className = 'modal-slider-value';
    refs.barValue.textContent = '20';
    refs.barSlider.oninput = () => {
        refs.barValue.textContent = refs.barSlider.value;
        const val = parseInt(refs.barSlider.value);
        setBarDensity(val);
    };
    barRow.appendChild(refs.barSlider);
    barRow.appendChild(refs.barValue);
    leftCol.appendChild(barRow);
    
    columns.appendChild(leftCol);
    
    // Right column - preview
    const rightCol = document.createElement('div');
    rightCol.className = 'modal-col-right';
    
    const previewLabel = document.createElement('div');
    previewLabel.className = 'modal-label';
    previewLabel.textContent = 'Preview';
    rightCol.appendChild(previewLabel);
    
    const previewBox = document.createElement('div');
    previewBox.className = 'modal-preview';
    
    const eyePreview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    eyePreview.id = 'eye-preview';
    eyePreview.className = 'eye-preview-svg';
    previewBox.appendChild(eyePreview);
    
    const mainEye = document.getElementById('eye');
    if (mainEye) {
        const updatePreview = () => {
            eyePreview.innerHTML = mainEye.innerHTML;
            const w = mainEye.clientWidth;
            const h = mainEye.clientHeight;
            const padding = w * 0.12;
            eyePreview.setAttribute('viewBox', `${-padding} 0 ${w + padding * 2} ${h}`);
            eyePreview.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        };
        updatePreview();
        refs.previewInterval = setInterval(updatePreview, 66);
         setTrackingElement(previewBox);
    }
    
    rightCol.appendChild(previewBox);
    columns.appendChild(rightCol);
    content.appendChild(columns);
}

function buildInterfaceTab(content, refs) {
    const leftCol = document.createElement('div');
    leftCol.className = 'modal-col-left';
    leftCol.style.width = '100%';
    
    // Dark mode toggle
    const darkModeRow = document.createElement('label');
    darkModeRow.className = 'modal-checkbox-row';
    refs.darkModeCheckbox = document.createElement('input');
    refs.darkModeCheckbox.type = 'checkbox';
    refs.darkModeCheckbox.className = 'modal-checkbox';
    refs.darkModeCheckbox.checked = darkMode;
    refs.darkModeCheckbox.onchange = () => setDarkMode(refs.darkModeCheckbox.checked, false);
    darkModeRow.appendChild(refs.darkModeCheckbox);
    darkModeRow.appendChild(document.createTextNode(' Enable dark mode'));
    leftCol.appendChild(darkModeRow);

    // Console toggle
    const consoleRow = document.createElement('label');
    consoleRow.className = 'modal-checkbox-row';
    refs.consoleCheckbox = document.createElement('input');
    refs.consoleCheckbox.type = 'checkbox';
    refs.consoleCheckbox.className = 'modal-checkbox';
    refs.consoleCheckbox.checked = consoleEnabled;
    refs.consoleCheckbox.onchange = () => setConsoleEnabled(refs.consoleCheckbox.checked, false);
    consoleRow.appendChild(refs.consoleCheckbox);
    consoleRow.appendChild(document.createTextNode(' Enable developer console'));
    leftCol.appendChild(consoleRow);

    // Page selection
    const selectionRow = document.createElement('label');
    selectionRow.className = 'modal-checkbox-row';
    refs.selectionCheckbox = document.createElement('input');
    refs.selectionCheckbox.type = 'checkbox';
    refs.selectionCheckbox.className = 'modal-checkbox';
    refs.selectionCheckbox.checked = selectionDisabled;
    refs.selectionCheckbox.onchange = () => setSelectionEnabled(!refs.selectionCheckbox.checked, false);
    selectionRow.appendChild(refs.selectionCheckbox);
    selectionRow.appendChild(document.createTextNode(' Disable text selection on page'));
    leftCol.appendChild(selectionRow);
    
    content.appendChild(leftCol);
}

function buildLockedTab(content) {
    const locked = document.createElement('div');
    locked.className = 'modal-locked-content';
    locked.innerHTML = '<span class="lock-icon">🔒</span><p>Complete achievements to unlock</p>';
    content.appendChild(locked);
}

function buildGraphicsTab(content, refs) {
    const col = document.createElement('div');
    col.className = 'modal-col-left';
    col.style.width = '100%';

    // Shadow quality dropdown
    const shadowRow = document.createElement('div');
    shadowRow.className = 'modal-checkbox-row';
    shadowRow.style.flexDirection = 'column';
    shadowRow.style.alignItems = 'flex-start';
    shadowRow.style.gap = '4px';

    const shadowLabel = document.createElement('span');
    shadowLabel.textContent = 'Shadows';
    shadowRow.appendChild(shadowLabel);

    refs.shadowQuality = document.createElement('select');
    refs.shadowQuality.className = 'modal-input';
    refs.shadowQuality.innerHTML = `
    <option value="off">Disabled</option>
    <option value="low">Low</option>
    <option value="medium">Medium</option>
    <option value="high">High</option>
`;
    refs.shadowQuality.value = Combat.config.shadows;
    refs.shadowQuality.onchange = () => {
        Combat.config.shadows = refs.shadowQuality.value;
        Combat.saveConfig();
    };
    shadowRow.appendChild(refs.shadowQuality);
    col.appendChild(shadowRow);

    // Tear Style dropdown
    const styleRow = document.createElement('div');
    styleRow.className = 'modal-checkbox-row';
    styleRow.style.flexDirection = 'column';
    styleRow.style.alignItems = 'flex-start';
    styleRow.style.gap = '4px';

    const styleLabel = document.createElement('span');
    styleLabel.textContent = 'Tear style';
    styleRow.appendChild(styleLabel);

    refs.tearStyle = document.createElement('select');
    refs.tearStyle.className = 'modal-input';
    refs.tearStyle.innerHTML = `
    <option value="fancy">Fancy</option>
    <option value="simple">Simple</option>
    <option value="minimal">Minimal</option>
`;
    refs.tearStyle.value = Combat.config.tearStyle;
    refs.tearStyle.onchange = () => {
        Combat.config.tearStyle = refs.tearStyle.value;
        Combat.saveConfig();
    };
    styleRow.appendChild(refs.tearStyle);
    col.appendChild(styleRow);

    // Splash checkbox
    const splashRow = document.createElement('label');
    splashRow.className = 'modal-checkbox-row';
    refs.splashCheckbox = document.createElement('input');
    refs.splashCheckbox.type = 'checkbox';
    refs.splashCheckbox.className = 'modal-checkbox';
    refs.splashCheckbox.checked = Combat.config.splash;
    refs.splashCheckbox.onchange = () => {
        Combat.config.splash = refs.splashCheckbox.checked;
        Combat.saveConfig();
    };
    splashRow.appendChild(refs.splashCheckbox);
    splashRow.appendChild(document.createTextNode(' Splash effects'));
    col.appendChild(splashRow);

    // Screen shake slider
    const shakeRow = document.createElement('div');
    shakeRow.className = 'modal-slider-row';

    const shakeLabel = document.createElement('span');
    shakeLabel.textContent = 'Screen shake';
    shakeRow.appendChild(shakeLabel);

    refs.shakeSlider = document.createElement('input');
    refs.shakeSlider.type = 'range';
    refs.shakeSlider.className = 'modal-slider';
    refs.shakeSlider.min = 0;
    refs.shakeSlider.max = 1000;
    refs.shakeSlider.value = (Combat.config.screenShake ?? 1) * 100;

    refs.shakeValue = document.createElement('span');
    refs.shakeValue.className = 'modal-slider-value';
    refs.shakeValue.textContent = refs.shakeSlider.value + '%';

    refs.shakeSlider.oninput = () => {
        refs.shakeValue.textContent = refs.shakeSlider.value + '%';
        const raw = refs.shakeSlider.value / 100; // 0 to 10
        Combat.config.screenShake = raw * raw; // 0 to 100 at max
        ScreenShake.multiplier = Combat.config.screenShake;
        Combat.saveConfig();
    };

    shakeRow.appendChild(refs.shakeSlider);
    shakeRow.appendChild(refs.shakeValue);
    col.appendChild(shakeRow);

    // Depth of field slider
    const dofRow = document.createElement('div');
    dofRow.className = 'modal-slider-row';

    const dofLabel = document.createElement('span');
    dofLabel.textContent = 'Depth of field';
    dofRow.appendChild(dofLabel);

    refs.dofSlider = document.createElement('input');
    refs.dofSlider.type = 'range';
    refs.dofSlider.className = 'modal-slider';
    refs.dofSlider.min = 0;
    refs.dofSlider.max = 100;
    refs.dofSlider.value = (Combat.config.depthOfField ?? 0) * 100;

    refs.dofValue = document.createElement('span');
    refs.dofValue.className = 'modal-slider-value';
    refs.dofValue.textContent = refs.dofSlider.value + '%';

    refs.dofSlider.oninput = () => {
        refs.dofValue.textContent = refs.dofSlider.value + '%';
        const val = refs.dofSlider.value / 100;
        Combat.config.depthOfField = val;
        DepthOfField.setIntensity(val);
        Combat.saveConfig();
    };

    dofRow.appendChild(refs.dofSlider);
    dofRow.appendChild(refs.dofValue);
    col.appendChild(dofRow);

    // Hitstop slider
    const hitstopRow = document.createElement('div');
    hitstopRow.className = 'modal-slider-row';

    const hitstopLabel = document.createElement('span');
    hitstopLabel.textContent = 'Hitstop';
    hitstopRow.appendChild(hitstopLabel);

    refs.hitstopSlider = document.createElement('input');
    refs.hitstopSlider.type = 'range';
    refs.hitstopSlider.className = 'modal-slider';
    refs.hitstopSlider.min = 0;
    refs.hitstopSlider.max = 200;
    refs.hitstopSlider.value = (Combat.config.hitstop ?? 1) * 100;

    refs.hitstopValue = document.createElement('span');
    refs.hitstopValue.className = 'modal-slider-value';
    refs.hitstopValue.textContent = refs.hitstopSlider.value + '%';

    refs.hitstopSlider.oninput = () => {
        refs.hitstopValue.textContent = refs.hitstopSlider.value + '%';
        Combat.config.hitstop = refs.hitstopSlider.value / 100;
        Combat.saveConfig();
    };

    hitstopRow.appendChild(refs.hitstopSlider);
    hitstopRow.appendChild(refs.hitstopValue);
    col.appendChild(hitstopRow);

    content.appendChild(col);
}

function buildAchievementsTab(content) {
    onAchievementsViewed();

    const container = document.createElement('div');
    container.className = 'achievements-container';

    const stats = getAchievementStats();
    const header = document.createElement('div');
    header.className = 'achievements-header';
    header.innerHTML = `
        <span>Achievements</span>
        <span class="achievements-count">${stats.unlocked} / ${stats.visible}</span>
    `;
    container.appendChild(header);

    const list = getAchievementList();

    // Split into categories
    const unlocked = list.filter(a => a.unlocked);
    const visibleLocked = list.filter(a => !a.hidden && !a.unlocked);
    const hiddenLocked = list.filter(a => a.hidden && !a.unlocked);

    // Render unlocked achievements
    for (const ach of unlocked) {
        container.appendChild(buildAchievementItem(ach));
    }

    // Render locked (visible) section
    if (visibleLocked.length > 0) {
        const lockedHeader = document.createElement('div');
        lockedHeader.className = 'achievements-section-header';
        lockedHeader.textContent = 'LOCKED ACHIEVEMENTS';
        container.appendChild(lockedHeader);

        for (const ach of visibleLocked) {
            container.appendChild(buildAchievementItem(ach));
        }
    }

    // Render hidden section if any remain
    if (hiddenLocked.length > 0) {
        const hiddenHeader = document.createElement('div');
        hiddenHeader.className = 'achievements-section-header';
        hiddenHeader.textContent = 'HIDDEN ACHIEVEMENTS';
        container.appendChild(hiddenHeader);

        const hiddenSection = document.createElement('div');
        hiddenSection.className = 'achievement-item hidden-summary';
        hiddenSection.innerHTML = `
        <div class="achievement-icon">?</div>
        <div class="achievement-info">
            <div class="achievement-title">${hiddenLocked.length} hidden achievement${hiddenLocked.length !== 1 ? 's' : ''} remaining</div>
            <div class="achievement-desc">Details for each achievement will be revealed once unlocked</div>
        </div>
    `;
        container.appendChild(hiddenSection);
    }

    content.appendChild(container);
}

function buildAchievementItem(ach) {
    const item = document.createElement('div');
    item.className = 'achievement-item';
    if (!ach.unlocked) item.classList.add('locked');

    let progressHtml = '';
    if (ach.progress && !ach.unlocked) {
        const pct = Math.min(100, (ach.progress.current / ach.progress.target) * 100);
        progressHtml = `
            <div class="achievement-progress">
                <div class="achievement-progress-bar" style="width: ${pct}%"></div>
            </div>
            <div class="achievement-desc">${ach.progress.current.toLocaleString()} / ${ach.progress.target.toLocaleString()}</div>
        `;
    }

    let unlockedHtml = '';
    if (ach.unlocked && ach.unlockedAt) {
        const date = new Date(ach.unlockedAt);
        unlockedHtml = `<div class="achievement-unlocked">✓ ${date.toLocaleDateString()}</div>`;
    }

    item.innerHTML = `
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-info">
            <div class="achievement-title">${ach.title}</div>
            <div class="achievement-desc">${ach.description}</div>
            ${progressHtml}
        </div>
        ${unlockedHtml}
    `;

    return item;
}

function buildAudioTab(content) {
    const container = document.createElement('div');
    container.className = 'audio-container';
    
    const header = document.createElement('div');
    header.className = 'audio-header';
    header.innerHTML = `
        <span>Sound Test</span>
        <span class="audio-hint">Discover sounds by using the site</span>
    `;
    container.appendChild(header);
    
    // ONE SOURCE OF TRUTH: Tracker library
    const sounds = Tracker.getLibrary();
    
    // Split into categories
    const effects = sounds.filter(s => !s.hasPatterns && !s.custom);
    const patterns = sounds.filter(s => s.hasPatterns && !s.custom);
    const custom = sounds.filter(s => s.custom);
    
    // EFFECTS section (synths)
    if (effects.length > 0) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'achievements-section-header';
        sectionHeader.textContent = 'EFFECTS';
        container.appendChild(sectionHeader);
        
        for (const sound of effects) {
            container.appendChild(buildAudioItem(sound));
        }
    }
    
    // PATTERNS section (built-in patterns)
    if (patterns.length > 0) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'achievements-section-header';
        sectionHeader.textContent = 'PATTERNS';
        container.appendChild(sectionHeader);
        
        for (const sound of patterns) {
            container.appendChild(buildAudioItem(sound));
        }
    }
    
    // CUSTOM section (user-created) - show if has custom sounds OR achievement unlocked
    const trackerUnlocked = getAchievementFlag('openedTracker');
    if (custom.length > 0 || trackerUnlocked) {
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'achievements-section-header';
        sectionHeader.textContent = 'CUSTOM';
        container.appendChild(sectionHeader);
        
        if (custom.length > 0) {
            for (const sound of custom) {
                container.appendChild(buildAudioItem(sound, true));
            }
        } else {
            const hint = document.createElement('div');
            hint.className = 'audio-item';
            hint.innerHTML = `
                <div class="audio-icon">🎹</div>
                <div class="audio-name" style="color: #808080; font-style: italic;">Create sounds in the tracker</div>
                <button class="modal-btn">🎹</button>
            `;
            hint.querySelector('.modal-btn').onclick = () => {
                closeModal();
                openTracker();
            };
            container.appendChild(hint);
        }
    }
    
    content.appendChild(container);
}

function buildAudioItem(sound, showDelete = false) {
    const item = document.createElement('div');
    item.className = 'audio-item' + (sound.unlocked ? '' : ' locked');
    
    if (sound.unlocked) {
        item.innerHTML = `
            <div class="audio-icon">${sound.icon}</div>
            <div class="audio-name">${sound.name}</div>
            ${showDelete ? '<button class="modal-btn audio-delete">×</button>' : ''}
            ${sound.hasPatterns ? '<button class="modal-btn audio-edit">✎</button>' : ''}
            <button class="modal-btn audio-play">▶</button>
        `;
        item.querySelector('.audio-play').onclick = () => sound.play();
        if (sound.hasPatterns) {
            item.querySelector('.audio-edit').onclick = () => {
                if (sound.custom) {
                    Tracker.loadCustomSong(sound.id);
                } else {
                    Tracker.loadFromLibrary(sound.id);
                }
                closeModal();
                openTracker();
            };
        }
        if (showDelete) {
            item.querySelector('.audio-delete').onclick = () => {
                if (confirm(`Delete "${sound.name}"?`)) {
                    Tracker.deleteCustomSong(sound.id);
                    // Rebuild the tab
                    const content = item.closest('.modal-content');
                    if (content) {
                        content.innerHTML = '';
                        buildAudioTab(content);
                    }
                }
            };
        }
    } else {
        item.innerHTML = `
            <div class="audio-icon">🔒</div>
            <div class="audio-name">???</div>
        `;
    }
    
    return item;
}

function openModal(title, options = {}) {
    if (activeModal) closeModal();

    const w = options.width || 500;
    const h = options.height || 400;
    const tabs = options.tabs || ['Eye', 'Audio', 'Interface', '???', '???'];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

    const modal = document.createElement('div');
    modal.className = 'source-modal';
    modal.style.width = w + 'px';
    modal.style.height = h + 'px';

    const titleBar = document.createElement('div');
    titleBar.className = 'modal-titlebar';
    
    const titleText = document.createElement('span');
    titleText.className = 'modal-title';
    titleText.textContent = title;
    titleBar.appendChild(titleText);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = 'x';
    closeBtn.onclick = closeModal;
    titleBar.appendChild(closeBtn);

    modal.appendChild(titleBar);

    const tabBar = document.createElement('div');
    tabBar.className = 'modal-tabs';

    const content = document.createElement('div');
    content.className = 'modal-content';
    
    const refs = {};
    
    const switchTab = (tabName, tabEl) => {
        tabBar.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        content.innerHTML = '';
        
        if (tabName === 'Eye') buildEyeTab(content, refs);
        else if (tabName === 'Interface') buildInterfaceTab(content, refs);
        else if (tabName === 'Achievements') buildAchievementsTab(content);
        else if (tabName === 'Graphics') buildGraphicsTab(content, refs);
        else if (tabName === 'Audio') {
            buildAudioTab(content);
        } else if (tabName === '???') buildLockedTab(content);
    };

    tabs.forEach((tab, i) => {
        const isActive = i === 0;
        const isLocked = tab === '???';

        const tabEl = document.createElement('button');
        tabEl.className = 'modal-tab';
        if (isActive) tabEl.classList.add('active');
        if (isLocked) tabEl.classList.add('locked');

        const tabText = document.createElement('span');
        tabText.textContent = tab;
        tabEl.appendChild(tabText);

        if (isLocked) {
            const lock = document.createElement('span');
            lock.className = 'tab-lock';
            lock.textContent = '🔒';
            tabEl.appendChild(lock);
        }
        
        tabEl.onclick = () => { if (!isLocked || tab === '???') switchTab(tab, tabEl); };
        tabBar.appendChild(tabEl);
    });

    modal.appendChild(tabBar);
    buildEyeTab(content, refs);
    modal.appendChild(content);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'modal-bottom-row';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
        const settings = {
            blinkEnabled: refs.blinkCheckbox?.checked ?? true,
            sleepEnabled: refs.sleepCheckbox?.checked ?? true,
            trackingEnabled: refs.trackingCheckbox?.checked ?? true,
            darkMode: refs.darkModeCheckbox?.checked ?? darkMode,
            consoleEnabled: refs.consoleCheckbox?.checked ?? consoleEnabled,
            selectionDisabled: refs.selectionCheckbox?.checked ?? selectionDisabled,
            upperColor: refs.upperColor?.value || '#54bebe',
            lowerColor: refs.lowerColor?.value || '#c80064',
            lashColor: refs.lashColor?.value || '#666666',
            barCount: parseInt(refs.barSlider?.value || 20),
        };
        localStorage.setItem('eyeSettings', JSON.stringify(settings));
    };
    bottomRow.appendChild(saveBtn);
    
    const loadBtn = document.createElement('button');
    loadBtn.className = 'modal-btn';
    loadBtn.textContent = 'Load';
    loadBtn.onclick = () => {
        const saved = localStorage.getItem('eyeSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            loading = true;
            if (refs.blinkCheckbox) { refs.blinkCheckbox.checked = settings.blinkEnabled !== false; refs.blinkCheckbox.onchange(); }
            if (refs.sleepCheckbox) { refs.sleepCheckbox.checked = settings.sleepEnabled !== false; refs.sleepCheckbox.onchange(); }
            if (refs.trackingCheckbox) { refs.trackingCheckbox.checked = settings.trackingEnabled !== false; refs.trackingCheckbox.onchange(); }
            if (refs.darkModeCheckbox) refs.darkModeCheckbox.checked = settings.darkMode || false;
            if (refs.consoleCheckbox) refs.consoleCheckbox.checked = settings.consoleEnabled || false;
            if (refs.selectionCheckbox) refs.selectionCheckbox.checked = settings.selectionDisabled || !isSelectionEnabled();
            if (refs.upperColor) { refs.upperColor.value = settings.upperColor || '#54bebe'; refs.upperColor.oninput(); }
            if (refs.lowerColor) { refs.lowerColor.value = settings.lowerColor || '#c80064'; refs.lowerColor.oninput(); }
            if (refs.lashColor) { refs.lashColor.value = settings.lashColor || '#666666'; refs.lashColor.oninput(); }
            if (refs.barSlider && refs.barValue) { refs.barSlider.value = settings.barCount; refs.barValue.textContent = settings.barCount; refs.barSlider.oninput(); }
            setDarkMode(settings.darkMode || false, false);
            setConsoleEnabled(settings.consoleEnabled || false, false);
            setSelectionEnabled(!(settings.selectionDisabled || false), false);
            loading = false;
        }
    };
    bottomRow.appendChild(loadBtn);
    
    const resetBtn = document.createElement('button');
    resetBtn.className = 'modal-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.onclick = () => {
        if (refs.blinkCheckbox) { refs.blinkCheckbox.checked = true; refs.blinkCheckbox.onchange(); }
        if (refs.sleepCheckbox) { refs.sleepCheckbox.checked = true; refs.sleepCheckbox.onchange(); }
        if (refs.trackingCheckbox) { refs.trackingCheckbox.checked = true; refs.trackingCheckbox.onchange(); }
        if (refs.darkModeCheckbox) refs.darkModeCheckbox.checked = false;
        if (refs.consoleCheckbox) refs.consoleCheckbox.checked = false;
        if (refs.upperColor) { refs.upperColor.value = '#54bebe'; refs.upperColor.oninput(); }
        if (refs.lowerColor) { refs.lowerColor.value = '#c80064'; refs.lowerColor.oninput(); }
        if (refs.lashColor) { refs.lashColor.value = '#666666'; refs.lashColor.oninput(); }
        if (refs.barSlider && refs.barValue) { refs.barSlider.value = 20; refs.barValue.textContent = '20'; refs.barSlider.oninput(); }
        setDarkMode(false, false);
        setConsoleEnabled(false, false);
        setSelectionEnabled(true);
    };
    bottomRow.appendChild(resetBtn);
    
    modal.appendChild(bottomRow);
    overlay.appendChild(modal);
    overlay.refs = refs;
    document.body.appendChild(overlay);
    activeModal = overlay;
    
    if (!window._settingsLoadedOnce) { loadBtn.onclick(); window._settingsLoadedOnce = true; }
}

function closeModal() {
    if (activeModal) {
        if (activeModal.refs?.previewInterval) clearInterval(activeModal.refs.previewInterval);
         clearTrackingElement();
        activeModal.remove();
        activeModal = null;
    }
}

function openSettings() {
    const hasGraphics = getAchievementFlag('combatUnlocked');
    const tabs = ['Eye', 'Achievements', 'Audio', hasGraphics ? 'Graphics' : '???', 'Interface', '???'];
    openModal('Options', { width: 640, height: 480, tabs });
}

// === CONSOLE ===
let consoleVisible = false;
let consoleElement = null;
let consoleHistory = [];
let historyIndex = -1;

// Command registry
const commands = {
    help: {
        description: 'Show this help',
        execute: () => {
            consolePrint('Available commands:');
            for (const [name, cmd] of Object.entries(commands)) {
                if (!cmd.hidden) {
                    const padding = ' '.repeat(Math.max(0, 16 - name.length));
                    consolePrint(`  ${name}${padding} - ${cmd.description}`);
                }
            }
        }
    },
    clear: {
        description: 'Clear console',
        execute: () => {
            consoleElement.querySelector('.console-output').innerHTML = '';
        }
    },
    echo: {
        description: 'Print text',
        execute: (args) => consolePrint(args.join(' '))
    },
    tagline: {
        description: 'Get/set tagline ("clear" to reset)',
        execute: (args) => {
            if (args.length === 0) {
                const current = getCustomTagline();
                if (current !== null) {
                    consolePrint('tagline = "' + current + '" (custom)');
                } else {
                    const el = document.getElementById('tagline');
                    consolePrint('tagline = "' + (el ? el.textContent : '') + '" (random)');
                }
            } else if (args[0].toLowerCase() === 'clear' || args[0].toLowerCase() === 'reset') {
                 clearCustomTagline();
                consolePrint('Tagline reset to random.');
            } else {
                const text = args.join(' ');
                 setCustomTagline(text);
                 setAchievementFlag('customTaglineSet');
                consolePrint('Tagline set to: "' + text + '"');
            }
        }
    },
    eye_blink: {
        description: 'Trigger blink',
        execute: () => {
            blink();
            consolePrint('Blink triggered.');
        }
    },
    eye_expression: {
        description: 'Set expression',
        execute: (args) => {
            if (args[0]) {
                setExpression(args[0]);
                consolePrint('Expression set to: ' + args[0]);
            } else {
                consolePrint('Usage: eye_expression <name>');
                consolePrint('Available: ' + Object.keys(expressions).join(', '));
            }
        }
    },
    bar_count: {
        description: 'Set eye bar count',
        execute: (args) => {
            const count = parseInt(args[0]);
            if (isNaN(count) || count < 1) {
                return 'Usage: bar_count <number>';
            }
            setBarDensity(count, state.gapRatio);
            return `Bar count set to ${count}`;
        }
    },
    quit: {
        description: 'Quit to desktop',
        execute: () => {  quitToDesktop(); }
    },
    save: {
        description: 'Save console settings',
        execute: () => {
            const settings = {
                tagline: getCustomTagline(),
                svCheats: isSvCheats(),
                bindings: keyBindings,
            };
            localStorage.setItem('consoleSettings', JSON.stringify(settings));
            consolePrint('Console settings saved.', 'success');
        }
    },
    load: {
        description: 'Load console settings',
        execute: () => {
            const saved = localStorage.getItem('consoleSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.tagline) setCustomTagline(settings.tagline);
                if (settings.svCheats) setSvCheats(true);
                if (settings.bindings) keyBindings = settings.bindings;
                consolePrint('Console settings loaded.', 'success');
            } else consolePrint('No saved console settings found.');
        }
    },
    // Hidden commands
    bind: {
        description: 'Bind a key to a command',
        execute: (args) => {
            if (args.length === 0) {
                consolePrint('Usage: bind <key> <command>');
                consolePrint('Example: bind f eye_expression flustered');
            } else if (args.length === 1) {
                const key = args[0].toLowerCase();
                if (keyBindings[key]) {
                    consolePrint(`"${key}" = "${keyBindings[key]}"`);
                } else {
                    consolePrint(`"${key}" is not bound`);
                }
            } else {
                const key = args[0].toLowerCase();
                const command = args.slice(1).join(' ');
                keyBindings[key] = command;
                consolePrint(`"${key}" = "${command}"`);
            }
        }
    },
    unbind: {
        description: 'Unbind a key',
        execute: (args) => {
            if (args.length === 0) {
                consolePrint('Usage: unbind <key>');
            } else {
                const key = args[0].toLowerCase();
                if (keyBindings[key]) {
                    delete keyBindings[key];
                    consolePrint(`Unbound "${key}"`);
                } else {
                    consolePrint(`"${key}" is not bound`);
                }
            }
        }
    },
    bindlist: {
        description: 'List all key bindings',
        execute: () => {
            const keys = Object.keys(keyBindings);
            if (keys.length === 0) {
                consolePrint('No bindings.');
            } else {
                for (const key of keys) {
                    consolePrint(`"${key}" = "${keyBindings[key]}"`);
                }
            }
        }
    },
    reset_achievements: {
        description: 'Reset all achievements',
        execute: () => {
            resetAchievements();
            consolePrint('Poof.');
        }
    },
    sv_cheats: {
        description: 'Enable/disable cheats',
        hidden: true,
        execute: (args) => {
            if (args[0] === '1') {
                 setSvCheats(true);
                 setAchievementFlag('svCheatsEnabled');
                consolePrint('sv_cheats enabled.', 'success');
            } else if (args[0] === '0') {
                 setSvCheats(false);
                consolePrint('sv_cheats disabled.');
            } else {
                consolePrint('sv_cheats = ' + (isSvCheats() ? '1' : '0'));
            }
        }
    },
    unbindall: {
        description: 'Unbind all keys',
        hidden: true,
        execute: () => {
            const count = Object.keys(keyBindings).length;
            if (count === 0) {
                consolePrint('No bindings to remove.');
            } else {
                keyBindings = {};
                consolePrint(`Removed ${count} binding${count !== 1 ? 's' : ''}.`);
            }
        }
    },
    noclip: {
        description: 'Toggle noclip',
        hidden: true,
        execute: () => consolePrint("I can't let you do that.")
    },
    kill: {
        description: 'Kill the eye',
        hidden: true,
        execute: () => {
            Eye.damage(1000, 'fall', 'player');
        }
    },
    explode: {
        description: 'Explode the eye',
        hidden: true,
        execute: () => {
            Eye.damage(1000, 'explode', 'player');
        }
    },
    impulse: {
        description: 'Impulse command',
        hidden: true,
        execute: (args) => {
            if (args[0] === '101') {
                if (!isSvCheats()) {
                    consolePrint('sv_cheats must be enabled to use this command.', 'error');
                    return;
                }
                const count = impulse101();
                consolePrint(`Unlocked ${count} achievement${count !== 1 ? 's' : ''}.`, 'success');
                playZeldaSecretJingle();
            }
        }
    },
    give: {
        description: 'Give an item',
        hidden: true,
        execute: (args) => {
            if (args.length === 0) {
                consolePrint('Usage: give <item_id>');
                consolePrint('Items: ' + Object.keys(Items.catalog).join(', '));
                return;
            }
            const itemId = args[0].toLowerCase();
            const item = Items.catalog[itemId];
            if (!item) {
                consolePrint(`Unknown item: ${itemId}`, 'error');
                consolePrint('Available: ' + Object.keys(Items.catalog).join(', '));
                return;
            }
            Items.pickupItem(item);
            consolePrint(`Gave ${item.name}`, 'success');
        }
    },
    place: {
        description: 'Spawn item pedestal',
        hidden: true,
        execute: (args) => {
            const itemId = args[0]?.toLowerCase();
            const item = itemId ? Items.catalog[itemId] : Object.values(Items.catalog)[Math.floor(Math.random() * Object.keys(Items.catalog).length)];
            if (!item) {
                consolePrint(`Unknown item: ${itemId}`, 'error');
                return;
            }
            Items.showPedestal(item);
            consolePrint(`Spawned ${item.name} pedestal`, 'success');
        }
    },
    drop: {
        description: 'Spawn consumable pickup',
        hidden: true,
        execute: (args) => {
            const consumableId = args[0]?.toLowerCase();
            if (!consumableId) {
                consolePrint('Usage: drop <consumable_id>');
                consolePrint('Available: ' + Object.keys(Items.consumables).join(', '));
                return;
            }
            const consumable = Items.consumables[consumableId];
            if (!consumable) {
                consolePrint(`Unknown consumable: ${consumableId}`, 'error');
                consolePrint('Available: ' + Object.keys(Items.consumables).join(', '));
                return;
            }
            Items.showConsumable(consumableId);
            consolePrint(`Spawned ${consumable.name}`, 'success');
        }
    },
    items: {
        description: 'List inventory',
        execute: () => {
            if (Items.inventory.length === 0) {
                consolePrint('Inventory is empty.');
                return;
            }
            consolePrint('Inventory:');
            for (const id of Items.inventory) {
                const item = Items.catalog[id];
                if (item) consolePrint(`  ${item.icon} ${item.name}`);
            }
        }
    },
    tracker: {
        description: 'Open the music tracker',
        hidden: true,
        execute: () => {
            openTracker();
            consolePrint('Tracker opened. Press Escape to close.', 'success');
        }
    },
    clear_items: {
        description: 'Clear all item effects',
        hidden: true,
        execute: () => {
            Items.clearEffects();
            consolePrint('Cleared all item effects.');
        }
    },
    hurt: {
        description: 'Take damage',
        hidden: true,
        execute: (args) => {
            const amount = parseInt(args[0]) || 1;
            const src = args[1] || 'player';
            Eye.damage(amount, 'fall', src);
            consolePrint(`Took ${amount} damage from ${src}. Health: ${Eye.health}/${Eye.maxHealth}`);
        }
    },
    heal: {
        description: 'Restore health',
        hidden: true,
        execute: (args) => {
            const amount = parseInt(args[0]) || 2;
            Eye.heal(amount);
            consolePrint(`Healed ${amount}. Health: ${Eye.health}/${Eye.maxHealth}`);
        }
    },
    health: {
        description: 'Show or set health',
        execute: (args) => {
            if (args.length > 0) {
                Eye.health = Math.min(Eye.maxHealth, Math.max(0, parseInt(args[0]) || 0));
                Eye.renderHealthBar();
                Eye.save();
            }
            consolePrint(`Health: ${Eye.health}/${Eye.maxHealth} (${Eye.maxHealth/2} containers)`);
        }
    },
    add_heart: {
        description: 'Add heart container',
        hidden: true,
        execute: () => {
            Eye.addContainer();
            consolePrint(`Added heart container. Max health: ${Eye.maxHealth/2} hearts`);
        }
    },
    unlock_sounds: {
        description: 'Unlock all sounds in the audio library',
        hidden: true,
        execute: () => {
            const lib = Tracker.getLibrary();
            let count = 0;
            for (const sound of lib) {
                if (!sound.unlocked) {
                    Tracker.unlockLibraryItem(sound.id);
                    count++;
                }
            }
            consolePrint(`Unlocked ${count} sound${count !== 1 ? 's' : ''}.`, 'success');
        }
    },
    spawn: {
        description: 'Spawn enemy from last analyzed game',
        hidden: true,
        execute: (args) => {
            const appId = args[0] || window.lastAnalyzedApp?.appId;
            const headerImage = window.lastAnalyzedApp?.headerImage;

            if (!appId || !headerImage) {
                consolePrint('No game to spawn. Analyze a game first or use: spawn <appId> <headerUrl>', 'error');
                return;
            }

            Combat.spawnEnemy(appId, headerImage);
            consolePrint(`Spawned ${appId}`, 'success');
        }
    },

    spawn_test: {
        description: 'Spawn test enemy (TF2)',
        hidden: true,
        execute: () => {
            const appId = 440;
            const headerImage = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/header.jpg';
            const res = Combat.spawnEnemy(appId, headerImage);
            if (res != null) {
                consolePrint('Spawned Enemy', 'success');
            }
            else {
                consolePrint("There's a time and place for everything but not now!", 'error');
            }
        }
    },

    spawn_test2: {
        description: 'Spawn test enemy (Dota 2)',
        hidden: true,
        execute: () => {
            const appId = 570;
            const headerImage = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/570/header.jpg';
            const res = Combat.spawnEnemy(appId, headerImage);
            if (res != null) {
                consolePrint('Spawned Enemy', 'success');
            }
            else {
                consolePrint("There's a time and place for everything but not now!", 'error');
            }
        }
    },

    killall: {
        description: 'Kill all enemies',
        hidden: true,
        execute: () => {
            const count = Combat.enemies.length;
            Combat.enemies = [];
            consolePrint(`Killed ${count} enemies`, 'success');
        }
    },
};

function createConsole() {
    if (consoleElement) return consoleElement;
    
    const con = document.createElement('div');
    con.className = 'dev-console';
    con.innerHTML = `
        <div class="console-output"></div>
        <div class="console-input-row">
            <span class="console-prompt">]</span>
            <input type="text" class="console-input" spellcheck="false" autocomplete="off">
        </div>
        <div class="console-resize"></div>
    `;
    
    document.body.appendChild(con);
    consoleElement = con;
    
    const input = con.querySelector('.console-input');
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            if (cmd) {
                consoleHistory.push(cmd);
                historyIndex = consoleHistory.length;
                consolePrint('> ' + cmd);
                executeCommand(cmd);
                input.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) { historyIndex--; input.value = consoleHistory[historyIndex]; }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < consoleHistory.length - 1) { historyIndex++; input.value = consoleHistory[historyIndex]; }
            else { historyIndex = consoleHistory.length; input.value = ''; }
        } else if (e.key === 'Escape' || e.key === '`' || e.key === '\\') {
            e.preventDefault();
            toggleConsole();
        }
    });
    
    const resize = con.querySelector('.console-resize');
    let startY, startHeight;
    
    resize.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = con.offsetHeight;
        const onResize = (e) => { con.style.height = Math.max(100, startHeight + e.clientY - startY) + 'px'; };
        const stopResize = () => { document.removeEventListener('mousemove', onResize); document.removeEventListener('mouseup', stopResize); };
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
    });
    
    consolePrint("Gamer's Remorse Developer Console");
    consolePrint('Type "help" for available commands.');
    consolePrint('');
    
    return con;
}

function consolePrint(text, className = '') {
    if (!consoleElement) return;
    const output = consoleElement.querySelector('.console-output');
    const line = document.createElement('div');
    line.className = 'console-line' + (className ? ' ' + className : '');
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function toggleConsole() {
    if (!consoleEnabled) return;
    if (!consoleElement) createConsole();
    
    consoleVisible = !consoleVisible;
    consoleElement.classList.toggle('visible', consoleVisible);
    if (consoleVisible) {
        consoleElement.querySelector('.console-input').focus();
    } else {
        consoleElement.querySelector('.console-input').blur();
    }
}

function executeCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const command = commands[commandName];
    if (command) command.execute(args);
    else consolePrint('Unknown command: ' + commandName);
}

// === TRACKER ===
let trackerVisible = false;
let trackerModal = null;

function openTracker() {
    setAchievementFlag('openedTracker');
    
    if (trackerModal) {
        trackerModal.style.display = 'block';
        trackerVisible = true;
        trackerModal.querySelector('.tracker')?.focus();
        return;
    }
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'tracker-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeTracker(); };
    
    // Create tracker container
    const container = document.createElement('div');
    container.className = 'tracker tracker-modal';
    
    // Init tracker UI
    Tracker.createUI(container);
    
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    trackerModal = overlay;
    trackerVisible = true;
    
    // Focus tracker for keyboard input
    trackerModal.querySelector('.tracker')?.focus();
}

function closeTracker() {
    if (trackerModal) {
        trackerModal.style.display = 'none';
        trackerVisible = false;
        Tracker.stop();
    }
}

function toggleTracker() {
    if (trackerVisible) closeTracker();
    else openTracker();
}

// Keyboard listener for console toggle and bindings
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.target.classList.contains('console-input')) return;
        return;
    }
    
    // Console toggle
    if ((e.key === '`' || e.key === '\\') && consoleEnabled) {
        e.preventDefault();
        toggleConsole();
        return;
    }
    
    // Check bindings
    let key = e.key.toLowerCase();
    // Normalize special keys
    if (key === ' ') key = 'space';
    
    if (keyBindings[key] && !consoleVisible) {
        e.preventDefault();
        executeCommand(keyBindings[key]);
    }
});

// Auto-load settings on page load
function loadEyeSettings() {
    const saved = localStorage.getItem('eyeSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        if (settings.blinkEnabled === false) setBlinkingEnabled(false);
        if (settings.sleepEnabled === false) setSleepEnabled(false);
        if (settings.trackingEnabled === false) setCursorTrackingEnabled(false);
        if (settings.darkMode) { darkMode = true; document.body.classList.add('dark-mode'); setAchievementFlag('darkModeEnabled'); }
        if (settings.consoleEnabled) consoleEnabled = true;
        if (settings.selectionDisabled) setSelectionEnabled(false, false);
        if (settings.upperColor) document.documentElement.style.setProperty('--color-positive', settings.upperColor);
        if (settings.lowerColor) document.documentElement.style.setProperty('--color-negative', settings.lowerColor);
        if (settings.lashColor) document.documentElement.style.setProperty('--color-uncertain', settings.lashColor);
        updateColorLegend();
        if (settings.barCount) setBarDensity(settings.barCount);
    }
    
    // Also load console settings
    const consoleSaved = localStorage.getItem('consoleSettings');
    if (consoleSaved) {
        const settings = JSON.parse(consoleSaved);
        if (settings.tagline) setCustomTagline(settings.tagline);
        if (settings.svCheats) setSvCheats(true);
        if (settings.bindings) keyBindings = settings.bindings;
    }
}

function applyChartDarkMode() {
    if (!darkMode || typeof Chart === 'undefined') return;
    Chart.defaults.color = '#ccc';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';
    Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.1)';
    Chart.defaults.scale.ticks.color = '#ccc';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadEyeSettings);
else loadEyeSettings();

window.addEventListener('load', applyChartDarkMode);
