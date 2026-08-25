import {
  forgetDeskRoom,
  listDeskCards,
  navigateDeskCard,
} from "../js/core/desk.js";
import { mountShellNav } from "../js/shell/nav.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { navigateInShell, ROOM_PATH } from "../js/shell/site-url.js";

mountShellNav({ active: "lobby", base: "../" });

const listEl = document.getElementById("lobby-list");
const emptyEl = document.getElementById("lobby-empty");
const joinBox = document.getElementById("join-box");
const joinInput = /** @type {HTMLInputElement | null} */ (
  document.getElementById("join-code")
);
const joinError = document.getElementById("join-error");

function setJoinError(msg) {
  if (!joinError) return;
  if (!msg) {
    joinError.classList.add("hidden");
    joinError.textContent = "";
    return;
  }
  joinError.textContent = msg;
  joinError.classList.remove("hidden");
}

function goJoin(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!c) {
    setJoinError("Vul een roomcode in of scan de QR.");
    return;
  }
  setJoinError("");
  navigateInShell(ROOM_PATH, { room: c });
}

document.getElementById("btn-toggle-join")?.addEventListener("click", () => {
  joinBox?.classList.toggle("hidden");
  setJoinError("");
  if (joinBox && !joinBox.classList.contains("hidden")) {
    joinInput?.focus();
  }
});

document.getElementById("btn-join-room")?.addEventListener("click", () => {
  goJoin(joinInput?.value);
});

joinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goJoin(joinInput.value);
});

document.getElementById("btn-scan-qr")?.addEventListener("click", () => {
  setJoinError("");
  openQrScanner({
    hint: "Richt op de QR van de host",
    onScan: (raw) => {
      const invite = parseP2pInvite(raw);
      if (!invite) {
        setJoinError("Geen geldige room-uitnodiging in deze QR.");
        return;
      }
      if (joinInput) joinInput.value = invite.code;
      goJoin(invite.code);
    },
    onError: () => setJoinError("Camera kon niet starten."),
  });
});

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
    });
  });
}

render();
