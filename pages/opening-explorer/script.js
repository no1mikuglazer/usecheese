/* Cheese — Opening Explorer page */
/* =====================
   Opening Explorer — script.js  (V1 + Analysis integration)
   =====================
   - Loads the 5 ECO JSON files ONCE on page load.
   - Merges them into a single in-memory array (allOpenings).
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
    const ECO_FILES = [
        '../../library/eco/ecoA.json',
        '../../library/eco/ecoB.json',
        '../../library/eco/ecoC.json',
        '../../library/eco/ecoD.json',
        '../../library/eco/ecoE.json',
    ];

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
            const responses = await Promise.all(
                ECO_FILES.map(file =>
                    fetch(file).then(res => {
                        if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
                        return res.json();
                    })
                )
            );

            // Each file may be an array of entries, or an object/map of entries.
            // Normalise both shapes into a flat array. Keep moves for Analysis.
            responses.forEach(data => {
                const entries = Array.isArray(data) ? data : Object.values(data);
                for (const entry of entries) {
                    if (entry && entry.name) {
                        allOpenings.push({
                            eco:   entry.eco   || '',
                            name:  entry.name  || '',
                            moves: entry.moves || '',
                        });
                    }
                }
            });

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
            : allOpenings.filter(o => o.name.toLowerCase().includes(q));

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
    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // ── Go ────────────────────────────────────────────────────────────────────
    setupRevealObserver();
    loadOpenings();

});