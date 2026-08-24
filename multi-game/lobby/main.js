import {
  forgetDeskRoom,
  listDeskCards,
  navigateDeskCard,
} from "../js/core/desk.js";
import { mountRoomStrip, mountShellNav } from "../js/shell/nav.js";

mountShellNav({ active: "lobby", base: "../" });
mountRoomStrip({ base: "../" });

const listEl = document.getElementById("lobby-list");
const emptyEl = document.getElementById("lobby-empty");

function render() {
  const items = listDeskCards("../");
  emptyEl.classList.toggle("hidden", items.length > 0);
  listEl.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "lobby-card";
    const role = item.role === "host" ? "Jij was host" : "Jij was gast";
    li.innerHTML = `
      <div class="meta">
        <strong>${item.title}</strong>
        <p class="room-code-line">${item.code}</p>
        <p class="hint">${role} · ${item.summary}</p>
      </div>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-go="open">Open</button>
        <button type="button" class="btn btn-ghost" data-go="host">Host opnieuw</button>
        <button type="button" class="btn btn-ghost" data-go="join">Join</button>
        <button type="button" class="btn btn-ghost" data-remove="${item.isRoomShell ? "" : item.gameId}|${item.code}">Wis</button>
      </div>`;
    listEl.appendChild(li);
    li.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const intent = /** @type {'open'|'host'|'join'} */ (
          btn.getAttribute("data-go") || "open"
        );
        navigateDeskCard(item, intent);
      });
    });
  }
  listEl.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [gameId, code] = btn.getAttribute("data-remove").split("|");
      forgetDeskRoom(gameId, code);
      render();
      mountRoomStrip({ base: "../" });
    });
  });
}

render();
