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

// ── state ─────────────────────────────────────────────────────────────────────
let allData    = null;   // full dictionary array
let pojPool    = [];     // all unique POJ strings for distractors
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
    dialectSelect.innerHTML =
      `<option value="all">All dialects</option>` +
      `<option value="shared">Shared / Cross-dialect</option>` +
      dialects.map(d =>
        `<option value="${d.id}"${d.id === "taiwanese" ? " selected" : ""}>${d.name}</option>`
      ).join("");
  } catch {
    // Fallback: leave the select empty so the game still works
    dialectSelect.innerHTML = `<option value="all">All dialects</option>`;
  }
}
populateDialectSelect();

// ── data loading ──────────────────────────────────────────────────────────────
async function ensureData() {
  if (allData) return;
  const res = await fetch("data/dialects/shared.json");
  allData   = await res.json();
  pojPool   = [...new Set(allData.filter(e => e.poj).map(e => e.poj.trim()))];
}

// ── question building ─────────────────────────────────────────────────────────
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildQuestion(entry) {
  const poj     = (entry.poj     || "").trim();
  const example = (entry.example || "").trim();

  if (poj && example) {
    const re = new RegExp(escRe(poj), "i");
    if (re.test(example)) {
      return {
        prompt:     "Fill in the blank:",
        sentence:   example.replace(re, "____"),
        answer:     poj,
        hint:       entry.english,
        hintLabel:  "Meaning",
        type:       "gap",
      };
    }
  }

  // Fallback: direct question
  return {
    prompt:    "How do you say this in Hokkien (POJ)?",
    sentence:  entry.english + (entry.hanzi ? `  ${entry.hanzi}` : ""),
    answer:    poj,
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

  await ensureData();

  startBtn.disabled    = false;
  startBtn.textContent = "Start";

  const dialect = dialectSelect.value;
  const count   = parseInt(countSelect.value, 10);
  difficulty    = diffSelect.value;

  let candidates = allData.filter(e => e.poj && e.poj.trim());
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
