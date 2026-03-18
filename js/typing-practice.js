// ── typing-practice.js ──────────────────────────────────────────────────────

const COOKIE_KEYS = {
  dialect: "hokkien_typing_dialect",
  source:  "hokkien_typing_source",
  mode:    "hokkien_typing_mode"
};

const state = {
  content:    null,
  allEntries: [],          // merged words + phrases depending on source
  deck:       [],
  idx:        0,
  dialect:    "all",
  source:     "words",
  mode:       "english",   // "english" | "hanzi"
  answered:   false,       // has user already checked this card?
  scores:     { correct: 0, wrong: 0, skipped: 0 }
};

// ── helpers ─────────────────────────────────────────────────────────────────

function setCookie(name, value, days = 365) {
  const exp = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.split("; ").find(r => r.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.split("=")[1]) : null;
}
function byId(id) { return document.getElementById(id); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Strip diacritics / tone marks so "tsiáu-á" normalises to "tsiau-a".
 * Used for the "almost correct" (right spelling, wrong tones) detection.
 */
function stripTones(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // combining marks
    .replace(/\u207F/g, "n")            // ᵑ etc
    .toLowerCase()
    .trim();
}

/**
 * Get the POJ for the current entry respecting the selected dialect's variant.
 */
function getPOJ(entry) {
  if (state.dialect !== "all" && entry.variants) {
    const v = entry.variants.find(v => v.dialectId === state.dialect);
    if (v) return v.poj;
  }
  return entry.poj;
}

// ── data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  const urls = [
    fetch("data/content.json",    { cache: "no-store" }),
    fetch("data/dialects/shared.json", { cache: "no-store" }),
    fetch("data/phrases.json",    { cache: "no-store" })
  ];
  const [cRes, dRes, pRes] = await Promise.all(urls);
  if (!cRes.ok) throw new Error("Could not load content.json");
  if (!dRes.ok) throw new Error("Could not load dictionary.json");
  if (!pRes.ok) throw new Error("Could not load phrases.json");

  state.content = await cRes.json();
  const words   = await dRes.json();
  const phrases = await pRes.json();
  state.allWords   = words;
  state.allPhrases = phrases;
}

// ── dialect select ────────────────────────────────────────────────────────────

function initDialectSelect() {
  const sel = byId("typingDialect");
  sel.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All dialects";
  sel.appendChild(allOpt);

  const groups = state.content.dialects.reduce((acc, d) => {
    const g = d.group || "Other";
    (acc[g] = acc[g] || []).push(d);
    return acc;
  }, {});
  for (const [grp, items] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = grp;
    for (const d of items) {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.name;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.value = state.dialect;
}

// ── build deck ────────────────────────────────────────────────────────────────

function buildDeck() {
  const { source, dialect } = state;
  let pool = [];

  if (source === "words" || source === "both") {
    pool = pool.concat(
      state.allWords.filter(e =>
        dialect === "all" || e.dialectId === dialect || e.dialectId === "shared"
      )
    );
  }
  if (source === "phrases" || source === "both") {
    pool = pool.concat(state.allPhrases);
  }

  return shuffle(pool);
}

// ── UI update ─────────────────────────────────────────────────────────────────

function updateScoreDisplay() {
  byId("scoreCorrect").textContent   = state.scores.correct;
  byId("scoreWrong").textContent     = state.scores.wrong;
  byId("scoreSkipped").textContent   = state.scores.skipped;
  byId("scoreRemaining").textContent = Math.max(0, state.deck.length - state.idx);
}

function showCard() {
  const entry = state.deck[state.idx];
  state.answered = false;

  // Prompt display
  if (state.mode === "english") {
    byId("promptMain").textContent = entry.english;
    byId("promptSub").textContent  = entry.hanzi || "";
  } else {
    byId("promptMain").textContent = entry.hanzi || entry.english;
    byId("promptSub").textContent  = entry.hanzi ? entry.english : "";
  }

  // Reset hint
  const hintEl = byId("promptHint");
  hintEl.textContent = "💡 hint (click up to 3×)";
  hintEl.title = "Click to reveal a hint";
  hintEl.dataset.level = "0";
  hintEl.style.opacity = "";

  // Clear input + feedback
  const inp = byId("typingInput");
  inp.value = "";
  inp.className = "";
  inp.disabled = false;
  inp.focus();

  byId("typingFeedback").textContent = "";
  byId("typingFeedback").className   = "typing-feedback";
  byId("typingAnswer").textContent   = "";

  byId("checkBtn").disabled = false;

  updateScoreDisplay();
}

/**
 * Return a hint string at the requested tier for a given POJ string.
 *
 * Tier 1 – first letter only:           "g…"
 * Tier 2 – first letter + last letter:  "g…a"  (for single words)
 *           first letter of every word: "G… à… c… p…"  (for phrases)
 * Tier 3 – full answer
 *
 * For single-syllable / very short words (≤ 2 chars stripped of tones):
 *   tier 2 skips to the last char so it doesn't just spell the whole word.
 */
function buildHint(poj, tier) {
  const words = poj.trim().split(/\s+/).filter(Boolean);
  const isPhrase = words.length > 1;

  if (tier >= 3) return poj;

  if (isPhrase) {
    if (tier === 1) {
      // first letter of first word only
      return words[0].charAt(0) + "…";
    }
    // tier 2: first letter of every word
    return words.map(w => w.charAt(0) + "…").join(" ");
  }

  // single word
  const word = words[0];
  const stripped = stripTones(word);   // pure ASCII letters
  if (tier === 1) {
    return word.charAt(0) + "…";
  }
  // tier 2: first letter + last letter
  if (stripped.length <= 2) {
    // word is already very short — just show first char to avoid giving it away
    return word.charAt(0) + "…";
  }
  const lastChar = word[word.length - 1];
  return word.charAt(0) + "… …" + lastChar;
}

function revealHint() {
  const hintEl = byId("promptHint");
  const level  = parseInt(hintEl.dataset.level || "0", 10);
  if (level >= 3) return;   // already showing full answer

  const entry = state.deck[state.idx];
  const poj   = getPOJ(entry);
  const next  = level + 1;

  hintEl.dataset.level = next;
  const text = buildHint(poj, next);

  const labels = ["", "1st letter", "+last letter", "answer"];
  hintEl.textContent = `💡 ${text}`;
  hintEl.title = next < 3 ? `Click again for more (${labels[next + 1] || ""})` : "Full answer revealed";
  if (next >= 3) hintEl.style.opacity = "0.85";
}

// ── check answer ──────────────────────────────────────────────────────────────

function checkAnswer() {
  if (state.answered) { advance(); return; }

  const entry    = state.deck[state.idx];
  const expected = getPOJ(entry).toLowerCase().trim();
  const typed    = byId("typingInput").value.toLowerCase().trim();
  const inp      = byId("typingInput");

  if (!typed) return;

  state.answered = true;
  byId("checkBtn").disabled = true;

  const exact  = typed === expected;
  const almost = !exact && stripTones(typed) === stripTones(expected);

  const fb  = byId("typingFeedback");
  const ans = byId("typingAnswer");

  if (exact) {
    inp.className  = "correct";
    fb.textContent = "✓ Correct!";
    fb.className   = "typing-feedback correct";
    ans.textContent = "";
    state.scores.correct++;
  } else if (almost) {
    inp.className  = "wrong";
    fb.textContent = "Close — check your tone marks!";
    fb.className   = "typing-feedback wrong";
    ans.textContent = `Expected: ${expected}`;
    state.scores.wrong++;
  } else {
    inp.className  = "wrong";
    fb.textContent = "✗ Not quite.";
    fb.className   = "typing-feedback wrong";
    ans.textContent = `Answer: ${expected}`;
    state.scores.wrong++;
  }

  byId("checkBtn").textContent = "Next →";
  byId("checkBtn").disabled    = false;
  updateScoreDisplay();
}

function skipCard() {
  if (!state.answered) state.scores.skipped++;
  advance();
}

function advance() {
  state.idx++;
  byId("checkBtn").textContent = "Check";

  if (state.idx >= state.deck.length) {
    showSummary();
  } else {
    showCard();
  }
}

function showSummary() {
  byId("typingGame").style.display    = "none";
  byId("typingSummary").style.display = "block";
  byId("summaryCorrect").textContent  = state.scores.correct;
  byId("summaryWrong").textContent    = state.scores.wrong;
  byId("summarySkipped").textContent  = state.scores.skipped;
}

// ── start session ─────────────────────────────────────────────────────────────

function startSession() {
  state.dialect = byId("typingDialect").value;
  state.source  = byId("typingSource").value;
  state.mode    = byId("typingMode").value;
  state.scores  = { correct: 0, wrong: 0, skipped: 0 };

  setCookie(COOKIE_KEYS.dialect, state.dialect);
  setCookie(COOKIE_KEYS.source,  state.source);
  setCookie(COOKIE_KEYS.mode,    state.mode);

  state.deck = buildDeck();

  if (state.deck.length === 0) {
    alert("No entries for this selection. Try a different dialect or source.");
    return;
  }

  state.idx = 0;

  // Show game panel, hide controls card / summary
  byId("typingSummary").style.display = "none";
  byId("typingGame").style.display    = "block";
  window.scrollTo(0, 0);

  showCard();
}

// ── POJ character picker ─────────────────────────────────────────────────────

// Each row: base label + all tone-marked variants used in POJ romanization.
// o͘ = o with combining dot above right (the "ou" /ɔ/ vowel in POJ)
// a̍ e̍ i̍ o̍ u̍ = vowel + combining vertical line above (tone 8 checked)
const CHAR_GROUPS = [
  { label: "a", chars: ["\u00e1", "\u00e0", "\u00e2", "\u0101", "a\u030d"] },
  { label: "e", chars: ["\u00e9", "\u00e8", "\u00ea", "\u0113", "e\u030d"] },
  { label: "i", chars: ["\u00ed", "\u00ec", "\u00ee", "\u012b", "i\u030d"] },
  { label: "o", chars: ["\u00f3", "\u00f2", "\u00f4", "\u014d", "o\u030d", "o\u0358"] },
  { label: "u", chars: ["\u00fa", "\u00f9", "\u00fb", "\u016b", "u\u030d"] },
  { label: "n", chars: ["\u0144", "\u01f9", "n\u0302", "n\u0304"] },
  { label: "m", chars: ["\u1e41"] },
];

// Tone label tooltip shown on hover: maps position in the chars array to tone number.
// (acute=2, grave=3, circ=5, macron=7, dot/vert=8, o͘=special)
const TONE_TIPS = ["tone 2", "tone 3", "tone 5", "tone 7", "tone 8", "\u014d (oo)"];

function insertChar(ch) {
  const inp = byId("typingInput");
  if (inp.disabled) return;
  const start = inp.selectionStart ?? inp.value.length;
  const end   = inp.selectionEnd   ?? inp.value.length;
  inp.value = inp.value.slice(0, start) + ch + inp.value.slice(end);
  // move cursor after inserted char(s)
  const newPos = start + ch.length;
  inp.setSelectionRange(newPos, newPos);
  inp.focus();
}

function buildCharPicker() {
  const container = byId("charPicker");
  if (!container) return;
  container.innerHTML = "";

  const title = document.createElement("div");
  title.className = "char-picker-title";
  title.textContent = "POJ special characters";
  container.appendChild(title);

  for (const group of CHAR_GROUPS) {
    const row = document.createElement("div");
    row.className = "char-row";

    const lbl = document.createElement("span");
    lbl.className   = "char-row-label";
    lbl.textContent = group.label;
    row.appendChild(lbl);

    group.chars.forEach((ch, i) => {
      const btn = document.createElement("button");
      btn.type      = "button";
      btn.className = "char-btn";
      btn.textContent = ch;
      btn.title = TONE_TIPS[i] || "";
      // mousedown + preventDefault keeps focus (and cursor pos) in the input
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        insertChar(ch);
      });
      row.appendChild(btn);
    });

    container.appendChild(row);
  }
}

// ── keyboard shortcuts ────────────────────────────────────────────────────────

function onKeyDown(e) {
  if (byId("typingGame").style.display === "none") return;
  if (e.key === "Enter") {
    e.preventDefault();
    checkAnswer();
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    await loadData();
  } catch (err) {
    console.error(err);
    document.querySelector("main").innerHTML =
      `<section class="card"><p>⚠️ Failed to load data: ${err.message}</p></section>`;
    return;
  }

  // Restore cookies
  state.dialect = getCookie(COOKIE_KEYS.dialect) || "all";
  state.source  = getCookie(COOKIE_KEYS.source)  || "words";
  state.mode    = getCookie(COOKIE_KEYS.mode)    || "english";

  initDialectSelect();

  byId("typingSource").value = state.source;
  byId("typingMode").value   = state.mode;

  // Wire events
  byId("startTypingBtn").addEventListener("click",   startSession);
  byId("restartTypingBtn").addEventListener("click", startSession);
  byId("checkBtn").addEventListener("click",         checkAnswer);
  byId("skipBtn").addEventListener("click",          skipCard);
  byId("backBtn").addEventListener("click", () => { window.location.href = "index.html"; });
  byId("promptHint").addEventListener("click",       revealHint);
  document.addEventListener("keydown",               onKeyDown);

  buildCharPicker();
}

document.addEventListener("DOMContentLoaded", init);
