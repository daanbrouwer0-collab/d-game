/**
 * Standalone ganzenbord: local hotseat only.
 * Multiplayer runs via room/ + embedded.js — not this file.
 */
import { createRoom } from "../js/core/room.js";
import { getDisplayName, setDisplayName } from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";
import { setupStandaloneLocalGame } from "../js/shell/room-only-multiplayer.js";
import { TURN_SECONDS } from "./game.js";
import { Room } from "./room.js";
import { UI } from "./ui.js";

mountShellNav({ active: "games", base: "../" });
setupStandaloneLocalGame();

const ui = new UI();
/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {Room | null} */
let room = null;

const savedName = getDisplayName();
if (savedName && ui.nameInput) ui.nameInput.value = savedName;
ui.nameInput?.addEventListener("change", () => {
  setDisplayName(ui.nameInput.value);
});

function syncView() {
  if (!room || !session) return;
  const online = room.state.players.map((p) => ({
    id: p.id,
    online: true,
  }));
  if (room.state.phase === "lobby") {
    ui.showLobby();
    ui.renderLobby(room.state, room.localId, true, {
      local: true,
      online,
      youName: room.localName,
    });
    ui.clearTurnTimer();
  } else {
    ui.showGame();
    ui.renderGame(room.state, room.localId, {
      local: true,
      online,
      youName: room.localName,
      connected: true,
      isHost: true,
    });
    syncTurnTimer();
  }
}

function syncTurnTimer() {
  if (!room || room.state.phase !== "playing") {
    ui.clearTurnTimer();
    return;
  }
  const current = room.state.players[room.state.turnIndex];
  if (!current) {
    ui.clearTurnTimer();
    return;
  }
  const posKey = room.state.players
    .map((p) => `${p.id}:${room.state.positions[p.id] ?? 0}`)
    .join("|");
  const key = `${room.state.turnIndex}:${current.id}:${posKey}`;
  ui.syncTurnTimer({
    key,
    seconds: TURN_SECONDS,
    active: true,
    canExpire: true,
    onExpire: () => {
      room?.tryTimeout();
      queueMicrotask(() => syncTurnTimer());
    },
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!room || room.state.phase !== "playing") return;
    ui.nudgeTurnTimer();
    queueMicrotask(() => syncTurnTimer());
  });
}

async function teardown() {
  ui.clearTurnTimer();
  if (session) await session.destroy();
  session = null;
  room = null;
}

async function startLocal(name) {
  ui.setError("");
  await teardown();
  const s = createRoom({ gameId: "ganzenbord", transport: "local", maxGuests: 5 });
  session = s;
  s.onStatus = (status, detail) => {
    ui.setConnectionStatus(status, detail);
    if (status === "hosting" || status === "connected") syncView();
  };
  s.onError = (err) => {
    const message = err instanceof Error ? err.message : String(err);
    ui.setError(message || "Fout");
  };

  const display = (name || ui.playerName() || "Speler").trim() || "Speler";
  setDisplayName(display);

  const r = new Room(s, { localName: display });
  room = r;
  r.onState = () => syncView();
  r.onReject = (reason) => ui.setError(reason);

  await s.host();
  r.beginAsHost();
  ui.setConnectionStatus("connected", "Op dit apparaat");
  ui.showLobby();
  syncView();
}

ui.btnLocal?.addEventListener("click", async () => {
  ui.btnLocal.disabled = true;
  try {
    await startLocal(ui.playerName());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ui.setError(message || "Kon niet starten");
  } finally {
    ui.btnLocal.disabled = false;
  }
});

ui.btnAddLocal?.addEventListener("click", () => {
  if (!room) return;
  const name =
    (ui.localPlayerName?.value || "").trim() ||
    `Speler ${room.state.players.length + 1}`;
  const result = room.addLocalPlayer(name);
  if (!result.ok) {
    ui.setError(result.reason || "Kon speler niet toevoegen");
    return;
  }
  if (ui.localPlayerName) ui.localPlayerName.value = "";
  ui.setError("");
});

ui.btnStart?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryStart();
  if (!result.ok) ui.setError(result.reason || "Kan niet starten");
  else ui.setError("");
});

ui.btnRoll?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryRoll();
  if (!result.ok) ui.setError(result.reason || "Kon niet gooien");
  else ui.setError("");
});

ui.btnRematch?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryRematch();
  if (!result.ok) ui.setError(result.reason || "Kon niet opnieuw starten");
  else ui.setError("");
});

ui.btnToLobby?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryToLobby();
  if (!result.ok) ui.setError(result.reason || "Kon niet terug");
  else ui.setError("");
});

ui.btnLeave?.addEventListener("click", async () => {
  await teardown();
  ui.showSetup();
  ui.setConnectionStatus("idle");
  ui.setError("");
});

ui.btnLeaveGame?.addEventListener("click", async () => {
  await teardown();
  ui.showSetup();
  ui.setConnectionStatus("idle");
  ui.setError("");
});

void startLocal(ui.playerName());
