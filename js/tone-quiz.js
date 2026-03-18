const COOKIE_KEYS = {
  selectedDialect: "hokkien_tone_dialect",
  questionCount: "hokkien_tone_count"
};

const state = {
  content: null,
  dictionary: [],
  questions: [],
  currentIndex: 0,
  selectedDialect: "all",
  questionCount: 10,
  score: 0,
  answered: false
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
    fetch("data/dialects/shared.json", { cache: "no-store" })
  ]);
  
  if (!contentResponse.ok) throw new Error("Could not load data/content.json");
  if (!dictionaryResponse.ok) throw new Error("Could not load data/dialects/shared.json");
  
  const content = await contentResponse.json();
  const dictionary = await dictionaryResponse.json();
  
  return { content, dictionary };
}

function initDialectSelect() {
  const select = byId("toneDialect");
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
  return state.dictionary.filter((entry) => {
    if (!entry.tone) return false; // Only entries with tone info
    if (state.selectedDialect === "all") return true;
    if (entry.dialectId === state.selectedDialect) return true;
    return entry.dialectId === "shared";
  });
}

function generateWrongAnswers(correctTone) {
  const allTones = ["1", "2", "3", "5", "7", "8"];
  const syllableCount = correctTone.split("-").length;
  const wrongAnswers = new Set();
  
  // Generate plausible wrong answers
  while (wrongAnswers.size < 3) {
    const fakeTone = Array(syllableCount)
      .fill(0)
      .map(() => allTones[Math.floor(Math.random() * allTones.length)])
      .join("-");
    
    if (fakeTone !== correctTone) {
      wrongAnswers.add(fakeTone);
    }
  }
  
  return Array.from(wrongAnswers);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function startQuiz() {
  state.selectedDialect = byId("toneDialect").value;
  state.questionCount = parseInt(byId("questionCount").value);
  
  setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
  setCookie(COOKIE_KEYS.questionCount, state.questionCount);

  const filtered = filterDictionary();
  
  if (filtered.length === 0) {
    alert("No entries with tone information for this dialect. Please select another.");
    return;
  }
  
  if (filtered.length < state.questionCount) {
    alert(`Only ${filtered.length} entries available. Adjusting quiz length.`);
    state.questionCount = filtered.length;
  }

  // Shuffle and pick questions
  const shuffled = shuffleArray(filtered);
  state.questions = shuffled.slice(0, state.questionCount);
  
  state.currentIndex = 0;
  state.score = 0;
  state.answered = false;

  byId("quizSection").style.display = "block";
  byId("resultsSection").style.display = "none";
  
  showQuestion();
}

function showQuestion() {
  const question = state.questions[state.currentIndex];
  state.answered = false;

  byId("questionWord").textContent = question.hanzi || question.english;
  byId("questionMeta").textContent = `${question.poj || question.tl || ""} • ${question.english}`;

  const wrongAnswers = generateWrongAnswers(question.tone);
  const allChoices = shuffleArray([question.tone, ...wrongAnswers]);

  const choicesContainer = byId("quizChoices");
  choicesContainer.innerHTML = "";

  allChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "quiz-choice";
    button.textContent = choice;
    button.dataset.tone = choice;
    button.addEventListener("click", () => checkAnswer(choice, question.tone));
    choicesContainer.appendChild(button);
  });

  byId("feedbackSection").style.display = "none";
  updateProgress();
}

function checkAnswer(selected, correct) {
  if (state.answered) return;
  
  state.answered = true;
  const isCorrect = selected === correct;
  
  if (isCorrect) {
    state.score++;
  }

  // Highlight choices
  document.querySelectorAll(".quiz-choice").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.tone === correct) {
      btn.classList.add("correct");
    } else if (btn.dataset.tone === selected && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  // Show feedback
  const feedback = byId("feedbackMessage");
  if (isCorrect) {
    feedback.className = "feedback correct";
    feedback.innerHTML = `<strong>✅ Correct!</strong>`;
  } else {
    feedback.className = "feedback incorrect";
    feedback.innerHTML = `<strong>❌ Incorrect.</strong> The correct tone is <strong>${correct}</strong>.`;
  }

  byId("feedbackSection").style.display = "block";
  updateProgress();
}

function nextQuestion() {
  state.currentIndex++;
  
  if (state.currentIndex >= state.questions.length) {
    showResults();
  } else {
    showQuestion();
  }
}

function updateProgress() {
  byId("quizProgress").textContent = `${state.currentIndex + 1} / ${state.questions.length}`;
  byId("quizScore").textContent = `Score: ${state.score} / ${state.questions.length}`;
}

function showResults() {
  byId("quizSection").style.display = "none";
  byId("resultsSection").style.display = "block";

  const percentage = Math.round((state.score / state.questions.length) * 100);

  byId("totalQuestions").textContent = state.questions.length;
  byId("correctAnswers").textContent = state.score;
  byId("finalScore").textContent = `${percentage}%`;

  const performanceMsg = byId("performanceMessage");
  if (percentage >= 90) {
    performanceMsg.innerHTML = "<h3>🎉 Outstanding!</h3><p>You have excellent tone recognition skills!</p>";
    performanceMsg.className = "performance-message excellent";
  } else if (percentage >= 70) {
    performanceMsg.innerHTML = "<h3>👍 Great job!</h3><p>You're doing well. Keep practicing!</p>";
    performanceMsg.className = "performance-message good";
  } else if (percentage >= 50) {
    performanceMsg.innerHTML = "<h3>📚 Keep going!</h3><p>You're making progress. Review the tone charts and try again!</p>";
    performanceMsg.className = "performance-message okay";
  } else {
    performanceMsg.innerHTML = "<h3>💪 Keep learning!</h3><p>Tones take time. Check out the tone charts and practice more!</p>";
    performanceMsg.className = "performance-message needs-practice";
  }
}

function hydrateStateFromCookies() {
  state.selectedDialect = getCookie(COOKIE_KEYS.selectedDialect) || "all";
  state.questionCount = parseInt(getCookie(COOKIE_KEYS.questionCount) || "10");
}

async function init() {
  try {
    hydrateStateFromCookies();
    
    const data = await loadContent();
    state.content = data.content;
    state.dictionary = data.dictionary;

    initDialectSelect();
    
    byId("questionCount").value = state.questionCount;

    byId("backBtn").addEventListener("click", () => window.location.href = "index.html");
    byId("startBtn").addEventListener("click", startQuiz);
    byId("nextBtn").addEventListener("click", nextQuestion);
    byId("retryBtn").addEventListener("click", () => {
      byId("resultsSection").style.display = "none";
      startQuiz();
    });
    byId("backToLearnBtn").addEventListener("click", () => window.location.href = "index.html");

  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
