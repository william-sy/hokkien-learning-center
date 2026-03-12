// ── theme-toggle.js ──────────────────────────────────────────────────────────
// Plain (non-module) script loaded in <head> so the correct theme is applied
// before first paint — no flash of wrong colour scheme.
// Persists choice in localStorage under "hokkien_theme".

(function () {
  const LS_KEY    = "hokkien_theme";
  const preferred = window.matchMedia("(prefers-color-scheme: light)").matches
                      ? "light" : "dark";
  const saved     = localStorage.getItem(LS_KEY);
  const theme     = saved || preferred;

  // Apply immediately — before any paint
  document.documentElement.setAttribute("data-theme", theme);

  function updateBtn(btn, t) {
    btn.textContent = t === "dark" ? "☀️" : "🌙";
    btn.title       = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;

    var current = document.documentElement.getAttribute("data-theme") || preferred;
    updateBtn(btn, current);

    btn.addEventListener("click", function () {
      var now  = document.documentElement.getAttribute("data-theme") || preferred;
      var next = now === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(LS_KEY, next);
      updateBtn(btn, next);
    });
  });
})();
