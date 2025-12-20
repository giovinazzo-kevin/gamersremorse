/* Items System - Declarative item definitions
 *
 * PHILOSOPHY:
 * - Items describe WHAT they are, not what they DO
 * - Systems interpret data; items have no callbacks or side effects
 * - All magic numbers live in ItemConfig, not scattered in code
 * - Eye is source of truth for health; we delegate, not duplicate
 * - No defensive typeof checks - load order is guaranteed
 * - Comments explain WHY, not WHAT
 */

const ItemConfig = {
    rarityWeights: { common: 10, uncommon: 5, rare: 2, legendary: 0.5 },
    baseDropChance: 0.15,
    bonusDropTags: ['PREDATORY', 'HEALTHY'],
    bonusDropChance: 0.1,
    legendaryBonusTags: ['LEGENDARY', 'GODHEAD'],
    legendaryBonusChance: 0.2,
    defaultItemSound: 'fame',
    defaultConsumableSound: 'pow',
    defaultPedestalSound: 'zelda_secret',
};

const Items = {
    // === ITEM CATALOG ===
    // All items are pure data. No callbacks. No side effects.
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
            effects: { tint: '#ffcccc', pulseRate: 0.5 },
            sound: 'fame'
        },
        lazarus_rags: {
            id: 'lazarus_rags',
            name: "Lazarus' Rags",
            icon: '🩹',
            flavor: '"Rise again"',
            description: 'Back from the dead. Rebuilt. Reborn.',
            tags: ['PHOENIX', '180', 'REDEMPTION'],
            rarity: 'uncommon',
            effects: { tint: '#ffe4b5', resurrection: true },
            sound: 'achievement'
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
            effects: { lives: 9, tint: '#666666' },
            sound: 'shame'
        },
        moms_knife: {
            id: 'moms_knife',
            name: "Mom's Knife",
            icon: '🔪',
            flavor: '"Hurts to hold"',
            description: 'It hurts but you keep coming back.',
            tags: ['STOCKHOLM', 'EXTRACTIVE'],
            rarity: 'uncommon',
            effects: { tint: '#cc4444', pain: true },
            sound: 'shame'
        },
        blood_bag: {
            id: 'blood_bag',
            name: 'Blood Bag',
            icon: '🩸',
            flavor: '"Drip... drip..."',
            description: "They're draining you dry.",
            tags: ['EXTRACTIVE', 'ADDICTIVE'],
            rarity: 'common',
            effects: { tint: '#8b0000', draining: true },
            sound: 'shame'
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
            effects: { ghostly: true, tint: '#e0e0ff', opacity: 0.7 },
            sound: 'error'
        },
        caffeine_pill: {
            id: 'caffeine_pill',
            name: 'Caffeine Pill',
            icon: '💊',
            flavor: '"One more game..."',
            description: 'Pupil dilation is a feature.',
            tags: ['ADDICTIVE'],
            rarity: 'common',
            effects: { dilation: 1.5, jitter: true },
            sound: 'pow'
        },
        the_poop: {
            id: 'the_poop',
            name: 'The Poop',
            icon: '💩',
            flavor: '"Plop"',
            description: 'Well, someone had to buy it.',
            tags: ['FLOP', 'CURSED'],
            rarity: 'common',
            effects: { stinky: true, tint: '#8b4513' },
            sound: 'shame'
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
            effects: { flustered: true, tint: '#ffb6c1', sweat: true },
            sound: 'achievement'
        },
        the_virus: {
            id: 'the_virus',
            name: 'The Virus',
            icon: '🦠',
            flavor: '"Tastes like pennies"',
            description: 'Spread the love.',
            tags: ['HORNY', 'PLAGUE'],
            rarity: 'rare',
            effects: { infected: true, tint: '#90EE90' },
            sound: 'error'
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
            condition: { positiveRatio: { gt: 0.95 }, medianRatio: { lt: 0.8 } },
            effects: { halo: true, tint: '#fffacd', divine: true },
            sound: 'zelda_secret'
        },
        brimstone: {
            id: 'brimstone',
            name: 'Brimstone',
            icon: '😈',
            flavor: '"Blood laser barrage"',
            description: 'Pure concentrated evil.',
            tags: ['PREDATORY', 'ENSHITTIFIED'],
            rarity: 'legendary',
            stackable: true,
            condition: { negativeRatio: { gt: 0.7 } },
            effects: { demonic: true, tint: '#ff0000', laserCharge: true, laserWidth: 80, laserFillTime: 1.0, laserDuration: 1.5 },
            sound: 'zelda_secret'
        },
        rubber_cement: {
            id: 'rubber_cement',
            name: 'Rubber Cement',
            icon: '🔄',
            flavor: '"Bounce bounce bounce"',
            description: 'Projectiles and beams reflect off surfaces.',
            tags: ['RICOCHET', 'SKILL'],
            rarity: 'uncommon',
            stackable: true,
            effects: { bounces: 2 },
            sound: 'fame'
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
            grants: { maxHealth: 2, heal: 2 },
            sound: 'pow'
        },
        lunch: {
            id: 'lunch',
            name: 'Lunch',
            icon: '🍎',
            flavor: '"HP Up"',
            description: 'HP up.',
            tags: ['HEALTHY'],
            rarity: 'common',
            stackable: true,
            grants: { maxHealth: 2, heal: 2 },
            sound: 'pow'
        },
        dinner: {
            id: 'dinner',
            name: 'Dinner',
            icon: '🍖',
            flavor: '"HP Up"',
            description: 'HP up.',
            tags: ['HEALTHY'],
            rarity: 'common',
            stackable: true,
            grants: { maxHealth: 2, heal: 2 },
            sound: 'pow'
        },
        onion: {
            id: 'onion',
            name: 'Onion',
            icon: '🧅',
            flavor: '"Tears up"',
            description: "It's enough to make a grown eye cry.",
            tags: ['DEAD', 'ENSHITTIFIED', 'RETCONNED'],
            rarity: 'common',
            effects: { tearsUp: true, tearRate: 2.0 },
            sound: 'shame'
        },
        number_one: {
            id: 'number_one',
            name: 'Number One',
            icon: '💛',
            flavor: '"Tears way up"',
            description: 'Fast and small. Like the reviews.',
            tags: ['LOW_DATA'],
            rarity: 'common',
            effects: { blinkRate: 2.0, pupilSize: 0.5 },
            sound: 'pow'
        },
        polyphemus: {
            id: 'polyphemus',
            name: 'Polyphemus',
            icon: '👁️',
            flavor: '"Mega tears"',
            description: 'ONE. GIANT. EYE.',
            tags: ['STOCKHOLM'],
            rarity: 'rare',
            condition: { stockholmIndex: { gt: 2.0 } },
            effects: { giant: true, pupilSize: 2.0 },
            sound: 'fame'
        },
        cupids_arrow: {
            id: 'cupids_arrow',
            name: "Cupid's Arrow",
            icon: '💘',
            flavor: '"Piercing shots"',
            description: 'Tears pass through enemies.',
            tags: ['HEALTHY'],
            rarity: 'uncommon',
            effects: { piercing: true },
        },

        spoon_bender: {
            id: 'spoon_bender',
            name: 'Spoon Bender',
            icon: '🥄',
            flavor: '"Psychic shot"',
            description: 'Tears seek enemies.',
            tags: ['ADDICTIVE'],
            rarity: 'rare',
            effects: { homing: true },
        },

        crown_of_thorns: {
            id: 'crown_of_thorns',
            name: 'Crown of Thorns',
            icon: '👑',
            flavor: '"Suffer"',
            description: 'Your tears are blood.',
            tags: ['PREDATORY', 'EXTRACTIVE'],
            rarity: 'uncommon',
            effects: { bloody: true },
        },
    },
    
    // === CONSUMABLES ===
    // Instant pickups - also declarative
    consumables: {
        red_heart: {
            id: 'red_heart',
            name: 'Red Heart',
            icon: '❤️',
            requires: { damaged: true },  // can only pick up if health < max
            grants: { heal: 2 },
            sound: 'pow'
        },
        half_heart: {
            id: 'half_heart',
            name: 'Half Heart',
            icon: '❤️',
            iconClass: 'heart half',
            requires: { damaged: true },
            grants: { heal: 1 },
            sound: 'pow'
        },
        soul_heart: {
            id: 'soul_heart',
            name: 'Soul Heart',
            icon: '💙',
            grants: { soulHealth: 2 },  // TODO: implement soul hearts
            sound: 'achievement'
        },
        penny: {
            id: 'penny',
            name: 'Penny',
            icon: '🪙',
            iconClass: 'coin penny',
            grants: { coins: 1 },
            sound: 'pow'
        },
        nickel: {
            id: 'nickel',
            name: 'Nickel',
            icon: '🪙',
            iconClass: 'coin nickel',
            grants: { coins: 5 },
            sound: 'pow'
        },
        dime: {
            id: 'dime',
            name: 'Dime',
            icon: '🪙',
            iconClass: 'coin dime',
            grants: { coins: 10 },
            sound: 'achievement'
        }
    },
    
    // === STATE ===
    inventory: [],      // item IDs
    activeEffects: {},  // id -> item (for items with effects)
    pedestalVisible: false,
    currentPedestal: null,
    coins: 0,
    soulHealth: 0,
    
    // === CONDITION CHECKER ===
    // Evaluates declarative conditions against metrics
    checkCondition(condition, metrics) {
        if (!condition) return true;
        
        for (const [key, check] of Object.entries(condition)) {
            const value = metrics[key];
            if (value === undefined) return false;
            
            if (typeof check === 'object') {
                if (check.gt !== undefined && !(value > check.gt)) return false;
                if (check.lt !== undefined && !(value < check.lt)) return false;
                if (check.gte !== undefined && !(value >= check.gte)) return false;
                if (check.lte !== undefined && !(value <= check.lte)) return false;
                if (check.eq !== undefined && value !== check.eq) return false;
            } else {
                if (value !== check) return false;
            }
        }
        return true;
    },
    
    // === REQUIREMENTS CHECKER ===
    // Evaluates pickup requirements
    checkRequires(requires) {
        if (!requires) return true;
        
        if (requires.damaged && Eye.health >= Eye.maxHealth) return false;
        if (requires.notFull && Eye.health >= Eye.maxHealth) return false;
        
        return true;
    },
    
    // === GRANTS APPLIER ===
    // Applies declarative grants
    applyGrants(grants) {
        if (!grants) return;
        
        if (grants.maxHealth) {
            const newMax = Math.min(Eye.maxContainers, Eye.maxHealth + grants.maxHealth);
            Eye.maxHealth = newMax;
        }
        if (grants.heal) {
            Eye.heal(grants.heal);
        }
        if (grants.soulHealth) {
            this.soulHealth += grants.soulHealth;
            // TODO: render soul hearts
        }
        if (grants.coins) {
            this.coins += grants.coins;
            // TODO: render coin counter
        }
        if (grants.damage) {
            Eye.damage(grants.damage, 'fall', 'item');
        }
    },
    
    // === EFFECTS MERGER ===
    // Merges all active item effects into one state object
    getMergedEffects() {
        const merged = {
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
            giant: false,
            pain: false,
            draining: false,
            resurrection: false,
            lives: 0,
            pulseRate: 0,
            stinky: false,
            infected: false,
            divine: false,
            laserCharge: 0,      // Now a number - beam level
            laserWidth: 25,      // Base beam width in px (max of all items)
            laserFillTime: 1.0,  // Seconds to fill one tier (averaged)
            laserDuration: 0.5,  // Base beam duration (max of all items)
            bounces: 0,          // Number of bounces for projectiles/beams
        };
        
        // Count items in inventory for stacking
        const itemCounts = {};
        for (const id of this.inventory) {
            itemCounts[id] = (itemCounts[id] || 0) + 1;
        }
        
        // Track laserFillTime for averaging
        let fillTimeSum = 0;
        let fillTimeCount = 0;
        
        // Stack effects from all items (using counts for stackable items)
        for (const [id, count] of Object.entries(itemCounts)) {
            const item = this.catalog[id];
            if (!item || !item.effects) continue;
            
            for (const [key, value] of Object.entries(item.effects)) {
                if (key === 'laserCharge') {
                    // laserCharge stacks additively based on item count
                    merged.laserCharge += value ? count : 0;
                } else if (key === 'laserWidth' || key === 'laserDuration') {
                    // laserWidth and laserDuration take max
                    merged[key] = Math.max(merged[key], value);
                } else if (key === 'bounces') {
                    // bounces stack additively
                    merged.bounces += value * count;
                } else if (key === 'laserFillTime') {
                    // laserFillTime averages (each item contributes count times)
                    fillTimeSum += value * count;
                    fillTimeCount += count;
                } else if (typeof value === 'boolean') {
                    merged[key] = merged[key] || value;  // OR booleans
                } else if (typeof value === 'number') {
                    // For numbers, use max (could be sum, depends on effect)
                    merged[key] = Math.max(merged[key] || 0, value);
                } else {
                    merged[key] = value;  // Last wins for strings/colors
                }
            }
        }
        
        // Apply averaged laserFillTime
        if (fillTimeCount > 0) {
            merged.laserFillTime = fillTimeSum / fillTimeCount;
        }
        
        return merged;
    },
    
    // === PUBLIC API ===
    
    // Health delegation to Eye
    get health() { return Eye.health; },
    set health(v) { Eye.health = v; },
    get maxHealth() { return Eye.maxHealth; },
    set maxHealth(v) { Eye.maxHealth = v; },
    get maxContainers() { return Eye.maxContainers; },
    
    // Get items matching tags
    getMatchingItems(tags, metrics) {
        const matches = [];
        
        for (const item of Object.values(this.catalog)) {
            const overlap = item.tags.filter(t => tags.includes(t));
            if (overlap.length === 0) continue;
            
            // Check declarative condition
            if (!this.checkCondition(item.condition, metrics)) continue;
            
            const rarityWeight = ItemConfig.rarityWeights[item.rarity] || 1;
            const weight = overlap.length * rarityWeight;
            
            for (let i = 0; i < weight; i++) {
                matches.push(item);
            }
        }
        
        return matches;
    },
    
    // Roll for item drop
    rollForDrop(tags, metrics) {
        let chance = ItemConfig.baseDropChance;
        if (ItemConfig.bonusDropTags.some(t => tags.includes(t))) chance += ItemConfig.bonusDropChance;
        if (ItemConfig.legendaryBonusTags.some(t => tags.includes(t))) chance += ItemConfig.legendaryBonusChance;
        
        if (Math.random() > chance) return null;
        
        const matches = this.getMatchingItems(tags, metrics);
        if (matches.length === 0) return null;
        
        return matches[Math.floor(Math.random() * matches.length)];
    },
    
    // Roll for consumable drop
    rollForConsumable(tags) {
        if (tags.includes('HEALTHY')) {
            const roll = Math.random();
            if (roll < 0.3) return 'red_heart';
            if (roll < 0.5) return 'half_heart';
        }
        if (tags.includes('HONEST') && Math.random() < 0.2) {
            return 'soul_heart';
        }
        return null;
    },
    
    // Show consumable pickup
    showConsumable(consumableId, container) {
        const consumable = this.consumables[consumableId];
        if (!consumable) return;
        
        const pickup = document.createElement('div');
        pickup.className = 'consumable-pickup';
        
        const iconClass = consumable.iconClass || '';
        pickup.innerHTML = `<span class="consumable-icon ${iconClass}">${consumable.icon}</span>`;
        
        pickup.onclick = () => this.pickupConsumable(consumableId, pickup);
        
        const target = container || document.getElementById('metrics-detail');
        if (target) {
            target.appendChild(pickup);
            setTimeout(() => pickup.classList.add('visible'), 50);
        }
    },
    
    // Pick up consumable
    pickupConsumable(consumableId, element) {
        const consumable = this.consumables[consumableId];
        if (!consumable) return;
        
        // Check requirements
        if (!this.checkRequires(consumable.requires)) return;
        
        // Remove pickup with animation
        if (element) {
            element.classList.add('picked-up');
            setTimeout(() => element.remove(), 300);
        }
        
        // Apply grants
        this.applyGrants(consumable.grants);
        
        // Play sound from item data or default
        sfx.play(consumable.sound || ItemConfig.defaultConsumableSound);
    },
    
    // Drop multiple consumables
    dropConsumables(tags, container, maxDrops = 4, dropChance = 1) {
        let numDrops = 0;
        for (let i = 0; i < maxDrops; i++) {
            const chance = dropChance * Math.pow(0.5, i);
            if (Math.random() < chance) numDrops++;
        }
        
        for (let i = 0; i < numDrops; i++) {
            const consumableId = this.rollForConsumable(tags);
            if (consumableId) {
                setTimeout(() => this.showConsumable(consumableId, container), i * 200);
            }
        }
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
        
        const container = document.getElementById('metrics-detail');
        if (container) {
            container.appendChild(pedestal);
            setTimeout(() => pedestal.classList.add('visible'), 100);
            sfx.play(ItemConfig.defaultPedestalSound);
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
        
        // Show popup
        this.showPickupPopup(item);
        
        // Apply grants (one-time effects like HP up)
        this.applyGrants(item.grants);
        
        // Store for persistent effects
        if (item.effects) {
            this.activeEffects[item.id] = item;
            this.applyEffects();
        }
        
        // Achievements
        setAchievementFlag('pickedUpItem');
        if (item.rarity === 'legendary') {
            setAchievementFlag('legendaryItem');
        }
        
        // Play sound from item data or default
        sfx.play(item.sound || ItemConfig.defaultItemSound);
        
        this.saveInventory();
        this.pedestalVisible = false;
        this.currentPedestal = null;
    },
    
    // Show pickup popup
    showPickupPopup(item) {
        const popup = document.createElement('div');
        popup.className = 'item-pickup-popup';
        popup.innerHTML = `
            <div class="item-pickup-icon">${item.icon}</div>
            <div class="item-pickup-name">${item.name}</div>
            <div class="item-pickup-flavor">${item.flavor}</div>
        `;
        
        document.body.appendChild(popup);
        setTimeout(() => popup.classList.add('visible'), 50);
        setTimeout(() => {
            popup.classList.remove('visible');
            setTimeout(() => popup.remove(), 500);
        }, 3000);
    },
    
    // Apply merged effects to eye
    applyEffects() {
        applyItemEffects(this.getMergedEffects());
    },
    
    // Health delegation
    renderHealthBar() { Eye.renderHealthBar(); },
    damage(halfHearts = 1, anim = 'fall', source = 'player') { Eye.damage(halfHearts, anim, source); },
    heal(halfHearts = 1) { Eye.heal(halfHearts); },
    addContainer() { Eye.addContainer(); },
    
    // Render item bar
    renderItemBar() {
        const bar = document.getElementById('item-bar');
        if (!bar) return;
        
        bar.innerHTML = '';
        
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
        
        const itemCounts = {};
        for (const id of this.inventory) {
            itemCounts[id] = (itemCounts[id] || 0) + 1;
        }
        
        const uniqueItems = [...new Set(this.inventory)];
        
        for (const id of uniqueItems) {
            const item = this.catalog[id];
            if (!item) continue;
            
            const count = itemCounts[id];
            const slot = document.createElement('div');
            slot.className = 'item-bar-slot';
            slot.dataset.rarity = item.rarity;
            
            if (item.stackable && count > 1) {
                slot.innerHTML = `<span class="item-icon">${item.icon}</span><span class="item-stack-count">${count}</span>`;
            } else {
                slot.innerHTML = `<span class="item-icon">${item.icon}</span>`;
            }
            
            slot.addEventListener('mouseenter', () => {
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
    
    // Persistence
    saveInventory() {
        localStorage.setItem('eyeInventory', JSON.stringify({
            inventory: this.inventory,
            active: Object.keys(this.activeEffects),
            coins: this.coins,
            soulHealth: this.soulHealth
        }));
        this.renderItemBar();
    },
    
    loadInventory() {
        const saved = localStorage.getItem('eyeInventory');
        if (saved) {
            const data = JSON.parse(saved);
            this.inventory = data.inventory || [];
            this.coins = data.coins || 0;
            this.soulHealth = data.soulHealth || 0;
            
            for (const id of (data.active || [])) {
                if (this.catalog[id]) {
                    this.activeEffects[id] = this.catalog[id];
                }
            }
            
            this.applyEffects();
        }
        this.renderItemBar();
    },
    
    clearEffects() {
        this.activeEffects = {};
        this.applyEffects();
        this.saveInventory();
    },
    
    // Console commands
    giveItem(itemId) {
        const item = this.catalog[itemId];
        if (!item) {
            console.log('Unknown item:', itemId);
            console.log('Available:', Object.keys(this.catalog).join(', '));
            return;
        }
        this.pickupItem(item);
    },
    
    place(itemId) {
        const item = this.catalog[itemId];
        if (!item) {
            console.log('Unknown item:', itemId);
            console.log('Available:', Object.keys(this.catalog).join(', '));
            return;
        }
        this.showPedestal(item);
    },
    
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

window.Items = Items;
