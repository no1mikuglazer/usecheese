/* Cheese — Database page */
/* =====================
   Database — script.js
   =====================
   - Renders player cards from a data-driven registry (add players, not code).
   - Opening a player loads their PGN file, splits it into individual games by
     the [Event] headers, and generates one card per game (dynamic — adding a
     PGN with more games just produces more cards).
   - Clicking a game stores ONLY that game's PGN in localStorage and opens the
     Analysis page, which loads it through the existing Review import pipeline.
   ===================== */

document.addEventListener('DOMContentLoaded', () => {

    // Disabled nav items never navigate.
    document.querySelectorAll('.left-nav-disabled').forEach(item => {
        item.addEventListener('click', e => e.preventDefault());
    });

    // ── Player registry — extend this to add more players ──────────────────────
    const PLAYERS = [
        {
            id: 'magnus',
            name: 'Magnus Carlsen',
            image: '../../data/masters/magnus/carslen.jpg',
            pgn: '../../data/masters/magnus/magnus1.pgn',
            // surname matched (case-insensitive) against the White/Black headers
            match: 'carlsen',
        },
        {
            id: 'fischer',
            name: 'Bobby Fischer',
            image: '../../data/masters/fisher/fisher.jpg',
            pgn: '../../data/masters/fisher/fisher1.pgn',
            // folder is "Fisher", but PGN headers use the surname "Fischer"
            match: 'fischer',
        },
        {
            id: 'anatoly',
            name: 'Anatoly Karpov',
            image: '../../data/masters/anatoly/anatoly.jpeg',
            pgn: '../../data/masters/anatoly/anatoly.pgn',
            match: 'karpov',
        },
        {
            id: 'botvinik',
            name: 'Mikhail Botvinnik',
            image: '../../data/masters/botvinik/botvinik.jpeg',
            pgn: '../../data/masters/botvinik/botvinik.pgn',
            // folder is "Botvinik", but PGN headers use the surname "Botvinnik"
            match: 'botvinnik',
        },
        {
            id: 'gukesh',
            name: 'Gukesh Dommaraju',
            image: '../../data/masters/gukesh/gukesh.jpeg',
            pgn: '../../data/masters/gukesh/gukesh.pgn',
            match: 'gukesh',
        },
        {
            id: 'hikaru',
            name: 'Hikaru Nakamura',
            image: '../../data/masters/hikaru/hikaru.jpeg',
            pgn: '../../data/masters/hikaru/hikaru.pgn',
            match: 'nakamura',
        },
        {
            id: 'tal',
            name: 'Mikhail Tal',
            image: '../../data/masters/tal/tal.jpeg',
            pgn: '../../data/masters/tal/tal.pgn',
            match: 'tal',
        },
        {
            id: 'vishy',
            name: 'Viswanathan Anand',
            image: '../../data/masters/vishy/vishy.jpeg',
            pgn: '../../data/masters/vishy/vishy.pgn',
            match: 'anand',
        },
    ];
    const playerById = id => PLAYERS.find(p => p.id === id);

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const playersView = document.getElementById('dbPlayersView');
    const playerView  = document.getElementById('dbPlayerView');
    const playersGrid = document.getElementById('dbPlayersGrid');
    const gamesGrid   = document.getElementById('dbGamesGrid');
    const statusEl    = document.getElementById('dbStatus');
    const backBtn     = document.getElementById('dbBackBtn');
    const photoEl     = document.getElementById('dbPlayerPhoto');
    const nameEl      = document.getElementById('dbPlayerName');
    const subEl       = document.getElementById('dbPlayerSub');

    let currentGames = [];   // [{ pgn, title, event, date, result }]
    let loadToken = 0;       // bumped per openPlayer call so a superseded (slow)
                             // PGN fetch never renders over the newer player

    // ── Players ────────────────────────────────────────────────────────────────
    function renderPlayers() {
        const frag = document.createDocumentFragment();
        PLAYERS.forEach(p => {
            const card = document.createElement('div');
            card.className = 'db-player-card';
            card.dataset.playerId = p.id;
            card.innerHTML =
                '<div class="db-player-card-photo" style="background-image:url(\'' +
                    encodeURI(p.image) + '\')"></div>' +
                '<div class="db-player-card-body">' +
                    '<span class="db-player-card-name">' + escapeHtml(p.name) + '</span>' +
                    '<span class="db-player-card-hint">View games \u2192</span>' +
                '</div>';
            frag.appendChild(card);
        });
        playersGrid.innerHTML = '';
        playersGrid.appendChild(frag);
    }

    playersGrid.addEventListener('click', e => {
        const card = e.target.closest('.db-player-card');
        if (!card) return;
        location.hash = card.dataset.playerId;   // route to the player view
    });

    // ── PGN parsing helpers ────────────────────────────────────────────────────
    // Split a multi-game PGN into individual games using the [Event] headers.
    function splitPGNGames(text) {
        const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!t) return [];
        return t.split(/\n(?=\[Event\s)/g).map(s => s.trim()).filter(Boolean);
    }

    function header(pgn, key) {
        const m = pgn.match(new RegExp('\\[' + key + '\\s+"([^"]*)"\\]'));
        return m ? m[1].trim() : '';
    }

    // "Last, First" -> "First Last"; otherwise returned unchanged.
    function tidyName(n) {
        if (!n) return '';
        const i = n.indexOf(',');
        if (i > -1) {
            const last = n.slice(0, i).trim();
            const first = n.slice(i + 1).trim();
            return first ? first + ' ' + last : last;
        }
        return n.trim();
    }

    // "2026.01.06" -> "6 Jan 2026"; unknown/empty -> "".
    function prettyDate(d) {
        if (!d || d.indexOf('?') > -1) return '';
        const m = d.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
        if (!m) return d;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return parseInt(m[3], 10) + ' ' + (months[parseInt(m[2], 10) - 1] || m[2]) + ' ' + m[1];
    }

    // Build display data for a single game relative to the active player.
    function buildGame(pgn, player) {
        const white = header(pgn, 'White');
        const black = header(pgn, 'Black');
        const event = header(pgn, 'Event');
        const date  = header(pgn, 'Date');
        let result  = header(pgn, 'Result');
        if (!result || result === '?') {
            const rm = pgn.match(/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/);
            result = rm ? rm[1] : '';
        }

        const key = (player.match || '').toLowerCase();
        const playerIsWhite = white.toLowerCase().indexOf(key) > -1;
        const playerIsBlack = black.toLowerCase().indexOf(key) > -1;

        let title;
        if (playerIsWhite) {
            title = player.name + ' vs ' + (tidyName(black) || 'Unknown');
        } else if (playerIsBlack) {
            title = (tidyName(white) || 'Unknown') + ' vs ' + player.name;
        } else {
            title = (tidyName(white) || 'White') + ' vs ' + (tidyName(black) || 'Black');
        }

        return { pgn, title, event, date, result };
    }

    // ── Open a player → load + parse PGN → render game cards ────────────────────
    async function openPlayer(player) {
        const token = ++loadToken;

        playersView.hidden = true;
        playerView.hidden = false;
        window.scrollTo(0, 0);

        photoEl.style.backgroundImage = "url('" + encodeURI(player.image) + "')";
        nameEl.textContent = player.name;
        subEl.textContent = '';
        statusEl.textContent = 'Loading games\u2026';
        gamesGrid.innerHTML = '';
        currentGames = [];

        let text;
        try {
            const res = await fetch(player.pgn);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            text = await res.text();
        } catch (err) {
            console.error('Database: failed to load PGN', err);
            if (token !== loadToken) return;   // superseded — leave the newer view alone
            statusEl.textContent = 'Could not load games for ' + player.name + '.';
            return;
        }

        // Another player was opened while this PGN was still downloading; drop
        // this result instead of appending it under the newer player's heading.
        if (token !== loadToken) return;

        currentGames = splitPGNGames(text).map(chunk => buildGame(chunk, player));

        subEl.textContent = currentGames.length +
            (currentGames.length === 1 ? ' game' : ' games');
        statusEl.textContent = currentGames.length
            ? 'Select a game to open it in Analysis.'
            : 'No games found in this file.';

        renderGames();
    }

    function renderGames() {
        const frag = document.createDocumentFragment();
        currentGames.forEach((g, i) => {
            const card = document.createElement('div');
            card.className = 'db-game-card';
            card.dataset.gameIndex = String(i);

            const date = prettyDate(g.date);
            let html = '<div class="db-game-title">' + escapeHtml(g.title) + '</div>';
            if (g.event) html += '<div class="db-game-event">' + escapeHtml(g.event) + '</div>';
            html += '<div class="db-game-foot">';
            if (date) html += '<span class="db-game-date">' + escapeHtml(date) + '</span>';
            if (g.result) html += '<span class="db-game-result">' + escapeHtml(g.result) + '</span>';
            html += '</div>';

            card.innerHTML = html;
            frag.appendChild(card);
        });
        gamesGrid.appendChild(frag);
    }

    // ── Game click → hand ONLY that game's PGN to Analysis (Review pipeline) ────
    gamesGrid.addEventListener('click', e => {
        const card = e.target.closest('.db-game-card');
        if (!card) return;
        const game = currentGames[parseInt(card.dataset.gameIndex, 10)];
        if (!game) return;

        try {
            localStorage.setItem('cheeseImportPGN', game.pgn);
        } catch (err) {
            console.error('Database: could not store game PGN', err);
        }
        window.location.href = '../analysis/index.html';
    });

    // ── Routing (hash-based, so refresh/back/forward work) ─────────────────────
    function showPlayers() {
        playerView.hidden = true;
        playersView.hidden = false;
        window.scrollTo(0, 0);
    }

    function route() {
        const id = (location.hash || '').replace(/^#/, '').trim();
        const player = id ? playerById(id) : null;
        if (player) openPlayer(player);
        else showPlayers();
    }

    backBtn.addEventListener('click', () => { location.hash = ''; });
    window.addEventListener('hashchange', route);

    // ── Helper ─────────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // ── Go ─────────────────────────────────────────────────────────────────────
    renderPlayers();
    route();

});