import { getGame } from "../js/core/catalog.js";
import { listAllRecentRooms, removeRecent } from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";

mountShellNav({ active: "lobby", base: "../" });

const listEl = document.getElementById("lobby-list");
const emptyEl = document.getElementById("lobby-empty");

function gamePath(gameId) {
  const g = getGame(gameId);
  return g ? `../${g.path}` : "../";
}

function render() {
  const items = listAllRecentRooms().sort(
    (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
  );
  emptyEl.classList.toggle("hidden", items.length > 0);
  listEl.innerHTML = "";
  for (const item of items) {
    const game = getGame(item.gameId);
    const li = document.createElement("li");
    li.className = "lobby-row";
    const href = `${gamePath(item.gameId)}?room=${encodeURIComponent(item.code)}`;
    li.innerHTML = `
      <div class="meta">
        <strong>${game?.title || item.gameId}</strong>
        <div class="hint">${item.code} · ${item.role}${item.name ? ` · ${item.name}` : ""}</div>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="${href}">Open</a>
        <button type="button" class="btn btn-ghost" data-remove="${item.gameId}|${item.code}">Wis</button>
      </div>`;
    listEl.appendChild(li);
  }
  listEl.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [gameId, code] = btn.getAttribute("data-remove").split("|");
      removeRecent(gameId, code);
      render();
    });
  });
}

render();
