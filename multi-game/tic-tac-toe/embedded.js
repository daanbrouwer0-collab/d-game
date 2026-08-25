import {
  runEmbeddedGame,
  watchSessionEnd,
} from "../js/bridge/embedded-bootstrap.js";
import {
  hideEmbeddedLeaveButtons,
  stripEmbeddedChrome,
  applySpectatorMode,
} from "../js/shell/embedded-chrome.js";
import { playerLabel } from "../js/core/storage.js";
import { TURN_SECONDS } from "./game.js";
import { GameEngine } from "./engine.js";
import { seatsFromLog } from "./log.js";
import { UI } from "./ui.js";

const ui = new UI();
/** @type {GameEngine | null} */
let engine = null;
let isSpectator = false;
/** @type {Set<string>} */
let readyPlayers = new Set();
const maybeEnd = watchSessionEnd(
  () =>
    !!engine &&
    (engine.state.status === "won" || engine.state.status === "draw"),
  () => {
    if (!engine) return { reason: "finished", summary: "Spel afgelopen" };
    if (engine.state.status === "draw") {
      return { reason: "draw", summary: "Gelijkspel" };
    }
    const mark = /** @type {'X'|'O'} */ (engine.state.winner);
    const seats = seatsFromLog(engine.log);
    const seat = seats[mark];
    const name = String(seat?.name || "").trim() || mark;
    return {
      reason: "finished",
      winnerName: name,
      winnerId: seat?.playerId || null,
      summary: `${name} wint`,
    };
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

function syncBoard() {
  if (!engine) return;
  ui.renderState(engine.state, engine.localMark, true, {
    hotseat: false,
    isHost: engine.session.role === "host",
    seats: seatsFromLog(engine.log),
  });
  if (ui.btnRestart) {
    ui.btnRestart.classList.add("hidden");
    ui.btnRestart.disabled = true;
  }
  syncTurnTimer();
  maybeEnd();
}

function syncTurnTimer() {
  if (!engine || engine.state.status !== "playing") {
    ui.clearTurnTimer();
    return;
  }
  const seats = seatsFromLog(engine.log);
  const currentId = seats[engine.state.turn]?.playerId || "";
  const ready = Boolean(currentId && readyPlayers.has(currentId));
  const boardKey = engine.state.board
    .map((c, i) => (engine.state.blocked.includes(i) ? "#" : c || "."))
    .join("");
  const key = `${engine.state.turn}:${boardKey}:${ready ? "go" : "wait"}`;
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
    canExpire: engine.session.role === "host",
    onExpire: () => {
      engine?.tryTimeout();
      queueMicrotask(() => syncTurnTimer());
    },
  });
}

function wireEngine() {
  if (!engine) return;
  engine.onReady = (mark) => {
    ui.setRole(mark, engine?.playerName || playerLabel());
    syncBoard();
  };
  engine.onState = () => syncBoard();
  engine.onReject = (reason) => {
    if (ui.resultLabel) ui.resultLabel.textContent = reason;
  };
}

ui.onCellClick((index) => {
  if (!engine || isSpectator) return;
  const result = engine.tryMove(index);
  if (!result.ok && result.reason && ui.resultLabel) {
    ui.resultLabel.textContent = result.reason;
  }
});

ui.btnRestart?.addEventListener("click", () => engine?.requestRestart());

runEmbeddedGame({
  gameId: "tic-tac-toe",
  prepareUI() {
    stripEmbeddedChrome();
    hideEmbeddedLeaveButtons();
    if (ui.btnRestart) {
      ui.btnRestart.classList.add("hidden");
      ui.btnRestart.disabled = true;
    }
  },
  start(ctx) {
    isSpectator = ctx.participation === "spectator";
    applySpectatorMode(isSpectator);
    readyPlayers = new Set();
    ctx.transport.setPresenceHandler(applyPresence);
    engine = new GameEngine(ctx.transport);
    wireEngine();
    engine.bootstrapEmbedded({
      role: ctx.role,
      log: ctx.log,
      playerId: ctx.playerId,
      name: ctx.name,
      roster: ctx.roster,
    });
    ui.showGame();
    hideEmbeddedLeaveButtons();
    if (ui.btnRestart) {
      ui.btnRestart.classList.add("hidden");
      ui.btnRestart.disabled = true;
    }
    syncBoard();
  },
});
