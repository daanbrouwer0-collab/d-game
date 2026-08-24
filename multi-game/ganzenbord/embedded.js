import { runEmbeddedGame, notifySessionEnded } from "../js/bridge/embedded-bootstrap.js";
import { TURN_SECONDS } from "./game.js";
import { Room } from "./room.js";
import { UI } from "./ui.js";

const ui = new UI();
/** @type {Room | null} */
let room = null;
/** @type {import('../js/bridge/bridge-transport.js').BridgeTransport | null} */
let transport = null;

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
  syncTurnTimer();
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
  notifySessionEnded({ reason: "back_to_lobby" });
});

ui.btnLeaveGame?.addEventListener("click", () => {
  notifySessionEnded({ reason: "left" });
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
    ui.setup?.classList.add("hidden");
    ui.lobby?.classList.add("hidden");
    document.querySelector(".nav")?.classList.add("hidden");
    document.querySelector(".header .nav")?.classList.add("hidden");
  },
  start(ctx) {
    transport = ctx.transport;
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
    ui.setConnectionStatus("connected", "Via room");
    ui.setError("");
    syncView();
  },
});
