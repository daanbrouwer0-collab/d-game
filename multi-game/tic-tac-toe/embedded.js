import { BridgeMsg } from "../js/bridge/bridge-protocol.js";
import { BridgeTransport, connectGameBridge } from "../js/bridge/bridge-transport.js";
import { playerLabel } from "../js/core/storage.js";
import { TURN_SECONDS } from "./game.js";
import { GameEngine } from "./engine.js";
import { seatsFromLog } from "./log.js";
import { UI } from "./ui.js";

const ui = new UI();
const transport = new BridgeTransport();
/** @type {GameEngine | null} */
let engine = null;
let sessionEndedSent = false;

function maybeNotifySessionEnd() {
  if (!engine || sessionEndedSent || transport.role !== "host") return;
  const { status } = engine.state;
  if (status !== "won" && status !== "draw") return;
  sessionEndedSent = true;
  window.parent.postMessage(
    { type: BridgeMsg.SESSION_ENDED, payload: { reason: status } },
    "*",
  );
}

function syncBoard() {
  if (!engine) return;
  ui.renderState(engine.state, engine.localMark, transport.isConnected(), {
    hotseat: false,
    isHost: transport.role === "host",
    seats: seatsFromLog(engine.log),
  });
  syncTurnTimer();
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
    canExpire: transport.role === "host",
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
  engine.onState = () => {
    syncBoard();
    maybeNotifySessionEnd();
  };
  engine.onReject = (reason) => {
    if (ui.resultLabel) ui.resultLabel.textContent = reason;
  };
}

ui.onCellClick((index) => {
  if (!engine) return;
  const result = engine.tryMove(index);
  if (!result.ok && result.reason && ui.resultLabel) {
    ui.resultLabel.textContent = result.reason;
  }
});

ui.btnRestart?.addEventListener("click", () => engine?.requestRestart());
ui.btnLeave?.addEventListener("click", () => {
  window.parent.postMessage(
    { type: BridgeMsg.SESSION_ENDED, payload: { reason: "left" } },
    "*",
  );
});

const lobbySection = document.getElementById("lobby");
if (lobbySection) lobbySection.classList.add("hidden");

connectGameBridge(transport, (init) => {
  engine = new GameEngine(transport);
  wireEngine();
  engine.bootstrapEmbedded({
    role: /** @type {'host'|'guest'} */ (init.role),
    log: init.log,
  });
  ui.setConnectionStatus("connected", "Via room");
  ui.showGame();
  syncBoard();
});
