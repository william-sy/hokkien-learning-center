const COOKIE_KEYS = {
  selectedDialect: "hokkien_phrase_dialect",
  selectedCategory: "hokkien_phrase_category",
  search: "hokkien_phrase_search"
};

const LS_LEARNED_KEY = "hokkien_learned_phrases";

const state = {
  content: null,
  phrases: [],
  selectedDialect: "all",
  selectedCategory: "all",
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

function toggleLearnedPhrase(key, article, btn) {
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
  const bar = byId("phrasesLearnedBar");
  if (!bar) return;
  const total = state.phrases.length;
  const count = state.learnedSet.size;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  bar.innerHTML =
    `<span>${count} / ${total} phrases learned</span>` +
    `<div class="learned-progress"><div class="learned-progress-fill" style="width:${pct}%"></div></div>`;
}

async function loadData() {
  const [contentRes, phrasesRes] = await Promise.all([
    fetch("data/content.json", { cache: "no-store" }),
    fetch("data/phrases.json", { cache: "no-store" })
  ]);
  if (!contentRes.ok) throw new Error("Could not load data/content.json");
  if (!phrasesRes.ok) throw new Error("Could not load data/phrases.json");
  return {
    content: await contentRes.json(),
    phrases: await phrasesRes.json()
  };
}

function initDialectSelect() {
  const select = byId("phraseDialect");
  const { dialects } = state.content;

  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All dialects";
  select.appendChild(allOpt);

  const groups = dialects.reduce((acc, d) => {
    const g = d.group || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(d);
    return acc;
  }, {});

  for (const [groupName, items] of Object.entries(groups)) {
    const grp = document.createElement("optgroup");
    grp.label = groupName;
    for (const d of items) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      grp.appendChild(opt);
    }
    select.appendChild(grp);
  }

  select.value = state.selectedDialect;
  select.addEventListener("change", () => {
    state.selectedDialect = select.value;
    setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
    render();
  });
}

function initCategorySelect() {
  const select = byId("phraseCategory");
  select.value = state.selectedCategory;
  select.addEventListener("change", () => {
    state.selectedCategory = select.value;
    setCookie(COOKIE_KEYS.selectedCategory, state.selectedCategory);
    render();
  });
}

function initSearch() {
  const input = byId("phraseSearch");
  input.value = state.search;
  input.addEventListener("input", () => {
    state.search = input.value;
    setCookie(COOKIE_KEYS.search, state.search);
    render();
  });
}

function filterPhrases() {
  return state.phrases.filter((p) => {
    if (state.selectedDialect !== "all") {
      const directMatch = p.dialectId === state.selectedDialect || p.dialectId === "shared";
      const variantMatch = p.variants && p.variants.some(v => v.dialectId === state.selectedDialect);
      if (!directMatch && !variantMatch) return false;
    }

    if (state.selectedCategory !== "all") {
      if (!p.tags || !p.tags.includes(state.selectedCategory)) return false;
    }

    if (state.search.trim()) {
      const q = state.search.toLowerCase();
      const searchable = [p.english, p.hanzi, p.poj, p.tl, ...(p.tags || [])]
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    return true;
  });
}

function renderPhrase(p) {
  const article = document.createElement("article");
  const isLearned = state.learnedSet.has(p.english);
  article.className = "dict-entry" + (isLearned ? " learned" : "");

  const audioBtn = (p.audioUrl && p.audioUrl.trim())
    ? `<button class="audio-btn-small" data-audio-url="${p.audioUrl}" aria-label="Play pronunciation">🔊</button>`
    : "";

  const dialectName = state.content.dialects.find(d => d.id === p.dialectId)?.name || p.dialectId;

  // Pick the right variant pronunciation if a dialect is selected
  let displayPoj = p.poj || "-";
  let displayTl  = p.tl  || "-";
  let variantsHtml = "";

  if (p.variants && p.variants.length > 0) {
    if (state.selectedDialect !== "all") {
      const match = p.variants.find(v => v.dialectId === state.selectedDialect);
      if (match) {
        displayPoj = match.poj || displayPoj;
        displayTl  = match.tl  || displayTl;
      }
    } else {
      const items = p.variants.map(v => {
        const vName = state.content.dialects.find(d => d.id === v.dialectId)?.name || v.dialectId;
        return `<span class="variant-item"><span class="dialect-tag" style="opacity:0.7;font-size:0.8em">${vName}</span> ${v.poj || ""}${v.tl && v.tl !== v.poj ? ` · ${v.tl}` : ""}</span>`;
      }).join(" ");
      variantsHtml = `<p class="romanization" style="font-size:0.85em;opacity:0.8"><span class="label">Variants:</span> ${items}</p>`;
    }
  }

  article.innerHTML = `
    <div class="dict-entry-header">
      <div class="dict-entry-title">
        <strong class="english">${p.english}</strong>
        <span class="hanzi">${p.hanzi || ""}</span>
      </div>
      ${audioBtn}
    </div>
    <div class="dict-entry-body">
      <p class="romanization">
        <span class="label">POJ:</span> ${displayPoj}
        <span class="separator">|</span>
        <span class="label">TL:</span> ${displayTl}
      </p>
      ${variantsHtml}
      ${p.example ? `<p class="example"><span class="label">Example:</span> ${p.example}</p>` : ""}
      <p class="meta">
        <span class="dialect-tag">${dialectName}</span>
        ${(p.tags || []).map(t => `<span class="tag">#${t}</span>`).join(" ")}
      </p>
    </div>
  `;

  const learnBtn = document.createElement("button");
  learnBtn.className = "learn-btn" + (isLearned ? " learned" : "");
  learnBtn.textContent = isLearned ? "✓ Learned" : "Mark learned";
  learnBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLearnedPhrase(p.english, article, learnBtn);
  });
  article.querySelector(".dict-entry-header").appendChild(learnBtn);

  return article;
}

function render() {
  const filtered = filterPhrases();
  const list  = byId("phrasesList");
  const count = byId("phrasesCount");

  list.innerHTML = "";
  count.textContent = `${filtered.length} phrase${filtered.length !== 1 ? "s" : ""} found`;

  if (filtered.length === 0) {
    list.innerHTML = "<p class='muted'>No phrases match your filters.</p>";
    return;
  }

  filtered.forEach(p => list.appendChild(renderPhrase(p)));
  updateLearnedBar();

  list.querySelectorAll(".audio-btn-small").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const audio = new Audio(btn.dataset.audioUrl);
      audio.play().catch(() => alert("Could not play audio."));
    });
  });
}

function hydrateFromCookies() {
  state.selectedDialect  = getCookie(COOKIE_KEYS.selectedDialect)  || "all";
  state.selectedCategory = getCookie(COOKIE_KEYS.selectedCategory) || "all";
  state.search           = getCookie(COOKIE_KEYS.search)           || "";
}

async function init() {
  try {
    hydrateFromCookies();
    loadLearnedSet();
    const data = await loadData();
    state.content = data.content;
    state.phrases = data.phrases;

    initDialectSelect();
    initCategorySelect();
    initSearch();
    render();
  } catch (err) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${err.message}</p></section></main>`;
  }
}

init();
