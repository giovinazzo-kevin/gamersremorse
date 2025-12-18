/* Modal JS - HTML/CSS Source Engine UI */

let activeModal = null;

const UI = {
    bg: '#4c5844',
    borderLight: '#889180',
    borderDark: '#282e22',
    text: '#e0e0e0',
    textDim: '#808080',
    accent: '#d4aa00',
};

function openModal(title, options = {}) {
    if (activeModal) closeModal();

    const w = options.width || 500;
    const h = options.height || 400;
    const tabs = options.tabs || ['Eye', 'Audio', 'Interface', '???', '???'];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };

    const modal = document.createElement('div');
    modal.className = 'source-modal';
    modal.style.width = w + 'px';
    modal.style.height = h + 'px';

    // Title bar
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

    // Tabs
    const tabBar = document.createElement('div');
    tabBar.className = 'modal-tabs';

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

        tabBar.appendChild(tabEl);
    });

    modal.appendChild(tabBar);

    // Content pane
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    // Two column layout
    const columns = document.createElement('div');
    columns.className = 'modal-columns';
    
    // Left column - controls
    const leftCol = document.createElement('div');
    leftCol.className = 'modal-col-left';
    
    // Blink toggle
    const blinkRow = document.createElement('label');
    blinkRow.className = 'modal-checkbox-row';
    const blinkCheckbox = document.createElement('input');
    blinkCheckbox.type = 'checkbox';
    blinkCheckbox.className = 'modal-checkbox';
    blinkCheckbox.checked = true;
    blinkCheckbox.onchange = () => {
        if (blinkCheckbox.checked) {
            enableBlinking();
        } else {
            disableBlinking();
        }
    };
    blinkRow.appendChild(blinkCheckbox);
    blinkRow.appendChild(document.createTextNode(' Enable blinking'));
    leftCol.appendChild(blinkRow);
    
    // Sleep toggle
    const sleepRow = document.createElement('label');
    sleepRow.className = 'modal-checkbox-row';
    const sleepCheckbox = document.createElement('input');
    sleepCheckbox.type = 'checkbox';
    sleepCheckbox.className = 'modal-checkbox';
    sleepCheckbox.checked = true;
    sleepCheckbox.onchange = () => {
        if (typeof setSleepEnabled === 'function') {
            setSleepEnabled(sleepCheckbox.checked);
        }
    };
    sleepRow.appendChild(sleepCheckbox);
    sleepRow.appendChild(document.createTextNode(' Enable sleep'));
    leftCol.appendChild(sleepRow);
    
    // Cursor tracking toggle
    const trackingRow = document.createElement('label');
    trackingRow.className = 'modal-checkbox-row';
    const trackingCheckbox = document.createElement('input');
    trackingCheckbox.type = 'checkbox';
    trackingCheckbox.className = 'modal-checkbox';
    trackingCheckbox.checked = true;
    trackingCheckbox.onchange = () => {
        if (typeof setCursorTrackingEnabled === 'function') {
            setCursorTrackingEnabled(trackingCheckbox.checked);
        }
    };
    trackingRow.appendChild(trackingCheckbox);
    trackingRow.appendChild(document.createTextNode(' Enable cursor tracking'));
    leftCol.appendChild(trackingRow);
    
    leftCol.appendChild(document.createElement('br'));
    
    // Upper lid color
    const upperRow = document.createElement('div');
    upperRow.className = 'modal-color-row';
    const upperLabel = document.createElement('span');
    upperLabel.textContent = 'Upper lid';
    upperRow.appendChild(upperLabel);
    const upperColor = document.createElement('input');
    upperColor.type = 'color';
    upperColor.className = 'modal-color';
    upperColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-positive').trim();
    upperColor.oninput = () => {
        document.documentElement.style.setProperty('--color-positive', upperColor.value);
    };
    upperRow.appendChild(upperColor);
    leftCol.appendChild(upperRow);
    
    // Lower lid color
    const lowerRow = document.createElement('div');
    lowerRow.className = 'modal-color-row';
    const lowerLabel = document.createElement('span');
    lowerLabel.textContent = 'Lower lid';
    lowerRow.appendChild(lowerLabel);
    const lowerColor = document.createElement('input');
    lowerColor.type = 'color';
    lowerColor.className = 'modal-color';
    lowerColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-negative').trim();
    lowerColor.oninput = () => {
        document.documentElement.style.setProperty('--color-negative', lowerColor.value);
    };
    lowerRow.appendChild(lowerColor);
    leftCol.appendChild(lowerRow);
    
    // Eyelash color
    const lashRow = document.createElement('div');
    lashRow.className = 'modal-color-row';
    const lashLabel = document.createElement('span');
    lashLabel.textContent = 'Eyelashes';
    lashRow.appendChild(lashLabel);
    const lashColor = document.createElement('input');
    lashColor.type = 'color';
    lashColor.className = 'modal-color';
    lashColor.value = getComputedStyle(document.documentElement).getPropertyValue('--color-uncertain').trim();
    lashColor.oninput = () => {
        document.documentElement.style.setProperty('--color-uncertain', lashColor.value);
    };
    lashRow.appendChild(lashColor);
    leftCol.appendChild(lashRow);
    
    columns.appendChild(leftCol);
    
    // Right column - preview
    const rightCol = document.createElement('div');
    rightCol.className = 'modal-col-right';
    
    const previewLabel = document.createElement('div');
    previewLabel.className = 'modal-label';
    previewLabel.textContent = 'Player Model';
    rightCol.appendChild(previewLabel);
    
    const previewBox = document.createElement('div');
    previewBox.className = 'modal-preview';
    
    const eyePreview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    eyePreview.id = 'eye-preview';
    eyePreview.className = 'eye-preview-svg';
    previewBox.appendChild(eyePreview);
    
    // Clone main eye content into preview
    const mainEye = document.getElementById('eye');
    if (mainEye) {
        const updatePreview = () => {
            eyePreview.innerHTML = mainEye.innerHTML;
            // Expand viewBox by 20% on each side to account for targetWidthRatio overhang
            const w = mainEye.clientWidth;
            const h = mainEye.clientHeight;
            const padding = w * 0.12; // ~12% padding each side
            eyePreview.setAttribute('viewBox', `${-padding} 0 ${w + padding * 2} ${h}`);
            eyePreview.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        };
        updatePreview();
        const previewInterval = setInterval(updatePreview, 66); // ~15fps
        overlay.previewInterval = previewInterval;
        
        // Track cursor relative to preview box
        if (typeof setTrackingElement === 'function') {
            setTrackingElement(previewBox);
        }
    }
    
    rightCol.appendChild(previewBox);
    
    columns.appendChild(rightCol);
    content.appendChild(columns);
    
    // Bottom row - buttons
    const bottomRow = document.createElement('div');
    bottomRow.className = 'modal-bottom-row';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'modal-btn';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
        const settings = {
            blinkEnabled: blinkCheckbox.checked,
            sleepEnabled: sleepCheckbox.checked,
            trackingEnabled: trackingCheckbox.checked,
            upperColor: upperColor.value,
            lowerColor: lowerColor.value,
            lashColor: lashColor.value,
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
            blinkCheckbox.checked = settings.blinkEnabled;
            sleepCheckbox.checked = settings.sleepEnabled;
            trackingCheckbox.checked = settings.trackingEnabled;
            upperColor.value = settings.upperColor;
            lowerColor.value = settings.lowerColor;
            lashColor.value = settings.lashColor;
            
            // Apply
            blinkCheckbox.onchange();
            sleepCheckbox.onchange();
            trackingCheckbox.onchange();
            upperColor.oninput();
            lowerColor.oninput();
            lashColor.oninput();
        }
    };
    bottomRow.appendChild(loadBtn);
    
    const resetBtn = document.createElement('button');
    resetBtn.className = 'modal-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.onclick = () => {
        blinkCheckbox.checked = true;
        sleepCheckbox.checked = true;
        trackingCheckbox.checked = true;
        upperColor.value = '#54bebe';
        lowerColor.value = '#c80064';
        lashColor.value = '#666666';
        
        // Apply
        blinkCheckbox.onchange();
        sleepCheckbox.onchange();
        trackingCheckbox.onchange();
        upperColor.oninput();
        lowerColor.oninput();
        lashColor.oninput();
    };
    bottomRow.appendChild(resetBtn);
    
    content.appendChild(bottomRow);
    
    modal.appendChild(content);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    activeModal = overlay;
}

function closeModal() {
    if (activeModal) {
        if (activeModal.previewInterval) {
            clearInterval(activeModal.previewInterval);
        }
        // Reset cursor tracking to main eye
        if (typeof clearTrackingElement === 'function') {
            clearTrackingElement();
        }
        activeModal.remove();
        activeModal = null;
    }
}

function openSettings() {
    openModal('Options', {
        width: 500,
        height: 350,
        tabs: ['Eye', 'Audio', 'Interface', '???', '???']
    });
}
