// ── dictionary-chinese.js — Taiwanese MoE Chinese Reference Dictionary ───────

const COOKIE_KEYS = {
  selectedLetter: "hokkien_dict_cn_letter",
  search:         "hokkien_dict_cn_search"
};

const MOE_FILES = [
  "data/dialects/taiwanese_moe/a-e.json",
  "data/dialects/taiwanese_moe/f-j.json",
  "data/dialects/taiwanese_moe/k-o.json",
  "data/dialects/taiwanese_moe/p-s.json",
  "data/dialects/taiwanese_moe/t.json",
  "data/dialects/taiwanese_moe/u-z.json",
];

const state = {
  dictionary:     [],
  loaded:         false,
  selectedLetter: "all",
  search:         ""
};

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.split("; ").find(row => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function byId(id) { return document.getElementById(id); }

async function loadMoeEntries() {
  if (state.loaded) return;
  const fill = byId("loadProgressFill");
  const text = byId("loadProgressText");
  let loaded = 0;
  const total = MOE_FILES.length;
  const results = await Promise.all(
    MOE_FILES.map(u =>
      fetch(u).then(r => r.ok ? r.json() : []).catch(() => []).then(entries => {
        loaded++;
        if (fill) fill.style.width = `${Math.round(loaded / total * 100)}%`;
        if (text) text.textContent = `Loading… ${loaded}/${total} files`;
        return entries;
      })
    )
  );
  state.dictionary = results.flat();
  state.loaded = true;
}

function filterEntries(entries) {
  return entries.filter(entry => {
    // Letter filter — bucket by first letter of TL romanization
    if (state.selectedLetter !== "all") {
      const first = (entry.tl || "").charAt(0).toLowerCase();
      if (first !== state.selectedLetter) return false;
    }

    // Search — diacritic-insensitive
    if (state.search.trim()) {
      const stripDia = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const qExact = state.search.toLowerCase();
      const qNorm  = stripDia(state.search);
      const raw = [entry.hanzi, entry.tl, entry.poj, entry.chinese].join(" ");
      if (!raw.toLowerCase().includes(qExact) && !stripDia(raw).includes(qNorm)) return false;
    }

    return true;
  });
}

function sortByTl(entries) {
  return [...entries].sort((a, b) => (a.tl || "").localeCompare(b.tl || ""));
}

function renderEntry(entry) {
  const article = document.createElement("article");
  article.className = "dict-entry";

  const audioBtn = (entry.audioUrl && entry.audioUrl.trim())
    ? `<button class="audio-btn-small" data-audio-url="${entry.audioUrl}" aria-label="Play pronunciation">🔊</button>`
    : "";

  // Hanzi is the headword; TL is the secondary label (reuses .hanzi class for visual treatment)
  const titleSecondary = entry.hanzi ? `<span class="hanzi">${entry.tl || ""}</span>` : "";

  article.innerHTML = `
    <div class="dict-entry-header">
      <div class="dict-entry-title">
        <strong class="english">${entry.hanzi || entry.tl || ""}</strong>
        ${titleSecondary}
      </div>
      ${audioBtn}
    </div>
    <div class="dict-entry-body">
      <p class="romanization">
        <span class="label">TL:</span> ${entry.tl || "-"}
        ${entry.poj ? `<span class="separator">|</span> <span class="label">POJ:</span> ${entry.poj}` : ""}
        <span class="separator">|</span>
        <span class="label">Tone:</span> ${entry.tone || "-"}
      </p>
      ${entry.chinese ? `<p class="example"><span class="label">定義：</span>${entry.chinese}</p>` : ""}
      ${entry.example ? `<p class="example"><span class="label">例句：</span>${entry.example}</p>` : ""}
      <p class="meta">
        <span class="dialect-tag">Taiwanese MoE</span>
        ${(entry.tags || []).filter(t => t !== "moe").map(t => `<span class="tag">#${t}</span>`).join(" ")}
      </p>
    </div>
  `;

  article.querySelectorAll(".audio-btn-small").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      new Audio(btn.dataset.audioUrl).play().catch(() => {});
    });
  });

  return article;
}

function renderDictionary() {
  const filtered = filterEntries(state.dictionary);
  const sorted   = sortByTl(filtered);

  const wordsList  = byId("wordsList");
  const wordsCount = byId("wordsCount");
  wordsList.innerHTML = "";
  wordsCount.textContent = `${sorted.length} entr${sorted.length !== 1 ? "ies" : "y"} found`;

  if (sorted.length === 0) {
    wordsList.innerHTML = '<p class="muted">No entries match your filters.</p>';
    return;
  }

  sorted.forEach(entry => wordsList.appendChild(renderEntry(entry)));
}

function initAlphabetNav() {
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
  const input = byId("dictSearch");
  input.value = state.search;
  input.addEventListener("input", () => {
    state.search = input.value;
    setCookie(COOKIE_KEYS.search, state.search);
    renderDictionary();
  });
}

function hydrateStateFromCookies() {
  state.selectedLetter = getCookie(COOKIE_KEYS.selectedLetter) || "all";
  state.search         = getCookie(COOKIE_KEYS.search) || "";
}

async function init() {
  try {
    hydrateStateFromCookies();

    await loadMoeEntries();

    // Hide loading panel, show main content + results
    byId("loadPanel").style.display   = "none";
    byId("mainContent").style.display = "";
    byId("resultsSection").style.display = "";

    initAlphabetNav();
    initSearch();

    // Restore active letter button + dropdown
    document.querySelectorAll(".alphabet-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.letter === state.selectedLetter);
    });
    const alphabetSelect = document.getElementById("alphabetSelect");
    if (alphabetSelect) alphabetSelect.value = state.selectedLetter;

    renderDictionary();
  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
