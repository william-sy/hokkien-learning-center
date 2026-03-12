const COOKIE_KEYS = {
  selectedDialect: "hokkien_dict_dialect",
  selectedLetter: "hokkien_dict_letter",
  search: "hokkien_dict_search"
};

const LS_LEARNED_KEY = "hokkien_learned_words";

const state = {
  content: null,
  dictionary: [],
  selectedDialect: "all",
  selectedLetter: "all",
  search: "",
  learnedSet: new Set()
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

function loadLearnedSet() {
  try {
    const raw = localStorage.getItem(LS_LEARNED_KEY);
    if (raw) {
      const keys = JSON.parse(raw);
      state.learnedSet = new Set(Array.isArray(keys) ? keys : []);
    }
  } catch (e) { /* ignore */ }
}

function saveLearnedSet() {
  try {
    localStorage.setItem(LS_LEARNED_KEY, JSON.stringify([...state.learnedSet]));
  } catch (e) { /* ignore */ }
}

function toggleLearned(key, article, btn) {
  if (state.learnedSet.has(key)) {
    state.learnedSet.delete(key);
  } else {
    state.learnedSet.add(key);
  }
  saveLearnedSet();
  const isLearned = state.learnedSet.has(key);
  article.classList.toggle("learned", isLearned);
  btn.classList.toggle("learned", isLearned);
  btn.textContent = isLearned ? "✓ Learned" : "Mark learned";
  updateLearnedBar();
}

function updateLearnedBar() {
  const bar = byId("dictLearnedBar");
  if (!bar) return;
  const total = state.dictionary.filter(e => !isPhrase(e)).length;
  const count = [...state.learnedSet].filter(k =>
    state.dictionary.some(e => e.english === k && !isPhrase(e))
  ).length;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  bar.innerHTML =
    `<span>${count} / ${total} words learned</span>` +
    `<div class="learned-progress"><div class="learned-progress-fill" style="width:${pct}%"></div></div>`;
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
  const select = byId("dictDialect");
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

  select.addEventListener("change", () => {
    state.selectedDialect = select.value;
    setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
    renderDictionary();
  });
}

function initAlphabetNav() {
  // Button nav (medium+ screens)
  document.querySelectorAll(".alphabet-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedLetter = btn.dataset.letter;
      setCookie(COOKIE_KEYS.selectedLetter, state.selectedLetter);
      
      document.querySelectorAll(".alphabet-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const sel = document.getElementById("alphabetSelect");
      if (sel) sel.value = state.selectedLetter;
      
      renderDictionary();
    });
  });

  // Dropdown fallback (narrow screens ≤500px)
  const alphabetSelect = document.getElementById("alphabetSelect");
  if (alphabetSelect) {
    alphabetSelect.addEventListener("change", () => {
      state.selectedLetter = alphabetSelect.value;
      setCookie(COOKIE_KEYS.selectedLetter, state.selectedLetter);

      document.querySelectorAll(".alphabet-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.letter === state.selectedLetter);
      });

      renderDictionary();
    });
  }
}

function initSearch() {
  const searchInput = byId("dictSearch");
  searchInput.value = state.search;

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    setCookie(COOKIE_KEYS.search, state.search);
    renderDictionary();
  });
}

function isPhrase(entry) {
  // Consider it a phrase if English has multiple words or if it's tagged as a phrase/sentence
  const hasMultipleWords = entry.english.trim().split(/\s+/).length > 2;
  const hasPhraseTags = entry.tags && (
    entry.tags.includes("phrase") || 
    entry.tags.includes("sentence") ||
    entry.tags.includes("question") ||
    entry.tags.includes("expression")
  );
  
  return hasMultipleWords || hasPhraseTags;
}

function filterEntries(entries) {
  return entries.filter((entry) => {
    // Dialect filter
    if (state.selectedDialect !== "all") {
      const directMatch = entry.dialectId === state.selectedDialect || entry.dialectId === "shared";
      const variantMatch = entry.variants && entry.variants.some(v => v.dialectId === state.selectedDialect);
      if (!directMatch && !variantMatch) return false;
    }

    // Letter filter
    if (state.selectedLetter !== "all") {
      const firstLetter = entry.english.charAt(0).toLowerCase();
      if (firstLetter !== state.selectedLetter) {
        return false;
      }
    }
    
    // Search filter
    if (state.search.trim()) {
      const q = state.search.toLowerCase();
      const searchable = [
        entry.english,
        entry.hanzi,
        entry.poj,
        entry.tl,
        ...(entry.tags || [])
      ].join(" ").toLowerCase();
      
      if (!searchable.includes(q)) {
        return false;
      }
    }
    
    return true;
  });
}

function sortByEnglish(entries) {
  return entries.sort((a, b) => a.english.localeCompare(b.english));
}

function renderEntry(entry) {
  const article = document.createElement("article");
  const isLearned = state.learnedSet.has(entry.english);
  article.className = "dict-entry" + (isLearned ? " learned" : "");

  const audioBtn = (entry.audioUrl && entry.audioUrl.trim()) ?
    `<button class="audio-btn-small" data-audio-url="${entry.audioUrl}" aria-label="Play pronunciation">🔊</button>` : "";

  const dialectName = state.content.dialects.find(d => d.id === entry.dialectId)?.name || entry.dialectId;

  // When a specific dialect is selected, show that dialect's variant pronunciation if available.
  // When 'all' is selected, show the base pronunciation and list all variants below.
  let displayPoj = entry.poj || "-";
  let displayTl = entry.tl || "-";
  let variantsHtml = "";

  if (entry.variants && entry.variants.length > 0) {
    if (state.selectedDialect !== "all") {
      const match = entry.variants.find(v => v.dialectId === state.selectedDialect);
      if (match) {
        displayPoj = match.poj || displayPoj;
        displayTl = match.tl || displayTl;
      }
    } else {
      const variantItems = entry.variants.map(v => {
        const vName = state.content.dialects.find(d => d.id === v.dialectId)?.name || v.dialectId;
        return `<span class="variant-item"><span class="dialect-tag" style="opacity:0.7;font-size:0.8em">${vName}</span> ${v.poj || ""}${v.tl && v.tl !== v.poj ? ` · ${v.tl}` : ""}</span>`;
      }).join(" ");
      variantsHtml = `<p class="romanization" style="font-size:0.85em;opacity:0.8"><span class="label">Variants:</span> ${variantItems}</p>`;
    }
  }

  article.innerHTML = `
    <div class="dict-entry-header">
      <div class="dict-entry-title">
        <strong class="english">${entry.english}</strong>
        <span class="hanzi">${entry.hanzi || ""}</span>
      </div>
      ${audioBtn}
    </div>
    <div class="dict-entry-body">
      <p class="romanization">
        <span class="label">POJ:</span> ${displayPoj}
        <span class="separator">|</span>
        <span class="label">TL:</span> ${displayTl}
        <span class="separator">|</span>
        <span class="label">Tone:</span> ${entry.tone || "-"}
      </p>
      ${variantsHtml}
      ${entry.example ? `<p class="example"><span class="label">Example:</span> ${entry.example}</p>` : ""}
      <p class="meta">
        <span class="dialect-tag">${dialectName}</span>
        ${entry.tags ? entry.tags.map(tag => `<span class="tag">#${tag}</span>`).join(" ") : ""}
      </p>
    </div>
  `;

  // Learn button added as DOM element to avoid escaping issues with entry names
  const learnBtn = document.createElement("button");
  learnBtn.className = "learn-btn" + (isLearned ? " learned" : "");
  learnBtn.textContent = isLearned ? "✓ Learned" : "Mark learned";
  learnBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLearned(entry.english, article, learnBtn);
  });
  article.querySelector(".dict-entry-header").appendChild(learnBtn);

  return article;
}

function renderDictionary() {
  const filtered = filterEntries(state.dictionary);
  const words = sortByEnglish(filtered.filter(e => !isPhrase(e)));
  const phrases = sortByEnglish(filtered.filter(e => isPhrase(e)));
  
  // Render words only (phrases are on phrases.html)
  const wordsList = byId("wordsList");
  const wordsCount = byId("wordsCount");
  wordsList.innerHTML = "";
  wordsCount.textContent = `${words.length} word${words.length !== 1 ? "s" : ""} found`;

  if (words.length === 0) {
    wordsList.innerHTML = '<p class="muted">No words match your filters.</p>';
  } else {
    words.forEach(entry => wordsList.appendChild(renderEntry(entry)));
  }

  updateLearnedBar();

  // Attach audio button listeners
  document.querySelectorAll(".audio-btn-small").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playAudio(btn.dataset.audioUrl);
    });
  });
}

function playAudio(audioUrl) {
  if (!audioUrl || !audioUrl.trim()) return;
  
  const audio = new Audio(audioUrl);
  audio.play().catch(err => {
    console.error("Audio playback failed:", err);
    alert("Could not play audio file. Please check the URL.");
  });
}

function hydrateStateFromCookies() {
  state.selectedDialect = getCookie(COOKIE_KEYS.selectedDialect) || "all";
  state.selectedLetter = getCookie(COOKIE_KEYS.selectedLetter) || "all";
  state.search = getCookie(COOKIE_KEYS.search) || "";
}

async function init() {
  try {
    hydrateStateFromCookies();
    loadLearnedSet();
    
    const data = await loadContent();
    state.content = data.content;
    state.dictionary = data.dictionary;

    initDialectSelect();
    initAlphabetNav();
    initSearch();
    
    // Set active letter button + sync dropdown
    document.querySelectorAll(".alphabet-btn").forEach(btn => {
      if (btn.dataset.letter === state.selectedLetter) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
    const alphabetSelect = document.getElementById("alphabetSelect");
    if (alphabetSelect) alphabetSelect.value = state.selectedLetter;
    
    renderDictionary();

  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
