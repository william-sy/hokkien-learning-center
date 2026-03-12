async function loadContent() {
  const response = await fetch("data/content.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load data/content.json");
  return response.json();
}

function byId(id) {
  return document.getElementById(id);
}

function renderOverview(content) {
  const overview = byId("overviewContent");
  overview.innerHTML = `<p>${content.generalInfo}</p>`;
}

function renderResources(resources) {
  const links = byId("resourceLinks");
  links.innerHTML = "";
  
  for (const item of resources) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `${item.title} — ${item.type}`;
    li.appendChild(a);
    links.appendChild(li);
  }
}

function renderDialects(dialects) {
  const dialectsInfo = byId("dialectsInfo");
  dialectsInfo.innerHTML = "";

  const groups = dialects.reduce((acc, dialect) => {
    const group = dialect.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(dialect);
    return acc;
  }, {});

  for (const [groupName, items] of Object.entries(groups)) {
    const groupSection = document.createElement("div");
    groupSection.className = "dialect-group";
    
    const groupTitle = document.createElement("h3");
    groupTitle.textContent = groupName;
    groupSection.appendChild(groupTitle);

    for (const dialect of items) {
      const card = document.createElement("div");
      card.className = "dialect-card";
      card.innerHTML = `
        <h4>${dialect.name}</h4>
        <p class="muted">${dialect.notes}</p>
      `;
      groupSection.appendChild(card);
    }

    dialectsInfo.appendChild(groupSection);
  }
}

async function init() {
  try {
    const content = await loadContent();
    renderOverview(content);
    renderResources(content.resources);
    renderDialects(content.dialects);
  } catch (error) {
    document.body.innerHTML = `<main class='container'><section class='card'><h2>Error</h2><p>${error.message}</p></section></main>`;
  }
}

init();
