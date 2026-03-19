const COOKIE_KEYS = {
  selectedDialect: "hokkien_dict_dialect",
  selectedLetter: "hokkien_dict_letter",
  search: "hokkien_dict_search"
};

const LS_LEARNED_KEY = "hokkien_learned_words";

const state = {
  content: null,
  dictionary: [],
  twEnLoaded: false,
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
  const total = state.dictionary.length;
  const count = [...state.learnedSet].filter(k =>
    state.dictionary.some(e => e.english === k)
  ).length;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  bar.innerHTML =
    `<span>${count} / ${total} words learned</span>` +
    `<div class="learned-progress"><div class="learned-progress-fill" style="width:${pct}%"></div></div>`;
}

const MN_FILES = [
  "data/dialects/malaysia_north/a-e.json",
  "data/dialects/malaysia_north/f-j.json",
  "data/dialects/malaysia_north/k-o.json",
  "data/dialects/malaysia_north/p-t.json",
  "data/dialects/malaysia_north/u-z.json",
];

const TW_EN_FILES = [
  "data/dialects/taiwanese_en/a-e.json",
  "data/dialects/taiwanese_en/f-j.json",
  "data/dialects/taiwanese_en/k-o.json",
  "data/dialects/taiwanese_en/p-s.json",
  "data/dialects/taiwanese_en/t.json",
  "data/dialects/taiwanese_en/u-z.json",
];

async function loadTwEnEntries(onProgress) {
  if (state.twEnLoaded) return;
  let loaded = 0;
  const total = TW_EN_FILES.length;
  const results = await Promise.all(
    TW_EN_FILES.map(u =>
      fetch(u).then(r => r.ok ? r.json() : []).catch(() => []).then(entries => {
        loaded++;
        if (onProgress) onProgress(loaded, total);
        return entries;
      })
    )
  );
  state.dictionary = [...state.dictionary, ...results.flat()];
  state.twEnLoaded = true;
}

function initTwEnPreloadPanel() {
  const panel = byId("twEnPreloadPanel");
  if (!panel) return;
  if (state.twEnLoaded || state.selectedDialect !== "taiwanese_en") { panel.style.display = "none"; return; }

  panel.style.display = "";
  panel.innerHTML = `
    <button id="twEnPreloadBtn" style="font-size:0.8em;padding:0.2rem 0.6rem;opacity:0.8">
      ⬇ Pre-load Taiwanese (English) offline
    </button>
    <div id="twEnProgressWrap" style="display:none;margin-top:0.3rem">
      <div class="learned-progress" style="height:6px">
        <div class="learned-progress-fill" id="twEnProgressFill" style="width:0%;transition:width 0.2s"></div>
      </div>
      <span id="twEnProgressText" style="font-size:0.75em;opacity:0.65">Downloading…</span>
    </div>
  `;

  byId("twEnPreloadBtn").addEventListener("click", async () => {
    const btn  = byId("twEnPreloadBtn");
    const wrap = byId("twEnProgressWrap");
    const fill = byId("twEnProgressFill");
    const text = byId("twEnProgressText");
    btn.disabled = true;
    wrap.style.display = "";
    await loadTwEnEntries((loaded, total) => {
      fill.style.width = `${Math.round(loaded / total * 100)}%`;
      text.textContent = `Loading… ${loaded}/${total} files`;
    });
    panel.innerHTML = `<span style="font-size:0.8em;opacity:0.65">✓ All 75,137 English entries loaded</span>`;
    if (state.selectedDialect === "taiwanese_en") renderDictionary();
  });
}

async function loadContent() {
  const [contentResponse, dictionaryResponse, ...mnResults] = await Promise.all([
    fetch("data/content.json", { cache: "no-store" }),
    fetch("data/dialects/shared.json", { cache: "no-store" }),
    ...MN_FILES.map(u => fetch(u, { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => []))
  ]);
  if (!contentResponse.ok) throw new Error("Could not load data/content.json");
  if (!dictionaryResponse.ok) throw new Error("Could not load data/dialects/shared.json");
  const content = await contentResponse.json();
  const shared = await dictionaryResponse.json();
  const mnEntries = mnResults.flat();
  const dictionary = [...shared, ...mnEntries];
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

  const groups = dialects.filter(d => !d.dictionaryOnly).reduce((acc, dialect) => {
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

  select.addEventListener("change", async () => {
    state.selectedDialect = select.value;
    setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
    initTwEnPreloadPanel();
    if (state.selectedDialect === "taiwanese_en" && !state.twEnLoaded) {
      byId("wordsList").innerHTML = '<p class="muted">Loading dictionary data…</p>';
      await loadTwEnEntries();
      initTwEnPreloadPanel();
    }
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
  const text = entry.english || entry.chinese || "";
  // Consider it a phrase if the display text has multiple words or has phrase tags
  const hasMultipleWords = text.trim().split(/\s+/).length > 2;
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
      // MoE entries have empty english — fall back to TL romanization for letter bucketing
      const engFirst = (entry.english || "").charAt(0).toLowerCase();
      const checkFirst = /^[a-z]/.test(engFirst) ? engFirst : (entry.tl || "").charAt(0).toLowerCase();
      if (checkFirst !== state.selectedLetter) {
        return false;
      }
    }
    
    // Search filter — diacritic-insensitive: "a" matches á/à/â/ā, "tsia" matches "tsiáh"
    if (state.search.trim()) {
      const stripDia = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const qExact = state.search.toLowerCase();
      const qNorm  = stripDia(state.search);
      const raw = [
        entry.english,
        entry.chinese,
        entry.hanzi,
        entry.poj,
        entry.tl,
        ...(entry.tags || [])
      ].join(" ");
      if (!raw.toLowerCase().includes(qExact) && !stripDia(raw).includes(qNorm)) {
        return false;
      }
    }
    
    return true;
  });
}

function sortByEnglish(entries) {
  return entries.sort((a, b) => (a.english || a.chinese || "").localeCompare(b.english || b.chinese || ""));
}

function renderEntry(entry) {
  const article = document.createElement("article");
  // Key off english if populated, else fall back to tl for MoE entries
  const learnKey = entry.english || entry.tl || entry.hanzi || "";
  const isLearned = state.learnedSet.has(learnKey);
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
        <strong class="english">${entry.english || entry.chinese || ""}</strong>
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
      ${entry.chinese && entry.english ? `<p class="example"><span class="label">中:</span> ${entry.chinese}</p>` : ""}
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
    toggleLearned(learnKey, article, learnBtn);
  });
  article.querySelector(".dict-entry-header").appendChild(learnBtn);

  return article;
}

function renderDictionary() {
  const filtered = filterEntries(state.dictionary);
  const words = sortByEnglish(filtered);

  const wordsList = byId("wordsList");
  const wordsCount = byId("wordsCount");
  wordsList.innerHTML = "";
  wordsCount.textContent = `${words.length} entr${words.length !== 1 ? "ies" : "y"} found`;

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
  // taiwanese_moe has moved to dictionary_chinese.html — reset stale cookie
  if (state.selectedDialect === "taiwanese_moe") state.selectedDialect = "all";
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

    if (state.selectedDialect === "taiwanese_en") {
      await loadTwEnEntries();
    }

    initDialectSelect();
    initTwEnPreloadPanel();
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
