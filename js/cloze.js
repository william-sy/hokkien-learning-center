// ── cloze.js ────────────────────────────────────────────────────────────────
// Fill-in-the-blank game.
// For entries that have an example sentence, we blank the target POJ inside it.
// For entries without a matching example, we ask "How do you say X?" directly.
// ── DOM refs ──────────────────────────────────────────────────────────────────
const setupSection    = document.getElementById("setupSection");
const gameSection     = document.getElementById("gameSection");
const resultsSection  = document.getElementById("resultsSection");
const dialectSelect   = document.getElementById("clozeDialect");
const countSelect     = document.getElementById("clozeCount");
const diffSelect      = document.getElementById("clozeDiff");
const startBtn        = document.getElementById("clozeStartBtn");
const progressEl      = document.getElementById("clozeProgress");
const scoreEl         = document.getElementById("clozeScore");
const promptEl        = document.getElementById("clozePrompt");
const sentenceEl      = document.getElementById("clozeSentence");
const hintEl          = document.getElementById("clozeHint");
const choicesEl       = document.getElementById("clozeChoices");
const feedbackEl      = document.getElementById("clozeFeedback");
const nextBtn         = document.getElementById("clozeNextBtn");
const nextHint        = document.getElementById("clozeNextHint");
const totalEl         = document.getElementById("totalQuestions");
const correctEl       = document.getElementById("correctAnswers");
const finalScoreEl    = document.getElementById("finalScore");
const perfMsgEl       = document.getElementById("performanceMessage");
const retryBtn        = document.getElementById("retryBtn");

const TW_EN_FILES = [
  "data/dialects/taiwanese_en/a-e.json",
  "data/dialects/taiwanese_en/f-j.json",
  "data/dialects/taiwanese_en/k-o.json",
  "data/dialects/taiwanese_en/p-s.json",
  "data/dialects/taiwanese_en/t.json",
  "data/dialects/taiwanese_en/u-z.json",
];

// ── state ─────────────────────────────────────────────────────────────────────
let sharedData = null;   // shared.json entries
let twEnData   = null;   // taiwanese_en entries (lazy)
let twEnLoaded = false;
let allData    = null;   // active dataset rebuilt per ensureData call
let pojPool    = [];     // all unique POJ/TL strings for distractors
let queue      = [];     // question objects for this session
let current    = 0;
let score      = 0;
let total      = 0;
let difficulty = "easy";
let answered   = false;

// ── populate dialect select from content.json ─────────────────────────────
async function populateDialectSelect() {
  try {
    const res      = await fetch("data/content.json");
    const content  = await res.json();
    const dialects = content.dialects || [];
    const groups   = dialects.reduce((acc, d) => {
      const g = d.group || "Other";
      (acc[g] = acc[g] || []).push(d);
      return acc;
    }, {});
    dialectSelect.innerHTML = `<option value="all">All dialects</option>`;
    for (const [grp, items] of Object.entries(groups)) {
      const og = document.createElement("optgroup");
      og.label = grp;
      dialectSelect.appendChild(og);
      for (const d of items) {
        if (d.dictionaryOnly) continue;
        const o = document.createElement("option");
        o.value = d.id;
        o.textContent = d.name;
        og.appendChild(o);
      }
    }
  } catch {
    dialectSelect.innerHTML = `<option value="all">All dialects</option>`;
  }
}
populateDialectSelect();

// ── data loading ──────────────────────────────────────────────────────────────
async function ensureData(dialect) {
  if (!sharedData) {
    const res = await fetch("data/dialects/shared.json");
    sharedData = await res.json();
  }
  if (dialect === "taiwanese_en" && !twEnLoaded) {
    const results = await Promise.all(TW_EN_FILES.map(u => fetch(u).then(r => r.ok ? r.json() : []).catch(() => [])));
    twEnData   = results.flat();
    twEnLoaded = true;
  }
  allData = [
    ...sharedData,
    ...(twEnLoaded && twEnData ? twEnData : []),
  ];
  pojPool = [...new Set(
    allData.map(e => (e.poj || e.tl || "").trim()).filter(Boolean)
  )];
}

// ── question building ─────────────────────────────────────────────────────────
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildQuestion(entry) {
  const answer  = (entry.poj || entry.tl || "").trim();
  const example = (entry.example || "").trim();
  const isMoe   = !entry.poj && !!entry.tl;

  if (answer && example) {
    const re = new RegExp(escRe(answer), "i");
    if (re.test(example)) {
      return {
        prompt:    "Fill in the blank:",
        sentence:  example.replace(re, "____"),
        answer,
        hint:      isMoe
          ? `${entry.hanzi || ""}${entry.english ? " — " + entry.english : ""}`
          : entry.english,
        hintLabel: "Meaning",
        type:      "gap",
      };
    }
  }

  // MoE fallback: show hanzi and ask for TL pronunciation
  if (isMoe && entry.hanzi) {
    return {
      prompt:    "What is the Tâi-lô (TL) pronunciation?",
      sentence:  `${entry.hanzi}${entry.english ? `  （${entry.english}）` : ""}`,
      answer,
      hint:      example || null,
      hintLabel: "Example",
      type:      "direct",
    };
  }

  // Standard fallback
  return {
    prompt:    "How do you say this in Hokkien (POJ)?",
    sentence:  entry.english + (entry.hanzi ? `  ${entry.hanzi}` : ""),
    answer,
    hint:      example || null,
    hintLabel: "Example",
    type:      "direct",
  };
}

function getDistractors(correct) {
  const len  = correct.length;
  const all  = pojPool.filter(p => p !== correct).sort(() => Math.random() - 0.5);
  // Prefer similar character length for plausible options
  const near = all.filter(p => Math.abs(p.length - len) <= Math.max(2, len * 0.5));
  const far  = all.filter(p => Math.abs(p.length - len) >  Math.max(2, len * 0.5));
  return [...new Set([...near, ...far])].slice(0, 3);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── start ─────────────────────────────────────────────────────────────────────
startBtn.addEventListener("click", async () => {
  startBtn.disabled    = true;
  startBtn.textContent = "Loading…";

  const dialect = dialectSelect.value;
  await ensureData(dialect);

  startBtn.disabled    = false;
  startBtn.textContent = "Start";

  const count   = parseInt(countSelect.value, 10);
  difficulty    = diffSelect.value;

  let candidates = allData.filter(e => (e.poj || e.tl) && (e.poj || e.tl).trim());
  if (dialect !== "all") {
    candidates = candidates.filter(e => e.dialectId === dialect);
  }

  if (candidates.length < 4) {
    alert("Not enough entries for this dialect. Try 'All dialects'.");
    return;
  }

  shuffle(candidates);
  queue   = candidates.slice(0, count).map(buildQuestion);
  current = 0;
  score   = 0;
  total   = queue.length;

  setupSection.style.display   = "none";
  resultsSection.style.display = "none";
  gameSection.style.display    = "";

  showQuestion();
});

// ── show question ─────────────────────────────────────────────────────────────
function showQuestion() {
  answered = false;
  feedbackEl.style.display = "none";
  nextBtn.style.display    = "none";
  if (nextHint) nextHint.style.display = "none";
  choicesEl.innerHTML      = "";

  const q = queue[current];
  progressEl.textContent = `Q ${current + 1} / ${total}`;
  scoreEl.textContent    = `Score: ${score} / ${current}`;

  promptEl.textContent  = q.prompt;
  sentenceEl.innerHTML  = q.sentence.replace(
    "____",
    '<span class="cloze-blank">____</span>'
  );

  if (difficulty === "easy" && q.hint) {
    hintEl.textContent   = `💡 ${q.hintLabel}: ${q.hint}`;
    hintEl.style.display = "";
  } else {
    hintEl.style.display = "none";
  }

  const choices = shuffle([q.answer, ...getDistractors(q.answer)]);
  choices.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className       = "quiz-choice cloze-choice";
    btn.dataset.value   = c;
    btn.innerHTML = `<span class="choice-num">${i + 1}</span><span>${c}</span>`;
    btn.addEventListener("click", () => selectAnswer(c));
    choicesEl.appendChild(btn);
  });
}

// ── select answer ─────────────────────────────────────────────────────────────
function selectAnswer(chosen) {
  if (answered) return;
  answered = true;

  const q       = queue[current];
  const correct = (chosen === q.answer);
  if (correct) score++;

  choicesEl.querySelectorAll(".quiz-choice").forEach(btn => {
    if (btn.dataset.value === q.answer)             btn.classList.add("correct");
    else if (btn.dataset.value === chosen && !correct) btn.classList.add("incorrect");
    btn.disabled = true;
  });

  feedbackEl.textContent = correct
    ? "✓ Correct!"
    : `✗ The answer was: ${q.answer}`;
  feedbackEl.className       = `feedback ${correct ? "correct" : "incorrect"}`;
  feedbackEl.style.display   = "";
  nextBtn.style.display      = "";
  if (nextHint) nextHint.style.display = "";
  scoreEl.textContent        = `Score: ${score} / ${current + 1}`;
}

nextBtn.addEventListener("click", () => {
  current++;
  if (current >= total) showResults();
  else showQuestion();
});

// Keyboard: 1-4 pick choice, Space/Enter advance
document.addEventListener("keydown", e => {
  if (gameSection.style.display === "none") return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 4 && !answered) {
    const btn = choicesEl.querySelectorAll(".quiz-choice")[n - 1];
    if (btn) btn.click();
  }
  if ((e.key === "Enter" || e.key === " ") && answered) {
    e.preventDefault();
    nextBtn.click();
  }
});

// ── results ───────────────────────────────────────────────────────────────────
function showResults() {
  gameSection.style.display    = "none";
  resultsSection.style.display = "";

  const pct = Math.round((score / total) * 100);
  totalEl.textContent      = total;
  correctEl.textContent    = score;
  finalScoreEl.textContent = `${pct}%`;

  const msgs = [
    [90, "🏆 Excellent! Your Hokkien is impressive!"],
    [70, "👍 Great work — nearly there!"],
    [50, "📚 Good effort — review the missed words and try again."],
    [0,  "💪 Keep going — every round builds memory!"],
  ];
  perfMsgEl.textContent = (msgs.find(([t]) => pct >= t) || msgs[msgs.length - 1])[1];
}

retryBtn.addEventListener("click", () => {
  resultsSection.style.display = "none";
  setupSection.style.display   = "";
});

document.querySelectorAll(".back-btn").forEach(btn =>
  btn.addEventListener("click", () => { window.location.href = "index.html"; })
);
