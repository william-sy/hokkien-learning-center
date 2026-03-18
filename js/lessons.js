// js/lessons.js — Structured lesson player
// Phases
const PHASE_INTRO     = 0;
const PHASE_PRESENT   = 1;
const PHASE_RECOGNISE = 2;
const PHASE_SUMMARY   = 3;
const PHASE_COMPLETE  = 4;

const PROGRESS_KEY  = "hokkien_lesson_progress";
const DIALECT_KEY   = "hokkien_lesson_dialect";

let lessonsData    = null;   // from data/lessons.json
let dictData       = null;   // from data/dialects/shared.json
let dictPojPool    = [];     // all unique POJ strings for distractors
let selectedDialect = localStorage.getItem(DIALECT_KEY) || "shared";

let state = {
  lesson:     null,
  words:      [],
  phase:      PHASE_INTRO,
  presentIdx: 0,
  quizQueue:  [],
  quizIdx:    0,
  score:      0,
  answered:   false,
  combo:      0,
  maxCombo:   0,
};

/* ── Progress helpers ─────────────────────────────────────────── */
function getProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); }
  catch { return {}; }
}
function saveProgress(lessonId, data) {
  const p = getProgress();
  p[lessonId] = { ...p[lessonId], ...data };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

/* ── Dialect selector ────────────────────────────────────────── */
async function populateDialectSelect() {
  const select = document.getElementById("lessonDialect");
  if (!select) return;
  try {
    const content  = await fetch("data/content.json").then(r => r.json());
    const dialects = content.dialects || [];
    select.innerHTML =
      `<option value="shared">Shared / Cross-dialect</option>` +
      dialects.map(d =>
        `<option value="${d.id}">${d.name}</option>`
      ).join("");
    select.value = selectedDialect;
  } catch {
    select.innerHTML = `<option value="shared">Shared / Cross-dialect</option>`;
  }
  select.addEventListener("change", () => {
    selectedDialect = select.value;
    localStorage.setItem(DIALECT_KEY, selectedDialect);
  });
}

/* ── Data loading ─────────────────────────────────────────────── */
async function loadData() {
  [lessonsData, dictData] = await Promise.all([
    fetch("data/lessons.json").then(r => r.json()),
    fetch("data/dialects/shared.json").then(r => r.json()),
  ]);
  dictPojPool = [...new Set(dictData.filter(e => e.poj).map(e => e.poj.trim()))];
}

/* ── Lesson list ──────────────────────────────────────────────── */
function renderLessonList() {
  const progress  = getProgress();
  const container = document.getElementById("lessonCards");
  container.innerHTML = "";

  lessonsData.lessons.forEach(lesson => {
    const prog        = progress[lesson.id] || {};
    const isCompleted = !!prog.completed;
    const prereq      = lesson.prerequisiteId;
    const isLocked    = !!(prereq && !progress[prereq]?.completed);

    const card = document.createElement("div");
    const isReview   = lesson.type === "review";
    const isSurvival = lesson.id === "survival";
    card.className = "lesson-card" +
      (isCompleted ? " lesson-done"    : "") +
      (isLocked    ? " lesson-locked"  : "") +
      (isReview    ? " lesson-review"  : "") +
      (isSurvival  ? " lesson-survival": "");

    let badge = "";
    if (isCompleted) badge = `<span class="lesson-badge done">✓ Complete</span>`;
    else if (isLocked) badge = `<span class="lesson-badge locked">🔒 Locked</span>`;
    else if (isReview) badge = `<span class="lesson-badge review">★ Review</span>`;
    else if (isSurvival) badge = `<span class="lesson-badge survival">🌟 Bonus</span>`;
    else badge = `<span class="lesson-badge available">Start →</span>`;

    const wordCount = isReview
      ? (lesson.reviewLessonIds || []).reduce((s, id) => {
          const l = lessonsData.lessons.find(x => x.id === id);
          return s + (l ? l.wordKeys.length : 0);
        }, 0)
      : lesson.wordKeys.length;

    card.innerHTML = `
      <div class="lesson-card-header">
        <span class="lesson-card-icon">${lesson.icon}</span>
        <div class="lesson-card-info">
          <div class="lesson-number">${isReview ? "Milestone" : isSurvival ? "Bonus" : "Lesson "+lesson.order}</div>
          <div class="lesson-title">${lesson.title}</div>
          <div class="lesson-titlezh">${lesson.titleZh}</div>
        </div>
        ${badge}
      </div>
      <p class="lesson-desc">${lesson.description}</p>
      <div class="lesson-meta">
        <span>📚 ${wordCount} words</span>
        <span>⏱ ~${lesson.estimatedMinutes} min</span>
        ${isCompleted && prog.score !== undefined
          ? `<span>🎯 ${prog.score}/${wordCount}</span>` : ""}
      </div>`;

    if (!isLocked) {
      card.style.cursor = "pointer";
      card.addEventListener("click", () => startLesson(lesson));
    }
    container.appendChild(card);
  });
}

/* ── Start a lesson ───────────────────────────────────────────── */
function resolveWords(wordKeys) {
  return wordKeys
    .map(key => {
      const k = key.toLowerCase();
      const dialectEntry = selectedDialect !== "shared"
        ? dictData.find(e => e.english?.toLowerCase() === k && e.dialectId === selectedDialect)
        : null;
      const sharedEntry  = dictData.find(e => e.english?.toLowerCase() === k && e.dialectId === "shared");
      const anyEntry     = dictData.find(e => e.english?.toLowerCase() === k);
      const word = dialectEntry || sharedEntry || anyEntry;
      if (!word) return null;
      return { ...word, _isFallback: !dialectEntry && selectedDialect !== "shared" };
    })
    .filter(Boolean);
}

function startLesson(lesson) {
  state.lesson = lesson;

  if (lesson.type === "review") {
    // Pull all words from the referenced lessons, deduplicate by english
    const seen   = new Set();
    const allKeys = (lesson.reviewLessonIds || []).flatMap(id => {
      const l = lessonsData.lessons.find(x => x.id === id);
      return l ? l.wordKeys : [];
    }).filter(k => { if (seen.has(k.toLowerCase())) return false; seen.add(k.toLowerCase()); return true; });
    state.words = resolveWords(allKeys);
  } else {
    state.words = resolveWords(lesson.wordKeys);
  }

  if (!state.words.length) {
    alert("Could not match word keys to dictionary entries. Check data/lessons.json.");
    return;
  }

  state.phase      = PHASE_INTRO;
  state.presentIdx = 0;
  state.quizQueue  = shuffle([...state.words]);
  state.quizIdx    = 0;
  state.score      = 0;
  state.answered   = false;
  state.combo      = 0;
  state.maxCombo   = 0;

  document.getElementById("lessonList").style.display   = "none";
  document.getElementById("lessonPlayer").style.display = "";
  renderPhase();
}

/* ── Phase dispatcher ─────────────────────────────────────────── */
function renderPhase() {
  ["phaseIntro","phasePresent","phaseRecognise","phaseSummary","phaseComplete"]
    .forEach(id => { document.getElementById(id).style.display = "none"; });
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Review lessons skip PHASE_PRESENT and PHASE_SUMMARY — straight to MCQ then complete
  if (state.lesson.type === "review") {
    if (state.phase === PHASE_PRESENT) { state.phase = PHASE_RECOGNISE; }
    if (state.phase === PHASE_SUMMARY) { state.phase = PHASE_COMPLETE; }
  }
  switch (state.phase) {
    case PHASE_INTRO:     renderIntro();     break;
    case PHASE_PRESENT:   renderPresent();   break;
    case PHASE_RECOGNISE: renderRecognise(); break;
    case PHASE_SUMMARY:   renderSummary();   break;
    case PHASE_COMPLETE:  renderComplete();  break;
  }
}

/* ── Phase 0: Intro ───────────────────────────────────────────── */
function renderIntro() {
  const el = document.getElementById("phaseIntro");
  el.style.display = "";
  const l = state.lesson;
  const isReview  = l.type === "review";
  const wordCount = state.words.length;
  const modeTag   = isReview ? "🌟 Mix Quiz · Review" : "🏷 Learn · Quiz · Review";
  const beginLabel = isReview ? "Start review quiz →" : "Begin lesson →";

  el.innerHTML = `
    <div class="phase-tag">${isReview ? "Review" : "Introduction"}</div>
    <div class="lesson-hero-icon">${l.icon}</div>
    <h2 class="lesson-hero-title">
      ${l.title}
      <span class="lesson-hero-zh">${l.titleZh}</span>
    </h2>
    <p class="lesson-intro-desc">${l.description}</p>
    <div class="lesson-meta lesson-meta-intro">
      <span>📚 ${wordCount} words</span>
      <span>⏱ ~${l.estimatedMinutes} min</span>
      <span>${modeTag}</span>
    </div>
    <div class="lesson-cultural-card">
      <div class="cultural-label">🌏 Cultural note</div>
      <p>${l.culturalNote}</p>
    </div>
    <button id="startLessonBtn" class="primary-btn" style="margin-top:1.5rem;">
      ${beginLabel}
    </button>`;

  document.getElementById("startLessonBtn").addEventListener("click", () => {
    state.quizQueue = shuffle([...state.words]);
    state.quizIdx   = 0;
    state.score     = 0;
    state.combo     = 0;
    state.maxCombo  = 0;
    state.phase     = isReview ? PHASE_RECOGNISE : PHASE_PRESENT;
    state.presentIdx = 0;
    renderPhase();
  });
}

/* ── Phase 1: Present ─────────────────────────────────────────── */
function renderPresent() {
  const el    = document.getElementById("phasePresent");
  el.style.display = "";
  const w     = state.words[state.presentIdx];
  const total = state.words.length;
  const idx   = state.presentIdx;
  const pct   = Math.round(((idx + 1) / total) * 100);

  el.innerHTML = `
    <div class="phase-tag">Learn · ${idx + 1} of ${total}</div>
    <div class="present-progress">
      <div class="present-progress-bar" style="width:${pct}%"></div>
    </div>
    <div class="present-card">
      <div class="present-english">${w.english}</div>
      ${w.hanzi ? `<div class="present-hanzi">${w.hanzi}</div>` : ""}
      <div class="present-poj">${w.poj || "—"}</div>
      ${w.tl && w.tl !== w.poj ? `<div class="present-tl">TL: ${w.tl}</div>` : ""}
      ${w.audioHint ? `<div class="present-audio-hint">🔊 Say: <em>${w.audioHint}</em></div>` : ""}
      ${w._isFallback ? `<div class="present-fallback-note">shared form — no ${getDialectName()} variant yet</div>` : ""}
      ${w.example ? `<div class="present-example">${w.example}</div>` : ""}
    </div>
    <div class="present-actions">
      ${idx > 0
        ? `<button id="prevWordBtn" class="secondary-btn">← Back</button>`
        : `<div></div>`}
      <button id="nextWordBtn" class="primary-btn">
        ${idx < total - 1 ? "Next word →" : "Start quiz →"}
      </button>
    </div>
    <p class="kbd-hint"><kbd>→</kbd> next &nbsp; <kbd>←</kbd> prev</p>`;

  document.getElementById("nextWordBtn").addEventListener("click", () => {
    if (state.presentIdx < state.words.length - 1) {
      state.presentIdx++;
      renderPresent();
    } else {
      state.phase     = PHASE_RECOGNISE;
      state.quizIdx   = 0;
      state.quizQueue = shuffle([...state.words]);
      state.score     = 0;
      state.answered  = false;
      renderPhase();
    }
  });

  document.getElementById("prevWordBtn")?.addEventListener("click", () => {
    if (state.presentIdx > 0) { state.presentIdx--; renderPresent(); }
  });
}

/* ── Phase 2: Recognise (MCQ English → POJ) ──────────────────── */
function renderRecognise() {
  const el = document.getElementById("phaseRecognise");
  el.style.display = "";
  state.answered = false;

  if (state.quizIdx >= state.quizQueue.length) {
    state.phase = PHASE_SUMMARY;
    renderPhase();
    return;
  }

  const w        = state.quizQueue[state.quizIdx];
  const total    = state.quizQueue.length;
  const correct  = w.poj;
  const choices  = shuffle([correct, ...getDistractors(correct, state.words)]);
  const pct      = Math.round((state.quizIdx / total) * 100);

  el.innerHTML = `
    <div class="phase-tag">Recognise · ${state.quizIdx + 1} of ${total}</div>
    <div class="present-progress">
      <div class="present-progress-bar" style="width:${pct}%"></div>
    </div>
    <p class="question-prompt">Which POJ romanisation matches this phrase?</p>
    <div class="recognise-target">
      <div class="present-english">${w.english}</div>
      ${w.hanzi ? `<div class="quiz-hanzi">${w.hanzi}</div>` : ""}
    </div>
    <div class="quiz-choices" id="recChoices"></div>
    <div id="recFeedback" class="feedback" style="display:none;"></div>
    <div class="quiz-next-row">
      <button id="recNextBtn" class="primary-btn" style="display:none;">Next →</button>
    </div>
    <p class="kbd-hint"><kbd>1</kbd>–<kbd>4</kbd> pick &nbsp; <kbd>Enter</kbd> next</p>`;

  const choicesEl = document.getElementById("recChoices");
  choices.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-choice cloze-choice";
    btn.dataset.value = c;
    btn.innerHTML = `<span class="choice-num">${i + 1}</span><span>${c}</span>`;
    btn.addEventListener("click", () => selectRecognise(c, correct, w));
    choicesEl.appendChild(btn);
  });
}

function selectRecognise(chosen, correct, _w) {
  if (state.answered) return;
  state.answered = true;

  const isCorrect = chosen === correct;
  if (isCorrect) {
    state.score++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
  } else {
    state.combo = 0;
  }

  document.querySelectorAll("#recChoices .quiz-choice").forEach(btn => {
    if (btn.dataset.value === correct)               btn.classList.add("correct");
    else if (btn.dataset.value === chosen && !isCorrect) btn.classList.add("incorrect");
    btn.disabled = true;
  });

  const fb = document.getElementById("recFeedback");
  let feedbackText = isCorrect ? "✓ Correct!" : `✗ The answer was: ${correct}`;
  if (isCorrect && state.combo >= 3) {
    feedbackText += `<span class="combo-flash">🔥 ${state.combo}x combo!</span>`;
  }
  fb.innerHTML   = feedbackText;
  fb.className   = `feedback ${isCorrect ? "correct" : "incorrect"}`;
  fb.style.display = "";

  const nextBtn = document.getElementById("recNextBtn");
  nextBtn.style.display = "";
  nextBtn.addEventListener("click", () => {
    state.quizIdx++;
    renderRecognise();
  });
}

/* ── Phase 3: Summary ─────────────────────────────────────────── */
function renderSummary() {
  const el = document.getElementById("phaseSummary");
  el.style.display = "";
  const l    = state.lesson;
  const total = state.quizQueue.length;

  const rows = state.words.map(w => `
    <tr>
      <td class="sum-hanzi">${w.hanzi || "—"}</td>
      <td class="sum-poj">${w.poj   || "—"}</td>
      <td class="sum-tl">${w.tl    || "—"}</td>
      <td class="sum-en">${w.english}</td>
    </tr>`).join("");

  const etymHtml = (l.etymologyNotes || []).map(e => `
    <div class="etym-card">
      <div class="etym-word">
        <span class="etym-poj">${e.poj}</span>
        <span class="etym-en">${e.english}</span>
      </div>
      <p class="etym-note">${e.note}</p>
    </div>`).join("");

  el.innerHTML = `
    <div class="phase-tag">Summary</div>
    <div class="summary-score-row">
      <h3 class="summary-heading">Words from this lesson</h3>
      <span class="summary-score">Quiz score: <strong>${state.score}/${total}</strong></span>
    </div>
    <div class="sum-table-wrap">
      <table class="comp-table sum-table">
        <thead>
          <tr><th>漢字</th><th>POJ</th><th>TL</th><th>English</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <button class="secondary-btn print-btn" onclick="window.print()">🖨️ Print cheat sheet</button>
    ${etymHtml ? `
    <h3 class="etym-heading">Etymology &amp; context</h3>
    <div class="etym-grid">${etymHtml}</div>` : ""}
    <div style="text-align:center;margin-top:2rem;">
      <button id="completeBtn" class="primary-btn">Mark complete ✓</button>
    </div>`;

  document.getElementById("completeBtn").addEventListener("click", () => {
    saveProgress(l.id, {
      completed:   true,
      completedAt: new Date().toISOString().slice(0, 10),
      score:       state.score,
    });
    state.phase = PHASE_COMPLETE;
    renderPhase();
  });
}

/* ── Phase 4: Complete ────────────────────────────────────────── */
function renderComplete() {
  const el = document.getElementById("phaseComplete");
  el.style.display = "";
  const l          = state.lesson;
  const total      = state.quizQueue.length;
  const pct        = total ? Math.round((state.score / total) * 100) : 0;
  const nextLesson = lessonsData.lessons.find(x => x.prerequisiteId === l.id);
  const isReview   = l.type === "review";

  const emoji = pct === 100 ? "🎉" : pct >= 70 ? "👍" : "💪";
  const comboMsg = state.maxCombo >= 3
    ? `<p class="combo-peak">🔥 Best combo: <strong>${state.maxCombo}</strong> in a row!</p>` : "";

  el.innerHTML = `
    <div class="complete-wrap">
      <div class="complete-emoji">${emoji}</div>
      <h2>${isReview ? "Review complete!" : "Lesson complete!"}</h2>
      <p class="muted">${l.title} · ${state.words.length} words covered</p>
      ${comboMsg}
      <div class="complete-stats">
        <div class="cstat">
          <div class="cstat-val correct-color">${state.score}</div>
          <div class="cstat-label">Correct</div>
        </div>
        <div class="cstat">
          <div class="cstat-val">${total}</div>
          <div class="cstat-label">Questions</div>
        </div>
        <div class="cstat">
          <div class="cstat-val">${pct}%</div>
          <div class="cstat-label">Score</div>
        </div>
      </div>
      <div class="complete-actions">
        <button id="repeatBtn"    class="secondary-btn">↺ Repeat</button>
        ${nextLesson
          ? `<button id="nextLessonBtn" class="primary-btn">
               Next: ${nextLesson.title} ${nextLesson.icon} →
             </button>` : ""}
        <button id="backToListBtn" class="secondary-btn">← All lessons</button>
      </div>
    </div>`;

  document.getElementById("repeatBtn").addEventListener("click", () => startLesson(l));
  document.getElementById("nextLessonBtn")?.addEventListener("click", () => startLesson(nextLesson));
  document.getElementById("backToListBtn").addEventListener("click", () => {
    document.getElementById("lessonPlayer").style.display = "none";
    document.getElementById("lessonList").style.display   = "";
    renderLessonList();
  });
}

function getDialectName() {
  const select = document.getElementById("lessonDialect");
  return select ? select.options[select.selectedIndex]?.text : selectedDialect;
}

/* ── Helpers ──────────────────────────────────────────────────── */
function getDistractors(correct, lessonWords) {
  const lessonOthers = lessonWords
    .filter(w => w.poj && w.poj !== correct)
    .map(w => w.poj);
  const globalOthers = dictPojPool.filter(p => p !== correct && !lessonOthers.includes(p));
  return shuffle([...shuffle(lessonOthers), ...shuffle(globalOthers)]).slice(0, 3);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ── Keyboard navigation ──────────────────────────────────────── */
document.addEventListener("keydown", e => {
  if (state.phase === PHASE_PRESENT) {
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      document.getElementById("nextWordBtn")?.click();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      document.getElementById("prevWordBtn")?.click();
    }
  }

  if (state.phase === PHASE_RECOGNISE && !state.answered) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      document.querySelectorAll("#recChoices .quiz-choice")[n - 1]?.click();
    }
  }

  if (state.phase === PHASE_RECOGNISE && state.answered) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      document.getElementById("recNextBtn")?.click();
    }
  }
});

/* ── Init ─────────────────────────────────────────────────────── */
async function init() {
  try {
    await Promise.all([loadData(), populateDialectSelect()]);
  } catch {
    document.getElementById("lessonCards").innerHTML =
      `<p class="error-msg">Failed to load lesson data. Please refresh the page.</p>`;
    return;
  }
  renderLessonList();
}

init();
