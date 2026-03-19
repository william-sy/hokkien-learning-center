/**
 * writing.js — Hanzi stroke-order practice page
 * Uses hanzi-writer (MIT, CDN) for SVG stroke animation / quiz mode.
 * Data from data/dialects/shared.json – entries that have a "hanzi" field.
 * Also supports lazy-loading the full Taiwanese (English) dataset.
 */

const SHARED_URL = "data/dialects/shared.json";
const TW_EN_FILES = [
  "data/dialects/taiwanese_en/a-e.json",
  "data/dialects/taiwanese_en/f-j.json",
  "data/dialects/taiwanese_en/k-o.json",
  "data/dialects/taiwanese_en/p-s.json",
  "data/dialects/taiwanese_en/t.json",
  "data/dialects/taiwanese_en/u-z.json",
];
const CANVAS_SIZE = 280;

let sharedData = [];     // raw entries from shared.json
let twEnData   = [];     // raw entries from taiwanese_en/*.json
let twEnLoaded = false;

let allChars = [];       // { hanzi, rom, english } built from active source
let currentIdx = 0;
let currentMode = "animate"; // "animate" | "quiz"

// ── DOM refs (resolved after DOMContentLoaded via defer / module semantics) ──
const wordListEl    = document.getElementById("wordList");
const canvasArea    = document.getElementById("canvasArea");
const modeTabs      = document.getElementById("modeTabs");
const sourceSelect  = document.getElementById("writingSource");

// ── init ────────────────────────────────────────────────────────────────────
async function init() {
  if (typeof HanziWriter === "undefined") {
    canvasArea.innerHTML = `<p class="muted">⚠ The hanzi-writer library failed to load from CDN. Please check your internet connection and reload.</p>`;
    wordListEl.innerHTML = "";
    return;
  }

  try {
    const res  = await fetch(SHARED_URL);
    sharedData = await res.json();
    buildCharList(sharedData);
    renderWordList();
    bindModeTabs();
    bindSourceSelect();
    if (allChars.length) loadChar(0);
  } catch (e) {
    wordListEl.innerHTML = `<p class="muted small">⚠ Could not load dictionary data.</p>`;
    console.error(e);
  }
}

async function loadTwEnData() {
  if (twEnLoaded) return;
  const results = await Promise.all(TW_EN_FILES.map(url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])));
  for (const entries of results) twEnData.push(...entries);
  twEnLoaded = true;
}

function buildCharList(data) {
  const seen = new Set();
  allChars = [];
  for (const entry of data) {
    if (!entry.hanzi) continue;
    const hanziChars = [...entry.hanzi].filter(c =>
      (c >= "\u4e00" && c <= "\u9fff") || (c >= "\u3400" && c <= "\u4dbf")
    );
    if (hanziChars.length !== 1) continue; // single-char entries only
    if (seen.has(entry.hanzi)) continue;
    seen.add(entry.hanzi);
    const rom = entry.poj || entry.tl || entry.romanization || "";
    allChars.push({
      hanzi:   entry.hanzi,
      rom,
      english: Array.isArray(entry.english)
        ? entry.english.join(", ")
        : (entry.english || ""),
    });
  }
  if (sourceSelect && sourceSelect.value === "taiwanese_en") {
    allChars.sort((a, b) => a.rom.localeCompare(b.rom));
  } else {
    allChars.sort((a, b) => a.english.localeCompare(b.english));
  }
}

// ── source selector ──────────────────────────────────────────────────────────
function bindSourceSelect() {
  if (!sourceSelect) return;
  sourceSelect.addEventListener("change", async () => {
    currentIdx = 0;
    wordListEl.innerHTML = `<p class="muted small">Loading…</p>`;
    if (sourceSelect.value === "taiwanese_en") {
      if (!twEnLoaded) {
        sourceSelect.disabled = true;
        wordListEl.innerHTML = `<p class="muted small">Downloading dictionary…</p>`;
        try {
          await loadTwEnData();
        } finally {
          sourceSelect.disabled = false;
        }
      }
      buildCharList(twEnData);
    } else {
      buildCharList(sharedData);
    }
    renderWordList();
    if (allChars.length) loadChar(0);
  });
}

// ── word list ────────────────────────────────────────────────────────────────
function renderWordList() {
  if (!allChars.length) {
    wordListEl.innerHTML = `<p class="muted small">No single-character Hanzi entries found.</p>`;
    return;
  }
  wordListEl.innerHTML = allChars.map((c, i) => `
    <button class="writing-word-btn${i === 0 ? " active" : ""}"
            data-idx="${i}" aria-label="${c.english || c.rom}">
      <span class="ww-hanzi">${c.hanzi}</span>
      <span>
        <span>${c.rom}</span>
        <span class="ww-english">${c.english}</span>
      </span>
    </button>`
  ).join("");

  wordListEl.querySelectorAll(".writing-word-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx === currentIdx) return;
      currentIdx = idx;
      setActiveBtn(currentIdx);
      loadChar(currentIdx);
      btn.scrollIntoView({ block: "nearest" });
    });
  });
}

function setActiveBtn(idx) {
  wordListEl.querySelectorAll(".writing-word-btn").forEach((b, i) => {
    b.classList.toggle("active", i === idx);
  });
}

// ── mode tabs ────────────────────────────────────────────────────────────────
function bindModeTabs() {
  modeTabs.querySelectorAll(".mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.dataset.mode === currentMode) return;
      currentMode = tab.dataset.mode;
      modeTabs.querySelectorAll(".mode-tab").forEach(t =>
        t.classList.toggle("active", t === tab)
      );
      loadChar(currentIdx);
    });
  });
}

// ── load / render character ───────────────────────────────────────────────────
function loadChar(idx) {
  const c = allChars[idx];
  if (!c) return;

  canvasArea.innerHTML = `
    <div class="writing-char-info">
      <div class="wci-hanzi">${c.hanzi}</div>
      <div class="wci-rom">${c.rom}</div>
      <div class="wci-english">${c.english}</div>
    </div>
    <div id="hwTarget" style="width:${CANVAS_SIZE}px;height:${CANVAS_SIZE}px;"></div>
    <div class="stroke-count" id="strokeCount">Loading stroke data…</div>
    <div class="writing-feedback" id="feedback"></div>
    <div class="writing-controls" id="controls"></div>
    <div class="char-nav">
      <button class="char-nav-btn" id="prevBtn" ${idx === 0 ? "disabled" : ""}>&#8249;</button>
      <span>${idx + 1} / ${allChars.length}</span>
      <button class="char-nav-btn" id="nextBtn" ${idx === allChars.length - 1 ? "disabled" : ""}>&#8250;</button>
    </div>`;

  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentIdx > 0) {
      currentIdx--;
      setActiveBtn(currentIdx);
      wordListEl.querySelector(`[data-idx="${currentIdx}"]`)?.scrollIntoView({ block: "nearest" });
      loadChar(currentIdx);
    }
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentIdx < allChars.length - 1) {
      currentIdx++;
      setActiveBtn(currentIdx);
      wordListEl.querySelector(`[data-idx="${currentIdx}"]`)?.scrollIntoView({ block: "nearest" });
      loadChar(currentIdx);
    }
  });

  const targetEl = document.getElementById("hwTarget");

  // Determine colours from computed styles, with safe fallbacks
  const style      = getComputedStyle(document.documentElement);
  const strokeCol  = style.getPropertyValue("--text").trim()    || "#2c2c2c";
  const outlineCol = style.getPropertyValue("--border").trim()  || "#cccccc";

  const hw = HanziWriter.create(targetEl, c.hanzi, {
    width:                CANVAS_SIZE,
    height:               CANVAS_SIZE,
    padding:              24,
    strokeColor:          strokeCol,
    outlineColor:         outlineCol,
    drawingColor:         "#3498db",
    drawingWidth:         5,
    strokeAnimationSpeed: 1,
    delayBetweenStrokes:  200,
    showCharacter:        currentMode !== "quiz",
    showOutline:          true,
    strokeWidth:          4,
    radicalColor:         "#e74c3c",
    onLoadCharDataSuccess(charData) {
      const count = charData?.strokes?.length ?? charData?.length ?? "?";
      const sc = document.getElementById("strokeCount");
      if (sc) sc.textContent = `${count} stroke${count !== 1 ? "s" : ""}`;
      buildControls(hw, idx);
    },
    onLoadCharDataError() {
      const sc = document.getElementById("strokeCount");
      if (sc) sc.textContent = "No stroke data available for this character";
      const ctrl = document.getElementById("controls");
      if (ctrl) ctrl.innerHTML = `<p class="muted small">hanzi-writer doesn't have stroke order data for 「${c.hanzi}」</p>`;
    },
  });
}

// ── controls ─────────────────────────────────────────────────────────────────
// hw is passed directly — avoids stale closure over module-level variable
function buildControls(hw, idx) {
  const controls = document.getElementById("controls");
  if (!controls) return;

  if (currentMode === "animate") {
    controls.innerHTML = `
      <button class="wc-btn primary" id="animateBtn">▶ Animate</button>
      <button class="wc-btn" id="showBtn">Show</button>
      <button class="wc-btn" id="hideBtn">Hide</button>`;

    document.getElementById("animateBtn").addEventListener("click", () => hw.animateCharacter());
    document.getElementById("showBtn").addEventListener("click",    () => hw.showCharacter());
    document.getElementById("hideBtn").addEventListener("click",   () => hw.hideCharacter());

    // auto-play on load
    setTimeout(() => hw.animateCharacter(), 300);

  } else {
    controls.innerHTML = `
      <button class="wc-btn primary" id="startQuizBtn">✏️ Start quiz</button>
      <button class="wc-btn" id="skipBtn">Skip / reveal</button>`;

    document.getElementById("startQuizBtn").addEventListener("click", () => startQuiz(hw, idx));
    document.getElementById("skipBtn").addEventListener("click",      () => skipReveal(hw));
  }
}

// ── quiz ─────────────────────────────────────────────────────────────────────
function startQuiz(hw, idx) {
  setFeedback("");
  hw.quiz({
    onMistake(strokeData) {
      setFeedback(`✗ ${strokeData.mistakesOnStroke} mistake${strokeData.mistakesOnStroke !== 1 ? "s" : ""} on this stroke`, "wrong");
    },
    onCorrectStroke() {
      setFeedback("✓ Correct stroke!", "correct");
    },
    onComplete(summary) {
      const m = summary.totalMistakes;
      if (m === 0)      setFeedback("🎉 Perfect! No mistakes!", "correct");
      else if (m <= 2)  setFeedback(`✅ Done! ${m} mistake${m !== 1 ? "s" : ""}.`, "correct");
      else              setFeedback(`Done! ${m} mistakes — keep going!`, "");

      // auto-advance on perfect run
      if (m === 0 && idx < allChars.length - 1) {
        setTimeout(() => {
          currentIdx = idx + 1;
          setActiveBtn(currentIdx);
          wordListEl.querySelector(`[data-idx="${currentIdx}"]`)?.scrollIntoView({ block: "nearest" });
          loadChar(currentIdx);
        }, 1200);
      }
    },
  });
}

function skipReveal(hw) {
  hw.showCharacter();
  hw.cancelQuiz();
  setFeedback("Revealed. Press Animate to see strokes.", "");
  const controls = document.getElementById("controls");
  if (!controls) return;
  controls.innerHTML = `
    <button class="wc-btn primary" id="animateBtn">▶ Animate</button>
    <button class="wc-btn" id="retryBtn">↩ Try again</button>`;
  document.getElementById("animateBtn").addEventListener("click", () => hw.animateCharacter());
  document.getElementById("retryBtn").addEventListener("click",  () => {
    hw.hideCharacter();
    startQuiz(hw, currentIdx);
  });
}

function setFeedback(msg, type = "") {
  const el = document.getElementById("feedback");
  if (!el) return;
  el.textContent = msg;
  el.className = "writing-feedback"
    + (type === "correct" ? " wf-correct" : type === "wrong" ? " wf-wrong" : "");
}

// ── boot ─────────────────────────────────────────────────────────────────────
init();

