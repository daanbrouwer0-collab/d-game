/**
 * RobotRun embedded in room shell — snapshot sync via bridge (SyncMsg.LOG + rr_* intents).
 */
import { notifySessionEnded, watchSessionEnd } from "../../js/bridge/embedded-bootstrap.js";
import { SyncMsg } from "../../js/sync/sync-msg.js";
import {
  appendEvent,
  applySyncPacket,
  createEventLog,
  encodeSyncPacket,
  parseSyncPacket,
  replaceFromHostPacket,
  tipSeq,
} from "../../js/sync/event-log.js";

const GAME_ID = "robotrun";

/**
 * @param {import('../../js/bridge/embedded-contract.js').EmbeddedContext} ctx
 */
export function bootstrapRoomEmbedded(ctx) {
  const ctrl = window.P2pSessionController;
  if (!ctrl || !window.RobotRallyApp) {
    throw new Error("RobotRun niet geladen");
  }

  ctrl.embeddedMode = true;
  ctrl.playerId = String(ctx.playerId || "");
  ctrl._bridgeTransport = ctx.transport;
  ctrl._wireFromSeq = 0;
  ctrl.session = {
    role: ctx.role,
    transport: "bridge",
    peerId: ctrl.playerId,
    roomCode: ctx.roomCode,
    destroy() {},
  };

  ctrl.log = loadInitialLog(ctx);
  ctrl.lobby = buildLobbyFromRoster(ctx);
  ctrl.peerToPlayer = {};
  ctrl.onlineIds = new Set((ctx.roster || []).map((m) => m.playerId));

  ctx.transport.onMessage = (msg) => handleTransportMessage(ctrl, msg);
  ctx.transport.onStatus = (status) => {
    if (status === "connected") ctrl.setStatus?.("online");
  };

  const maybeEnd = watchSessionEnd(
    () => window.RobotRallyApp?.engine?.phase === "finished",
    () => {
      const winner = window.RobotRallyApp?.engine?.winner;
      const name = String(winner?.name || "").trim();
      if (name) {
        return {
          reason: "finished",
          winnerName: name,
          winnerId: winner?.id || winner?.peerUserId || null,
          summary: `${name} wint`,
        };
      }
      return { reason: "finished", summary: "Spel afgelopen" };
    },
  );
  const prevChange = window.RobotRallyApp.engine.onStateChange;
  window.RobotRallyApp.engine.onStateChange = () => {
    if (typeof prevChange === "function") prevChange();
    maybeEnd();
  };

  if (ctx.role === "host") {
    if (!ctrl.log.events.length) {
      seedSeatsOnLog(ctrl, ctx.roster || []);
      startEmbeddedRace(ctrl);
    } else {
      ctrl.syncFromEmbeddedLog({ enterPlay: true });
      ctrl.wireHostAutosnapshots();
    }
    pushLogWire(ctrl);
  } else {
    ctrl.syncFromEmbeddedLog({ enterPlay: true });
  }

  Nav.switchTab("play");
  const app = window.RobotRallyApp;
  if (app?.ui) {
    app.ui.resizeCanvas();
    app.ui.updateCardsUI();
    app.ui.render?.();
  }
  Toast.show("RobotRun — programmeer tegelijk!");
}

/**
 * @param {import('../../js/bridge/embedded-contract.js').EmbeddedContext} ctx
 */
function loadInitialLog(ctx) {
  const packet = parseSyncPacket(ctx.log);
  if (!packet) return createEventLog(GAME_ID);
  const replaced = replaceFromHostPacket(GAME_ID, packet);
  return replaced.ok ? replaced.log : createEventLog(GAME_ID);
}

/**
 * @param {import('../../js/bridge/embedded-contract.js').EmbeddedContext} ctx
 */
function buildLobbyFromRoster(ctx) {
  const roster = Array.isArray(ctx.roster) ? ctx.roster : [];
  const hubChar = StorageManager.loadCharacter();
  const seats = roster.map((member, index) => {
    const defaults = CONFIG.DEFAULT_PLAYERS[index] || CONFIG.DEFAULT_PLAYERS[0];
    const isLocal = member.playerId === ctx.playerId;
    const profile = isLocal
      ? hubChar
      : {
          name: member.name || defaults.name,
          colors: defaults.colors,
          style: defaults.style,
        };
    return window.P2pSessionController.makeSeat(
      member.playerId,
      index,
      profile,
    );
  });

  return {
    hostId: "room",
    roomCode: ctx.roomCode,
    status: "lobby",
    settings: {
      name: "RobotRun",
      difficulty: "normal",
      checkpointsCount: CONFIG.DEFAULT_CHECKPOINTS,
      startingLives: CONFIG.DEFAULT_STARTING_LIVES,
      seed: Date.now() >>> 0,
    },
    seats,
  };
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {{ playerId: string, name: string }[]} roster
 */
function seedSeatsOnLog(ctrl, roster) {
  let log = ctrl.log;
  roster.forEach((member, index) => {
    const seat = ctrl.lobby.seats[index];
    if (!seat) return;
    const added = appendEvent(log, "seat", {
      userId: seat.userId,
      robotId: seat.robotId,
      name: seat.name,
      color: seat.color,
      colors: seat.colors,
      style: seat.style,
    });
    if (added.ok) log = added.log;
  });
  ctrl.log = log;
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 */
function startEmbeddedRace(ctrl) {
  const app = window.RobotRallyApp;
  if (!app?.engine || ctrl.session?.role !== "host") return;

  const seats = ctrl.lobby?.seats || [];
  if (seats.length < 2) {
    Toast.show("Minstens 2 spelers nodig in de room.");
    return;
  }

  const settings = ctrl.lobby.settings || {};
  const seed = settings.seed || (Date.now() >>> 0);
  settings.seed = seed;
  ctrl.lobby.settings = settings;

  const roster = seats.map((seat, index) => ({
    robotId: seat.robotId || `player_${index + 1}`,
    name: seat.name,
    colors: seat.colors || StorageManager.makeColors(seat.color),
    style: seat.style || "scout",
    peerUserId: seat.userId,
    userId: seat.userId,
  }));

  const boardData = app.engine.serializeBoard(
    app.engine.generateRandomBoard(
      roster.length,
      seed,
      settings.difficulty || "normal",
      settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
    ),
  );

  app.engine.setRngSeed(seed);
  app.engine.loadCourse(
    boardData.id,
    roster,
    CONFIG.GAME_MODES.P2P,
    roster.length,
    boardData,
    {
      startRound: true,
      startingLives: settings.startingLives,
      rngSeed: seed,
    },
  );

  ctrl.lobby.status = "playing";
  ctrl.lobby.boardData = boardData;
  ctrl.lobby.gameState = app.engine.exportGameState();

  ctrl.appendEmbeddedEvent("start", {
    settings: { ...settings },
    seats: seats.map((s) => ({ ...s })),
    boardData,
    gameState: ctrl.lobby.gameState,
  });

  app.sessionReady = true;
  if (app.ui) {
    app.ui.localP2pRobotId = ctrl.localRobotId();
    app.ui.p2pHostMode = true;
    app.ui.programmingUnlockedRobotId = ctrl.localRobotId();
    app.ui.resizeCanvas();
    app.ui.updateCardsUI();
    app.ui.render?.();
  }

  Nav.switchTab("play");
  ctrl.wireHostAutosnapshots();
  ctrl.publishSnapshot?.().catch(() => {});
}

/**
 * Strip room-shell fields from guest intents before host handling.
 * @param {unknown} payload
 */
function normalizeIntentPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId, gameId, wireType, ...rest } = /** @type {Record<string, unknown>} */ (payload);
  return rest;
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {{ type: string, payload?: unknown, fromPeerId?: string|null }} msg
 */
function handleTransportMessage(ctrl, msg) {
  if (msg.type === SyncMsg.LOG) {
    if (ctrl.isHost()) return;
    adoptLogPacket(ctrl, msg.payload);
    return;
  }

  if (ctrl.isHost()) {
    ctrl.handleMessage({
      type: msg.type,
      payload: normalizeIntentPayload(msg.payload),
      fromPeerId: msg.fromPeerId || null,
    });
  }
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {unknown} raw
 */
function adoptLogPacket(ctrl, raw) {
  const packet = parseSyncPacket(raw);
  if (!packet) return;
  const merged = applySyncPacket(ctrl.log, packet);
  if (!merged.ok) return;
  ctrl.log = merged.log;
  ctrl.syncFromEmbeddedLog();
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 */
export function pushLogWire(ctrl) {
  if (!ctrl.isHost() || !ctrl._bridgeTransport || !ctrl.log) return;
  const fromSeq = ctrl._wireFromSeq || 0;
  const packet = encodeSyncPacket(ctrl.log, fromSeq);
  if (!packet.events.length) return;
  ctrl._bridgeTransport.send(SyncMsg.LOG, packet);
  ctrl._wireFromSeq = tipSeq(ctrl.log);
}

/**
 * Patch P2pSessionController with room-embedded helpers (classic script — no imports).
 */
export function patchP2pSessionForRoom() {
  const ctrl = window.P2pSessionController;
  if (!ctrl || ctrl._roomEmbeddedPatched) return;
  ctrl._roomEmbeddedPatched = true;
  ctrl.embeddedMode = false;

  const prevIsActive = ctrl.isActive.bind(ctrl);
  ctrl.isActive = function isActive() {
    if (this.embeddedMode) return !!this.session;
    return prevIsActive();
  };

  const prevSend = ctrl.send.bind(ctrl);
  ctrl.send = function send(type, payload) {
    if (this.embeddedMode && this._bridgeTransport) {
      return this._bridgeTransport.send(type, payload);
    }
    return prevSend(type, payload);
  };

  const prevBroadcast = ctrl.broadcast.bind(ctrl);
  ctrl.broadcast = function broadcast(type, payload) {
    if (this.embeddedMode) {
      if (!this.isHost()) return;
      const logType =
        type === "rr_game_start"
          ? "start"
          : type === "rr_state_snapshot"
            ? "snap"
            : type;
      this.appendEmbeddedEvent(logType, payload);
      return;
    }
    return prevBroadcast(type, payload);
  };

  ctrl.appendEmbeddedEvent = function appendEmbeddedEvent(type, payload) {
    if (!this.log) return;
    const added = appendEvent(this.log, type, payload);
    if (!added.ok) return;
    this.log = added.log;
    if (this.embeddedMode) pushLogWire(this);
  };

  const prevPublish = ctrl.publishSnapshot?.bind(ctrl);
  if (prevPublish) {
    ctrl.publishSnapshot = async function publishSnapshot() {
      if (!this.isHost() || !window.RobotRallyApp?.engine) return;
      const gameState = window.RobotRallyApp.engine.exportGameState();
      const boardData = window.RobotRallyApp.engine.serializeBoard();
      this.lobby = this.lobby || {};
      this.lobby.status = gameState.phase === "finished" ? "finished" : "playing";
      this.lobby.boardData = boardData;
      this.lobby.gameState = gameState;
      this.lobby.updatedAt = Date.now();
      if (this.embeddedMode) {
        this.broadcast("rr_state_snapshot", { boardData, gameState });
        return;
      }
      return prevPublish();
    };
  }

  ctrl.syncFromEmbeddedLog = function syncFromEmbeddedLog({ enterPlay = false } = {}) {
    const restored = this.restoreFromEmbeddedLog();
    if (!restored) return;
    this.lobby = {
      ...(this.lobby || {}),
      seats: restored.seats,
      boardData: restored.boardData,
      gameState: restored.gameState,
      status: restored.status,
      settings: restored.settings || this.lobby?.settings,
      roomCode: this.session?.roomCode,
    };
    if (restored.boardData && restored.gameState) {
      this.applyGameSnapshot(
        { boardData: restored.boardData, gameState: restored.gameState },
        { enterPlay },
      );
    }
  };

  ctrl.restoreFromEmbeddedLog = function restoreFromEmbeddedLog() {
    const seats = [];
    let boardData = null;
    let gameState = null;
    let status = "lobby";
    let restoredSettings = { ...(this.lobby?.settings || {}) };
    for (const ev of this.log?.events || []) {
      if (ev.type === "seat") {
        const p = ev.payload || {};
        const userId = String(p.userId || "");
        if (!userId) continue;
        const seat = {
          userId,
          robotId: p.robotId || `player_${seats.length + 1}`,
          name: (p.name || "Speler").slice(0, 24),
          color: p.color,
          colors: p.colors,
          style: p.style || "scout",
          ready: false,
        };
        const idx = seats.findIndex((s) => s.userId === userId);
        if (idx >= 0) seats[idx] = { ...seats[idx], ...seat };
        else seats.push(seat);
      } else if (ev.type === "start" || ev.type === "rr_game_start") {
        const p = ev.payload || {};
        if (p.settings) restoredSettings = { ...restoredSettings, ...p.settings };
        if (p.boardData) boardData = p.boardData;
        if (p.gameState) gameState = p.gameState;
        if (Array.isArray(p.seats) && p.seats.length) {
          seats.length = 0;
          for (const s of p.seats) seats.push({ ...s, ready: false });
        }
        status = "playing";
      } else if (ev.type === "snap" || ev.type === "rr_state_snapshot") {
        const p = ev.payload || {};
        if (p.boardData) boardData = p.boardData;
        if (p.gameState) {
          gameState = p.gameState;
          status = p.gameState.phase === "finished" ? "finished" : "playing";
        }
      }
    }
    return { seats, boardData, gameState, status, settings: restoredSettings };
  };
}

export { notifySessionEnded };
