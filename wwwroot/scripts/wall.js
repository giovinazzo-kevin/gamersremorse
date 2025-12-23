let wallSort = 'negMedian';
let wallOrder = 'desc';
let wallOffset = 0;
let wallLoading = false;
let wallExhausted = false;

async function loadWall(append = false) {
    if (wallLoading || wallExhausted) return;
    wallLoading = true;
    
    const loading = document.getElementById('wall-loading');
    if (loading) loading.style.display = 'block';
    
    const res = await fetch(`/wall?sort=${wallSort}&order=${wallOrder}&limit=50&offset=${wallOffset}`);
    const games = await res.json();
    
    if (games.length < 50) wallExhausted = true;
    
    const tbody = document.getElementById('wall-body');
    if (!append) tbody.innerHTML = '';
    
    for (const game of games) {
        const sunkCost = game.posMedian > 0 ? ((game.negMedian * game.steamNegative) / (game.posMedian * game.steamPositive)).toFixed(2) : '—';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="name-cell">
                <canvas class="row-thumb" width="120" height="100"></canvas>
                <span class="game-name">${game.name}</span>
            </td>
            <td class="sunkCost">${sunkCost}x</td>
            <td class="pos">${formatTime(game.posMedian)}</td>
            <td class="neg">${formatTime(game.negMedian)}</td>
            <td class="updated">${formatDate(game.updatedOn)}</td>
        `;
        tr.addEventListener('click', () => {
            navigate('play');
            setTimeout(() => {
                document.getElementById('appId').value = game.appId;
                analyze();
            }, 100);
        });
        
        tbody.appendChild(tr);
        
        // Render fingerprint
        if (game.thumbnailPng) {
            const canvas = tr.querySelector('canvas');
            const rgba = decodeFingerprint(game.thumbnailPng);
            renderFingerprint(rgba, canvas);
        }

        // Infinite scroll
        const scrollHandler = () => {
            if (currentPage !== 'wall' && currentPage !== 'fame') return;
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                loadWall(true);
            }
        };
        window.removeEventListener('scroll', scrollHandler);
        window.addEventListener('scroll', scrollHandler);
    }
    
    wallOffset += games.length;
    wallLoading = false;
    if (loading) loading.style.display = 'none';
}

function formatTime(minutes) {
    if (!minutes || minutes === 0) return '—';
    const hours = minutes / 60;
    if (hours < 1) return `${Math.round(minutes)}m`;
    if (hours < 100) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours)}h`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function initWallTable() {
    const headers = document.querySelectorAll('.wall-table th.sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const sort = th.dataset.sort;
            
            // Toggle order if same column, else default to desc
            if (wallSort === sort) {
                wallOrder = wallOrder === 'desc' ? 'asc' : 'desc';
            } else {
                wallSort = sort;
                wallOrder = 'desc';
            }
            
            // Update header states
            headers.forEach(h => {
                h.classList.remove('active', 'asc', 'desc');
            });
            th.classList.add('active', wallOrder);
            
            // Reload
            wallOffset = 0;
            wallExhausted = false;
            loadWall();
        });
    });
}

function init_wall() {
    wallOffset = 0;
    wallExhausted = false;
    wallSort = 'sunkCost';
    wallOrder = 'desc';

    initWallTable();

    // Set initial header state
    const th = document.querySelector('.wall-table th[data-sort="sunkCost"]');
    if (th) {
        document.querySelectorAll('.wall-table th').forEach(h => h.classList.remove('active', 'asc', 'desc'));
        th.classList.add('active', 'asc');
    }

    loadWall();
}


function init_fame() {
    wallOffset = 0;
    wallExhausted = false;
    wallSort = 'sunkCost';
    wallOrder = 'asc';
    
    initWallTable();
    
    // Set initial header state
    const th = document.querySelector('.wall-table th[data-sort="sunkCost"]');
    if (th) {
        document.querySelectorAll('.wall-table th').forEach(h => h.classList.remove('active', 'asc', 'desc'));
        th.classList.add('active', 'asc');
    }
    
    loadWall();
}
