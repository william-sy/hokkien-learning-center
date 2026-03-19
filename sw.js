// ── sw.js — Service Worker ───────────────────────────────────────────────────
// Cache-first strategy. All static assets are pre-cached on install.
// New resources fetched at runtime are also cached for future offline use.

const CACHE = "hokkien-v23";

const ASSETS = [
  "./",
  "./index.html",
  "./dictionary.html",
  "./dictionary_chinese.html",
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
  "./review.html",
  "./writing.html",
  "./styles.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./data/dialects/shared.json",
  "./data/dialects/taiwanese.json",
  "./data/dialects/singapore.json",
  "./data/dialects/xiamen.json",
  "./data/phrases.json",
  // Malaysia North — not pre-cached (large); fetched and runtime-cached on first visit
  // "./data/dialects/malaysia_north/a-e.json",  // 1824 entries
  // "./data/dialects/malaysia_north/f-j.json",  // 1053 entries
  // "./data/dialects/malaysia_north/k-o.json",  // 874 entries
  // "./data/dialects/malaysia_north/p-t.json",  // 1789 entries
  // "./data/dialects/malaysia_north/u-z.json",  // 414 entries
  "./data/content.json",
  "./data/lessons.json",
  "./js/theme-toggle.js",
  "./js/streak.js",
  "./js/pwa.js",
  "./js/app.js",
  "./js/dictionary-page.js",
  "./js/dictionary-chinese.js",
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
  "./js/review.js",
  "./js/writing.js",
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

  // Let no-store requests (JS modules etc.) always go to network
  if (e.request.cache === "no-store") {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
