const COOKIE_KEYS = {
  selectedDialect: "hokkien_flashcard_dialect",
  mode: "hokkien_flashcard_mode",
  difficulty: "hokkien_flashcard_difficulty",
  reviewLearnedOnly: "hokkien_flashcard_learned_only"
};

const LS_LEARNED_KEY = "hokkien_learned_words";

const state = {
  content: null,
  dictionary: [],
  currentDeck: [],
  currentIndex: 0,
  selectedDialect: "all",
  mode: "english-to-hokkien",
  difficulty: "normal",
  reviewLearnedOnly: false,
  isFlipped: false,
  stats: {
    correct: 0,
    partial: 0,
    incorrect: 0
  }
};

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function byId(id) {
  return document.getElementById(id);
}

async function loadContent() {
  const [contentResponse, dictionaryResponse] = await Promise.all([
    fetch("data/content.json", { cache: "no-store" }),
    fetch("data/dictionary.json", { cache: "no-store" })
  ]);
  
  if (!contentResponse.ok) throw new Error("Could not load data/content.json");
  if (!dictionaryResponse.ok) throw new Error("Could not load data/dictionary.json");
  
  const content = await contentResponse.json();
  const dictionary = await dictionaryResponse.json();
  
  return { content, dictionary };
}

function initDialectSelect() {
  const select = byId("flashcardDialect");
  const { dialects } = state.content;

  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All dialects";
  select.appendChild(allOpt);

  const groups = dialects.reduce((acc, dialect) => {
    const group = dialect.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(dialect);
    return acc;
  }, {});

  for (const [groupName, items] of Object.entries(groups)) {
    const groupEl = document.createElement("optgroup");
    groupEl.label = groupName;
    for (const dialect of items) {
      const option = document.createElement("option");
      option.value = dialect.id;
      option.textContent = dialect.name;
      groupEl.appendChild(option);
    }
    select.appendChild(groupEl);
  }

  select.value = state.selectedDialect;
}

function filterDictionary() {
  let entries = state.dictionary.filter((entry) => {
    if (state.selectedDialect === "all") return true;
    if (entry.dialectId === state.selectedDialect) return true;
    return entry.dialectId === "shared";
  });

  if (state.reviewLearnedOnly) {
    let learnedSet = new Set();
    try {
      const raw = localStorage.getItem(LS_LEARNED_KEY);
      if (raw) learnedSet = new Set(JSON.parse(raw));
    } catch (_) {}
    entries = entries.filter(e => learnedSet.has(e.english));
  }

  return entries;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startSession() {
  state.selectedDialect = byId("flashcardDialect").value;
  state.mode = byId("flashcardMode").value;
  state.difficulty = byId("flashcardDifficulty").value;
  state.reviewLearnedOnly = byId("reviewLearnedOnly").checked;
  
  setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
  setCookie(COOKIE_KEYS.mode, state.mode);
  setCookie(COOKIE_KEYS.difficulty, state.difficulty);
  setCookie(COOKIE_KEYS.reviewLearnedOnly, state.reviewLearnedOnly ? "1" : "0");

  const filtered = filterDictionary();
  
  if (filtered.length === 0) {
    if (state.reviewLearnedOnly) {
      alert("No learned words found for this dialect. Mark some words as learned on the Dictionary page first, then try again.");
    } else {
      alert("No cards available for this dialect. Please select another or add entries to the dictionary.");
    }
    return;
  }

  state.currentDeck = shuffleArray(filtered);
  state.currentIndex = 0;
  state.isFlipped = false;
  state.stats = { correct: 0, partial: 0, incorrect: 0 };

  byId("flashcardSection").style.display = "block";
  byId("resultsSection").style.display = "none";
  
  showCard();
}

function showCard() {
  const card = state.currentDeck[state.currentIndex];
  state.isFlipped = false;

  byId("flashcardFront").style.display = "block";
  byId("flashcardBack").style.display = "none";
  byId("flashcardActions").style.display = "block";
  byId("flashcardRating").style.display = "none";

  const { question, answer, details } = generateCardContent(card);

  byId("questionContent").innerHTML = question;
  byId("answerContent").innerHTML = answer;
  byId("detailsContent").innerHTML = details;

  updateProgress();
}

function generateCardContent(entry) {
  let question = "";
  let answer = "";
  let details = "";

  const mode = state.mode === "mixed" 
    ? ["english-to-hokkien", "hokkien-to-english", "hanzi-to-romanization"][Math.floor(Math.random() * 3)]
    : state.mode;

  const poj  = entry.poj || entry.tl || "-";
  const diff = state.difficulty;

  // Easy hint: first syllable of POJ (always available, e.g. "chá-...")
  const firstSyllable = poj.split(/[-\s]/)[0];
  const pojHint    = diff === "easy"
    ? `<p class="flashcard-hint">💡 Starts with: <strong>${firstSyllable}-</strong></p>` : "";
  const toneHint   = diff === "easy" && entry.tone
    ? `<p class="flashcard-hint">🎵 Tone: ${entry.tone}</p>` : "";
  const exHint     = diff === "easy" && entry.example
    ? `<p class="flashcard-hint">💬 ${entry.example}</p>` : "";

  switch (mode) {
    case "english-to-hokkien":
      // Easy:   English + POJ first-syllable hint + tone + example
      // Normal: English only → flip reveals Hanzi + POJ + tone + example
      // Hard:   English only → flip reveals Hanzi ONLY (must recall pronunciation)
      question = `<h3>${entry.english}</h3>${pojHint}${toneHint}${exHint}`;
      if (diff === "hard") {
        answer = `<h3 style="font-size:2rem">${entry.hanzi || entry.english}</h3>
                  <p class="flashcard-hint" style="opacity:0.4">Romanization hidden — recall it yourself</p>`;
      } else {
        answer = `<h3>${entry.hanzi || "(No Hanzi)"}</h3><p class="romanization">${poj}</p>`;
      }
      break;

    case "hokkien-to-english":
      // Hard: Hanzi only on question (no romanization) — already meaningful
      // Easy/Normal: Hanzi + POJ as usual
      if (diff === "hard") {
        question = `<h3 style="font-size:2rem">${entry.hanzi || entry.english}</h3>
                    <p class="flashcard-hint" style="opacity:0.4">Romanization hidden in hard mode</p>`;
      } else {
        question = `<h3>${entry.hanzi || "(No Hanzi)"}</h3><p class="romanization">${poj}</p>${toneHint}`;
      }
      answer = `<h3>${entry.english}</h3>`;
      break;

    case "hanzi-to-romanization":
      // Easy: Hanzi + English meaning hint + tone hint on question
      const meaningHint = diff === "easy"
        ? `<p class="flashcard-hint">🔤 ${entry.english}</p>` : "";
      question = `<h3 style="font-size:2rem">${entry.hanzi || entry.english}</h3>${meaningHint}${toneHint}`;
      answer   = `<p class="romanization large">${poj}</p>`;
      break;
  }

  // Details (shown after flip) — hidden entirely in Hard
  if (diff !== "hard") {
    if (mode === "english-to-hokkien" || mode === "hokkien-to-english") {
      details = [
        entry.tone    ? `<p><strong>Tone:</strong> ${entry.tone}</p>` : "",
        entry.example ? `<p><strong>Example:</strong> ${entry.example}</p>` : ""
      ].join("");
    } else {
      details = [
        `<p><strong>English:</strong> ${entry.english}</p>`,
        entry.tone ? `<p><strong>Tone:</strong> ${entry.tone}</p>` : ""
      ].join("");
    }
  }

  return { question, answer, details };
}

function showAnswer() {
  state.isFlipped = true;
  byId("flashcardFront").style.display = "none";
  byId("flashcardBack").style.display = "block";
  byId("flashcardActions").style.display = "none";
  byId("flashcardRating").style.display = "block";
}

function rateCard(rating) {
  state.stats[rating]++;
  
  state.currentIndex++;
  
  if (state.currentIndex >= state.currentDeck.length) {
    showResults();
  } else {
    showCard();
  }
}

function updateProgress() {
  byId("cardProgress").textContent = `${state.currentIndex + 1} / ${state.currentDeck.length}`;
  byId("cardScore").textContent = `Correct: ${state.stats.correct} | Incorrect: ${state.stats.incorrect}`;
}

function showResults() {
  byId("flashcardSection").style.display = "none";
  byId("resultsSection").style.display = "block";

  byId("totalCards").textContent = state.currentDeck.length;
  byId("correctCount").textContent = state.stats.correct;
  byId("partialCount").textContent = state.stats.partial;
  byId("incorrectCount").textContent = state.stats.incorrect;
}

function endSession() {
  if (confirm("Are you sure you want to end this session?")) {
    showResults();
  }
}

function restartSession() {
  byId("resultsSection").style.display = "none";
  startSession();
}

function hydrateStateFromCookies() {
  state.selectedDialect = getCookie(COOKIE_KEYS.selectedDialect) || "all";
  state.mode = getCookie(COOKIE_KEYS.mode) || "english-to-hokkien";
  state.difficulty = getCookie(COOKIE_KEYS.difficulty) || "normal";
  state.reviewLearnedOnly = getCookie(COOKIE_KEYS.reviewLearnedOnly) === "1";
}

async function init() {
  try {
    hydrateStateFromCookies();
    
    const data = await loadContent();
    state.content = data.content;
    state.dictionary = data.dictionary;

    initDialectSelect();
    
    byId("flashcardMode").value = state.mode;
    byId("flashcardDifficulty").value = state.difficulty;
    byId("reviewLearnedOnly").checked = state.reviewLearnedOnly;

    byId("backBtn").addEventListener("click", () => window.location.href = "index.html");
    byId("startBtn").addEventListener("click", startSession);
    byId("showAnswerBtn").addEventListener("click", showAnswer);
    byId("endSessionBtn").addEventListener("click", endSession);
    byId("restartBtn").addEventListener("click", restartSession);
    byId("backToLearnBtn").addEventListener("click", () => window.location.href = "index.html");

    document.querySelectorAll(".rating-btn").forEach(btn => {
      btn.addEventListener("click", () => rateCard(btn.dataset.rating));
    });

  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
