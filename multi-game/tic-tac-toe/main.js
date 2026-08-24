import { createRoom, transportFromUrl } from "../js/core/room.js";
import { saveRoom } from "../js/core/storage.js";
import { mountShellNav } from "../js/shell/nav.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { drawQr } from "../js/shell/qr-ui.js";
import { GAME_ID } from "./game.js";
import { GameEngine } from "./engine.js";
import { UI } from "./ui.js";

mountShellNav({ active: "games", base: "../" });

const GAME_PATH = "/tic-tac-toe/";

const ui = new UI();

/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {GameEngine | null} */
let engine = null;

let lastStatus = "idle";
/** @type {string | null} */
let shareUrl = null;

function syncBoard() {
  if (!engine || !session) return;
  ui.renderState(engine.state, engine.localMark, session.isConnected(), {
    hotseat: engine.hotseat,
  });
}

/**
 * @param {'local'|'p2p'} transport
 */
function ensureSession(transport) {
  session = createRoom({ gameId: GAME_ID, transport, maxGuests: 1 });
  engine = new GameEngine(session);
  wireSession();
  wireEngine();
  return session;
}

async function showInviteQr(url) {
  if (ui.inviteQrCanvas && url) {
    await drawQr(ui.inviteQrCanvas, url);
  }
}

function wireSession() {
  if (!session || !engine) return;

  session.onStatus = (status, detail) => {
    const wasDisconnected =
      lastStatus === "disconnected" || lastStatus === "error";
    lastStatus = status;
    ui.setConnectionStatus(status, detail);

    if (session.transport === "local") return;

    if (status === "connected") {
      ui.setLobbyError("");
      ui.showGame();
      if (session.role === "host") {
        if (engine.localMark && wasDisconnected) engine.onReconnected();
        else engine.onPeerConnected();
      } else if (wasDisconnected && engine.localMark) {
        engine.onReconnected();
      } else {
        engine.startAsGuest();
      }
      syncBoard();
    }

    if (status === "hosting") {
      ui.showLobby();
    }

    if (status === "disconnected" || status === "error") {
      syncBoard();
    }
  };

  session.onError = (err) => {
    ui.setLobbyError(humanizePeerError(err));
  };

  session.onGameMismatch = (reason) => {
    ui.setLobbyError(reason);
  };
}

function wireEngine() {
  if (!engine) return;
  engine.onReady = (mark) => {
    if (engine?.hotseat) {
      ui.setRole(null);
      ui.roleLabel.textContent = "Hotseat — wissel om de beurt";
    } else {
      ui.setRole(mark);
    }
    syncBoard();
  };
  engine.onState = () => syncBoard();
}

ui.onCellClick((index) => {
  if (!engine) return;
  const result = engine.tryMove(index);
  if (!result.ok && result.reason) {
    ui.resultLabel.textContent = result.reason;
  }
});

ui.btnLocal.addEventListener("click", async () => {
  ui.setLobbyError("");
  ui.btnLocal.disabled = true;
  try {
    await teardown({ clearUrl: true });
    ensureSession("local");
    await session.host();
    shareUrl = null;
    ui.hideHostInvite();
    engine.startLocalHotseat();
    ui.showGame();
    ui.setConnectionStatus("connected", "Op dit apparaat");
    syncBoard();
  } catch (err) {
    ui.setLobbyError(humanizePeerError(err));
  } finally {
    ui.btnLocal.disabled = false;
  }
});

ui.btnHost.addEventListener("click", async () => {
  ui.setLobbyError("");
  ui.btnHost.disabled = true;
  try {
    await teardown({ clearUrl: true });
    ensureSession("p2p");
    const code = await session.host();
    shareUrl = session.buildShareUrl(GAME_PATH, code);
    session.writeRoomToUrl(code);
    saveRoom({
      gameId: GAME_ID,
      code,
      name: "host",
      role: "host",
    });
    ui.showHostInvite(code, shareUrl);
    await showInviteQr(shareUrl);
    engine.startAsHost();
    await shareInvite({ preferWhatsApp: false });
  } catch (err) {
    ui.setLobbyError(humanizePeerError(err));
  } finally {
    ui.btnHost.disabled = false;
  }
});

ui.btnJoin.addEventListener("click", () => joinFromInput());

ui.btnScanQr?.addEventListener("click", () => {
  ui.setLobbyError("");
  openQrScanner({
    hint: "Richt op de P2P-QR van de host",
    onScan: async (raw) => {
      const invite = parseP2pInvite(raw);
      if (!invite) {
        ui.setLobbyError("Geen geldige P2P-uitnodiging in deze QR.");
        return;
      }
      ui.joinCode.value = invite.code;
      await joinRoom(invite.code);
    },
    onError: () => {
      ui.setLobbyError("Camera kon niet starten.");
    },
  });
});

ui.joinCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    joinFromInput();
  }
});

ui.btnShareWhatsapp.addEventListener("click", () => openWhatsAppShare());
ui.btnShare.addEventListener("click", async () => {
  await shareInvite({ preferWhatsApp: false });
});
ui.btnCopyLink.addEventListener("click", async () => {
  if (!shareUrl) return;
  const ok = await copyText(shareUrl);
  flashButton(ui.btnCopyLink, ok ? "Gekopieerd" : "Mislukt", "Kopieer link");
});

ui.btnRestart.addEventListener("click", () => engine?.requestRestart());

ui.btnLeave.addEventListener("click", async () => {
  await teardown({ clearUrl: true });
  ui.setRole(null);
  ui.hideHostInvite();
  ui.setLobbyError("");
  ui.showLobby();
  ui.setConnectionStatus("idle");
  lastStatus = "idle";
});

ui.btnReconnect.addEventListener("click", async () => {
  if (!session || session.transport === "local") return;
  ui.setLobbyError("");
  try {
    await session.reconnect();
  } catch (err) {
    ui.setLobbyError(humanizePeerError(err));
  }
});

async function joinFromInput() {
  await joinRoom(ui.joinCode.value);
}

/**
 * @param {string} code
 */
async function joinRoom(code) {
  ui.setLobbyError("");
  ui.btnJoin.disabled = true;
  try {
    await teardown({ clearUrl: false });
    ensureSession("p2p");
    ui.hideHostInvite();
    const normalized = code.trim().toUpperCase();
    await session.join(normalized);
    session.writeRoomToUrl(normalized);
    shareUrl = session.buildShareUrl(GAME_PATH, normalized);
    saveRoom({
      gameId: GAME_ID,
      code: normalized,
      name: "guest",
      role: "guest",
    });
  } catch (err) {
    ui.setLobbyError(
      `${humanizePeerError(err)} De host moet het spel open hebben.`,
    );
  } finally {
    ui.btnJoin.disabled = false;
  }
}

/**
 * @param {{ clearUrl?: boolean }} [opts]
 */
async function teardown({ clearUrl = false } = {}) {
  if (engine) engine.stop();
  if (session) {
    if (clearUrl) session.clearRoomFromUrl();
    await session.destroy();
  }
  session = null;
  engine = null;
  shareUrl = null;
}

function inviteText() {
  return `Speel tic-tac-toe met me: ${shareUrl}`;
}

function openWhatsAppShare() {
  if (!shareUrl) return;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(inviteText())}`,
    "_blank",
    "noopener,noreferrer",
  );
}

/**
 * @param {{ preferWhatsApp?: boolean }} [opts]
 */
async function shareInvite({ preferWhatsApp = false } = {}) {
  if (!shareUrl) return;
  if (!preferWhatsApp && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Tic Tac Toe",
        text: inviteText(),
        url: shareUrl,
      });
      return;
    } catch (err) {
      if (err && /** @type {{ name?: string }} */ (err).name === "AbortError") {
        return;
      }
    }
  }
  openWhatsAppShare();
}

/**
 * @param {string} text
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} temp
 * @param {string} restore
 */
function flashButton(btn, temp, restore) {
  btn.textContent = temp;
  setTimeout(() => {
    btn.textContent = restore;
  }, 1500);
}

/**
 * @param {unknown} err
 */
function humanizePeerError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const type =
    err && typeof err === "object" && "type" in err
      ? /** @type {{ type?: string }} */ (err).type
      : null;

  if (type === "peer-unavailable" || /Could not connect to peer/i.test(message)) {
    return "Peer niet gevonden. Controleer de code of of de host online is.";
  }
  if (type === "unavailable-id") {
    return "Die kamercode is al in gebruik. Probeer opnieuw.";
  }
  if (type === "network" || /Lost connection to server/i.test(message)) {
    return "Geen verbinding met de PeerJS-server.";
  }
  return message || "Onbekende fout";
}

const roomParam = new URLSearchParams(window.location.search)
  .get("room")
  ?.trim()
  .toUpperCase();
if (roomParam && transportFromUrl() !== "qr") {
  ui.joinCode.value = roomParam;
  ui.lobbyHint.textContent = "Bezig met joinen via deellink…";
  joinRoom(roomParam);
}
