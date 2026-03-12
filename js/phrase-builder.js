// ── phrase-builder.js ────────────────────────────────────────────────────────

const COOKIE_KEYS = {
  dialect:  "hokkien_pb_dialect",
  category: "hokkien_pb_category"
};

const state = {
  content:  null,
  phrases:  [],       // full phrases list
  deck:     [],       // filtered + shuffled
  idx:      0,
  dialect:  "all",
  category: "all",
  chips:    [],       // { token, origIdx, placed } for current card
  placed:   [],       // array of origIdx in answer order
  answered: false,
  scores:   { correct: 0, wrong: 0, skipped: 0 }
};

// ── helpers ──────────────────────────────────────────────────────────────────

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

function getPOJ(entry) {
  if (state.dialect !== "all" && entry.variants) {
    const v = entry.variants.find(v => v.dialectId === state.dialect);
    if (v) return v.poj;
  }
  return entry.poj;
}

/**
 * Split a POJ phrase into word tokens, preserving hyphens within a word.
 * "Góa ài chia̍h pn̄g" → ["Góa", "ài", "chia̍h", "pn̄g"]
 */
function tokenise(poj) {
  return poj.trim().split(/\s+/).filter(Boolean);
}

// ── data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  const [cRes, pRes] = await Promise.all([
    fetch("data/content.json", { cache: "no-store" }),
    fetch("data/phrases.json", { cache: "no-store" })
  ]);
  if (!cRes.ok) throw new Error("Could not load content.json");
  if (!pRes.ok) throw new Error("Could not load phrases.json");

  state.content = await cRes.json();
  state.phrases = await pRes.json();
}

// ── dialect select ────────────────────────────────────────────────────────────

function initDialectSelect() {
  const sel = byId("pbDialect");
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

// ── deck building ─────────────────────────────────────────────────────────────

function buildDeck() {
  const { category } = state;
  // Only include phrases with ≥ 2 tokens (single-word phrases aren't interesting)
  let pool = state.phrases.filter(p => {
    const tokens = tokenise(getPOJ(p));
    if (tokens.length < 2) return false;
    if (category === "all") return true;
    return p.tags && p.tags.includes(category);
  });
  return shuffle(pool);
}

// ── render chips ──────────────────────────────────────────────────────────────

function renderChips() {
  const bank       = byId("pbBank");
  const answerZone = byId("pbAnswerZone");
  bank.innerHTML       = "";
  answerZone.innerHTML = "";

  // Placeholder if answer is empty
  if (state.placed.length === 0) {
    const ph = document.createElement("span");
    ph.className = "placeholder";
    ph.textContent = "Tap a word below to start…";
    answerZone.appendChild(ph);
  }

  // Build bank chips
  state.chips.forEach((chip, i) => {
    const el = document.createElement("button");
    el.className   = "pb-chip" + (chip.placed ? " used" : "");
    el.textContent = chip.token;
    el.dataset.idx = i;
    el.addEventListener("click", () => placeChip(i));
    bank.appendChild(el);
  });

  // Build answer chips
  state.placed.forEach((chipIdx, answerPos) => {
    const chip = state.chips[chipIdx];
    const el   = document.createElement("button");
    el.className   = "pb-chip";
    el.textContent = chip.token;
    el.dataset.ansPos = answerPos;
    el.addEventListener("click", () => removeChip(answerPos));
    answerZone.appendChild(el);
  });
}

function placeChip(chipIdx) {
  if (state.answered) return;
  if (state.chips[chipIdx].placed) return;
  state.chips[chipIdx].placed = true;
  state.placed.push(chipIdx);
  renderChips();
}

function removeChip(answerPos) {
  if (state.answered) return;
  const chipIdx = state.placed[answerPos];
  state.chips[chipIdx].placed = false;
  state.placed.splice(answerPos, 1);
  renderChips();
}

// ── show card ─────────────────────────────────────────────────────────────────

function showCard() {
  const entry = state.deck[state.idx];
  state.answered = false;
  state.placed   = [];

  const poj    = getPOJ(entry);
  const tokens = tokenise(poj);

  // Shuffle the bank tokens but keep track of original index for answer checking
  const shuffledIndices = shuffle(tokens.map((_, i) => i));
  state.chips = shuffledIndices.map(origIdx => ({
    token:   tokens[origIdx],
    origIdx: origIdx,
    placed:  false
  }));

  byId("pbEnglish").textContent = entry.english;
  byId("pbHanzi").textContent   = entry.hanzi || "";
  byId("pbFeedback").textContent  = "";
  byId("pbFeedback").className    = "pb-feedback";
  byId("pbExpected").textContent  = "";
  byId("pbAnswerZone").className  = "pb-answer-zone";
  byId("pbCheckBtn").textContent  = "Check";
  byId("pbCheckBtn").disabled     = false;

  renderChips();
  updateScoreDisplay();
}

// ── score ─────────────────────────────────────────────────────────────────────

function updateScoreDisplay() {
  byId("pbCorrect").textContent   = state.scores.correct;
  byId("pbWrong").textContent     = state.scores.wrong;
  byId("pbSkipped").textContent   = state.scores.skipped;
  byId("pbRemaining").textContent = Math.max(0, state.deck.length - state.idx);
}

// ── check answer ──────────────────────────────────────────────────────────────

function checkAnswer() {
  if (state.answered) { advance(); return; }
  if (state.placed.length === 0) { return; }

  const entry  = state.deck[state.idx];
  const poj    = getPOJ(entry);
  const tokens = tokenise(poj);

  // Build the user's answer from placed chip indices → original token order
  const userAnswer = state.placed.map(chipIdx => state.chips[chipIdx].token).join(" ");
  const correct    = tokens.join(" ");

  const isCorrect = userAnswer.toLowerCase() === correct.toLowerCase();

  state.answered = true;
  byId("pbCheckBtn").disabled = true;

  const fb      = byId("pbFeedback");
  const expEl   = byId("pbExpected");
  const zone    = byId("pbAnswerZone");

  if (isCorrect) {
    fb.textContent = "✓ Correct!";
    fb.className   = "pb-feedback correct";
    zone.className = "pb-answer-zone correct";
    expEl.textContent = "";
    state.scores.correct++;
  } else {
    fb.textContent = "✗ Not quite.";
    fb.className   = "pb-feedback wrong";
    zone.className = "pb-answer-zone wrong";
    expEl.textContent = `Correct order: ${correct}`;
    state.scores.wrong++;
  }

  byId("pbCheckBtn").textContent = "Next →";
  byId("pbCheckBtn").disabled    = false;
  updateScoreDisplay();
}

function clearAnswer() {
  if (state.answered) return;
  state.placed = [];
  state.chips.forEach(c => { c.placed = false; });
  renderChips();
}

function skipCard() {
  if (!state.answered) state.scores.skipped++;
  advance();
}

function advance() {
  state.idx++;
  byId("pbCheckBtn").textContent = "Check";
  if (state.idx >= state.deck.length) {
    showSummary();
  } else {
    showCard();
  }
}

function showSummary() {
  byId("pbGame").style.display    = "none";
  byId("pbSummary").style.display = "block";
  byId("pbSumCorrect").textContent  = state.scores.correct;
  byId("pbSumWrong").textContent    = state.scores.wrong;
  byId("pbSumSkipped").textContent  = state.scores.skipped;
}

// ── start session ─────────────────────────────────────────────────────────────

function startSession() {
  state.dialect  = byId("pbDialect").value;
  state.category = byId("pbCategory").value;
  state.scores   = { correct: 0, wrong: 0, skipped: 0 };

  setCookie(COOKIE_KEYS.dialect,  state.dialect);
  setCookie(COOKIE_KEYS.category, state.category);

  state.deck = buildDeck();

  if (state.deck.length === 0) {
    alert("No phrases found for this category. Try a different one!");
    return;
  }

  state.idx = 0;
  byId("pbSummary").style.display = "none";
  byId("pbGame").style.display    = "block";
  window.scrollTo(0, 0);
  showCard();
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

  state.dialect  = getCookie(COOKIE_KEYS.dialect)  || "all";
  state.category = getCookie(COOKIE_KEYS.category) || "all";

  initDialectSelect();
  byId("pbCategory").value = state.category;

  byId("startPBBtn").addEventListener("click",   startSession);
  byId("pbRestartBtn").addEventListener("click", startSession);
  byId("pbCheckBtn").addEventListener("click",   checkAnswer);
  byId("pbClearBtn").addEventListener("click",   clearAnswer);
  byId("pbSkipBtn").addEventListener("click",    skipCard);
  byId("backBtn").addEventListener("click", () => { window.location.href = "index.html"; });
}

document.addEventListener("DOMContentLoaded", init);
