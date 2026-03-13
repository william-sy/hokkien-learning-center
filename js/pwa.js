// ── pwa.js — Service Worker registration ─────────────────────────────────────
// Registers sw.js relative to the current page, so it works both on
// localhost (root) and GitHub Pages (/hokkien-learning-center/ subdirectory).

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Derive the SW URL from the current page's directory
    const swUrl = new URL("sw.js", location.href).href;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Silently ignore — site works fine without offline support
    });
  });
}
