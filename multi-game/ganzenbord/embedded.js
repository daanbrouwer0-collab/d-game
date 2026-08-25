import {
  runEmbeddedGame,
  watchSessionEnd,
} from "../js/bridge/embedded-bootstrap.js";
import {
  hideEmbeddedLeaveButtons,
  stripEmbeddedChrome,
  applySpectatorMode,
} from "../js/shell/embedded-chrome.js";
import { TURN_SECONDS } from "./game.js";
import { Room } from "./room.js";
import { UI } from "./ui.js";

const ui = new UI();
/** @type {Room | null} */
let room = null;
/** @type {import('../js/bridge/bridge-transport.js').BridgeTransport | null} */
let transport = null;
let isSpectator = false;
/** @type {Set<string>} */
let readyPlayers = new Set();

const maybeEnd = watchSessionEnd(
  () => !!room && room.state.phase === "finished",
  () => {
    if (!room) return { reason: "finished", summary: "Spel afgelopen" };
    const winner = room.state.players.find((p) => p.id === room.state.winnerId);
    const name = String(winner?.name || "").trim();
    if (name) {
      return {
        reason: "finished",
        winnerName: name,
        winnerId: winner?.id || null,
        summary: `${name} wint`,
      };
    }
    return { reason: "finished", summary: "Spel afgelopen" };
  },
);

/**
 * @param {{ inGame?: string[] }} payload
 */
function applyPresence(payload) {
  const list = Array.isArray(payload?.inGame) ? payload.inGame : [];
  readyPlayers = new Set(list.map(String).filter(Boolean));
  syncTurnTimer();
}

function syncView() {
  if (!room || !transport) return;
  const online = room.state.players.map((p) => ({
    id: p.id,
    online: room.isPlayerOnline(p.id),
  }));
  ui.showGame();
  ui.renderGame(room.state, room.localId, {
    local: false,
    online,
    youName: room.localName,
    connected: true,
    isHost: transport.role === "host",
  });
  // Room shell owns the end screen — keep in-game rematch/lobby actions hidden.
  ui.winActions?.classList.add("hidden");
  ui.btnRematch?.classList.add("hidden");
  ui.btnToLobby?.classList.add("hidden");
  syncTurnTimer();
  maybeEnd();
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
  const ready = readyPlayers.has(current.id);
  const posKey = room.state.players
    .map((p) => `${p.id}:${room.state.positions[p.id] ?? 0}`)
    .join("|");
  const key = `${room.state.turnIndex}:${current.id}:${posKey}:${ready ? "go" : "wait"}`;
  if (!ready) {
    ui.syncTurnTimer({
      key,
      seconds: TURN_SECONDS,
      active: true,
      waiting: true,
      canExpire: false,
    });
    return;
  }
  ui.syncTurnTimer({
    key,
    seconds: TURN_SECONDS,
    active: true,
    canExpire: transport?.role === "host",
    onExpire: () => {
      room?.tryTimeout();
      queueMicrotask(() => syncTurnTimer());
    },
  });
}

function wireRoom(r) {
  room = r;
  r.onState = () => syncView();
  r.onReject = (reason) => ui.setError(reason);
}

ui.btnRoll?.addEventListener("click", () => {
  if (!room || isSpectator) return;
  const result = room.tryRoll();
  if (!result.ok) ui.setError(result.reason || "Kon niet gooien");
  else ui.setError("");
});

ui.btnRematch?.addEventListener("click", () => {
  if (!room || isSpectator) return;
  const result = room.tryRematch();
  if (!result.ok) ui.setError(result.reason || "Kon niet opnieuw starten");
  else ui.setError("");
});

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!room || room.state.phase !== "playing") return;
    ui.nudgeTurnTimer();
    queueMicrotask(() => syncTurnTimer());
  });
}

runEmbeddedGame({
  gameId: "ganzenbord",
  prepareUI() {
    stripEmbeddedChrome();
    ui.setup?.classList.add("hidden");
    ui.lobby?.classList.add("hidden");
    hideEmbeddedLeaveButtons("#btn-leave, #btn-leave-game, #btn-to-lobby");
    ui.winActions?.classList.add("hidden");
    ui.btnRematch?.classList.add("hidden");
    ui.btnToLobby?.classList.add("hidden");
  },
  start(ctx) {
    isSpectator = ctx.participation === "spectator";
    applySpectatorMode(isSpectator);
    readyPlayers = new Set();
    transport = ctx.transport;
    transport.setPresenceHandler(applyPresence);
    transport.onStatus = (status) => {
      ui.setConnectionStatus(status === "connected" ? "connected" : status);
    };
    const r = new Room(ctx.transport, { localName: ctx.name });
    wireRoom(r);
    r.bootstrapEmbedded({
      role: ctx.role,
      log: ctx.log,
      playerId: ctx.playerId,
      name: ctx.name,
      roster: ctx.roster,
    });
    ui.setError("");
    hideEmbeddedLeaveButtons("#btn-leave, #btn-leave-game, #btn-to-lobby");
    ui.winActions?.classList.add("hidden");
    ui.btnRematch?.classList.add("hidden");
    ui.btnToLobby?.classList.add("hidden");
    syncView();
  },
});
