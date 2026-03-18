// ── progress-manager.js ──────────────────────────────────────────────────────
// Save / Load / Reset local learning progress.
// Works with every hokkien_* key in localStorage.
// Useful on shared computers — export to a personal file, import to restore.

const PROGRESS_PREFIX = "hokkien_";

// ── data helpers ──────────────────────────────────────────────────────────────

function getAllProgress() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PROGRESS_PREFIX)) {
      data[key] = localStorage.getItem(key);
    }
  }
  return data;
}

function exportProgress() {
  const progress = getAllProgress();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `hokkien-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportAnki() {
  let learnedSet;
  try {
    const raw = localStorage.getItem("hokkien_learned_words");
    learnedSet = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_) { learnedSet = new Set(); }

  if (learnedSet.size === 0) {
    return { error: "No \u2b50 learned words yet \u2014 mark words as learned in the Dictionary first." };
  }

  const res = await fetch("data/dialects/shared.json");
  if (!res.ok) throw new Error("Could not load data/dialects/shared.json");
  const dict = await res.json();

  const rows = dict
    .filter(e => learnedSet.has(e.english))
    .map(e => {
      const front = e.english;
      const rom   = e.poj || e.tl || "";
      const back  = [e.hanzi, rom, e.example].filter(Boolean).join(" \u2022 ");
      const tags  = [...(e.tags || []), e.dialectId].filter(Boolean).join(" ");
      return [front, back, tags].join("\t");
    });

  const tsv  = "#separator:tab\n#html:false\n#tags column:3\n" + rows.join("\n");
  const blob = new Blob([tsv], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), {
    href: url,
    download: `hokkien-anki-${new Date().toISOString().slice(0, 10)}.txt`
  }).click();
  URL.revokeObjectURL(url);
  return { count: rows.length };
}

function importProgress(file, onDone) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.progress || typeof data.progress !== "object") {
        throw new Error("Invalid file — missing progress object.");
      }
      // Remove old hokkien_ keys
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PROGRESS_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      // Restore
      let count = 0;
      for (const [key, value] of Object.entries(data.progress)) {
        if (key.startsWith(PROGRESS_PREFIX)) {
          localStorage.setItem(key, value);
          count++;
        }
      }
      onDone(null, count);
    } catch (err) {
      onDone(err.message);
    }
  };
  reader.readAsText(file);
}

function resetProgress(onDone) {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PROGRESS_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  onDone(toRemove.length);
}

// ── stats ─────────────────────────────────────────────────────────────────────

function readStats() {
  let words = 0, phrases = 0;
  try {
    const w = localStorage.getItem("hokkien_learned_words");
    if (w) words = JSON.parse(w).length;
  } catch {}
  try {
    const p = localStorage.getItem("hokkien_learned_phrases");
    if (p) phrases = JSON.parse(p).length;
  } catch {}
  return { words, phrases };
}

// ── UI ────────────────────────────────────────────────────────────────────────

function createProgressUI() {
  // FAB
  const fab = document.createElement("button");
  fab.id        = "progressFab";
  fab.title     = "Save / Load / Reset progress";
  fab.innerHTML = "💾";
  fab.setAttribute("aria-label", "Manage learning progress");

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.id = "progressBackdrop";

  // Panel
  const panel = document.createElement("div");
  panel.id = "progressPanel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Learning progress manager");
  panel.innerHTML = `
    <div class="pm-header">
      <h3>📚 Learning Progress</h3>
      <button class="pm-close" id="pmClose" aria-label="Close">✕</button>
    </div>

    <div class="pm-stats" id="pmStats"></div>

    <p class="pm-desc">
      Export your progress to a personal file, then import it again on any device
      — handy for shared computers.
    </p>

    <div class="pm-actions">
      <button class="pm-btn pm-export" id="pmExport">
        <span class="pm-btn-icon">⬇️</span>
        <span>Export progress</span>
      </button>

      <button class="pm-btn pm-anki" id="pmAnki">
        <span class="pm-btn-icon">🃏</span>
        <span>Export to Anki</span>
      </button>

      <label class="pm-btn pm-import" tabindex="0" id="pmImportLabel"
             onkeydown="if(event.key==='Enter'||event.key===' ')this.querySelector('input').click()">
        <span class="pm-btn-icon">⬆️</span>
        <span>Import progress</span>
        <input type="file" id="pmImportFile" accept=".json" style="display:none" />
      </label>

      <button class="pm-btn pm-reset" id="pmReset">
        <span class="pm-btn-icon">🗑️</span>
        <span>Reset all progress</span>
      </button>
    </div>

    <div class="pm-feedback" id="pmFeedback"></div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  // ── helpers ────────────────────────────────────────────────────────────────

  function updateStats() {
    const { words, phrases } = readStats();
    const el = document.getElementById("pmStats");
    if (words === 0 && phrases === 0) {
      el.innerHTML = `<span class="pm-stat-empty">No progress saved yet</span>`;
    } else {
      el.innerHTML =
        `<span class="pm-stat">✓ <strong>${words}</strong> word${words !== 1 ? "s" : ""} learned</span>` +
        `<span class="pm-stat">✓ <strong>${phrases}</strong> phrase${phrases !== 1 ? "s" : ""} learned</span>`;
    }
  }

  function showFeedback(msg, isError = false) {
    const el = document.getElementById("pmFeedback");
    el.textContent = msg;
    el.className   = "pm-feedback " + (isError ? "pm-error" : "pm-success");
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.textContent = "";
      el.className   = "pm-feedback";
    }, 4000);
  }

  function openPanel() {
    updateStats();
    panel.classList.add("open");
    backdrop.classList.add("open");
    document.getElementById("pmFeedback").textContent = "";
    document.getElementById("pmClose").focus();
  }

  function closePanel() {
    panel.classList.remove("open");
    backdrop.classList.remove("open");
    fab.focus();
  }

  // ── events ─────────────────────────────────────────────────────────────────

  fab.addEventListener("click", openPanel);

  document.getElementById("pmClose").addEventListener("click", closePanel);
  backdrop.addEventListener("click", closePanel);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
  });

  document.getElementById("pmExport").addEventListener("click", () => {
    const data = getAllProgress();
    if (Object.keys(data).length === 0) {
      showFeedback("Nothing to export yet — mark some words as learned first.", true);
      return;
    }
    exportProgress();
    showFeedback("✓ File downloaded — save it somewhere personal.");
  });
  document.getElementById("pmAnki").addEventListener("click", async () => {
    try {
      const result = await exportAnki();
      if (result.error) {
        showFeedback(result.error, true);
      } else {
        showFeedback(`\u2713 Exported ${result.count} card${result.count !== 1 ? "s" : ""} \u2014 import the .txt file into Anki.`);
      }
    } catch (err) {
      showFeedback("Export failed: " + err.message, true);
    }
  });
  document.getElementById("pmImportFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importProgress(file, (err, count) => {
      e.target.value = "";
      if (err) {
        showFeedback("Import failed: " + err, true);
      } else {
        // Remove stale streak badge immediately so it reflects imported data after reload
        document.getElementById("streakBadge")?.remove();
        updateStats();
        showFeedback(`✓ Imported ${count} item${count !== 1 ? "s" : ""}. Reloading…`);
        setTimeout(() => location.reload(), 1600);
      }
    });
  });

  document.getElementById("pmReset").addEventListener("click", () => {
    const { words, phrases } = readStats();
    if (words === 0 && phrases === 0) {
      showFeedback("Nothing to reset.", true);
      return;
    }
    if (!confirm(`Reset all progress?\n\n• ${words} word${words !== 1 ? "s" : ""} learned\n• ${phrases} phrase${phrases !== 1 ? "s" : ""} learned\n\nThis cannot be undone.`)) return;
    resetProgress((count) => {
      // Prevent recordVisit() from re-creating a streak of 1 on the next page load
      localStorage.setItem("hokkien_streak_skip", "1");
      // Remove stale streak badge immediately
      document.getElementById("streakBadge")?.remove();
      updateStats();
      showFeedback(`✓ Progress cleared (${count} item${count !== 1 ? "s" : ""}). Reloading…`);
      setTimeout(() => location.reload(), 1600);
    });
  });
}

document.addEventListener("DOMContentLoaded", createProgressUI);
