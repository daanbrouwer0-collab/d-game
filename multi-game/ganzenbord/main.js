import { createRoom } from "../js/core/room.js";
import {
  clearRoom,
  getDisplayName,
  listRecent,
  loadRoom,
  removeRecent,
  saveRoom,
  setDisplayName,
} from "../js/core/storage.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { showHostInviteCard } from "../js/shell/p2p-invite-ui.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { readRoomFromUrl } from "../js/shell/site-url.js";
import { GAME_ID, MAX_PLAYERS } from "./game.js";
import { Room } from "./room.js";
import { UI } from "./ui.js";

const GAME_PATH = "/ganzenbord/";

const ui = new UI();
/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {Room | null} */
let room = null;
/** @type {string | null} */
let shareUrl = null;

const savedName = getDisplayName();
if (savedName && ui.nameInput) ui.nameInput.value = savedName;

function currentCode() {
  return session?.roomCode || null;
}

function isLocal() {
  return session?.transport === "local";
}

function refreshRecent() {
  ui.renderRecentLists(
    listRecent(GAME_ID),
    currentCode(),
    (item) => switchToRecent(item),
    (code) => {
      removeRecent(GAME_ID, code);
      refreshRecent();
    },
  );
}

function bindSession(s) {
  session = s;

  s.onStatus = (status, detail) => {
    ui.setConnectionStatus(status, detail);

    if (status === "connected" && s.role === "guest" && room && !room.joined) {
      room.joined = true;
      ui.showLobby();
      room.beginAsGuest();
      refreshRecent();
    }

    if (status === "hosting" && s.role === "host") {
      ui.showLobby();
      refreshRecent();
    }

    if (
      (status === "disconnected" || status === "error") &&
      s.transport !== "local"
    ) {
      ui.setError(detail || "Verbinding verbroken. De host moet online blijven.");
    }
  };

  s.onError = (err) => ui.setError(humanizePeerError(err));
  s.onGameMismatch = (reason) => ui.setError(reason);
  s.onRoomFull = () =>
    ui.setError(`Lobby is vol (max ${MAX_PLAYERS} spelers).`);
}

function bindRoom(r) {
  room = r;
  r.onState = (state) => {
    const local = isLocal();
    if (state.phase === "lobby") {
      ui.showLobby();
      ui.renderLobby(state, r.localId, session?.role === "host", { local });
      refreshRecent();
    } else {
      ui.showGame();
      ui.renderGame(state, r.localId, { local });
    }
  };
  r.onReject = (reason) => {
    ui.setError(reason);
    clearRoom();
    ui.showSetup();
    refreshRecent();
  };
}

/**
 * @param {string} code
 * @param {string} name
 * @param {'host'|'guest'} role
 */
function remember(code, name, role) {
  if (code === "LOCAL") return;
  saveRoom({ gameId: GAME_ID, code, name, role });
  refreshRecent();
}

function rememberName(name) {
  setDisplayName(name);
}

ui.btnLocal.addEventListener("click", async () => {
  ui.setError("");
  ui.btnLocal.disabled = true;
  try {
    await startHost({ name: ui.playerName(), transport: "local" });
  } catch (err) {
    ui.setError(humanizePeerError(err));
  } finally {
    ui.btnLocal.disabled = false;
  }
});

ui.btnHost.addEventListener("click", async () => {
  ui.setError("");
  ui.btnHost.disabled = true;
  try {
    await startHost({ name: ui.playerName(), transport: "p2p" });
  } catch (err) {
    ui.setError(humanizePeerError(err));
  } finally {
    ui.btnHost.disabled = false;
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

ui.btnJoin.addEventListener("click", () => joinFromInput());

ui.btnScanQr?.addEventListener("click", () => {
  ui.setError("");
  openQrScanner({
    hint: "Richt op de P2P-QR van de host",
    onScan: async (raw) => {
      const invite = parseP2pInvite(raw);
      if (!invite) {
        ui.setError("Geen geldige P2P-uitnodiging in deze QR.");
        return;
      }
      ui.joinCode.value = invite.code;
      await joinRoom(invite.code, ui.playerName());
    },
    onError: () => ui.setError("Camera kon niet starten."),
  });
});

ui.joinCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    joinFromInput();
  }
});

ui.btnStart.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryStart();
  if (!result.ok) ui.setError(result.reason || "Kan niet starten");
});

ui.btnRoll.addEventListener("click", () => {
  room?.tryRoll();
});

ui.btnShareWhatsapp.addEventListener("click", () => openWhatsAppShare());
ui.btnShare.addEventListener("click", () => shareInvite());
ui.btnCopyLink.addEventListener("click", async () => {
  if (!shareUrl) return;
  try {
    await navigator.clipboard.writeText(shareUrl);
    ui.btnCopyLink.textContent = "Gekopieerd";
    setTimeout(() => {
      ui.btnCopyLink.textContent = "Kopieer link";
    }, 1200);
  } catch {
    /* ignore */
  }
});

ui.btnLeave.addEventListener("click", () => leaveAll());
ui.btnLeaveGame?.addEventListener("click", () => leaveAll());

ui.btnSwitchJoin?.addEventListener("click", async () => {
  const code = ui.switchCode?.value || "";
  if (!code.trim()) return;
  await switchToGuest(code.trim().toUpperCase());
});

ui.switchCode?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    ui.btnSwitchJoin?.click();
  }
});

ui.btnSwitchNew?.addEventListener("click", async () => {
  ui.setError("");
  try {
    await teardown({ clearUrl: true });
    clearRoom();
    await startHost({ name: ui.playerName(), transport: "p2p" });
  } catch (err) {
    ui.setError(humanizePeerError(err));
  }
});

/**
 * @param {import('../js/p2p/room-memory.js').RecentRoom} item
 */
async function switchToRecent(item) {
  if (item.code === currentCode() && session) {
    ui.setHint(`Je zit al in ${item.code}.`);
    return;
  }
  ui.setError("");
  try {
    await teardown({ clearUrl: true });
    clearRoom();
    if (item.role === "host") {
      await startHost({
        name: item.name || ui.playerName(),
        code: item.code,
        resumed: true,
        transport: "p2p",
      });
    } else {
      await joinRoom(item.code, item.name || ui.playerName());
    }
  } catch (err) {
    ui.setError(humanizePeerError(err));
  }
}

/**
 * @param {string} code
 */
async function switchToGuest(code) {
  if (code === currentCode()) {
    ui.setHint(`Je zit al in ${code}.`);
    return;
  }
  ui.setError("");
  try {
    await teardown({ clearUrl: true });
    clearRoom();
    await joinRoom(code, ui.playerName());
  } catch (err) {
    ui.setError(humanizePeerError(err));
  }
}

async function leaveAll() {
  clearRoom();
  await teardown({ clearUrl: true });
  ui.showSetup();
  ui.setConnectionStatus("idle");
  ui.setError("");
  ui.setHint("");
  refreshRecent();
}

async function joinFromInput() {
  await joinRoom(ui.joinCode.value, ui.playerName());
}

/**
 * @param {{ name: string, code?: string, resumed?: boolean, transport?: 'local'|'p2p' }} opts
 */
async function startHost({
  name,
  code,
  resumed = false,
  transport = "p2p",
}) {
  rememberName(name);
  const s = createRoom({
    gameId: GAME_ID,
    transport,
    maxGuests: MAX_PLAYERS - 1,
  });
  bindSession(s);
  const roomCode = code ? await s.hostWithCode(code) : await s.host();
  const local = transport === "local";
  shareUrl = local ? null : s.buildShareUrl(GAME_PATH, roomCode);
  if (!local) s.writeRoomToUrl(roomCode);
  remember(roomCode, name, "host");
  if (ui.nameInput) ui.nameInput.value = name;
  const r = new Room(s, { localName: name });
  bindRoom(r);
  r.beginAsHost();
  ui.showInvite(roomCode, shareUrl, true, { local });
  if (shareUrl && ui.inviteQrCanvas) {
    await showHostInviteCard({
      card: ui.inviteBox,
      canvas: ui.inviteQrCanvas,
      codeEl: ui.roomCodeEl,
      urlEl: ui.shareUrlEl,
      code: roomCode,
      url: shareUrl,
    });
  }
  ui.showLobby();
  ui.renderLobby(r.state, r.localId, true, { local });
  if (local) {
    ui.setHint("Voeg spelers toe op dit apparaat, daarna Start.");
    ui.setConnectionStatus("connected", "Op dit apparaat");
  } else if (resumed) {
    ui.setHint(
      "Je bent terug in je lobby. Anderen moeten de link opnieuw openen als ze weg waren.",
    );
  } else {
    ui.setHint("Laat de ander jouw QR scannen of deel de link.");
  }
  refreshRecent();
  return roomCode;
}

/**
 * @param {string} code
 * @param {string} name
 */
async function joinRoom(code, name = ui.playerName()) {
  ui.setError("");
  ui.btnJoin.disabled = true;
  try {
    rememberName(name);
    const s = createRoom({
      gameId: GAME_ID,
      transport: "p2p",
      maxGuests: MAX_PLAYERS - 1,
    });
    bindSession(s);
    const normalized = code.trim().toUpperCase();
    await s.join(normalized);
    s.writeRoomToUrl(normalized);
    shareUrl = s.buildShareUrl(GAME_PATH, normalized);
    remember(normalized, name, "guest");
    if (ui.nameInput) ui.nameInput.value = name;
    const r = new Room(s, { localName: name });
    bindRoom(r);
    ui.showInvite(normalized, shareUrl, false, { local: false });
    ui.showLobby();
    if (s.isConnected() && !r.joined) {
      r.joined = true;
      r.beginAsGuest();
    }
    refreshRecent();
  } catch (err) {
    ui.setError(
      `${humanizePeerError(err)} De host moet de lobby open hebben.`,
    );
  } finally {
    ui.btnJoin.disabled = false;
  }
}

/**
 * @param {{ clearUrl?: boolean }} [opts]
 */
async function teardown({ clearUrl = false } = {}) {
  if (session) {
    if (clearUrl) session.clearRoomFromUrl();
    await session.destroy();
  }
  session = null;
  room = null;
  shareUrl = null;
}

function inviteText() {
  return `Speel ganzenbord met me (lobby, max 6): ${shareUrl}`;
}

function openWhatsAppShare() {
  if (!shareUrl) return;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(inviteText())}`,
    "_blank",
    "noopener,noreferrer",
  );
}

async function shareInvite() {
  if (!shareUrl) return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Ganzenbord",
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
 * @param {unknown} err
 */
function humanizePeerError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const type =
    err && typeof err === "object" && "type" in err
      ? /** @type {{ type?: string }} */ (err).type
      : null;
  if (type === "peer-unavailable" || /Could not connect to peer/i.test(message)) {
    return "Peer niet gevonden.";
  }
  if (type === "unavailable-id") return "Code is al in gebruik.";
  if (type === "network") return "Geen verbinding met PeerJS.";
  return message || "Onbekende fout";
}

async function resumeIfPossible() {
  const saved = loadRoom(GAME_ID);
  const roomFromUrl = readRoomFromUrl();

  if (saved?.role === "host") {
    ui.nameInput.value = saved.name || "";
    ui.setHint(`Lobby ${saved.code} hervatten…`);
    try {
      await startHost({
        name: saved.name || "Speler",
        code: saved.code,
        resumed: true,
        transport: "p2p",
      });
      return;
    } catch (err) {
      clearRoom();
      ui.setError(humanizePeerError(err));
      ui.setHint("");
    }
  }

  if (saved?.role === "guest") {
    ui.nameInput.value = saved.name || "";
    ui.joinCode.value = saved.code;
    ui.setHint(`Opnieuw joinen bij ${saved.code}…`);
    await joinRoom(saved.code, saved.name || "Speler");
    return;
  }

  if (roomFromUrl) {
    ui.joinCode.value = roomFromUrl;
    ui.setHint("Bezig met joinen via deellink…");
    await joinRoom(roomFromUrl);
    return;
  }

  refreshRecent();
}

refreshRecent();
resumeIfPossible();
