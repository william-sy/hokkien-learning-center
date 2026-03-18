// ── review.js — Spaced Repetition Review ─────────────────────────────────────
// Simple Leitner-style SRS with 5 ease buckets.
// Storage key: hokkien_srs  →  { [english]: { ease, nextReview, correct, reviews } }

const SRS_KEY    = "hokkien_srs";
const LEARNED_KEY = "hokkien_learned_words";

// Interval in days per ease bucket (index 0 = ease 1)
const INTERVALS = [1, 3, 7, 14, 30];

const DIALECT_LABELS = {
  shared:           "Shared / Cross-dialect",
  quanzhou:         "Quanzhou",
  zhangzhou:        "Zhangzhou",
  xiamen:           "Xiamen / Amoy",
  taiwanese:        "Taiwanese",
  sea_hokkien:      "SE Asian Hokkien",
  malaysia_north:   "Malaysian – North",
  malaysia_central: "Malaysian – Central",
  malaysia_south:   "Malaysian – South",
  singapore:        "Singaporean",
  philippine:       "Philippine",
  indonesian:       "Indonesian",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function loadSRS() {
  try { return JSON.parse(localStorage.getItem(SRS_KEY) || "{}"); }
  catch { return {}; }
}

function saveSRS(data) {
  localStorage.setItem(SRS_KEY, JSON.stringify(data));
}

function loadLearnedSet() {
  try {
    const raw = localStorage.getItem(LEARNED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

// ── SRS scheduling ───────────────────────────────────────────────────────────

function getOrCreateCard(srs, english) {
  if (!srs[english]) {
    srs[english] = { ease: 1, nextReview: todayISO(), correct: 0, reviews: 0 };
  }
  return srs[english];
}

function isDue(card) {
  return card.nextReview <= todayISO();
}

function scheduleCard(card, rating) {
  card.reviews += 1;
  if (rating === "again") {
    card.ease = Math.max(1, card.ease - 1);
    // Keep nextReview as today so it may appear later this session if re-added
    card.nextReview = todayISO();
  } else if (rating === "hard") {
    // Keep ease, schedule at current interval
    card.nextReview = addDays(todayISO(), INTERVALS[card.ease - 1]);
    card.correct += 1;
  } else {
    // easy: advance ease bucket
    card.ease = Math.min(5, card.ease + 1);
    card.nextReview = addDays(todayISO(), INTERVALS[card.ease - 1]);
    card.correct += 1;
  }
  return card;
}

// Label for the next interval shown on buttons
function intervalLabel(ease, rating) {
  let nextEase = ease;
  if (rating === "again") nextEase = Math.max(1, ease - 1);
  else if (rating === "easy") nextEase = Math.min(5, ease + 1);
  const days = INTERVALS[nextEase - 1];
  return days === 1 ? "tomorrow" : `${days}d`;
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function byId(id) { return document.getElementById(id); }

function renderStats(due, total) {
  const wrap = byId("reviewStats");
  wrap.style.display = "flex";
  wrap.innerHTML = `
    <div class="srs-stat">
      <div class="srs-stat-num">${due}</div>
      <div class="srs-stat-label">due today</div>
    </div>
    <div class="srs-stat">
      <div class="srs-stat-num">${total}</div>
      <div class="srs-stat-label">total enrolled</div>
    </div>`;
}

function renderEmpty(learnedCount) {
  const body = byId("reviewBody");
  if (learnedCount === 0) {
    body.innerHTML = `
      <div class="review-empty">
        <div class="empty-icon">📖</div>
        <p>You haven't marked any words as learned yet.</p>
        <p>Go to the <a href="dictionary.html">Dictionary</a> and tap <strong>★ Mark learned</strong> on words you know — they'll appear here for review.</p>
      </div>`;
  } else {
    const srs   = loadSRS();
    const today = todayISO();
    // Find next due date
    const nextDates = Object.values(srs).map(c => c.nextReview).filter(Boolean).sort();
    const nextDate  = nextDates.find(d => d > today);
    body.innerHTML = `
      <div class="review-empty">
        <div class="empty-icon">✅</div>
        <h3>All caught up!</h3>
        <p>No cards due right now.${nextDate ? ` Next review: <strong>${nextDate}</strong>.` : ""}</p>
        <p class="muted small">Keep marking words as learned in the <a href="dictionary.html">Dictionary</a> to grow your review queue.</p>
      </div>`;
  }
}

function renderDone(session) {
  const body = byId("reviewBody");
  const pct  = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;
  body.innerHTML = `
    <div class="review-done">
      <div class="done-icon">🎉</div>
      <h3>Session complete!</h3>
      <p>${session.total} card${session.total !== 1 ? "s" : ""} reviewed &mdash; <strong>${pct}%</strong> correct</p>
      <div class="srs-stats" style="justify-content:center;margin:1rem 0;">
        <div class="srs-stat">
          <div class="srs-stat-num" style="color:#27ae60">${session.correct}</div>
          <div class="srs-stat-label">correct</div>
        </div>
        <div class="srs-stat">
          <div class="srs-stat-num" style="color:#e74c3c">${session.again}</div>
          <div class="srs-stat-label">again</div>
        </div>
      </div>
      <button class="btn-show" id="reviewAgainBtn" style="margin-top:0.5rem">Review again</button>
    </div>`;
  document.getElementById("reviewAgainBtn")?.addEventListener("click", () => init());
}

// ── main session ─────────────────────────────────────────────────────────────

async function init() {
  const body = byId("reviewBody");
  body.innerHTML = `<p class="muted" style="text-align:center;padding:1.5rem">Loading…</p>`;
  byId("reviewStats").style.display = "none";

  // Load dictionary
  let dict = [];
  try {
    const res = await fetch("data/dialects/shared.json", { cache: "no-store" });
    dict = await res.json();
  } catch (e) {
    body.innerHTML = `<p class="muted">Could not load dictionary data.</p>`;
    return;
  }

  const dictMap = new Map(dict.map(e => [e.english.toLowerCase(), e]));
  const learned = loadLearnedSet();

  if (learned.size === 0) { renderEmpty(0); return; }

  const srs  = loadSRS();
  const today = todayISO();

  // Build due queue from learned words
  let dueQueue = [];
  for (const english of learned) {
    const card = getOrCreateCard(srs, english);
    if (isDue(card)) dueQueue.push(english);
  }

  // Save any newly created cards
  saveSRS(srs);

  renderStats(dueQueue.length, Object.keys(srs).length);

  if (dueQueue.length === 0) { renderEmpty(learned.size); return; }

  // Session state
  const session = { queue: [...dueQueue], total: 0, correct: 0, again: 0, done: new Set() };

  function showCard(english) {
    const entry = dictMap.get(english.toLowerCase());
    const card  = srs[english];

    body.innerHTML = `
      <div class="review-meta">
        <span>${session.done.size} / ${dueQueue.length} done</span>
        <span>${dueQueue.length - session.done.size} remaining</span>
      </div>
      <div class="review-progress-bar">
        <div class="review-progress-fill" style="width:${Math.round(session.done.size / dueQueue.length * 100)}%"></div>
      </div>
      <div class="review-card review-card-front" id="cardFront">
        <div class="card-english">${english}</div>
      </div>
      <div class="review-actions">
        <button class="btn-show" id="btnShow">Show answer</button>
      </div>`;

    document.getElementById("btnShow").addEventListener("click", () => {
      // Replace card body with the answer
      const cardEl = document.getElementById("cardFront");
      cardEl.classList.replace("review-card-front", "review-card-back");

      const romParts = [entry?.poj, entry?.tl].filter(Boolean);
      const rom      = romParts.join("  ·  ") || "—";
      const dialectLabel = entry ? (DIALECT_LABELS[entry.dialectId] || entry.dialectId) : "";

      cardEl.innerHTML = `
        ${entry?.hanzi ? `<div class="card-hanzi">${entry.hanzi}</div>` : ""}
        <div class="card-rom">${rom}</div>
        ${dialectLabel ? `<div class="card-dialect">${dialectLabel}</div>` : ""}
        ${entry?.example ? `<p class="card-example">${entry.example}</p>` : ""}`;

      const ease = card.ease;
      body.querySelector(".review-actions").innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;width:100%">
          <div class="review-actions">
            <button class="btn-rating btn-again" id="btnAgain">Again ✗<span class="interval-hint">${intervalLabel(ease,"again")}</span></button>
            <button class="btn-rating btn-hard"  id="btnHard">Hard ↩<span class="interval-hint">${intervalLabel(ease,"hard")}</span></button>
            <button class="btn-rating btn-easy"  id="btnEasy">Easy ✓<span class="interval-hint">${intervalLabel(ease,"easy")}</span></button>
          </div>
        </div>`;

      function rate(rating) {
        scheduleCard(card, rating);
        saveSRS(srs);
        session.total += 1;
        if (rating === "again") {
          session.again += 1;
          // Re-insert at end of queue for this session
          session.queue.push(english);
        } else {
          session.correct += 1;
          session.done.add(english);
        }
        next();
      }

      document.getElementById("btnAgain").addEventListener("click", () => rate("again"));
      document.getElementById("btnHard").addEventListener("click",  () => rate("hard"));
      document.getElementById("btnEasy").addEventListener("click",  () => rate("easy"));
    });
  }

  function next() {
    if (session.queue.length === 0) {
      renderDone(session);
      return;
    }
    const english = session.queue.shift();
    showCard(english);
  }

  next();
}

document.addEventListener("DOMContentLoaded", init);
