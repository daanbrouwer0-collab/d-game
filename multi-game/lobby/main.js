import {
  deskHashHref,
  forgetDeskRoom,
  listDeskCards,
} from "../js/core/desk.js";
import { mountRoomStrip, mountShellNav } from "../js/shell/nav.js";
import { isHashShell } from "../js/shell/site-url.js";

mountShellNav({ active: "lobby", base: "../" });
mountRoomStrip({ base: "../" });

const listEl = document.getElementById("lobby-list");
const emptyEl = document.getElementById("lobby-empty");

function href(card, intent) {
  if (isHashShell()) return deskHashHref(card, intent);
  if (intent === "host") return card.hostHref;
  if (intent === "join") return card.joinHref;
  return card.openHref;
}

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
        <a class="btn btn-primary" href="${href(item, "open")}">Open</a>
        <a class="btn btn-ghost" href="${href(item, "host")}">Host opnieuw</a>
        <a class="btn btn-ghost" href="${href(item, "join")}">Join</a>
        <button type="button" class="btn btn-ghost" data-remove="${item.gameId}|${item.code}">Wis</button>
      </div>`;
    listEl.appendChild(li);
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
