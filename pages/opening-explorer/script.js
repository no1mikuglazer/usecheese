/* Cheese — Opening Explorer page */
/* =====================
   Opening Explorer — script.js  (V1 + Analysis integration)
   =====================
   - Loads library/eco/openings.json ONCE on page load into allOpenings.
     That file is derived from the 5 raw ECO sources by scripts/shrink-eco.mjs
     — see there for why the page no longer reads the sources directly.
   - Live, case-insensitive, partial-match search on the "name" field.
   - Empty search shows all openings.
   - Renders dark-panel cards (name + ECO code only) into a responsive grid.
   - Clicking a card stores the opening (eco/name/moves) in localStorage and
     navigates to the Analysis page, which auto-loads it.
   - Large result sets render incrementally via an IntersectionObserver
     sentinel so the page stays responsive.
   - Cards reveal in a coordinated, row-by-row cascade (see reveal observer).
   ===================== */

document.addEventListener('DOMContentLoaded', () => {

    // ── DOM refs ────────────────────────────────────────────────────────────
    const searchInput = document.getElementById('oeSearchInput');
    const grid        = document.getElementById('oeGrid');
    const statusEl    = document.getElementById('oeStatus');
    const sentinel    = document.getElementById('oeSentinel');

    // ── State ─────────────────────────────────────────────────────────────────
    // One pre-derived file rather than the five raw library/eco/eco{A..E}.json
    // sources. Those are FEN-keyed and carry five fields this page never reads,
    // so loading them meant parsing 4.5MB to use 1.4MB of it. Regenerate with
    // `node scripts/shrink-eco.mjs` after editing any source file.
    const OPENINGS_FILE = '../../library/eco/openings.json';

    let allOpenings = [];     // merged, loaded once
    let filtered    = [];     // current search results
    let rendered    = 0;      // how many of `filtered` are in the DOM
    const CHUNK     = 60;     // cards added per render pass

    // ── Coordinated row-reveal animation ──────────────────────────────────────
    // Cards start hidden (CSS). A card is revealed by adding `.is-revealed`.
    // Cards that enter the viewport together share the same row-top, so we
    // reveal a whole row at once, and cascade successive rows by REVEAL_STEP.
    // Revealing is once-only: each card is unobserved the moment it's shown.
    const REVEAL_STEP = 70;   // ms between rows in a cascade
    const REVEAL_CAP  = 6;    // max rows of stagger in a single batch
    let revealObserver = null;

    function revealEntries(entries) {
        // Group the rows that just entered by their (rounded) viewport top.
        const rows = new Map(); // top -> [cards]
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const card = entry.target;
            revealObserver.unobserve(card);            // once only
            const top = Math.round(entry.boundingClientRect.top);
            if (!rows.has(top)) rows.set(top, []);
            rows.get(top).push(card);
        }
        if (rows.size === 0) return;

        // Cascade the rows top -> bottom; all cards in a row reveal together.
        const tops = [...rows.keys()].sort((a, b) => a - b);
        tops.forEach((top, i) => {
            const cards = rows.get(top);
            const delay = Math.min(i, REVEAL_CAP) * REVEAL_STEP;
            if (delay === 0) {
                cards.forEach(c => c.classList.add('is-revealed'));
            } else {
                setTimeout(() => {
                    cards.forEach(c => c.classList.add('is-revealed'));
                }, delay);
            }
        });
    }

    function setupRevealObserver() {
        if (!('IntersectionObserver' in window)) { revealObserver = null; return; }
        revealObserver = new IntersectionObserver(revealEntries, {
            root: null,
            rootMargin: '0px 0px -5% 0px',
            threshold: 0.05,
        });
    }

    function observeForReveal(cards) {
        if (revealObserver) {
            cards.forEach(c => revealObserver.observe(c));
        } else {
            // No IntersectionObserver support: just show everything.
            cards.forEach(c => c.classList.add('is-revealed'));
        }
    }

    // ── Load + merge ECO data once ────────────────────────────────────────────
    async function loadOpenings() {
        try {
            const res = await fetch(OPENINGS_FILE);
            if (!res.ok) throw new Error(`Failed to load ${OPENINGS_FILE} (${res.status})`);
            const rows = await res.json();

            // Stored as [eco, name, moves] tuples — see scripts/shrink-eco.mjs
            // for why the keys aren't repeated 12,379 times in the file.
            // `nameLower` is built here rather than shipped: it would cost
            // ~0.7MB in the file to save this single pass, and the search
            // filter would otherwise lowercase every name on every keystroke.
            allOpenings = rows.map(([eco, name, moves]) => ({
                eco,
                name,
                moves,
                nameLower: name.toLowerCase(),
            }));

            // Initial view = everything
            applyFilter('');

        } catch (err) {
            console.error('Opening Explorer: failed to load ECO data', err);
            statusEl.textContent = 'Could not load opening data.';
            grid.innerHTML =
                '<div class="oe-empty">' +
                    '<div class="oe-empty-icon" aria-hidden="true"></div>' +
                    '<div class="oe-empty-title">Couldn’t load openings.</div>' +
                    '<div class="oe-empty-text">Check that the ECO JSON files are present.</div>' +
                '</div>';
        }
    }

    // ── Filtering ─────────────────────────────────────────────────────────────
    function applyFilter(rawQuery) {
        const q = rawQuery.trim().toLowerCase();

        filtered = q === ''
            ? allOpenings
            : allOpenings.filter(o => o.nameLower.includes(q));

        // Reset the grid for the new result set
        grid.innerHTML = '';
        rendered = 0;
        if (revealObserver) revealObserver.disconnect();   // stop watching old cards

        if (filtered.length === 0) {
            statusEl.textContent = 'No openings found.';
            grid.innerHTML =
                '<div class="oe-empty">' +
                    '<div class="oe-empty-icon" aria-hidden="true"></div>' +
                    '<div class="oe-empty-title">No openings found.</div>' +
                    '<div class="oe-empty-text">Nothing matches “' +
                    escapeHtml(rawQuery.trim()) + '”. Try another search.</div>' +
                '</div>';
            return;
        }

        const count = filtered.length.toLocaleString();
        statusEl.textContent = q === ''
            ? `Showing all ${count} openings`
            : `${count} ${filtered.length === 1 ? 'opening' : 'openings'} found`;

        renderNextChunk();
    }

    // ── Incremental rendering ─────────────────────────────────────────────────
    function renderNextChunk() {
        const next = filtered.slice(rendered, rendered + CHUNK);
        if (next.length === 0) return;

        const frag = document.createDocumentFragment();
        const newCards = [];

        for (const opening of next) {
            const card = document.createElement('div');
            card.className = 'oe-card';
            card.style.cursor = 'pointer';

            // Store the data needed to hand off to Analysis on click
            card.dataset.eco   = opening.eco;
            card.dataset.name  = opening.name;
            card.dataset.moves = opening.moves;

            const name = document.createElement('div');
            name.className = 'oe-card-name';
            name.textContent = opening.name;

            const eco = document.createElement('div');
            eco.className = 'oe-card-eco';
            eco.textContent = opening.eco;

            card.appendChild(name);
            if (opening.eco) card.appendChild(eco);
            frag.appendChild(card);
            newCards.push(card);
        }

        grid.appendChild(frag);
        rendered += next.length;

        // Hand the freshly-added cards to the row-reveal observer.
        observeForReveal(newCards);
    }

    // ── Card click → store opening, open Analysis ─────────────────────────────
    // Event delegation: one listener handles every card, including those added
    // later by incremental rendering.
    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.oe-card');
        if (!card) return;

        const opening = {
            eco:   card.dataset.eco   || '',
            name:  card.dataset.name  || '',
            moves: card.dataset.moves || '',
        };

        try {
            localStorage.setItem('selectedOpening', JSON.stringify(opening));
        } catch (err) {
            console.error('Opening Explorer: could not store selected opening', err);
        }

        window.location.href = '../analysis/index.html';
    });

    // Load more as the sentinel scrolls into view
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) renderNextChunk();
    }, { rootMargin: '400px' });

    if (sentinel) observer.observe(sentinel);

    // ── Live search (debounced) ───────────────────────────────────────────────
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => applyFilter(searchInput.value), 120);
    });

    // ── Small helper ──────────────────────────────────────────────────────────
    // escapeHtml — defined by assets/js/clerk-client.js, which every page
    // carrying the nav already loads before this file. That copy coerces its
    // argument with String() first; this one did not, so it would have thrown
    // on anything but a string.

    // ── Go ────────────────────────────────────────────────────────────────────
    setupRevealObserver();
    loadOpenings();

});