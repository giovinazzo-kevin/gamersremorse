const pageCache = {};
let currentPage = null;

async function navigate(page) {
    if (currentPage === page) return;

    // Cleanup before leaving current page
    if (currentPage === 'play') {
        // Save checkbox state before leaving
        if (typeof saveCheckboxState === 'function') saveCheckboxState();
        
        // Close WebSocket but keep state for restoration
        if (typeof currentSocket !== 'undefined' && currentSocket && currentSocket.readyState !== WebSocket.CLOSED) {
            currentSocket.close();
        }
        currentSocket = null;
        if (typeof isStreaming !== 'undefined') isStreaming = false;
        // NOTE: Keep currentSnapshot, currentMetrics, currentGameInfo for restoration
    }

    if (!pageCache[page]) {
        const res = await fetch(`${page}.html`);
        if (!res.ok) {
            console.error(`Failed to load page: ${page}`);
            return;
        }
        pageCache[page] = await res.text();
    }
    currentPage = page;
    document.getElementById('main').innerHTML = pageCache[page];

    // Update nav active state
    document.querySelectorAll('.nav a[data-page]').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });

    // Run page-specific init
    if (window[`init_${page}`]) window[`init_${page}`]();
}

// Wire up nav clicks
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav a[data-page]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            navigate(a.dataset.page);
        });
    });

    // Initial page
    navigate('play');
});