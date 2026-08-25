/**
 * Standalone tic-tac-toe: local hotseat only.
 * Multiplayer runs via room/ + embedded.js — not this file.
 */
import { createRoom } from "../js/core/room.js";
import { getDisplayName, playerLabel, setDisplayName } from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";
import { setupStandaloneLocalGame } from "../js/shell/room-only-multiplayer.js";
import { GAME_ID } from "./game.js";
import { GameEngine } from "./engine.js";
import { seatsFromLog } from "./log.js";
import { UI } from "./ui.js";

mountShellNav({ active: "games", base: "../" });
setupStandaloneLocalGame();

const ui = new UI();

if (ui.nameInput) {
  ui.nameInput.value = getDisplayName();
  ui.nameInput.addEventListener("change", () => {
    setDisplayName(ui.nameInput.value);
  });
}

function rememberName() {
  if (!ui.nameInput) return playerLabel();
  setDisplayName(ui.nameInput.value);
  return playerLabel();
}

/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {GameEngine | null} */
let engine = null;

function syncBoard() {
  if (!engine || !session) return;
  ui.renderState(engine.state, engine.localMark, session.isConnected(), {
    hotseat: engine.hotseat,
    isHost: false,
    seats: seatsFromLog(engine.log),
  });
  ui.clearTurnTimer();
}

function ensureLocalSession() {
  session = createRoom({ gameId: GAME_ID, transport: "local", maxGuests: 1 });
  engine = new GameEngine(session);
  engine.onReady = (mark) => {
    if (engine?.hotseat) {
      ui.setRole(null);
      ui.roleLabel.textContent = "Hotseat — wissel om de beurt";
    } else {
      ui.setRole(mark, engine.playerName || playerLabel());
    }
    syncBoard();
  };
  engine.onState = () => syncBoard();
  engine.onReject = (reason) => {
    if (ui.resultLabel) ui.resultLabel.textContent = reason;
  };
  return session;
}

async function teardown() {
  ui.clearTurnTimer();
  if (engine) engine.stop();
  if (session) await session.destroy();
  session = null;
  engine = null;
}

async function startLocalHotseat() {
  rememberName();
  ui.setLobbyError("");
  try {
    await teardown();
    ensureLocalSession();
    await session.host();
    ui.hideHostInvite?.();
    engine.startLocalHotseat();
    ui.showGame();
    ui.setConnectionStatus("connected", "Op dit apparaat");
    syncBoard();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ui.setLobbyError(message || "Kon niet starten");
  }
}

ui.onCellClick((index) => {
  if (!engine) return;
  const result = engine.tryMove(index);
  if (!result.ok && result.reason && ui.resultLabel) {
    ui.resultLabel.textContent = result.reason;
  }
});

ui.btnLocal?.addEventListener("click", () => {
  void startLocalHotseat();
});

ui.btnRestart?.addEventListener("click", () => engine?.requestRestart());

ui.btnLeave?.addEventListener("click", async () => {
  await teardown();
  ui.setRole(null);
  ui.hideHostInvite?.();
  ui.setLobbyError("");
  ui.showLobby();
  ui.setConnectionStatus("idle");
});

void startLocalHotseat();
