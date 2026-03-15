// ── sw.js — Service Worker ───────────────────────────────────────────────────
// Cache-first strategy. All static assets are pre-cached on install.
// New resources fetched at runtime are also cached for future offline use.

const CACHE = "hokkien-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./dictionary.html",
  "./phrases.html",
  "./grammar.html",
  "./tones.html",
  "./comparison.html",
  "./info.html",
  "./contribute.html",
  "./flashcards.html",
  "./tone-quiz.html",
  "./character-match.html",
  "./typing-practice.html",
  "./phrase-builder.html",
  "./cloze.html",
  "./lessons.html",
  "./styles.css",
  "./manifest.json",
  "./data/dictionary.json",
  "./data/content.json",
  "./data/lessons.json",
  "./js/theme-toggle.js",
  "./js/streak.js",
  "./js/pwa.js",
  "./js/app.js",
  "./js/dictionary-page.js",
  "./js/phrases-page.js",
  "./js/info.js",
  "./js/contribute.js",
  "./js/lessons.js",
  "./js/progress-manager.js",
  "./js/flashcards.js",
  "./js/tone-quiz.js",
  "./js/character-match.js",
  "./js/typing-practice.js",
  "./js/phrase-builder.js",
  "./js/cloze.js",
];

// Pre-cache everything on install
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Delete old caches on activate
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: serve from cache, fall back to network and cache the result
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached); // if network fails, return cache (may be undefined)
    })
  );
});
