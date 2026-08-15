/* =====================
   Home — script.js
   =====================
   The Home page is intentionally lightweight.
   This file exists as the Home page's own script entry point
   so future functionality can be added here independently
   of the Analysis page.
   ===================== */

document.addEventListener('DOMContentLoaded', () => {

    // Logo links to Home — prevent reload since we're already here
    const logoLink = document.getElementById('logoLink');
    if (logoLink) {
        logoLink.addEventListener('click', e => e.preventDefault());
    }

});