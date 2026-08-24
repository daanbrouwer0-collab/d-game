import { createRoom, transportFromUrl } from "../js/core/room.js";
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
import { openQrScanner, closeQrScanner } from "../js/shell/qr-scanner.js";
import { mountRoomStrip, mountShellNav } from "../js/shell/nav.js";
import {
  readHostIntentFromUrl,
  readRoomFromUrl,
  watchShellRoute,
} from "../js/shell/site-url.js";
import { GAME_ID, MAX_PLAYERS, TURN_SECONDS } from "./game.js";
import { Room } from "./room.js";
import { UI } from "./ui.js";

mountShellNav({ active: "games", base: "../" });
mountRoomStrip({ base: "../", currentGameId: GAME_ID });

const GAME_PATH = "/ganzenbord/";

const ui = new UI();
/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {Room | null} */
let room = null;
/** @type {string | null} */
let shareUrl = null;
let lastStatus = "idle";
/** @type {ReturnType<typeof setTimeout> | null} */
let autoReconnectTimer = null;
let autoReconnectAttempts = 0;

const savedName = getDisplayName();
if (savedName && ui.nameInput) ui.nameInput.value = savedName;
ui.nameInput?.addEventListener("change", () => {
  setDisplayName(ui.nameInput.value);
});

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

function syncView() {
  if (!room) return;
  const local = isLocal();
  const online =
    room.state.players.map((p) => ({
      id: p.id,
      online: room.isPlayerOnline(p.id),
    })) || [];
  if (room.state.phase === "lobby") {
    ui.showLobby();
    ui.renderLobby(room.state, room.localId, session?.role === "host", {
      local,
      online,
      youName: room.localName,
    });
    ui.clearTurnTimer();
  } else {
    ui.showGame();
    ui.renderGame(room.state, room.localId, {
      local,
      online,
      youName: room.localName,
      connected: Boolean(session?.isConnected?.() || local),
      isHost: session?.role === "host",
    });
    syncTurnTimer();
  }
  refreshRecent();
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
  // Don't include lastLog — timeout updates it and caused timer/key races.
  const key = `${room.state.turnIndex}:${current.id}:${posKey}`;
  const isHost = session?.role === "host";
  ui.syncTurnTimer({
    key,
    seconds: TURN_SECONDS,
    active: true,
    canExpire: Boolean(isHost || isLocal()),
    onExpire: () => {
      room?.tryTimeout();
      queueMicrotask(() => syncTurnTimer());
    },
  });
}

// When a backgrounded tab wakes, overdue deadlines fire immediately.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!room || room.state.phase !== "playing") return;
    ui.nudgeTurnTimer();
    queueMicrotask(() => syncTurnTimer());
  });
}

function bindSession(s) {
  session = s;

  s.onStatus = (status, detail) => {
    const wasDisconnected =
      lastStatus === "disconnected" || lastStatus === "error";
    lastStatus = status;
    ui.setConnectionStatus(status, detail);
    ui.setReconnectVisible(
      !isLocal() && (status === "disconnected" || status === "error"),
    );

    if (status === "connected") {
      autoReconnectAttempts = 0;
      if (autoReconnectTimer) {
        clearTimeout(autoReconnectTimer);
        autoReconnectTimer = null;
      }
    }

    if (status === "connected" && s.role === "guest" && room) {
      if (room.joined && wasDisconnected) {
        room.onReconnected();
      } else if (!room.joined) {
        room.joined = true;
        ui.showLobby();
        room.beginAsGuest();
      }
      ui.setError("");
      syncView();
      refreshRecent();
    }

    if (status === "connected" && s.role === "host" && room && !isLocal()) {
      if (wasDisconnected) room.onReconnected();
      ui.setError("");
      syncView();
    }

    if (status === "hosting" && s.role === "host") {
      ui.showLobby();
      syncView();
      refreshRecent();
    }

    if (
      (status === "disconnected" || status === "error") &&
      s.transport !== "local"
    ) {
      ui.setError(detail || "Verbinding verbroken.");
      syncView();
      if (s.role === "guest") scheduleGuestAutoReconnect();
    }
  };

  s.onError = (err) => ui.setError(humanizePeerError(err));
  s.onGameMismatch = (reason) => ui.setError(reason);
  s.onRoomFull = () =>
    ui.setError(`Lobby is vol (max ${MAX_PLAYERS} spelers).`);
}

function scheduleGuestAutoReconnect() {
  if (!session || session.role !== "guest" || isLocal()) return;
  if (autoReconnectTimer) return;
  if (autoReconnectAttempts >= 6) {
    ui.setError("Verbinding blijft weg. Tik op Opnieuw verbinden.");
    return;
  }
  const delay = 700 + autoReconnectAttempts * 600;
  autoReconnectTimer = setTimeout(async () => {
    autoReconnectTimer = null;
    autoReconnectAttempts += 1;
    ui.setError(`Opnieuw verbinden… (${autoReconnectAttempts}/6)`);
    try {
      await session?.reconnect();
    } catch (err) {
      ui.setError(humanizePeerError(err));
      scheduleGuestAutoReconnect();
    }
  }, delay);
}

function bindRoom(r) {
  room = r;
  r.onState = () => syncView();
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
  if (!room) return;
  const result = room.tryRoll();
  if (!result.ok) {
    ui.setError(result.reason || "Kon niet gooien");
    if (/** @type {{ reconnect?: boolean }} */ (result).reconnect) {
      scheduleGuestAutoReconnect();
    }
  }
});

ui.btnRematch?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryRematch();
  if (!result.ok) ui.setError(result.reason || "Kon niet opnieuw starten");
});

ui.btnToLobby?.addEventListener("click", () => {
  if (!room) return;
  const result = room.tryToLobby();
  if (!result.ok) ui.setError(result.reason || "Kon niet terug naar lobby");
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

ui.btnReconnect?.addEventListener("click", () => reconnectNow());
ui.btnReconnectGame?.addEventListener("click", () => reconnectNow());

async function reconnectNow() {
  if (!session || session.transport === "local") return;
  ui.setError("");
  autoReconnectAttempts = 0;
  try {
    await session.reconnect();
  } catch (err) {
    ui.setError(humanizePeerError(err));
    if (session.role === "guest") scheduleGuestAutoReconnect();
  }
}

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
      await resumeAsHost(item.code, item.name || ui.playerName());
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
  try {
    await closeQrScanner();
  } catch {
    /* ignore */
  }
  await teardown({ clearUrl: true });
  lastShellKey = `${readRoomFromUrl() || ""}:${readHostIntentFromUrl() ? "host" : "join"}`;
  if (ui.inviteBox) ui.inviteBox.classList.add("hidden");
  if (ui.inviteQrCanvas) ui.inviteQrCanvas.innerHTML = "";
  ui.showSetup();
  ui.setConnectionStatus("idle");
  ui.setReconnectVisible(false);
  ui.setError("");
  ui.setHint("");
  lastStatus = "idle";
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
  await teardown({ clearUrl: false });
  const s = createRoom({
    gameId: GAME_ID,
    transport,
    maxGuests: MAX_PLAYERS - 1,
  });
  bindSession(s);
  ui.showLobby();
  ui.showInvite(code || "…", null, true, { local: transport === "local" });
  ui.setHint("Kamer wordt aangemaakt… even wachten.");
  const roomCode = code ? await s.hostWithCode(code) : await s.host();
  const local = transport === "local";
  shareUrl = local ? null : s.buildShareUrl(GAME_PATH, roomCode);
  if (!local) s.writeRoomToUrl(roomCode);
  remember(roomCode, name, "host");
  if (ui.nameInput) ui.nameInput.value = name;
  const r = new Room(s, { localName: name });
  if (!local) r.loadPersisted(roomCode);
  bindRoom(r);
  r.beginAsHost();
  ui.showInvite(roomCode, shareUrl, true, { local });
  syncView();
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
  if (local) {
    ui.setHint("Voeg spelers toe op dit apparaat, daarna Start.");
    ui.setConnectionStatus("connected", "Op dit apparaat");
  } else if (resumed) {
    ui.setHint(
      "Room opnieuw gehost. Anderen joinen met dezelfde code; stoelen en stand blijven bewaard.",
    );
  } else {
    ui.setHint("Laat de ander jouw QR scannen of deel de link.");
  }
  refreshRecent();
  return roomCode;
}

/**
 * @param {string} code
 * @param {string} [name]
 */
async function resumeAsHost(code, name = ui.playerName()) {
  const normalized = code.trim().toUpperCase();
  ui.setError("");
  ui.btnHost.disabled = true;
  try {
    await startHost({
      name,
      code: normalized,
      resumed: true,
      transport: "p2p",
    });
  } finally {
    ui.btnHost.disabled = false;
  }
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
    await teardown({ clearUrl: false });
    const s = createRoom({
      gameId: GAME_ID,
      transport: "p2p",
      maxGuests: MAX_PLAYERS - 1,
    });
    bindSession(s);
    const normalized = code.trim().toUpperCase();
    const r = new Room(s, { localName: name });
    r.loadPersisted(normalized);
    bindRoom(r);
    await s.join(normalized);
    s.writeRoomToUrl(normalized);
    shareUrl = s.buildShareUrl(GAME_PATH, normalized);
    remember(normalized, name, "guest");
    if (ui.nameInput) ui.nameInput.value = name;
    ui.showInvite(normalized, shareUrl, false, { local: false });
    ui.showLobby();
    if (s.isConnected() && !r.joined) {
      r.joined = true;
      r.beginAsGuest();
    }
    syncView();
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
  if (type === "unavailable-id") {
    return "Die kamercode is al in gebruik. Iemand host deze room nog — kies Join, of wacht tot de host weg is.";
  }
  if (type === "network") return "Geen verbinding met PeerJS.";
  return message || "Onbekende fout";
}

const roomParam = readRoomFromUrl();
let lastShellKey = `${roomParam || ""}:${readHostIntentFromUrl() ? "host" : "join"}`;

async function bootFromUrl() {
  const roomFromUrl = readRoomFromUrl();
  if (roomFromUrl && transportFromUrl() !== "qr") {
    ui.joinCode.value = roomFromUrl;
    if (readHostIntentFromUrl()) {
      ui.setHint("Bezig deze room opnieuw te hosten…");
      await resumeAsHost(roomFromUrl);
      return;
    }
    ui.setHint("Bezig met joinen via deellink…");
    await joinRoom(roomFromUrl);
    return;
  }

  const saved = loadRoom(GAME_ID);
  if (saved?.role === "host") {
    ui.nameInput.value = saved.name || "";
    ui.setHint(`Lobby ${saved.code} hervatten…`);
    try {
      await resumeAsHost(saved.code, saved.name || ui.playerName());
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

  refreshRecent();
}

watchShellRoute(() => {
  const roomCode = readRoomFromUrl();
  const asHost = readHostIntentFromUrl();
  const key = `${roomCode || ""}:${asHost ? "host" : "join"}`;
  if (key === lastShellKey) return;
  lastShellKey = key;
  if (!roomCode || transportFromUrl() === "qr") return;
  ui.joinCode.value = roomCode;
  if (asHost) {
    ui.setHint("Bezig deze room opnieuw te hosten…");
    resumeAsHost(roomCode);
  } else {
    ui.setHint("Bezig met joinen via deellink…");
    joinRoom(roomCode);
  }
});

refreshRecent();
bootFromUrl();
