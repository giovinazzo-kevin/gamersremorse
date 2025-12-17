const NEW_GAME = {
    currencies: {
        analysis: {
            name: 'ANALYSIS COINS',
            icon: '🔵',
            amount: 10
        }
    },
    gates: {

    }
};
let progression = loadProgression();

function loadProgression() {
    return localStorage.getItem('progression') || NEW_GAME;
}
function saveProgression() {
    localStorage.setItem('progression', progression);
}

function createCheatCodeListener(codes, onMatch) {
    const keyMap = {
        'ArrowUp': '↑',
        'ArrowDown': '↓',
        'ArrowLeft': '←',
        'ArrowRight': '→'
    };

    let buffer = '';
    const maxLength = Math.max(...Object.values(codes).map(c => c.length));

    document.addEventListener('keydown', (e) => {
        const key = keyMap[e.key] || e.key.toLowerCase();
        buffer += key;

        if (buffer.length > maxLength) {
            buffer = buffer.slice(-maxLength);
        }

        for (const [name, code] of Object.entries(codes)) {
            if (buffer.endsWith(code)) {
                onMatch(name);
                buffer = '';
            }
        }
    });
}

createCheatCodeListener({
    'konami': '↑↑↓↓←→←→ba',
    'doom': 'iddqd',
    'doomguns': 'idkfa',
    'xyzzy': 'xyzzy'
}, (code) => {
    playZeldaSecretJingle();
    if (code === 'konami') {
        progression.currencies.analysis.amount += 1000;
    }
});