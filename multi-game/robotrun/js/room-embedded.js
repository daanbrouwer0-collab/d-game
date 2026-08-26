/**
 * RobotRun embedded in room shell — tip-proven CHECKPOINT truth + intent bridge.
 *
 * Live guest sync does NOT depend on incremental LOG merge (that permanently
 * gaps joiners). Host publishes self-contained checkpoints; guests apply them
 * directly. The event log is kept for boot/restore only.
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
  tipEventId,
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
  ctrl._truthTipSeq = 0;
  ctrl._truthTipEventId = null;
  ctrl._lastTruth = null;
  ctrl._lastTruthAdoptAt = Date.now();
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
    // Boot catch-up for peers already in the room.
    ctrl.publishSnapshot?.({ persist: false }).catch(() => {});
  } else {
    ctrl.syncFromEmbeddedLog({ enterPlay: true });
    ctrl.sendLocalProfileUpdate?.();
    startGuestTruthWatchdog(ctrl);
  }

  Nav.switchTab("play");
  const app = window.RobotRallyApp;
  if (app?.ui) {
    app.ui.p2pHostMode = ctrl.isHost();
    app.ui.syncLocalP2pRobotId?.();
    app.ui.localP2pRobotId = ctrl.localRobotId() || app.ui.localP2pRobotId;
    app.ui.programmingUnlockedRobotId = app.ui.localP2pRobotId || app.ui.programmingUnlockedRobotId;
    app.ui.resizeCanvas();
    app.ui.updateCardsUI();
    app.ui.render?.();
    app.ui.scheduleScrollBoardToTop?.({ delay: 50 });
  }
  if (window.RobotRallyApp?.engine?.phase === "programming") {
    Toast.show("RobotRun — programmeer tegelijk!");
  }
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
      awaitMatchReady: true,
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
  ctrl.applyLocalHubProfile?.();
  if (app.ui) {
    app.ui.p2pHostMode = true;
    app.ui.syncLocalP2pRobotId?.();
    app.ui.localP2pRobotId = ctrl.localRobotId() || app.ui.localP2pRobotId;
    app.ui.programmingUnlockedRobotId = app.ui.localP2pRobotId;
    app.ui.resizeCanvas();
    app.ui.updateCardsUI();
    app.ui.render?.();
    app.ui.scheduleScrollBoardToTop?.({ delay: 50 });
  }

  Nav.switchTab("play");
  ctrl.wireHostAutosnapshots();
  ctrl.publishSnapshot?.({ persist: true }).catch(() => {});
}

/**
 * Strip room-shell fields from guest intents before host handling.
 * @param {unknown} payload
 */
function normalizeIntentPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId, gameId, wireType, tipSeq: _ts, tipEventId: _te, ...rest } =
    /** @type {Record<string, unknown>} */ (payload);
  return rest;
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {{ type: string, payload?: unknown, fromPeerId?: string|null }} msg
 */
function handleTransportMessage(ctrl, msg) {
  if (msg.type === SyncMsg.CHECKPOINT) {
    if (ctrl.isHost()) return;
    adoptTruthCheckpoint(ctrl, msg.payload);
    return;
  }

  if (msg.type === SyncMsg.LOG) {
    if (ctrl.isHost()) return;
    // Boot/catch-up only. Live play uses CHECKPOINT.
    adoptLogPacket(ctrl, msg.payload);
    return;
  }

  if (msg.type === SyncMsg.RESYNC) {
    if (!ctrl.isHost()) return;
    // Prefer frozen last tip (safe mid-executing). Else export fresh.
    if (!rebroadcastLastTruth(ctrl)) {
      Promise.resolve(ctrl.publishSnapshot?.({ persist: false })).catch(() => {});
    }
    return;
  }

  if (ctrl.isHost()) {
    const payload = normalizeIntentPayload(msg.payload);
    const claimedUserId = String(
      /** @type {{ userId?: string }} */ (payload).userId || "",
    );
    if (msg.fromPeerId && claimedUserId) {
      ctrl.peerToPlayer = ctrl.peerToPlayer || {};
      ctrl.peerToPlayer[msg.fromPeerId] = claimedUserId;
    }
    ctrl.handleMessage({
      type: msg.type,
      payload,
      fromPeerId: msg.fromPeerId || null,
    });
  }
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {unknown} raw
 */
function adoptTruthCheckpoint(ctrl, raw) {
  if (!raw || typeof raw !== "object") return;
  const payload = /** @type {{
    tipSeq?: number,
    tipEventId?: string|null,
    boardData?: unknown,
    gameState?: unknown,
  }} */ (raw);
  if (!payload.boardData || !payload.gameState) return;

  const tip = Number(payload.tipSeq) || 0;
  const tipId = payload.tipEventId || null;
  // Ignore stale/out-of-order checkpoints (keep newest tip).
  if (tip && ctrl._truthTipSeq && tip < ctrl._truthTipSeq) return;

  // Same tip already applied — mark healthy, do not reset local Play/UI.
  if (
    tip
    && tip === ctrl._truthTipSeq
    && tipId
    && tipId === ctrl._truthTipEventId
  ) {
    ctrl._lastTruthAdoptAt = Date.now();
    return;
  }

  ctrl._truthTipSeq = tip || ctrl._truthTipSeq || 0;
  ctrl._truthTipEventId = tipId;
  ctrl._lastTruthAdoptAt = Date.now();

  const hadBoard = !!window.RobotRallyApp?.engine?.board;
  ctrl.lobby = {
    ...(ctrl.lobby || {}),
    boardData: payload.boardData,
    gameState: payload.gameState,
    status:
      /** @type {{ phase?: string }} */ (payload.gameState).phase === "finished"
        ? "finished"
        : "playing",
  };
  ctrl.applyGameSnapshot(
    { boardData: payload.boardData, gameState: payload.gameState },
    { enterPlay: !hadBoard },
  );
}

/**
 * @param {{ boardData: unknown, gameState: unknown }} truth
 */
function cloneTruth(truth) {
  try {
    return {
      boardData: structuredClone(truth.boardData),
      gameState: structuredClone(truth.gameState),
    };
  } catch {
    return {
      boardData: JSON.parse(JSON.stringify(truth.boardData)),
      gameState: JSON.parse(JSON.stringify(truth.gameState)),
    };
  }
}

/**
 * Re-send frozen tip truth without re-exporting mid-Play engine state.
 * @param {typeof window.P2pSessionController} ctrl
 */
function rebroadcastLastTruth(ctrl) {
  const last = ctrl._lastTruth;
  if (!ctrl.isHost() || !ctrl._bridgeTransport || !last) return false;
  ctrl._bridgeTransport.send(SyncMsg.CHECKPOINT, {
    tipSeq: last.tipSeq,
    tipEventId: last.tipEventId,
    boardData: last.boardData,
    gameState: last.gameState,
  });
  return true;
}

/**
 * Guest self-heal: if no tip arrived recently, ask host for last truth.
 * @param {typeof window.P2pSessionController} ctrl
 */
function startGuestTruthWatchdog(ctrl) {
  if (ctrl._truthWatchdogTimer) clearInterval(ctrl._truthWatchdogTimer);
  ctrl._truthWatchdogTimer = setInterval(() => {
    if (!ctrl.isActive?.() || ctrl.isHost?.()) return;
    if (ctrl.lobby?.status !== "playing") return;
    const phase = window.RobotRallyApp?.engine?.phase;
    if (!phase || phase === "finished") return;
    const age = Date.now() - (ctrl._lastTruthAdoptAt || 0);
    if (age < 2500) return;
    ctrl.requestLogResync?.();
  }, 1000);
}

/**
 * @param {typeof window.P2pSessionController} ctrl
 * @param {unknown} raw
 */
function adoptLogPacket(ctrl, raw) {
  const packet = parseSyncPacket(raw);
  if (!packet) return;
  // Prefer full replace when packet starts from seq 1 (welcome / catch-up).
  const first = packet.events?.[0];
  if (first && first.seq === 1) {
    const replaced = replaceFromHostPacket(GAME_ID, packet);
    if (!replaced.ok) return;
    ctrl.log = replaced.log;
  } else {
    const merged = applySyncPacket(ctrl.log, packet);
    if (!merged.ok) return;
    ctrl.log = merged.log;
  }
  const hadBoard = !!window.RobotRallyApp?.engine?.board;
  ctrl.syncFromEmbeddedLog({ enterPlay: !hadBoard });
}

/**
 * Persist event for desk/boot; do not use as the live guest channel.
 * @param {typeof window.P2pSessionController} ctrl
 * @param {string} type
 * @param {unknown} payload
 * @param {{ wire?: boolean }} [opts]
 */
function appendEmbeddedEventLocal(ctrl, type, payload, { wire = false } = {}) {
  if (!ctrl.log) return;
  const added = appendEvent(ctrl.log, type, payload);
  if (!added.ok) return;
  ctrl.log = added.log;
  if (wire) pushLogWire(ctrl, { full: true });
}

/**
 * Self-contained host truth for all peers. Safe if prior packets were dropped.
 * @param {typeof window.P2pSessionController} ctrl
 * @param {{ boardData: unknown, gameState: unknown }} truth
 */
export function pushTruthCheckpoint(ctrl, truth) {
  if (!ctrl.isHost() || !ctrl._bridgeTransport) return;
  const tip = tipSeq(ctrl.log);
  const tipId = tipEventId(ctrl.log);
  const frozen = cloneTruth(truth);
  ctrl._truthTipSeq = tip;
  ctrl._truthTipEventId = tipId;
  ctrl._lastTruth = {
    tipSeq: tip,
    tipEventId: tipId,
    boardData: frozen.boardData,
    gameState: frozen.gameState,
  };
  ctrl._bridgeTransport.send(SyncMsg.CHECKPOINT, {
    tipSeq: tip,
    tipEventId: tipId,
    boardData: frozen.boardData,
    gameState: frozen.gameState,
  });
}

/**
 * Optional desk catch-up (welcome / rare). Not the live sync path.
 * @param {typeof window.P2pSessionController} ctrl
 * @param {{ full?: boolean }} [opts]
 */
export function pushLogWire(ctrl, { full = false } = {}) {
  if (!ctrl.isHost() || !ctrl._bridgeTransport || !ctrl.log) return;
  const fromSeq = full ? 0 : (ctrl._wireFromSeq || 0);
  const packet = encodeSyncPacket(ctrl.log, fromSeq);
  if (!packet.events.length) return;
  const ok = ctrl._bridgeTransport.send(SyncMsg.LOG, packet);
  if (ok !== false) ctrl._wireFromSeq = tipSeq(ctrl.log);
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
      // Desk log only — live peers get CHECKPOINT from publishSnapshot.
      appendEmbeddedEventLocal(this, logType, payload, { wire: false });
      return;
    }
    return prevBroadcast(type, payload);
  };

  ctrl.appendEmbeddedEvent = function appendEmbeddedEvent(type, payload) {
    appendEmbeddedEventLocal(this, type, payload, { wire: false });
  };

  const prevPublish = ctrl.publishSnapshot?.bind(ctrl);
  if (prevPublish) {
    ctrl.publishSnapshot = async function publishSnapshot(opts = {}) {
      if (!this.isHost() || !window.RobotRallyApp?.engine) return;
      const gameState = window.RobotRallyApp.engine.exportGameState();
      gameState.currentRoundReplayFrames = [];
      gameState.lastRoundReplay = null;
      const boardData = window.RobotRallyApp.engine.serializeBoard();
      this.lobby = this.lobby || {};
      this.lobby.status = gameState.phase === "finished" ? "finished" : "playing";
      this.lobby.boardData = boardData;
      this.lobby.gameState = gameState;
      this.lobby.updatedAt = Date.now();
      if (this.embeddedMode) {
        const persist = opts.persist !== false;
        if (persist) {
          appendEmbeddedEventLocal(this, "snap", { boardData, gameState }, { wire: false });
        }
        pushTruthCheckpoint(this, { boardData, gameState });
        return;
      }
      return prevPublish.call(this, opts);
    };
  }

  ctrl.requestLogResync = function requestLogResyncFromCtrl() {
    if (this.isHost?.() || !this._bridgeTransport) return;
    this._bridgeTransport.send(SyncMsg.RESYNC, {
      haveTipSeq: tipSeq(this.log),
      haveTipEventId: tipEventId(this.log),
    });
  };

  ctrl.rebroadcastLastTruth = function rebroadcastLastTruthFromCtrl() {
    return rebroadcastLastTruth(this);
  };

  ctrl.syncFromEmbeddedLog = function syncFromEmbeddedLog({ enterPlay = false } = {}) {
    const restored = this.restoreFromEmbeddedLog();
    if (!restored) return;
    const seats =
      Array.isArray(restored.seats) && restored.seats.length
        ? restored.seats
        : (this.lobby?.seats || []);
    this.lobby = {
      ...(this.lobby || {}),
      seats,
      boardData: restored.boardData || this.lobby?.boardData,
      gameState: restored.gameState || this.lobby?.gameState,
      status: restored.status || this.lobby?.status,
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
