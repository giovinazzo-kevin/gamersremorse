/* Items System - Isaac-style item pickups */

const Items = {
    // Item definitions
    catalog: {
        // === GOOD ITEMS ===
        sacred_heart: {
            id: 'sacred_heart',
            name: 'Sacred Heart',
            icon: '❤️',
            flavor: '"Pure love"',
            description: 'A healthy game. They do exist.',
            tags: ['HEALTHY', 'HONEST'],
            rarity: 'rare',
            effect: (eye) => {
                eye.tint = '#ffcccc';
                eye.pulseRate = 0.5; // gentle heartbeat pulse
            }
        },
        lazarus_rags: {
            id: 'lazarus_rags',
            name: "Lazarus' Rags",
            icon: '🩹',
            flavor: '"Rise again"',
            description: 'Back from the dead. Rebuilt. Reborn.',
            tags: ['PHOENIX', '180', 'REDEMPTION'],
            rarity: 'uncommon',
            effect: (eye) => {
                eye.tint = '#ffe4b5';
                eye.resurrection = true;
            }
        },
        
        // === BAD ITEMS ===
        dead_cat: {
            id: 'dead_cat',
            name: 'Dead Cat',
            icon: '🐱',
            flavor: '"9 lives"',
            description: "You'll need all of them.",
            tags: ['PREDATORY', 'REFUND_TRAP'],
            rarity: 'uncommon',
            effect: (eye) => {
                eye.lives = 9;
                eye.tint = '#666666';
            }
        },
        moms_knife: {
            id: 'moms_knife',
            name: "Mom's Knife",
            icon: '🔪',
            flavor: '"Hurts to hold"',
            description: 'It hurts but you keep coming back.',
            tags: ['STOCKHOLM', 'EXTRACTIVE'],
            rarity: 'uncommon',
            effect: (eye) => {
                eye.tint = '#cc4444';
                eye.pain = true;
            }
        },
        blood_bag: {
            id: 'blood_bag',
            name: 'Blood Bag',
            icon: '🩸',
            flavor: '"Drip... drip..."',
            description: "They're draining you dry.",
            tags: ['EXTRACTIVE', 'ADDICTIVE'],
            rarity: 'common',
            effect: (eye) => {
                eye.tint = '#8b0000';
                eye.draining = true;
            }
        },
        
        // === NEUTRAL/WEIRD ITEMS ===
        ouija_board: {
            id: 'ouija_board',
            name: 'Ouija Board',
            icon: '👻',
            flavor: '"Press F to talk"',
            description: 'The servers are silent now.',
            tags: ['DEAD', 'PRESS_F', 'ZOMBIE'],
            rarity: 'common',
            effect: (eye) => {
                eye.ghostly = true;
                eye.tint = '#e0e0ff';
                eye.opacity = 0.7;
            }
        },
        caffeine_pill: {
            id: 'caffeine_pill',
            name: 'Caffeine Pill',
            icon: '💊',
            flavor: '"One more game..."',
            description: 'Pupil dilation is a feature.',
            tags: ['ADDICTIVE'],
            rarity: 'common',
            effect: (eye) => {
                eye.dilation = 1.5;
                eye.jitter = true;
            }
        },
        the_poop: {
            id: 'the_poop',
            name: 'The Poop',
            icon: '💩',
            flavor: '"Plop"',
            description: 'Well, someone had to buy it.',
            tags: ['FLOP', 'CURSED'],
            rarity: 'common',
            effect: (eye) => {
                eye.stinky = true;
                eye.tint = '#8b4513';
            }
        },
        
        // === SPICY ITEMS ===
        moms_bra: {
            id: 'moms_bra',
            name: "Mom's Bra",
            icon: '👙',
            flavor: '"???"',
            description: 'You know exactly what kind of game this is.',
            tags: ['HORNY'],
            rarity: 'uncommon',
            effect: (eye) => {
                eye.flustered = true;
                eye.tint = '#ffb6c1';
                eye.sweat = true;
            }
        },
        the_virus: {
            id: 'the_virus',
            name: 'The Virus',
            icon: '🦠',
            flavor: '"Tastes like pennies"',
            description: 'Spread the love.',
            tags: ['HORNY', 'PLAGUE'],
            rarity: 'rare',
            effect: (eye) => {
                eye.infected = true;
                eye.tint = '#90EE90';
            }
        },
        
        // === ULTRA RARE ===
        godhead: {
            id: 'godhead',
            name: 'Godhead',
            icon: '☀️',
            flavor: '"God tears"',
            description: 'A perfect game. Literally flawless.',
            tags: ['HEALTHY', 'HONEST'],
            rarity: 'legendary',
            condition: (metrics) => metrics.positiveRatio > 0.95 && metrics.medianRatio < 0.8,
            effect: (eye) => {
                eye.halo = true;
                eye.tint = '#fffacd';
                eye.divine = true;
            }
        },
        brimstone: {
            id: 'brimstone',
            name: 'Brimstone',
            icon: '😈',
            flavor: '"Blood laser barrage"',
            description: 'Pure concentrated evil.',
            tags: ['PREDATORY', 'ENSHITTIFIED'],
            rarity: 'legendary',
            condition: (metrics) => metrics.negativeRatio > 0.7,
            effect: (eye) => {
                eye.demonic = true;
                eye.tint = '#ff0000';
                eye.laserCharge = true;
            }
        },
        
        // === MEME ITEMS ===
        breakfast: {
            id: 'breakfast',
            name: 'Breakfast',
            icon: '🥛',
            flavor: '"HP Up"',
            description: 'HP up.',
            tags: ['HEALTHY'],
            rarity: 'common',
            stackable: true,
            onPickup: () => {
                Items.maxHealth = Math.min(Items.maxContainers, Items.maxHealth + 2);
                Items.health = Math.min(Items.maxHealth, Items.health + 2);
                Items.renderHealthBar();
                Items.saveInventory();
            }
        },
        onion: {
            id: 'onion',
            name: 'Onion',
            icon: '🧅',
            flavor: '"Tears up"',
            description: "It's enough to make a grown eye cry.",
            tags: ['DEAD', 'ENSHITTIFIED', 'RETCONNED'],
            rarity: 'common',
            effect: (eye) => {
                eye.tearsUp = true;
                eye.tearRate = 2.0;
            }
        },
        number_one: {
            id: 'number_one',
            name: 'Number One',
            icon: '💛',
            flavor: '"Tears way up"',
            description: 'Fast and small. Like the reviews.',
            tags: ['LOW_DATA'],
            rarity: 'common',
            effect: (eye) => {
                eye.blinkRate = 2.0;
                eye.pupilSize = 0.5;
            }
        },
        polyphemus: {
            id: 'polyphemus',
            name: 'Polyphemus',
            icon: '👁️',
            flavor: '"Mega tears"',
            description: 'ONE. GIANT. EYE.',
            tags: ['STOCKHOLM'],
            rarity: 'rare',
            condition: (metrics) => metrics.stockholmIndex > 2.0,
            effect: (eye) => {
                eye.giant = true;
                eye.pupilSize = 2.0;
            }
        }
    },
    
    // State
    inventory: [],
    activeEffects: {},
    pedestalVisible: false,
    currentPedestal: null,
    
    // Consumables - instant pickups that don't go to inventory
    consumables: {
        red_heart: {
            id: 'red_heart',
            name: 'Red Heart',
            icon: '❤️',
            canPickup: () => Items.health < Items.maxHealth,
            onPickup: () => {
                Items.heal(2);
            }
        },
        half_heart: {
            id: 'half_heart',
            name: 'Half Heart',
            icon: '<span class="heart half">❤️</span>',
            canPickup: () => Items.health < Items.maxHealth,
            onPickup: () => {
                Items.heal(1);
            }
        },
        soul_heart: {
            id: 'soul_heart',
            name: 'Soul Heart',
            icon: '💙',
            onPickup: () => {
                // TODO: soul hearts (temporary HP)
                Items.heal(2);
            }
        },
        penny: {
            id: 'penny',
            name: 'Penny',
            icon: '<span class="coin penny">🪙</span>',
            onPickup: () => {
                // TODO: currency system
            }
        },
    },
    
    // Show a consumable drop (no pedestal, just floating pickup)
    showConsumable(consumableId, container) {
        const consumable = this.consumables[consumableId];
        if (!consumable) return;
        
        const pickup = document.createElement('div');
        pickup.className = 'consumable-pickup';
        pickup.innerHTML = `<span class="consumable-icon">${consumable.icon}</span>`;
        
        pickup.onclick = () => this.pickupConsumable(consumable, pickup);
        
        const target = container || document.getElementById('metrics-detail');
        if (target) {
            target.appendChild(pickup);
            setTimeout(() => pickup.classList.add('visible'), 50);
        }
    },
    
    // Pick up consumable (instant effect, no inventory)
    pickupConsumable(consumable, element) {
        if (!consumable) return;
        
        // Check if can pick up
        if (consumable.canPickup && !consumable.canPickup()) {
            return; // Can't pick up right now
        }
        
        // Remove pickup with animation
        if (element) {
            element.classList.add('picked-up');
            setTimeout(() => element.remove(), 300);
        }
        
        // Apply effect
        if (consumable.onPickup) {
            consumable.onPickup();
        }
        
        // Play pickup sound
        if (typeof playPickupSound === 'function') playPickupSound();
    },
    
    // Roll for consumable drops based on tags
    rollForConsumable(tags) {
        // Healthy games drop hearts
        if (tags.includes('HEALTHY')) {
            const roll = Math.random();
            if (roll < 0.3) return 'red_heart';
            if (roll < 0.5) return 'half_heart';
        }
        
        // Soul hearts from spiritual/honest games
        if (tags.includes('HONEST') && Math.random() < 0.2) {
            return 'soul_heart';
        }
        
        return null;
    },
    
    // Drop multiple consumables
    dropConsumables(tags, container, maxDrops = 4, dropChance = 1) {
        // Skewed toward 0: roll for each potential drop
        let numDrops = 0;
        for (let i = 0; i < maxDrops; i++) {
            // Each successive drop is less likely
            const chance = dropChance * Math.pow(0.5, i);
            if (Math.random() < chance) numDrops++;
        }
        
        for (let i = 0; i < numDrops; i++) {
            const consumableId = this.rollForConsumable(tags);
            if (consumableId) {
                // Stagger the drops
                setTimeout(() => this.showConsumable(consumableId, container), i * 200);
            }
        }
    },
    
    // Health system
    health: 12,          // current health (in half-hearts, so 12 = 6 full hearts)
    maxHealth: 12,       // max health
    maxContainers: 24,   // max possible (12 full hearts = 24 half-hearts)
    
    // Get items that match given tags
    getMatchingItems(tags, metrics) {
        const matches = [];
        
        for (const item of Object.values(this.catalog)) {
            // Check tag overlap
            const overlap = item.tags.filter(t => tags.includes(t));
            if (overlap.length === 0) continue;
            
            // Check special conditions
            if (item.condition && !item.condition(metrics)) continue;
            
            // Weight by overlap count and rarity
            const rarityWeight = {
                common: 10,
                uncommon: 5,
                rare: 2,
                legendary: 0.5
            }[item.rarity] || 1;
            
            const weight = overlap.length * rarityWeight;
            
            for (let i = 0; i < weight; i++) {
                matches.push(item);
            }
        }
        
        return matches;
    },
    
    // Roll for item drop
    rollForDrop(tags, metrics) {
        // Base 15% chance for pedestal to spawn
        const baseChance = 0.15;
        
        // Increase chance for extreme games
        let chance = baseChance;
        if (tags.includes('PREDATORY') || tags.includes('HEALTHY')) chance += 0.1;
        if (tags.includes('LEGENDARY') || tags.includes('GODHEAD')) chance += 0.2;
        
        if (Math.random() > chance) return null;
        
        const matches = this.getMatchingItems(tags, metrics);
        if (matches.length === 0) return null;
        
        // Pick random item from weighted pool
        return matches[Math.floor(Math.random() * matches.length)];
    },
    
    // Show item pedestal
    showPedestal(item) {
        if (!item) return;
        
        this.currentPedestal = item;
        this.pedestalVisible = true;
        
        const pedestal = document.createElement('div');
        pedestal.className = 'item-pedestal';
        pedestal.innerHTML = `
            <div class="pedestal-glow"></div>
            <div class="pedestal-item">${item.icon}</div>
            <div class="pedestal-base"></div>
        `;
        
        pedestal.onclick = () => this.pickupItem(item);
        
        // Find where to put it - near the verdict area
        const container = document.getElementById('metrics-detail');
        if (container) {
            container.appendChild(pedestal);
            
            // Animate in
            setTimeout(() => pedestal.classList.add('visible'), 100);
            
            // Play sound
            if (typeof playPedestalSound === 'function') playPedestalSound();
        }
    },
    
    // Pick up item from pedestal
    pickupItem(item) {
        if (!item) return;
        
        // Remove pedestal
        const pedestal = document.querySelector('.item-pedestal');
        if (pedestal) {
            pedestal.classList.add('pickup');
            setTimeout(() => pedestal.remove(), 500);
        }
        
        // Add to inventory
        this.inventory.push(item.id);
        
        // Show pickup popup (Isaac style)
        this.showPickupPopup(item);
        
        // Apply effect
        if (item.effect && typeof item.effect === 'function') {
            // Store effect for eye system to read
            this.activeEffects[item.id] = item;
            this.applyEffects();
        }
        
        // One-time pickup effect (doesn't persist)
        if (item.onPickup && typeof item.onPickup === 'function') {
            item.onPickup();
        }
        
        // Achievement
        if (typeof setAchievementFlag === 'function') {
            setAchievementFlag('pickedUpItem');
            
            // Special achievements for rare items
            if (item.rarity === 'legendary') {
                setAchievementFlag('legendaryItem');
            }
        }
        
        // Play pickup sound
        if (typeof playItemPickupSound === 'function') playItemPickupSound();
        
        // Save to localStorage
        this.saveInventory();
        
        this.pedestalVisible = false;
        this.currentPedestal = null;
    },
    
    // Show Isaac-style item pickup popup
    showPickupPopup(item) {
        const popup = document.createElement('div');
        popup.className = 'item-pickup-popup';
        popup.innerHTML = `
            <div class="item-pickup-icon">${item.icon}</div>
            <div class="item-pickup-name">${item.name}</div>
            <div class="item-pickup-flavor">${item.flavor}</div>
        `;
        
        document.body.appendChild(popup);
        
        // Animate in
        setTimeout(() => popup.classList.add('visible'), 50);
        
        // Remove after delay
        setTimeout(() => {
            popup.classList.remove('visible');
            setTimeout(() => popup.remove(), 500);
        }, 3000);
    },
    
    // Apply all active effects to eye
    applyEffects() {
        const eyeState = {
            tint: null,
            opacity: 1,
            pupilSize: 1,
            blinkRate: 1,
            tearRate: 1,
            dilation: 0,
            jitter: false,
            ghostly: false,
            halo: false,
            demonic: false,
            flustered: false,
            sweat: false,
            tearsUp: false,
            giant: false
        };
        
        // Stack effects
        for (const item of Object.values(this.activeEffects)) {
            if (item.effect) {
                item.effect(eyeState);
            }
        }
        
        // Apply to actual eye
        if (typeof applyItemEffects === 'function') {
            applyItemEffects(eyeState);
        }
    },
    
    // Render health bar
    renderHealthBar() {
        const bar = document.getElementById('health-bar');
        if (!bar) return;
        
        // Hidden until tookDamage achievement unlocked
        const hasUnlocked = typeof achievementState !== 'undefined' && achievementState.unlocked?.kill_eye;
        if (!hasUnlocked) {
            bar.innerHTML = '';
            return;
        }
        
        bar.innerHTML = '';
        
        // Calculate containers (in full hearts)
        const containers = Math.ceil(this.maxHealth / 2);
        const fullHearts = Math.floor(this.health / 2);
        const hasHalf = this.health % 2 === 1;
        
        // Split into rows of 6
        const row1 = document.createElement('div');
        row1.className = 'health-row';
        const row2 = document.createElement('div');
        row2.className = 'health-row';
        
        for (let i = 0; i < containers; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            
            if (i < fullHearts) {
                heart.classList.add('full');
                heart.textContent = '❤️';
            } else if (i === fullHearts && hasHalf) {
                heart.classList.add('half');
                heart.textContent = '❤️'; // invisible, pseudo-elements overlay
            } else {
                heart.classList.add('empty');
                heart.textContent = '❤️';
            }
            
            if (i < 6) {
                row1.appendChild(heart);
            } else {
                row2.appendChild(heart);
            }
        }
        
        bar.appendChild(row1);
        if (containers > 6) {
            bar.appendChild(row2);
        }
    },
    
    // Health manipulation
    damage(halfHearts = 1, anim = 'fall') {
        // Achievement for taking damage
        if (typeof setAchievementFlag === 'function') {
            setAchievementFlag('tookDamage');
        }
        
        this.health = Math.max(0, this.health - halfHearts);
        this.renderHealthBar();
        this.saveInventory();
        
        if (this.health <= 0) {
            this.onDeath(anim);
        }
    },
    
    heal(halfHearts = 1) {
        this.health = Math.min(this.maxHealth, this.health + halfHearts);
        this.renderHealthBar();
        this.saveInventory();
    },
    
    addContainer() {
        if (this.maxHealth < this.maxContainers) {
            this.maxHealth += 2; // add one full heart container
            this.renderHealthBar();
            this.saveInventory();
        }
    },
    
    onDeath(anim) {
        // Kill the eye!
        if (typeof killEye === 'function') {
            killEye(anim);
        }
        
        // YASD - Yet Another Stupid Death
        if (typeof setAchievementFlag === 'function') {
            setAchievementFlag('yasd');
        }
        
        // Reset health after respawn
        setTimeout(() => {
            this.health = this.maxHealth;
            this.renderHealthBar();
            this.saveInventory();
        }, 11000);
    },
    
    // Render item bar in header
    renderItemBar() {
        const bar = document.getElementById('item-bar');
        if (!bar) return;
        
        bar.innerHTML = '';
        
        // Create shared tooltip if it doesn't exist
        if (!document.getElementById('item-tooltip')) {
            const tooltip = document.createElement('div');
            tooltip.id = 'item-tooltip';
            tooltip.className = 'item-tooltip';
            tooltip.innerHTML = `
                <div class="item-tooltip-name"></div>
                <div class="item-tooltip-flavor"></div>
            `;
            document.body.appendChild(tooltip);
        }
        
        // Count items
        const itemCounts = {};
        for (const id of this.inventory) {
            itemCounts[id] = (itemCounts[id] || 0) + 1;
        }
        
        // Show unique items
        const uniqueItems = [...new Set(this.inventory)];
        
        for (const id of uniqueItems) {
            const item = this.catalog[id];
            if (!item) continue;
            
            const count = itemCounts[id];
            const slot = document.createElement('div');
            slot.className = 'item-bar-slot';
            slot.dataset.rarity = item.rarity;
            
            // Show stack count only for stackable items with count > 1
            if (item.stackable && count > 1) {
                slot.innerHTML = `<span class="item-icon">${item.icon}</span><span class="item-stack-count">${count}</span>`;
            } else {
                slot.innerHTML = `<span class="item-icon">${item.icon}</span>`;
            }
            
            slot.addEventListener('mouseenter', (e) => {
                const tooltip = document.getElementById('item-tooltip');
                const rect = slot.getBoundingClientRect();
                tooltip.querySelector('.item-tooltip-name').textContent = item.name;
                tooltip.querySelector('.item-tooltip-flavor').textContent = item.flavor;
                tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
                tooltip.style.top = (rect.bottom + 8) + 'px';
                tooltip.classList.add('visible');
            });
            
            slot.addEventListener('mouseleave', () => {
                document.getElementById('item-tooltip')?.classList.remove('visible');
            });
            
            bar.appendChild(slot);
        }
    },
    
    // Save/load inventory
    saveInventory() {
        localStorage.setItem('eyeInventory', JSON.stringify({
            inventory: this.inventory,
            active: Object.keys(this.activeEffects),
            health: this.health,
            maxHealth: this.maxHealth
        }));
        this.renderItemBar();
    },
    
    loadInventory() {
        const saved = localStorage.getItem('eyeInventory');
        if (saved) {
            const data = JSON.parse(saved);
            this.inventory = data.inventory || [];
            this.health = data.health ?? 12;
            this.maxHealth = data.maxHealth ?? 12;
            
            // Don't start dead
            if (this.health <= 0) {
                this.health = this.maxHealth;
            }
            
            // Restore active effects
            for (const id of (data.active || [])) {
                if (this.catalog[id]) {
                    this.activeEffects[id] = this.catalog[id];
                }
            }
            
            this.applyEffects();
        }
        this.renderItemBar();
        this.renderHealthBar();
    },
    
    // Clear all effects (for testing)
    clearEffects() {
        this.activeEffects = {};
        this.applyEffects();
        this.saveInventory();
    },
    
    // Console command: give item
    giveItem(itemId) {
        const item = this.catalog[itemId];
        if (!item) {
            console.log('Unknown item:', itemId);
            console.log('Available:', Object.keys(this.catalog).join(', '));
            return;
        }
        this.pickupItem(item);
    },
    
    // Console command: place item pedestal
    place(itemId) {
        const item = this.catalog[itemId];
        if (!item) {
            console.log('Unknown item:', itemId);
            console.log('Available:', Object.keys(this.catalog).join(', '));
            return;
        }
        this.showPedestal(item);
    },
    
    // Console command: drop consumable
    drop(consumableId) {
        const consumable = this.consumables[consumableId];
        if (!consumable) {
            console.log('Unknown consumable:', consumableId);
            console.log('Available:', Object.keys(this.consumables).join(', '));
            return;
        }
        this.showConsumable(consumableId);
    }
};

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Items.loadInventory());
} else {
    Items.loadInventory();
}

// Expose for console
window.Items = Items;
