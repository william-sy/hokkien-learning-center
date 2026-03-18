const COOKIE_KEYS = {
  selectedDialect: "hokkien_selected_dialect",
  search: "hokkien_search"
};

const REPO_URL = "https://github.com/william-sy/hokkien-learning-center";

const state = {
  content: null,
  selectedDialect: "all",
  search: ""
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

const MN_FILES = [
  "data/dialects/malaysia_north/a-e.json",
  "data/dialects/malaysia_north/f-j.json",
  "data/dialects/malaysia_north/k-o.json",
  "data/dialects/malaysia_north/p-t.json",
  "data/dialects/malaysia_north/u-z.json",
];

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

  return { ...content, dictionary };
}

function initDialectSelect() {
  const select = byId("dialectSelect");
  const notes = byId("dialectNotes");
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
  updateDialectNotes();

  select.addEventListener("change", () => {
    state.selectedDialect = select.value;
    setCookie(COOKIE_KEYS.selectedDialect, state.selectedDialect);
    updateDialectNotes();
    renderDictionary();
    renderPronunciation();
  });

  function updateDialectNotes() {
    if (state.selectedDialect === "all") {
      notes.textContent = "Showing shared and regional entries.";
      return;
    }
    const current = dialects.find((d) => d.id === state.selectedDialect);
    notes.textContent = current?.notes || "";
  }
}

function filterEntries(entries) {
  return entries
    .filter((entry) => {
      if (state.selectedDialect === "all") return true;
      if (entry.dialectId === state.selectedDialect) return true;
      return entry.dialectId === "shared";
    })
    .filter((entry) => {
      if (!state.search.trim()) return true;
      const q = state.search.toLowerCase();
      const searchable = [
        entry.english,
        entry.hanzi,
        entry.poj,
        entry.tl,
        entry.audioHint,
        ...(entry.tags || [])
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(q);
    });
}

function renderDictionary() {
  const list = byId("dictionaryList");
  const entries = filterEntries(state.content.dictionary);

  const PREVIEW_LIMIT = 20;
  const preview = entries.slice(0, PREVIEW_LIMIT);
  const overflow = entries.length - PREVIEW_LIMIT;

  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = "<p class='muted'>No entries match this filter yet.</p>";
    return;
  }

  for (const item of preview) {
    const article = document.createElement("article");
    article.className = "entry";
    
    const audioBtn = (item.audioUrl && item.audioUrl.trim()) ? 
      `<button class="audio-btn" data-audio-url="${item.audioUrl}" aria-label="Play pronunciation">🔊</button>` : "";
    
    article.innerHTML = `
      <div class="entry-header">
        <h3>${item.hanzi || "(No Hanzi)"} · ${item.english}</h3>
        ${audioBtn}
      </div>
      <p class="meta">POJ: ${item.poj || "-"} | TL: ${item.tl || "-"}</p>
      <p>${item.example || ""}</p>
      <p class="meta">Tone: ${item.tone || "-"} | Pronunciation hint: ${item.audioHint || "-"}</p>
    `;
    list.appendChild(article);
  }
  
  if (overflow > 0) {
    const more = document.createElement("p");
    more.className = "muted";
    more.style.textAlign = "center";
    more.style.marginTop = "1rem";
    more.innerHTML = `…and ${overflow} more. <a href="dictionary.html">View all in Dictionary →</a>`;
    list.appendChild(more);
  }

  // Attach audio button listeners
  document.querySelectorAll(".audio-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      playAudio(btn.dataset.audioUrl);
    });
  });
}

function renderPronunciation() {
  const tipsWrap = byId("pronunciationTips");
  const tableWrap = byId("toneTableWrap");

  // Section was removed from index.html in favour of tones.html — bail silently.
  if (!tipsWrap || !tableWrap) return;

  const tips = state.content.pronunciationTips;
  const tones = state.content.toneCharts;

  tipsWrap.innerHTML = "";
  for (const tip of tips) {
    const span = document.createElement("span");
    span.className = "pill";
    span.textContent = tip;
    tipsWrap.appendChild(span);
  }

  const activeChart =
    state.selectedDialect === "all"
      ? tones.shared
      : tones[state.selectedDialect] || tones.shared;

  tableWrap.innerHTML = "";
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Tone</th>
        <th>Contour</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      ${activeChart
        .map(
          (row) => `
            <tr>
              <td>${row.tone}</td>
              <td>${row.contour}</td>
              <td>${row.description}</td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  `;

  tableWrap.appendChild(table);
}

function initSearch() {
  const searchInput = byId("searchInput");
  searchInput.value = state.search;

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    setCookie(COOKIE_KEYS.search, state.search);
    renderDictionary();
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
  state.search = getCookie(COOKIE_KEYS.search) || "";
}

async function init() {
  try {
    hydrateStateFromCookies();
    state.content = await loadContent();

    initDialectSelect();
    initSearch();
    renderDictionary();
    renderPronunciation();
  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
