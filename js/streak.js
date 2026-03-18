// ── streak.js ──────────────────────────────────────────────────────────────
// Tracks consecutive daily study activity.
// A "study day" is recorded the first time any page loads on a given calendar date.
// The streak badge is injected into the nav on every page.

const STREAK_DATE_KEY  = "hokkien_streak_date";   // ISO date of last activity
const STREAK_COUNT_KEY = "hokkien_streak_count";  // consecutive days

function todayISO() {
  return new Date().toISOString().slice(0, 10); // "2026-03-13"
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getStreak() {
  const lastDate  = localStorage.getItem(STREAK_DATE_KEY)  || "";
  const lastCount = parseInt(localStorage.getItem(STREAK_COUNT_KEY) || "0", 10);
  return { lastDate, count: lastCount };
}

function recordVisit() {
  // Check for a skip flag set by reset/import — clear it and render 0
  if (localStorage.getItem("hokkien_streak_skip") === "1") {
    localStorage.removeItem("hokkien_streak_skip");
    renderBadge(0);
    return 0;
  }

  const today     = todayISO();
  const yesterday = yesterdayISO();
  const { lastDate, count } = getStreak();

  if (lastDate === today) return count;          // already recorded today

  const newCount = lastDate === yesterday ? count + 1 : 1;   // extend or restart
  localStorage.setItem(STREAK_DATE_KEY,  today);
  localStorage.setItem(STREAK_COUNT_KEY, String(newCount));
  return newCount;
}

function renderBadge(count) {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  // Remove any stale badge
  document.getElementById("streakBadge")?.remove();

  if (count === 0) return;

  const btn   = document.createElement("span");
  btn.id        = "streakBadge";
  btn.className = "streak-badge";
  btn.title     = `${count}-day streak — keep it up!`;
  btn.setAttribute("aria-label", `${count}-day streak`);

  const emoji = count >= 30 ? "🔥🔥" : count >= 7 ? "🔥" : "🔥";
  btn.textContent = `${emoji} ${count}`;

  // Insert before the themeToggle button so it sits on the right
  const toggleBtn = document.getElementById("themeToggle");
  if (toggleBtn) {
    nav.insertBefore(btn, toggleBtn);
  } else {
    nav.appendChild(btn);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const count = recordVisit();
  renderBadge(count);
});
