const COOKIE_KEYS = {
  selectedDialect: "hokkien_match_dialect",
  mode: "hokkien_match_mode"
};

const TW_EN_FILES = [
  "data/dialects/taiwanese_en/a-e.json",
  "data/dialects/taiwanese_en/f-j.json",
  "data/dialects/taiwanese_en/k-o.json",
  "data/dialects/taiwanese_en/p-s.json",
  "data/dialects/taiwanese_en/t.json",
  "data/dialects/taiwanese_en/u-z.json",
];

const state = {
  content: null,
  dictionary: [],
  twEnLoaded: false,
  cards: [],
  flippedCards: [],
  matchedPairs: 0,
  totalPairs: 0,
  selectedDialect: "all",
  mode: "hanzi-to-romanization",
  startTime: null,
  clicks: 0,
  timerInterval: null
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

async function loadTwEnEntries() {
  if (state.twEnLoaded) return;
  const results = await Promise.all(TW_EN_FILES.map(url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])));
  for (const entries of results) {
    state.dictionary.push(...entries);
  }
  state.twEnLoaded = true;
}

function initDialectSelect() {
  const select = byId("matchDialect");
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
      if (dialect.dictionaryOnly) continue;
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
    const hasRequiredFields = entry.hanzi && (entry.poj || entry.tl);
    if (!hasRequiredFields) return false;
    // For modes that show English, require an english field
    if ((state.mode === "hanzi-to-english" || state.mode === "english-to-hanzi") && !entry.english) return false;
    
    if (state.selectedDialect === "all") return true;
    if (entry.dialectId === state.selectedDialect) return true;
    return entry.dialectId === "shared";
  });
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateCards(entries) {
  const pairs = [];
  
  entries.slice(0, 6).forEach((entry, index) => {
    let content1, content2;
    
    switch (state.mode) {
      case "hanzi-to-romanization":
        content1 = entry.hanzi;
        content2 = entry.poj || entry.tl;
        break;
      case "romanization-to-hanzi":
        content1 = entry.poj || entry.tl;
        content2 = entry.hanzi;
        break;
      case "hanzi-to-english":
        content1 = entry.hanzi;
        content2 = entry.english;
        break;
      case "english-to-hanzi":
        content1 = entry.english;
        content2 = entry.hanzi;
        break;
    }
    
    pairs.push(
      { id: index, pairId: index, content: content1, matched: false },
      { id: index + 100, pairId: index, content: content2, matched: false }
    );
  });
  
  return shuffleArray(pairs);
}

async function startGame() {
  state.selectedDialect = byId("matchDialect").value;
  state.mode = byId("matchMode").value;
  
  setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
  setCookie(COOKIE_KEYS.mode, state.mode);

  if (state.selectedDialect === "taiwanese_en" && !state.twEnLoaded) {
    const btn = byId("startBtn");
    btn.disabled = true;
    btn.textContent = "Loading…";
    try {
      await loadTwEnEntries();
    } finally {
      btn.disabled = false;
      btn.textContent = "Start Game";
    }
  }

  const filtered = filterDictionary();
  
  if (filtered.length === 0) {
    alert("No suitable entries for this dialect. Please select another or add entries.");
    return;
  }
  
  if (filtered.length < 6) {
    alert(`Need at least 6 entries. Only ${filtered.length} available.`);
    return;
  }

  state.cards = generateCards(filtered);
  state.totalPairs = state.cards.length / 2;
  state.matchedPairs = 0;
  state.flippedCards = [];
  state.clicks = 0;
  state.startTime = Date.now();

  byId("matchSection").style.display = "block";
  byId("resultsSection").style.display = "none";
  
  renderCards();
  startTimer();
  updateStats();
}

function renderCards() {
  const grid = byId("matchGrid");
  grid.innerHTML = "";
  
  state.cards.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "match-card";
    cardEl.dataset.id = card.id;
    cardEl.dataset.pairId = card.pairId;
    
    const cardInner = document.createElement("div");
    cardInner.className = "match-card-inner";
    
    const cardFront = document.createElement("div");
    cardFront.className = "match-card-front";
    cardFront.textContent = "?";
    
    const cardBack = document.createElement("div");
    cardBack.className = "match-card-back";
    cardBack.textContent = card.content;
    
    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardEl.appendChild(cardInner);
    
    cardEl.addEventListener("click", () => handleCardClick(card, cardEl));
    
    grid.appendChild(cardEl);
  });
}

function handleCardClick(card, cardEl) {
  if (card.matched) return;
  if (state.flippedCards.length >= 2) return;
  if (state.flippedCards.some(f => f.card.id === card.id)) return;
  
  state.clicks++;
  
  cardEl.classList.add("flipped");
  state.flippedCards.push({ card, element: cardEl });
  
  if (state.flippedCards.length === 2) {
    setTimeout(checkMatch, 600);
  }
}

function checkMatch() {
  const [first, second] = state.flippedCards;
  
  if (first.card.pairId === second.card.pairId) {
    // Match!
    first.card.matched = true;
    second.card.matched = true;
    first.element.classList.add("matched");
    second.element.classList.add("matched");
    
    state.matchedPairs++;
    updateStats();
    
    if (state.matchedPairs === state.totalPairs) {
      setTimeout(showResults, 500);
    }
  } else {
    // No match
    first.element.classList.remove("flipped");
    second.element.classList.remove("flipped");
  }
  
  state.flippedCards = [];
}

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  state.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    byId("matchTimer").textContent = `Time: ${elapsed}s`;
  }, 1000);
}

function updateStats() {
  byId("matchScore").textContent = `Matches: ${state.matchedPairs} / ${state.totalPairs}`;
}

function showResults() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  
  const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
  
  byId("matchSection").style.display = "none";
  byId("resultsSection").style.display = "block";

  byId("pairsCount").textContent = state.totalPairs;
  byId("timeSpent").textContent = `${timeSpent}s`;
  byId("clicksCount").textContent = state.clicks;

  const efficiency = state.clicks / (state.totalPairs * 2);
  const performanceMsg = byId("performanceMessage");
  
  if (efficiency <= 1.5 && timeSpent < 60) {
    performanceMsg.innerHTML = "<h3>🏆 Amazing!</h3><p>Perfect memory and speed!</p>";
    performanceMsg.className = "performance-message excellent";
  } else if (efficiency <= 2 && timeSpent < 90) {
    performanceMsg.innerHTML = "<h3>⭐ Great work!</h3><p>Excellent matching skills!</p>";
    performanceMsg.className = "performance-message good";
  } else if (efficiency <= 3) {
    performanceMsg.innerHTML = "<h3>👍 Well done!</h3><p>Keep practicing to improve!</p>";
    performanceMsg.className = "performance-message okay";
  } else {
    performanceMsg.innerHTML = "<h3>💪 Nice try!</h3><p>The more you play, the better you'll get!</p>";
    performanceMsg.className = "performance-message needs-practice";
  }
}

function endGame() {
  if (confirm("Are you sure you want to end the game?")) {
    showResults();
  }
}

function hydrateStateFromCookies() {
  state.selectedDialect = getCookie(COOKIE_KEYS.selectedDialect) || "all";
  state.mode = getCookie(COOKIE_KEYS.mode) || "hanzi-to-romanization";
}

async function init() {
  try {
    hydrateStateFromCookies();
    
    const data = await loadContent();
    state.content = data.content;
    state.dictionary = data.dictionary;

    initDialectSelect();
    
    byId("matchMode").value = state.mode;

    // Pre-load en entries in the background if the user had it selected last time
    if (state.selectedDialect === "taiwanese_en") {
      loadTwEnEntries();
    }

    byId("backBtn").addEventListener("click", () => window.location.href = "index.html");
    byId("startBtn").addEventListener("click", startGame);
    byId("endGameBtn").addEventListener("click", endGame);
    byId("playAgainBtn").addEventListener("click", () => {
      byId("resultsSection").style.display = "none";
      startGame();
    });
    byId("backToLearnBtn").addEventListener("click", () => window.location.href = "index.html");

  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
