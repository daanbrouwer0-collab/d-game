import { createRoomSession } from "../js/core/room.js";
import { GAMES, getGame, roomReadyGames } from "../js/core/catalog.js";
import { isRoomPlayable } from "../js/bridge/embedded-contract.js";
import {
  loadRoomLogByCode,
  saveRoomLogByCode,
  loadSessionLog,
  saveSessionLog,
  touchDeskRoom,
} from "../js/core/desk.js";
import { getPlayerId, playerLabel } from "../js/core/storage.js";
import { saveRoom, clearRoom, loadActiveRoom } from "../js/p2p/room-memory.js";
import { mountRoomStrip, mountShellNav, guardRoomNavigation } from "../js/shell/nav.js";
import { showHostInviteCard } from "../js/shell/p2p-invite-ui.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { mountRoomChat } from "../js/shell/room-chat.js";
import {
  renderRoomRoster,
  tallyVotes,
  pickWinningGame,
} from "../js/shell/room-roster.js";
import {
  readHostIntentFromUrl,
  readRoomFromUrl,
  buildRoomShareUrl,
  mountEmbeddedGameFrame,
  writeRoomCodeToUrl,
} from "../js/shell/site-url.js";
import { TransportType } from "../js/p2p/protocol.js";
import {
  adoptHostPacket,
  encodeSyncPacket,
  tipSeq,
} from "../js/sync/event-log.js";
import {
  RoomEvent,
  getSessionStartRoster,
  replayRoom,
  newSessionId,
  commitRoomEvent,
} from "../js/sync/room-log.js";
import { createRoomHostCommit } from "../js/sync/room-host.js";
import { RoomMsg } from "../js/sync/room-msg.js";
import { mountGameBridge } from "../js/bridge/game-bridge.js";
import { createSessionHost } from "../js/bridge/session-host.js";
import { SyncMsg } from "../js/sync/sync-msg.js";

mountShellNav({ active: "lobby", base: "../" });
mountRoomStrip({ base: "../" });

const panelIdle = document.getElementById("panel-idle");
const panelLobby = document.getElementById("panel-lobby");
const panelPlaying = document.getElementById("panel-playing");
const roomChrome = document.getElementById("room-chrome");
const roomStatus = document.getElementById("room-status");
const roomError = document.getElementById("room-error");
const rosterList = document.getElementById("roster-list");
const rosterCount = document.getElementById("roster-count");
const gamePicker = document.getElementById("game-picker");
const pickerHint = document.getElementById("picker-hint");
const voteStatus = document.getElementById("vote-status");
const btnStartVoted = document.getElementById("btn-start-voted");
const gameFrame = /** @type {HTMLIFrameElement} */ (
  document.getElementById("game-frame")
);
/** @type {string | null} */
let gameFrameBlobUrl = null;
const playingBar = document.querySelector(".playing-bar");
const btnLeaveGame = document.getElementById("btn-leave-game");
const btnEndSession = document.getElementById("btn-end-session");
const btnGoToGame = document.getElementById("btn-go-to-game");
const gameSessionBanner = document.getElementById("game-session-banner");
const gameSessionTitle = document.getElementById("game-session-title");
const gameSessionHint = document.getElementById("game-session-hint");
const joinInput = /** @type {HTMLInputElement} */ (
  document.getElementById("join-code")
);

/** @type {ReturnType<typeof createRoomSession> | null} */
let session = null;
/** @type {ReturnType<typeof createRoomHostCommit> | null} */
let roomHost = null;
/** @type {import('../js/sync/event-log.js').EventLog} */
let roomLog = null;
/** @type {ReturnType<typeof createSessionHost> | null} */
let sessionHost = null;
/** @type {ReturnType<typeof mountGameBridge> | null} */
let gameBridge = null;

/** @type {{ sessionId: string, gameId: string } | null} */
let activeSession = null;
/** @type {string | null} */
let shareUrl = null;
/** @type {Map<string, string>} */
const peerToPlayer = new Map();
/** @type {ReturnType<typeof mountRoomChat> | null} */
let roomChat = null;
let sessionConnected = false;
let hostStartInFlight = false;
let joinInFlight = false;

const playerId = getPlayerId();
const roomCommit = createRoomHostCommit();

function setError(msg) {
  if (!msg) {
    roomError.classList.add("hidden");
    roomError.textContent = "";
    return;
  }
  roomError.textContent = msg;
  roomError.classList.remove("hidden");
}

function setStatus(text) {
  roomStatus.textContent = text;
}

function showPanel(name) {
  panelIdle.classList.toggle("hidden", name !== "idle");
  panelLobby.classList.toggle("hidden", name !== "lobby");
  panelPlaying.classList.toggle("hidden", name !== "playing");
  roomChrome?.classList.toggle("hidden", name === "idle");
}

function roomState() {
  return replayRoom(roomLog);
}

function rosterArray() {
  return [...roomState().members.values()];
}

function memberCount() {
  return rosterArray().length;
}

function getGameTitle(gameId) {
  return getGame(gameId)?.title || gameId;
}

function syncHostInvite() {
  const card = document.getElementById("invite-card");
  if (!card) return;
  if (session?.role !== "host") {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const code = session.roomCode || "";
  const codeEl = document.getElementById("invite-code");
  if (codeEl && code && !codeEl.textContent) codeEl.textContent = code;
  const urlEl = /** @type {HTMLAnchorElement | null} */ (
    document.getElementById("invite-url")
  );
  const url = shareUrl || (code ? buildRoomShareUrl(code) : "");
  if (urlEl && url) {
    urlEl.textContent = url;
    urlEl.href = url;
  }
}

function renderRoster() {
  const state = roomState();
  renderRoomRoster(rosterList, rosterCount, {
    members: rosterArray(),
    hostPlayerId: state.hostPlayerId,
    localPlayerId: playerId,
    maxPlayers: 6,
    votes: state.votes,
    getGameTitle,
  });
  renderGamePicker();
  renderChat();
  syncChatMode();
  syncHostInvite();
  syncGameSessionBanner();
}

function initRoomChat() {
  const root = document.getElementById("room-chat-root");
  if (!root || roomChat) return;
  roomChat = mountRoomChat(root, {
    onSend(text) {
      sendChat(text);
    },
  });
}

function renderChat() {
  if (!roomChat || !roomLog) return;
  const state = roomState();
  roomChat.render({
    messages: state.chat,
    localPlayerId: playerId,
    chatSeq: state.chatSeq,
  });
}

function syncChatMode() {
  if (!roomChat) return;
  const playing = !!roomState().activeSession || !!activeSession;
  roomChat.setMode(playing ? "collapsed" : "open");
  if (!playing) roomChat.markRead(roomState().chatSeq);
}

/**
 * @param {string} authorId
 * @param {string} text
 */
function commitChat(authorId, text) {
  if (!session || !roomLog || !roomHost) return;
  const name =
    rosterArray().find((m) => m.playerId === authorId)?.name || "Speler";
  const posted = roomHost.postChat(roomLog, {
    playerId: authorId,
    name,
    text,
  });
  if (!posted.ok) return;
  roomLog = posted.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);
  renderRoster();
  persistRoomDesk();
}

function sendChat(text) {
  if (!session || !roomLog || !roomHost) return;
  if (session.role === "host") {
    const posted = roomHost.postChat(roomLog, {
      playerId,
      name: playerLabel(),
      text,
    });
    if (!posted.ok) {
      if (posted.reason === "rate_limit") {
        setError("Te veel berichten — even wachten.");
      }
      return;
    }
    setError("");
    roomLog = posted.log;
    saveRoomLogByCode(session.roomCode, roomLog);
    broadcastRoomLog(tipSeq(roomLog) - 1);
    renderRoster();
    persistRoomDesk();
    return;
  }
  session.send(RoomMsg.ROOM_INTENT, {
    kind: "chat",
    playerId,
    text,
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderGamePicker() {
  const state = roomState();
  const count = memberCount();
  const playable = roomReadyGames(count);
  const playableIds = playable.map((g) => g.id);
  const tallies = tallyVotes(state.votes);
  const winner = pickWinningGame(tallies, playableIds);
  const myVote = state.votes.get(playerId) || null;

  pickerHint.textContent = state.activeSession
    ? "Er loopt nog een spel — stemmen gaat open zodra iedereen het spel heeft verlaten."
    : count < 2
      ? "Wacht op minstens 2 spelers om te stemmen."
      : `${count} speler${count === 1 ? "" : "s"} — stem op een spel hieronder.`;

  gamePicker.innerHTML = "";
  for (const g of GAMES) {
    const countOk = count >= g.minPlayers && count <= g.maxPlayers;
    const roomReady = isRoomPlayable(g.embedded);
    const ok = countOk && roomReady;
    const votes = tallies.get(g.id) || 0;
    const isVoted = myVote === g.id;
    const isLeading = ok && winner === g.id && votes > 0;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-vote-card";
    if (isVoted) btn.classList.add("is-voted");
    if (isLeading) btn.classList.add("is-leading");
    btn.disabled = !ok || !!state.activeSession;
    btn.dataset.game = g.id;
    const reason = !countOk
      ? `Vereist ${g.minPlayers}–${g.maxPlayers} spelers`
      : !roomReady
        ? "Room-modus volgt"
        : `${g.minPlayers}–${g.maxPlayers} spelers`;
    const voteLine =
      votes > 0
        ? `${votes} stem${votes === 1 ? "" : "men"}`
        : "Nog geen stemmen";
    btn.innerHTML = `<strong>${escapeHtml(g.title)}</strong>
      <span class="vote-meta">${escapeHtml(reason)} · ${escapeHtml(voteLine)}</span>`;
    btn.addEventListener("click", () => voteForGame(g.id));
    li.appendChild(btn);
    gamePicker.appendChild(li);
  }

  if (state.activeSession) {
    voteStatus.textContent = "";
    btnStartVoted?.classList.add("hidden");
    return;
  }

  if (myVote) {
    voteStatus.textContent = `Jij stemde op ${getGameTitle(myVote)}.`;
  } else if (count >= 2) {
    voteStatus.textContent = "Klik op een spel om te stemmen.";
  } else {
    voteStatus.textContent = "";
  }

  const isHost = session?.role === "host";
  if (isHost && count >= 2 && winner) {
    btnStartVoted?.classList.remove("hidden");
    btnStartVoted.textContent = `Start ${getGameTitle(winner)}`;
    btnStartVoted.disabled = !playable.some((g) => g.id === winner);
  } else {
    btnStartVoted?.classList.add("hidden");
  }

  if (!isHost && count >= 2) {
    voteStatus.textContent = [
      myVote ? `Jij stemde op ${getGameTitle(myVote)}.` : "Klik op een spel om te stemmen.",
      winner
        ? `Winnend: ${getGameTitle(winner)} (${tallies.get(winner) || 0} stemmen). Wacht op de host.`
        : "Wacht tot iedereen stemt — de host start het winnende spel.",
    ]
      .filter(Boolean)
      .join(" ");
  }
}

/**
 * @param {string} voterId
 * @param {string} gameId
 */
function commitVote(voterId, gameId) {
  if (!session || !roomLog || !roomHost) return;
  const voted = roomHost.voteGame(roomLog, { playerId: voterId, gameId });
  if (!voted.ok) return;
  roomLog = voted.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);
  renderRoster();
  persistRoomDesk();
}

/**
 * @param {string} gameId
 */
function voteForGame(gameId) {
  if (!session || !roomLog || roomState().activeSession) return;
  if (session.role === "host") {
    commitVote(playerId, gameId);
    return;
  }
  session.send(RoomMsg.ROOM_INTENT, {
    kind: "game_vote",
    playerId,
    gameId,
  });
}

function persistRoomDesk() {
  if (!session?.roomCode) return;
  const state = roomState();
  touchDeskRoom({
    code: session.roomCode,
    role: session.role === "host" ? "host" : "guest",
    name: playerLabel(),
    memberCount: state.members.size,
    activeGameId: state.activeSession?.gameId || null,
    activeSessionId: state.activeSession?.sessionId || null,
    summary: state.activeSession
      ? `Speelt ${getGame(state.activeSession.gameId)?.title || state.activeSession.gameId}`
      : `${state.members.size} speler${state.members.size === 1 ? "" : "s"}`,
    seq: tipSeq(roomLog),
    isRoomShell: !state.activeSession,
  });
}

function broadcastRoomLog(fromSeq = 0) {
  if (!session || session.role !== "host") return;
  session.broadcast(RoomMsg.ROOM_LOG, {
    packet: encodeSyncPacket(roomLog, fromSeq),
  });
}

function clearGameFrame() {
  if (gameFrameBlobUrl) {
    URL.revokeObjectURL(gameFrameBlobUrl);
    gameFrameBlobUrl = null;
  }
  gameFrame.removeAttribute("srcdoc");
  gameFrame.src = "about:blank";
}

function syncPlayingBarButtons() {
  if (!session) return;
  btnLeaveGame?.classList.remove("hidden");
  btnEndSession?.classList.toggle("hidden", session.role !== "host");
}

/** @param {"player"|"spectator"} [participation] */
function syncPlayingBarHint(participation) {
  playingBar?.classList.toggle("is-spectator", participation === "spectator");
}

/**
 * @param {string} sessionId
 * @param {string} gameId
 * @returns {"player"|"spectator"}
 */
function resolveParticipation(sessionId, gameId) {
  if (!session || !roomLog) return "spectator";
  const startRoster = getSessionStartRoster(roomLog, sessionId);
  if (!startRoster.includes(playerId)) return "spectator";
  if (playerHasSeatInSessionLog(sessionId, gameId, playerId)) return "player";
  const log = loadSessionLog(session.roomCode, sessionId, gameId);
  if (!log?.events?.length) return "player";
  return "spectator";
}

/**
 * @param {string} sessionId
 * @param {string} gameId
 * @param {string} pid
 */
function playerHasSeatInSessionLog(sessionId, gameId, pid) {
  if (!session) return false;
  const log = loadSessionLog(session.roomCode, sessionId, gameId);
  const id = String(pid || "");
  for (const ev of log?.events || []) {
    if (ev.type !== "seat") continue;
    const p = /** @type {{ playerId?: string, userId?: string }} */ (
      ev.payload || {}
    );
    if (String(p.playerId || p.userId || "") === id) return true;
  }
  return false;
}

function syncGameSessionBanner() {
  if (!gameSessionBanner) return;
  const state = roomState();
  const running = !!state.activeSession && !activeSession && !!session;
  gameSessionBanner.classList.toggle("hidden", !running);
  if (!running || !state.activeSession) return;

  const { sessionId, gameId } = state.activeSession;
  if (gameSessionTitle) {
    gameSessionTitle.textContent = getGameTitle(gameId);
  }

  const participation = resolveParticipation(sessionId, gameId);
  if (participation === "spectator") {
    if (gameSessionHint) {
      gameSessionHint.textContent =
        "Je kijkt alleen mee — geen zetten.";
    }
    if (btnGoToGame) btnGoToGame.textContent = "Ga naar spel (kijken)";
  } else if (session.role === "host") {
    if (gameSessionHint) {
      gameSessionHint.textContent =
        "Spelers kunnen nog in het spel zitten — jij bent in de lobby.";
    }
    if (btnGoToGame) btnGoToGame.textContent = "Ga naar spel";
  } else {
    if (gameSessionHint) {
      gameSessionHint.textContent =
        "Je bent uit het spel — ga terug om verder te spelen.";
    }
    if (btnGoToGame) btnGoToGame.textContent = "Ga naar spel";
  }
}

function commitPlayerInGame(pid) {
  if (!session || session.role !== "host" || !roomLog || !roomHost) return;
  const sid = roomState().activeSession?.sessionId;
  if (!sid) return;
  const updated = roomHost.setPlayerInGame(roomLog, {
    sessionId: sid,
    playerId: pid,
  });
  if (!updated.ok) return;
  roomLog = updated.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);
}

function commitPlayerOutGame(pid) {
  if (!session || session.role !== "host" || !roomLog || !roomHost) return;
  const sid = roomState().activeSession?.sessionId;
  if (!sid) return;
  const updated = roomHost.setPlayerOutGame(roomLog, {
    sessionId: sid,
    playerId: pid,
  });
  if (!updated.ok) return;
  roomLog = updated.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);
  checkAllLeftAndEnd();
}

function checkAllLeftAndEnd() {
  if (session?.role !== "host" || !roomLog) return;
  const state = roomState();
  if (!state.activeSession) return;
  const members = rosterArray().map((m) => m.playerId);
  if (!members.length) return;
  const allOut = members.every((id) => !state.inGamePlayers.has(id));
  if (allOut) endGame("all_left");
}

function signalPlayerInGame() {
  if (!session) return;
  if (session.role === "host") commitPlayerInGame(playerId);
  else {
    session.send(RoomMsg.ROOM_INTENT, {
      kind: "session_player_in",
      playerId,
    });
  }
}

function signalPlayerOutGame() {
  if (!session) return;
  if (session.role === "host") commitPlayerOutGame(playerId);
  else {
    session.send(RoomMsg.ROOM_INTENT, {
      kind: "session_player_out",
      playerId,
    });
  }
}

function pauseLocalGame() {
  if (gameBridge) {
    gameBridge.destroy();
    gameBridge = null;
  }
  clearGameFrame();
  activeSession = null;
  signalPlayerOutGame();
  showPanel("lobby");
  syncPlayingBarHint();
  renderRoster();
  syncChatMode();
  syncGameSessionBanner();
  persistRoomDesk();
}

function goToGame() {
  if (!session || !roomLog) return;
  const state = roomState();
  if (!state.activeSession) return;

  activeSession = state.activeSession;
  if (!sessionHost) {
    sessionHost = createSessionHost({
      gameId: state.activeSession.gameId,
      sessionId: state.activeSession.sessionId,
      roomCode: session.roomCode,
    });
  }

  const log = loadSessionLog(
    session.roomCode,
    state.activeSession.sessionId,
    state.activeSession.gameId,
  );
  mountActiveGame(
    state.activeSession.gameId,
    state.activeSession.sessionId,
    encodeSyncPacket(log, 0),
  );
  syncGameSessionBanner();
}

function returnToVoting() {
  if (gameBridge) {
    gameBridge.destroy();
    gameBridge = null;
  }
  clearGameFrame();
  activeSession = null;
  sessionHost = null;
  showPanel("lobby");
  syncPlayingBarHint();
  renderRoster();
  syncChatMode();
  syncGameSessionBanner();
  persistRoomDesk();
}

function adoptRoomPacket(packet) {
  if (!packet) return;
  const prevSession = activeSession;
  const adopted = adoptHostPacket(roomLog, packet);
  if (!adopted.ok) return;
  roomLog = adopted.log;
  if (session?.roomCode) saveRoomLogByCode(session.roomCode, roomLog);

  const state = roomState();

  if (!state.activeSession && prevSession) {
    returnToVoting();
  }

  renderRoster();
  syncGameSessionBanner();
  persistRoomDesk();
}

function handleRoomIntent(payload, fromPeerId) {
  if (!session || session.role !== "host" || !roomLog || !roomHost) return;
  const p = /** @type {{ kind?: string, playerId?: string, gameId?: string, text?: string }} */ (
    payload || {}
  );

  if (p.kind === "game_vote") {
    const pid = String(p.playerId || "");
    const gameId = String(p.gameId || "");
    if (!pid || !gameId) return;
    if (fromPeerId && peerToPlayer.get(fromPeerId) !== pid) return;
    if (roomState().activeSession) return;
    commitVote(pid, gameId);
    return;
  }

  if (p.kind === "chat") {
    const pid = String(p.playerId || "");
    const text = String(p.text || "");
    if (!pid || !text) return;
    if (fromPeerId && peerToPlayer.get(fromPeerId) !== pid) return;
    commitChat(pid, text);
    return;
  }

  if (p.kind === "session_player_in") {
    const pid = String(p.playerId || "");
    if (!pid) return;
    if (fromPeerId && peerToPlayer.get(fromPeerId) !== pid) return;
    commitPlayerInGame(pid);
    return;
  }

  if (p.kind === "session_player_out") {
    const pid = String(p.playerId || "");
    if (!pid) return;
    if (fromPeerId && peerToPlayer.get(fromPeerId) !== pid) return;
    commitPlayerOutGame(pid);
  }
}

function bindSession(s) {
  session = s;
  roomHost = roomCommit;

  s.onStatus = (status, detail) => {
    const labels = {
      idle: "Niet verbonden",
      hosting: "Room open — wacht op spelers",
      connecting: "Verbinden…",
      connected: "In room",
      disconnected: "Verbinding verbroken",
      error: "Fout",
    };
    setStatus(
      detail ? `${labels[status] || status}: ${detail}` : labels[status] || status,
    );
    sessionConnected =
      status === "hosting" || status === "connected" || status === "connecting";
    if (status === "hosting" || status === "connected") {
      showPanel(activeSession ? "playing" : "lobby");
    }
    // Alleen naar idle als sessie echt weg is — niet bij kortstondige disconnect.
    if (status === "idle" && !session) {
      showPanel("idle");
    }
  };

  s.onPeerJoin = () => {};

  s.onPeerLeave = (peerId) => {
    peerToPlayer.delete(peerId);
    if (sessionHost) sessionHost.unbindPeer(peerId);
  };

  s.onMessage = (msg) => {
    if (msg.type === TransportType.HELLO) {
      handleHello(msg);
      return;
    }
    if (msg.type === TransportType.WELCOME) {
      handleWelcome(msg.payload);
      return;
    }
    if (msg.type === RoomMsg.ROOM_LOG) {
      const packet = /** @type {{ packet?: unknown }} */ (msg.payload || {})
        .packet;
      adoptRoomPacket(packet);
      return;
    }
    if (msg.type === RoomMsg.ROOM_INTENT) {
      handleRoomIntent(msg.payload, msg.fromPeerId || null);
      return;
    }
    if (msg.type === RoomMsg.SESSION_LOG) {
      handleSessionLog(msg.payload, msg.fromPeerId);
      return;
    }
    if (msg.type === RoomMsg.SESSION_INTENT) {
      if (s.role === "host") {
        const p = /** @type {{ wireType?: string }} */ (msg.payload || {});
        const wireType = p.wireType || SyncMsg.INTENT;
        gameBridge?.sendGameIn(
          wireType,
          msg.payload,
          msg.fromPeerId || null,
        );
      }
      return;
    }
    if (msg.type === SyncMsg.ACK || msg.type === SyncMsg.REJECT) {
      gameBridge?.sendGameIn(msg.type, msg.payload, msg.fromPeerId || null);
    }
  };
}

function handleHello(msg) {
  if (!session || session.role !== "host" || !roomLog) return;
  const p = /** @type {{ playerId?: string, name?: string }} */ (
    msg.payload || {}
  );
  const pid = String(p.playerId || "");
  const name = String(p.name || "").trim() || "Speler";
  if (!pid) return;

  peerToPlayer.set(String(msg.fromPeerId || ""), pid);
  if (sessionHost) sessionHost.bindPeer(String(msg.fromPeerId || ""), pid);

  const joined = roomHost.joinMember(roomLog, { playerId: pid, name });
  if (joined.ok) {
    roomLog = joined.log;
    saveRoomLogByCode(session.roomCode, roomLog);
    broadcastRoomLog(tipSeq(roomLog) - 1);
    renderRoster();
    persistRoomDesk();
  }

  /** @type {Record<string, unknown>} */
  const welcome = {
    youAre: "guest",
    playerId: pid,
    roomLog: encodeSyncPacket(roomLog, 0),
  };
  if (activeSession && sessionHost) {
    welcome.activeSession = activeSession;
    welcome.sessionLog = encodeSyncPacket(sessionHost.log, 0);
  }
  session.sendWelcome(welcome, String(msg.fromPeerId || ""));
}

function handleWelcome(payload) {
  const p = /** @type {{
    roomLog?: import('../js/sync/event-log.js').SyncPacket,
    activeSession?: { sessionId: string, gameId: string },
    sessionLog?: import('../js/sync/event-log.js').SyncPacket,
  }} */ (payload || {});
  if (p.roomLog) adoptRoomPacket(p.roomLog);
  if (p.activeSession && session && p.sessionLog) {
    const local = loadSessionLog(
      session.roomCode,
      p.activeSession.sessionId,
      p.activeSession.gameId,
    );
    const adopted = adoptHostPacket(local, p.sessionLog);
    if (adopted.ok) {
      saveSessionLog(
        session.roomCode,
        p.activeSession.sessionId,
        p.activeSession.gameId,
        adopted.log,
      );
    }
    if (!sessionHost) {
      sessionHost = createSessionHost({
        gameId: p.activeSession.gameId,
        sessionId: p.activeSession.sessionId,
        roomCode: session.roomCode,
      });
    }
    sessionHost.setLog(adopted.ok ? adopted.log : local);
  }
  renderRoster();
}

function handleSessionLog(payload, fromPeerId) {
  const p = /** @type {{ sessionId?: string, gameId?: string, packet?: unknown }} */ (
    payload || {}
  );
  if (!p.sessionId || !p.gameId || !p.packet) return;
  if (activeSession?.sessionId !== p.sessionId) return;

  if (session?.role === "host" && fromPeerId) return;

  const local = loadSessionLog(session.roomCode, p.sessionId, p.gameId);
  const adopted = adoptHostPacket(local, p.packet);
  if (adopted.ok) {
    saveSessionLog(session.roomCode, p.sessionId, p.gameId, adopted.log);
    if (sessionHost) sessionHost.setLog(adopted.log);
    gameBridge?.sendGameIn(SyncMsg.LOG, p.packet);
  }
}

function relayGameOut(msg) {
  if (!session) return;
  const { gameType, payload } = msg;

  if (gameType === "__leave_game__") {
    pauseLocalGame();
    return;
  }

  if (!activeSession) return;

  if (gameType === "__session_ended__") {
    const reason = String(
      /** @type {{ reason?: string }} */ (payload || {}).reason || "finished",
    );
    if (session.role === "guest" && reason === "left") {
      pauseLocalGame();
      return;
    }
    endGame(reason);
    return;
  }

  if (gameType === SyncMsg.LOG) {
    if (session.role === "host" && sessionHost) {
      const packet = /** @type {import('../js/sync/event-log.js').SyncPacket} */ (
        payload
      );
      const adopted = adoptHostPacket(sessionHost.log, packet);
      if (adopted.ok) {
        sessionHost.setLog(adopted.log);
        session.broadcast(RoomMsg.SESSION_LOG, {
          sessionId: activeSession.sessionId,
          gameId: activeSession.gameId,
          packet,
        });
      }
    }
    return;
  }

  if (gameType === SyncMsg.INTENT) {
    if (session.role === "guest") {
      session.send(RoomMsg.SESSION_INTENT, {
        sessionId: activeSession.sessionId,
        gameId: activeSession.gameId,
        ...(/** @type {object} */ (payload || {})),
      });
    }
    return;
  }

  if (gameType === SyncMsg.ACK || gameType === SyncMsg.REJECT) {
    if (session.role === "host") {
      session.broadcast(gameType, payload);
    }
    return;
  }

  if (session.role === "guest") {
    session.send(RoomMsg.SESSION_INTENT, {
      sessionId: activeSession.sessionId,
      gameId: activeSession.gameId,
      wireType: gameType,
      ...(typeof payload === "object" && payload !== null ? payload : { payload }),
    });
  }
}

/**
 * @param {string} gameId
 */
async function startGame(gameId) {
  if (!session || session.role !== "host" || !roomLog) return;
  const game = getGame(gameId);
  if (!game || !isRoomPlayable(game.embedded)) {
    setError("Dit spel is nog niet speelbaar in de room.");
    return;
  }

  const members = rosterArray();
  const playable = roomReadyGames(members.length);
  if (!playable.some((g) => g.id === gameId)) {
    setError("Dit spel past niet bij het aantal spelers.");
    return;
  }

  const sessionId = newSessionId();
  const roster = members.map((m) => ({ playerId: m.playerId, name: m.name }));
  const started = roomHost.startSession(roomLog, { sessionId, gameId, roster });
  if (!started.ok) return;
  roomLog = started.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);

  activeSession = { sessionId, gameId };
  sessionHost = createSessionHost({
    gameId,
    sessionId,
    roomCode: session.roomCode,
  });

  for (const [peerId, pid] of peerToPlayer) {
    sessionHost.bindPeer(peerId, pid);
  }

  persistRoomDesk();
  mountActiveGame(gameId, sessionId, null);
  syncChatMode();

  session.broadcast(RoomMsg.ROOM_LOG, {
    packet: encodeSyncPacket(roomLog, tipSeq(roomLog) - 1),
  });
}

function startVotedGame() {
  if (!session || session.role !== "host") return;
  const state = roomState();
  const playable = roomReadyGames(memberCount());
  const winner = pickWinningGame(tallyVotes(state.votes), playable.map((g) => g.id));
  if (!winner) {
    setError("Stem eerst op een spel.");
    return;
  }
  setError("");
  startGame(winner);
}

/**
 * @param {string} gameId
 * @param {string} sessionId
 * @param {unknown} [sessionLogPacket]
 */
async function mountActiveGame(gameId, sessionId, sessionLogPacket) {
  const game = getGame(gameId);
  if (!game || !session) return;

  const participation = resolveParticipation(sessionId, gameId);
  activeSession = { sessionId, gameId };
  showPanel("playing");
  syncPlayingBarHint(participation);
  syncPlayingBarButtons();
  syncGameSessionBanner();
  syncChatMode();

  if (gameBridge) gameBridge.destroy();
  gameBridge = mountGameBridge(gameFrame);
  gameBridge.onGameOut(relayGameOut);

  clearGameFrame();
  gameBridge.resetHandshake();

  const initPayload = () => {
    const log =
      sessionHost?.log ||
      loadSessionLog(session.roomCode, sessionId, gameId);
    return {
      role: session.role,
      roomCode: session.roomCode,
      sessionId,
      gameId,
      playerId,
      name: playerLabel(),
      participation,
      roster: rosterArray().map((m) => ({
        playerId: m.playerId,
        name: m.name,
      })),
      log: sessionLogPacket || encodeSyncPacket(log, 0),
    };
  };

  signalPlayerInGame();

  // Queue init; bridge delivers when the game posts READY
  // (iframe onload races ahead of deferred module scripts).
  gameBridge.sendSessionInit(initPayload());

  gameFrame.onload = () => {
    gameBridge?.resetHandshake();
    gameBridge?.sendSessionInit(initPayload());
  };

  try {
    gameFrameBlobUrl = await mountEmbeddedGameFrame(gameFrame, game.path, {
      room: session.roomCode,
      session: sessionId,
      embedded: 1,
    });
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Kon het spel niet laden.",
    );
    pauseLocalGame();
  }
}

function endGame(reason = "back_to_lobby") {
  if (!session || !roomLog) return;
  const state = roomState();
  const sid = state.activeSession;
  if (!sid) return;
  if (session.role === "host") {
    const ended = roomHost.endSession(roomLog, {
      sessionId: sid.sessionId,
      gameId: sid.gameId,
      reason,
    });
    if (ended.ok) {
      roomLog = ended.log;
      saveRoomLogByCode(session.roomCode, roomLog);
      broadcastRoomLog(tipSeq(roomLog) - 1);
    }
  }
  returnToVoting();
}

async function startHost() {
  if (hostStartInFlight) return;
  hostStartInFlight = true;
  setError("");
  if (session) {
    await session.destroy();
    session = null;
  }
  showPanel("lobby");
  document.getElementById("invite-card")?.classList.remove("hidden");

  const s = createRoomSession({ maxGuests: 5 });
  bindSession(s);

  try {
    const urlCode = readRoomFromUrl();
    const mem = loadActiveRoom();
    const resumeHost =
      readHostIntentFromUrl() ||
      (mem?.isRoomShell &&
        mem.role === "host" &&
        urlCode &&
        mem.code === urlCode);
    let code;
    if (urlCode && resumeHost) {
      code = await s.hostWithCode(urlCode);
    } else {
      code = await s.host();
    }

    roomLog = loadRoomLogByCode(code);
    if (!roomLog.events.some((e) => e.type === RoomEvent.CREATED)) {
      roomLog = commitRoomEvent(roomLog, RoomEvent.CREATED, {
        hostPlayerId: playerId,
        maxPlayers: 6,
        version: 1,
      }).log;
    }
    const joined = roomHost.joinMember(roomLog, {
      playerId,
      name: playerLabel(),
    });
    if (joined.ok) roomLog = joined.log;
    saveRoomLogByCode(code, roomLog);

    shareUrl = buildRoomShareUrl(code);
    saveRoom({
      code,
      role: "host",
      name: playerLabel(),
      isRoomShell: true,
    });
    writeRoomCodeToUrl(code, { asHost: true });

    await showHostInviteCard({
      card: document.getElementById("invite-card"),
      canvas: document.getElementById("invite-qr-host"),
      codeEl: document.getElementById("invite-code"),
      urlEl: /** @type {HTMLAnchorElement} */ (document.getElementById("invite-url")),
      code,
      url: shareUrl,
    });

    initRoomChat();
    renderRoster();
    persistRoomDesk();

    const state = roomState();
    if (state.activeSession) {
      sessionHost = createSessionHost({
        gameId: state.activeSession.gameId,
        sessionId: state.activeSession.sessionId,
        roomCode: code,
      });
      if (state.inGamePlayers.has(playerId)) {
        activeSession = state.activeSession;
        mountActiveGame(
          state.activeSession.gameId,
          state.activeSession.sessionId,
          null,
        );
      } else {
        syncGameSessionBanner();
      }
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    shareUrl = null;
    await s.destroy();
    session = null;
    showPanel("idle");
  } finally {
    hostStartInFlight = false;
  }
}

async function joinRoom(code) {
  if (joinInFlight || hostStartInFlight) return;
  joinInFlight = true;
  setError("");
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!c) {
    setError("Vul een roomcode in of scan de QR van de host.");
    joinInFlight = false;
    return;
  }

  if (session) {
    await session.destroy();
    session = null;
  }

  const s = createRoomSession({ maxGuests: 5 });
  bindSession(s);
  showPanel("lobby");
  setStatus("Verbinden…");

  try {
    // Must wait for PeerJS data channel — hello before open is dropped.
    await s.join(c);
    s.writeRoomToUrl(c);
    roomLog = loadRoomLogByCode(c);

    const helloOk = s.sendHello({ playerId, name: playerLabel() });
    if (!helloOk) {
      throw new Error("Verbonden, maar hello mislukte — probeer opnieuw.");
    }

    saveRoom({
      code: c,
      role: "guest",
      name: playerLabel(),
      isRoomShell: true,
    });

    initRoomChat();
    renderRoster();
    persistRoomDesk();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    await s.destroy();
    session = null;
    roomLog = null;
    showPanel("idle");
  } finally {
    joinInFlight = false;
  }
}

async function leaveRoom() {
  if (activeSession) {
    pauseLocalGame();
  }
  if (session?.role === "host" && roomState().activeSession) {
    endGame("left");
  }
  if (session) await session.destroy();
  session = null;
  roomLog = null;
  shareUrl = null;
  clearRoom();
  showPanel("idle");
  setStatus("Niet verbonden");
}

document.getElementById("btn-start-room")?.addEventListener("click", startHost);
document.getElementById("btn-join-room")?.addEventListener("click", () => {
  joinRoom(joinInput.value);
});
joinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoom(joinInput.value);
});
document.getElementById("btn-scan-qr")?.addEventListener("click", () => {
  setError("");
  openQrScanner({
    hint: "Richt op de QR van de host",
    onScan: async (raw) => {
      const invite = parseP2pInvite(raw);
      if (!invite) {
        setError("Geen geldige room-uitnodiging in deze QR.");
        return;
      }
      if (joinInput) joinInput.value = invite.code;
      await joinRoom(invite.code);
    },
    onError: () => setError("Camera kon niet starten."),
  });
});
btnStartVoted?.addEventListener("click", startVotedGame);
btnLeaveGame?.addEventListener("click", () => pauseLocalGame());
btnEndSession?.addEventListener("click", () => endGame("host_abort"));
btnGoToGame?.addEventListener("click", () => goToGame());
document.getElementById("btn-leave-room")?.addEventListener("click", leaveRoom);

document.getElementById("btn-copy-invite")?.addEventListener("click", async () => {
  const url =
    shareUrl ||
    (session?.roomCode ? buildRoomShareUrl(session.roomCode) : "");
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setError("");
    const btn = document.getElementById("btn-copy-invite");
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = "Gekopieerd!";
      setTimeout(() => {
        btn.textContent = prev;
      }, 2000);
    }
  } catch {
    setError("Kon link niet kopiëren — selecteer de link hierboven.");
  }
});

guardRoomNavigation({
  isConnected: () => sessionConnected,
});

const urlRoom = readRoomFromUrl();
if (urlRoom && !hostStartInFlight && !joinInFlight) {
  // Share/QR links never include as=host — always join as guest.
  // Only explicit ?as=host (Host opnieuw / Ga verder als host) resumes hosting.
  if (readHostIntentFromUrl()) startHost();
  else joinRoom(urlRoom);
}
