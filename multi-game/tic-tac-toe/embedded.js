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
const maybeEnd = watchSessionEnd(
  () =>
    !!engine &&
    (engine.state.status === "won" || engine.state.status === "draw"),
  "finished",
);

function syncBoard() {
  if (!engine) return;
  ui.renderState(engine.state, engine.localMark, true, {
    hotseat: false,
    isHost: engine.session.role === "host",
    seats: seatsFromLog(engine.log),
  });
  syncTurnTimer();
  maybeEnd();
}

function syncTurnTimer() {
  if (!engine || engine.state.status !== "playing") {
    ui.clearTurnTimer();
    return;
  }
  const boardKey = engine.state.board
    .map((c, i) => (engine.state.blocked.includes(i) ? "#" : c || "."))
    .join("");
  const key = `${engine.state.turn}:${boardKey}`;
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
  },
  start(ctx) {
    isSpectator = ctx.participation === "spectator";
    applySpectatorMode(isSpectator);
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
    syncBoard();
  },
});
