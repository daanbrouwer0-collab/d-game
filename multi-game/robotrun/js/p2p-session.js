/**
 * P2P session controller for RobotRun (host-authoritative lobby + game sync).
 */
const P2pSessionController = {
  GAME_ID: "robotrun",
  GAME_PATH: "/robotrun/",

  session: null,
  lobby: null,
  localSessionId: null,
  localPeerId: null,
  /** Stable browser id — seat key across host switch */
  playerId: null,
  /** @type {Record<string, string>} */
  peerToPlayer: {},
  /** @type {Set<string>} */
  onlineIds: new Set(),
  log: null,
  connectionStatus: "idle",
  lastError: null,
  applyingSnapshot: false,
  joinInFlight: false,
  lastSnapshotAt: 0,
  _localCommittedRound: null,
  _localCommittedRegisters: null,
  _snapTimer: null,
  _phaseHeartbeatTimer: null,
  _phaseHeartbeatPhase: "",
  _deskSnapAt: 0,

  isActive() {
    return !!(this.session && this.lobby);
  },

  isHost() {
    return this.session?.role === "host";
  },

  resolvePlayerId() {
    this.playerId =
      window.RobotRunP2P?.getPlayerId?.() ||
      this.playerId ||
      `p_${Math.random().toString(36).slice(2, 10)}`;
    return this.playerId;
  },

  localSeat() {
    if (!this.lobby?.seats || !this.playerId) return null;
    return this.lobby.seats.find((s) => s.userId === this.playerId) || null;
  },

  isSeatOnline(userId) {
    if (!userId) return false;
    if (userId === this.playerId) return true;
    return this.onlineIds.has(userId);
  },

  localRobotId() {
    return this.localSeat()?.robotId || null;
  },

  /** Apply Me-tab colors/name onto the local robot (and lobby seat). */
  applyLocalHubProfile() {
    const app = window.RobotRallyApp;
    const localId = this.localRobotId();
    if (!app?.engine || !localId) return;
    const hub = StorageManager.loadCharacter();
    const colors = hub.colors || StorageManager.makeColors(hub.color);
    const robot = app.engine.robots.find((r) => r.id === localId);
    if (robot) {
      robot.name = hub.name || robot.name;
      robot.colors = { ...colors };
      robot.color = colors.head;
      robot.style = hub.style || robot.style || "scout";
    }
    const seat = this.localSeat();
    if (seat) {
      seat.name = hub.name || seat.name;
      seat.color = colors.head;
      seat.colors = { ...colors };
      seat.style = hub.style || seat.style || "scout";
    }
  },

  /** Guest: push Me-tab profile so host robots get the right colors. */
  sendLocalProfileUpdate() {
    if (this.isHost()) return;
    const seat = this.localSeat();
    if (!seat) return;
    this.applyLocalHubProfile();
    this.send("rr_seat_update", {
      userId: this.playerId,
      seat: {
        userId: seat.userId,
        robotId: seat.robotId,
        name: seat.name,
        color: seat.color,
        colors: seat.colors,
        style: seat.style,
      },
    });
  },

  activeRoomKey() {
    return CONFIG.P2P?.ACTIVE_ROOM_KEY || "dgame-robotrun-p2p-active";
  },

  shortId(id) {
    if (!id) return "?";
    const s = String(id);
    return s.length <= 8 ? s : `${s.slice(0, 4)}…${s.slice(-3)}`;
  },

  persistActiveRoom() {
    if (!this.lobby?.roomCode || !this.playerId) return;
    try {
      localStorage.setItem(
        this.activeRoomKey(),
        JSON.stringify({
          roomCode: this.lobby.roomCode,
          localSessionId: this.localSessionId,
          hostId: this.lobby.hostId,
          localPeerId: this.localPeerId,
          playerId: this.playerId,
          role: this.isHost() ? "host" : "guest",
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* ignore */
    }
  },

  loadPersistedRoom() {
    try {
      const raw = localStorage.getItem(this.activeRoomKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearPersistedRoom() {
    try {
      localStorage.removeItem(this.activeRoomKey());
    } catch {
      /* ignore */
    }
  },

  ensureLog(code) {
    const api = window.RobotRunP2P;
    if (!api?.loadRoomLog) {
      this.log = { gameId: this.GAME_ID, events: [] };
      return;
    }
    this.log =
      api.loadRoomLog(this.GAME_ID, code) || api.createEventLog(this.GAME_ID);
  },

  persistDesk() {
    const api = window.RobotRunP2P;
    const code = this.lobby?.roomCode;
    if (!code || !api?.saveRoomLog || !this.log) return;
    api.saveRoomLog(this.GAME_ID, code, this.log);
    api.touchDeskRoom?.({
      gameId: this.GAME_ID,
      code,
      role: this.isHost() ? "host" : "guest",
      name: this.localSeat()?.name || "Speler",
      summary:
        this.lobby?.status === "playing"
          ? "Race bezig"
          : this.lobby?.status === "finished"
            ? "Afgelopen"
            : `Lobby · ${(this.lobby?.seats || []).length} spelers`,
      seq: api.tipSeq?.(this.log) || 0,
    });
  },

  appendDesk(type, payload) {
    const api = window.RobotRunP2P;
    if (!api?.appendEvent || !this.log) return;
    const added = api.appendEvent(this.log, type, payload);
    if (!added.ok) return;
    this.log = added.log;
    this.persistDesk();
  },

  /**
   * @param {string} code
   * @param {object} [settings]
   */
  restoreFromLog(code, settings = {}) {
    this.ensureLog(code);
    const seats = [];
    let boardData = null;
    let gameState = null;
    let status = "lobby";
    let restoredSettings = { ...settings };
    for (const ev of this.log.events || []) {
      if (ev.type === "seat") {
        const p = ev.payload || {};
        const userId = String(p.userId || "");
        if (!userId) continue;
        const idx = seats.findIndex((s) => s.userId === userId);
        const seat = {
          userId,
          robotId: p.robotId || `player_${seats.length + 1}`,
          name: (p.name || "Speler").slice(0, 24),
          color: p.color,
          colors: p.colors,
          style: p.style || "scout",
          ready: false,
        };
        if (idx >= 0) seats[idx] = { ...seats[idx], ...seat, ready: false };
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
  },

  setStatus(status, errorMsg = null) {
    this.connectionStatus = status;
    this.lastError = errorMsg;
    this.renderLobbyUi();
  },

  stop() {
    if (this._snapTimer) clearTimeout(this._snapTimer);
    this._snapTimer = null;
    if (this._phaseHeartbeatTimer) clearInterval(this._phaseHeartbeatTimer);
    this._phaseHeartbeatTimer = null;
    this._phaseHeartbeatPhase = "";
    if (this._truthWatchdogTimer) clearInterval(this._truthWatchdogTimer);
    this._truthWatchdogTimer = null;
    if (this._playStartRetipTimer) clearTimeout(this._playStartRetipTimer);
    this._playStartRetipTimer = null;
    if (this._countdownEndRetipTimer) clearTimeout(this._countdownEndRetipTimer);
    this._countdownEndRetipTimer = null;
    if (this.session) {
      this.session.destroy().catch(() => {});
    }
    this.session = null;
    this.lobby = null;
    this.localSessionId = null;
    this.localPeerId = null;
    this.peerToPlayer = {};
    this.onlineIds = new Set();
    this.log = null;
    this.connectionStatus = "idle";
    this.lastError = null;
    this._localCommittedRound = null;
    this._localCommittedRegisters = null;
    this._pendingGuestCommits = {};
    this.clearPersistedRoom();
  },

  makeSeat(userId, index, profile, robotId) {
    const colors = StorageManager.normalizeColors(
      profile?.colors || profile?.color,
      StorageManager.getPlayerColor(profile)
    );
    const color = colors.head;
    return {
      userId,
      robotId: robotId || `player_${index + 1}`,
      name: (profile?.name || `Speler ${index + 1}`).trim().slice(0, 24),
      color,
      colors,
      style: profile?.style || "scout",
      ready: false,
    };
  },

  ensureBridge() {
    if (!window.RobotRunP2P?.createRoom) {
      throw new Error("P2P-bridge niet geladen. Herlaad de pagina.");
    }
  },

  getLocalPeerId() {
    return this.session?.peerId || this.session?.roomCode || null;
  },

  wireSession() {
    const s = this.session;
    if (!s) return;

    s.onStatus = (status, detail) => {
      if (status === "disconnected" || status === "error") {
        this.setStatus("error", detail || "Verbinding verbroken");
      } else if (status === "hosting" || status === "connected") {
        this.setStatus("online");
      } else if (status === "connecting") {
        this.setStatus("connecting");
      }
    };

    s.onPeerJoin = () => {
      if (!this.isHost() || !this.lobby) return;
      this.broadcastLobby();
      this.renderLobbyUi();
    };

    s.onPeerLeave = (peerId) => {
      if (!this.isHost() || !this.lobby) return;
      const uid = this.peerToPlayer[peerId];
      delete this.peerToPlayer[peerId];
      if (uid) this.onlineIds.delete(uid);
      this.lobby.updatedAt = Date.now();
      this.broadcastLobby();
      this.renderLobbyUi();
    };

    s.onMessage = (msg) => this.handleMessage(msg);
    s.onError = (err) => {
      this.setStatus("error", err?.message || "P2P-fout");
    };
  },

  broadcastLobby() {
    if (!this.isHost() || !this.session) return;
    this.session.broadcast("rr_lobby", this.lobby);
  },

  broadcast(type, payload) {
    if (!this.isHost() || !this.session) return;
    this.session.broadcast(type, payload);
  },

  send(type, payload) {
    if (!this.session) return false;
    return this.session.send(type, payload);
  },

  sanitizeStateForLocalView(gameState, localRobotId) {
    if (!gameState || !Array.isArray(gameState.robots)) return gameState;
    const phase = gameState.phase;
    const hideSecrets = phase === "programming" || phase === "ready";
    if (!hideSecrets || !localRobotId) return gameState;

    return {
      ...gameState,
      robots: gameState.robots.map((robot) => {
        if (robot.id === localRobotId) return robot;
        const damage = Number(robot.damage) || 0;
        const memoryBonus = Array.isArray(robot.upgrades)
          ? robot.upgrades.filter((id) => id === "memoryBank").length
          : 0;
        const handSize = Math.max(
          CONFIG.MIN_HAND_SIZE || 0,
          (CONFIG.DEFAULT_HAND_SIZE || 9) - damage + memoryBonus,
        );
        const unlocked = Math.min(5, handSize);
        const memory = Array.isArray(robot.lockedRegisterMemory)
          ? robot.lockedRegisterMemory
          : [];
        return {
          ...robot,
          hand: [],
          // Vastgezette schade-registers zijn publiek (die voer je toch uit).
          registers: [0, 1, 2, 3, 4].map((i) => {
            if (i < unlocked) return null;
            const card = (robot.registers && robot.registers[i]) || memory[i] || null;
            return card ? { ...card } : null;
          }),
          lockedRegisterMemory: [0, 1, 2, 3, 4].map((i) => {
            if (i < unlocked) return null;
            const card = memory[i] || (robot.registers && robot.registers[i]) || null;
            return card ? { ...card } : null;
          }),
        };
      }),
    };
  },

  async createHostLobby(settings) {
    this.ensureBridge();
    this.setStatus("connecting");
    this.resolvePlayerId();
    const maxGuests = (CONFIG.P2P?.MAX_PLAYERS || 5) - 1;
    this.session = window.RobotRunP2P.createRoom({
      gameId: this.GAME_ID,
      transport: "p2p",
      maxGuests,
    });
    this.wireSession();
    const code = settings.roomCode
      ? await this.session.hostWithCode(String(settings.roomCode).trim().toUpperCase())
      : await this.session.host();
    this.localPeerId = this.getLocalPeerId() || code;
    this.peerToPlayer = {};
    this.onlineIds = new Set([this.playerId]);

    const hubChar = StorageManager.loadCharacter();
    const restored = settings.roomCode
      ? this.restoreFromLog(code, {
          name: settings.name || "RobotRun",
          difficulty: settings.difficulty || "normal",
          checkpointsCount:
            settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
          startingLives:
            settings.startingLives || CONFIG.DEFAULT_STARTING_LIVES,
          seed: settings.seed || (Date.now() >>> 0),
        })
      : null;

    if (!restored) this.ensureLog(code);

    const baseSettings = restored?.settings || {
      name: settings.name || "RobotRun",
      difficulty: settings.difficulty || "normal",
      checkpointsCount:
        settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
      startingLives:
        settings.startingLives || CONFIG.DEFAULT_STARTING_LIVES,
      seed: settings.seed || (Date.now() >>> 0),
    };

    let seats = restored?.seats?.length
      ? restored.seats.map((s) => ({ ...s, ready: false }))
      : [];
    const selfIdx = seats.findIndex((s) => s.userId === this.playerId);
    if (selfIdx < 0) {
      const seat = this.makeSeat(this.playerId, seats.length, hubChar);
      seats.push(seat);
      this.appendDesk("seat", {
        userId: seat.userId,
        robotId: seat.robotId,
        name: seat.name,
        color: seat.color,
        colors: seat.colors,
        style: seat.style,
      });
    } else {
      seats[selfIdx] = {
        ...seats[selfIdx],
        name: hubChar.name || seats[selfIdx].name,
        color: StorageManager.getPlayerColor(hubChar),
        colors: hubChar.colors || seats[selfIdx].colors,
        style: hubChar.style || seats[selfIdx].style,
        ready: false,
      };
      this.appendDesk("seat", {
        userId: seats[selfIdx].userId,
        robotId: seats[selfIdx].robotId,
        name: seats[selfIdx].name,
        color: seats[selfIdx].color,
        colors: seats[selfIdx].colors,
        style: seats[selfIdx].style,
      });
    }

    this.lobby = {
      hostId: code,
      roomCode: code,
      status:
        restored?.status === "playing" || restored?.status === "finished"
          ? restored.status
          : "lobby",
      settings: baseSettings,
      seats,
      boardData: restored?.boardData || null,
      gameState: restored?.gameState || null,
      updatedAt: Date.now(),
    };

    const session = StorageManager.createSession(
      this.lobby.settings.name,
      hubChar.name,
      this.lobby.settings.difficulty,
      null,
      CONFIG.GAME_MODES.P2P,
      seats.length,
      this.lobby.settings.checkpointsCount,
      this.lobby.settings.startingLives,
      {
        p2pRoomCode: code,
        p2pHostId: code,
        p2pSeed: this.lobby.settings.seed,
      },
    );
    this.localSessionId = session.id;
    this.persistActiveRoom();
    this.persistDesk();
    this.setStatus("online");
    window.RobotRunP2P?.writeRoomToUrl?.(this.GAME_PATH, code);

    if (
      (this.lobby.status === "playing" || this.lobby.status === "finished") &&
      this.lobby.boardData &&
      this.lobby.gameState
    ) {
      this.applyGameSnapshot(
        {
          boardData: this.lobby.boardData,
          gameState: this.lobby.gameState,
        },
        { enterPlay: true },
      );
      this.wireHostAutosnapshots();
    }

    this.renderLobbyUi();
    return { roomCode: code, session, lobby: this.lobby };
  },

  async joinRoom(roomCode) {
    if (this.joinInFlight) throw new Error("Join is al bezig…");
    this.joinInFlight = true;
    this.setStatus("connecting");
    try {
      this.ensureBridge();
      this.resolvePlayerId();
      const code = String(roomCode || "")
        .trim()
        .toUpperCase();
      if (!code) throw new Error("Voer een kamercode in.");

      if (this.session) await this.session.destroy();
      const maxGuests = (CONFIG.P2P?.MAX_PLAYERS || 5) - 1;
      this.session = window.RobotRunP2P.createRoom({
        gameId: this.GAME_ID,
        transport: "p2p",
        maxGuests,
      });
      this.wireSession();
      this.ensureLog(code);
      await this.session.join(code);

      this.localPeerId = this.getLocalPeerId();
      if (!this.localPeerId) {
        throw new Error("Geen peer-id na join. Probeer opnieuw.");
      }
      this.lobby = {
        hostId: code,
        roomCode: code,
        status: "lobby",
        settings: {},
        seats: [],
      };

      const hubChar = StorageManager.loadCharacter();
      const joinPayload = {
        userId: this.playerId,
        profile: {
          name: hubChar.name,
          color: hubChar.color,
          colors: hubChar.colors,
          style: hubChar.style,
        },
      };
      let sent = this.send("rr_seat_join", joinPayload);
      for (let i = 0; !sent && i < 8; i++) {
        await new Promise((r) => setTimeout(r, 80));
        sent = this.send("rr_seat_join", joinPayload);
      }
      if (!sent) {
        throw new Error("Kon join-bericht niet sturen. Host moet online blijven.");
      }

      const session = StorageManager.createSession(
        "RobotRun",
        hubChar.name,
        "normal",
        null,
        CONFIG.GAME_MODES.P2P,
        1,
        CONFIG.DEFAULT_CHECKPOINTS,
        CONFIG.DEFAULT_STARTING_LIVES,
        { p2pRoomCode: code, p2pHostId: code },
      );
      this.localSessionId = session.id;
      this.persistActiveRoom();
      this.persistDesk();
      this.setStatus("online");
      this.renderLobbyUi();
      return { roomCode: code, session, lobby: this.lobby };
    } catch (err) {
      this.setStatus("error", err.message || "Joinen mislukt");
      throw err;
    } finally {
      this.joinInFlight = false;
    }
  },

  async tryResumeActiveRoom() {
    const saved = this.loadPersistedRoom();
    if (!saved?.roomCode) return false;
    try {
      const asHost =
        saved.role === "host" ||
        saved.localPeerId === saved.hostId ||
        saved.roomCode === saved.hostId;
      if (asHost) {
        await this.createHostLobby({
          name: "RobotRun",
          roomCode: saved.roomCode,
        });
        if (saved.localSessionId) this.localSessionId = saved.localSessionId;
      } else {
        await this.joinRoom(saved.roomCode);
        if (saved.localSessionId) this.localSessionId = saved.localSessionId;
      }
      Toast.show("P2P-lobby hervat");
      return true;
    } catch {
      return false;
    }
  },

  async updateLocalSeatProfile(profile) {
    const seat = this.localSeat();
    if (!seat) return;
    Object.assign(seat, {
      name: profile.name || seat.name,
      color: StorageManager.getPlayerColor(profile),
      colors: StorageManager.normalizeColors(
        profile.colors || profile.color,
        profile.color || StorageManager.getPlayerColor(profile)
      ),
      style: profile.style || seat.style,
    });
    seat.color = seat.colors.head;
    if (this.isHost()) {
      this.lobby.updatedAt = Date.now();
      this.appendDesk("seat", {
        userId: seat.userId,
        robotId: seat.robotId,
        name: seat.name,
        color: seat.color,
        colors: seat.colors,
        style: seat.style,
      });
      this.broadcastLobby();
    } else {
      this.send("rr_seat_update", { userId: this.playerId, seat: { ...seat } });
    }
    this.renderLobbyUi();
  },

  hostMergeSeat(seat) {
    if (!this.isHost() || !this.lobby || !seat?.userId) return;
    const seats = this.lobby.seats || [];
    const idx = seats.findIndex((s) => s.userId === seat.userId);
    if (idx >= 0) {
      const robotId = seats[idx].robotId;
      seats[idx] = { ...seats[idx], ...seat, robotId };
    } else if (seats.length < (CONFIG.P2P?.MAX_PLAYERS || 5)) {
      if (!seat.robotId) seat.robotId = `player_${seats.length + 1}`;
      seats.push(seat);
      this.appendDesk("seat", {
        userId: seat.userId,
        robotId: seat.robotId,
        name: seat.name,
        color: seat.color,
        colors: seat.colors,
        style: seat.style,
      });
    }
    this.lobby.seats = seats;
    this.lobby.updatedAt = Date.now();

    // Mid-race profile update: paint robot with seat colors and republish.
    const app = window.RobotRallyApp;
    const merged = seats.find((s) => s.userId === seat.userId);
    if (app?.engine && merged?.robotId && this.lobby.status === "playing") {
      const robot = app.engine.robots.find((r) => r.id === merged.robotId);
      if (robot) {
        if (merged.name) robot.name = merged.name;
        if (merged.colors) {
          robot.colors = { ...merged.colors };
          robot.color = merged.colors.head || merged.color;
        } else if (merged.color) {
          robot.colors = StorageManager.makeColors(merged.color);
          robot.color = merged.color;
        }
        if (merged.style) robot.style = merged.style;
        this.publishSnapshot().catch(() => {});
      }
    }

    this.broadcastLobby();
    this.renderLobbyUi();
  },

  async setReady(ready) {
    const seat = this.localSeat();
    if (!seat) throw new Error("Je zit niet in deze lobby.");
    seat.ready = !!ready;
    if (this.isHost()) {
      this.lobby.updatedAt = Date.now();
      this.broadcastLobby();
    } else {
      this.send("rr_seat_ready", {
        userId: this.playerId,
        ready: !!ready,
        seat: { ...seat },
      });
    }
    this.renderLobbyUi();
  },

  async startRace() {
    if (!this.isHost()) throw new Error("Alleen de host start de race.");
    const seats = this.lobby?.seats || [];
    const minPlayers = CONFIG.P2P?.MIN_PLAYERS || 2;
    if (seats.length < minPlayers) {
      throw new Error(`Je hebt minstens ${minPlayers} spelers nodig.`);
    }
    if (!seats.every((seat) => seat.ready)) {
      throw new Error("Niet iedereen is ready.");
    }

    const app = window.RobotRallyApp;
    if (!app?.engine) throw new Error("Engine niet klaar.");

    const settings = this.lobby.settings || {};
    const seed = settings.seed || (Date.now() >>> 0);
    settings.seed = seed;
    this.lobby.settings = settings;

    const roster = seats.map((seat, index) => ({
      robotId: seat.robotId || `player_${index + 1}`,
      name: seat.name,
      colors: seat.colors || StorageManager.makeColors(seat.color),
      style: seat.style || "scout",
      peerUserId: seat.userId,
      userId: seat.userId,
    }));

    const slotCount = roster.length;
    const boardData = app.engine.serializeBoard(
      app.engine.generateRandomBoard(
        slotCount,
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

    this.lobby.status = "playing";
    this.lobby.boardData = boardData;
    this.lobby.gameState = app.engine.exportGameState();
    this.lobby.updatedAt = Date.now();

    this.appendDesk("start", {
      settings: { ...settings },
      seats: seats.map((s) => ({ ...s })),
      boardData,
      gameState: this.lobby.gameState,
    });

    this.broadcast("rr_game_start", {
      boardData,
      gameState: this.lobby.gameState,
      lobby: this.lobby,
    });

    if (this.localSessionId) {
      StorageManager.updateSession(this.localSessionId, {
        boardData,
        gameState: this.lobby.gameState,
        playerCount: roster.length,
        gameMode: CONFIG.GAME_MODES.P2P,
        p2pSeed: seed,
      });
      StorageManager.setActiveSession(this.localSessionId);
    }

    this.persistActiveRoom();
    app.sessionReady = true;
    if (app.ui) {
      app.ui.localP2pRobotId = this.localRobotId();
      app.ui.p2pHostMode = true;
      app.ui.programmingUnlockedRobotId = this.localRobotId();
      app.ui.resizeCanvas();
      app.ui.updateCardsUI();
    }
    SessionMenu.hideModal();
    Nav.switchTab("play");
    Toast.show("Race gestart — iedereen programmeert tegelijk.");
    this.setStatus("online");
    this.renderLobbyUi();
  },

  applyGameSnapshot(payload, { enterPlay = false } = {}) {
    const app = window.RobotRallyApp;
    if (!app?.engine) return;
    const boardData = payload.boardData;
    let gameState = payload.gameState;
    if (!boardData || !gameState) return;

    this.applyingSnapshot = true;
    try {
      const seats = this.lobby?.seats || [];
      const roster = seats.map((seat, index) => ({
        robotId: seat.robotId || `player_${index + 1}`,
        name: seat.name,
        colors: seat.colors || StorageManager.makeColors(seat.color),
        style: seat.style || "scout",
        peerUserId: seat.userId,
        userId: seat.userId,
      }));

      const isNewRound = app.engine?.roundNumber !== gameState.roundNumber;
      const isSameRoundProgramming = !isNewRound
        && app.engine?.phase === "programming"
        && gameState.phase === "programming";

      const prevSelected = isSameRoundProgramming && app.ui?.selectedRegisters
        ? app.ui.selectedRegisters.map((card) => (card ? { ...card } : null))
        : null;
      const prevRobotId = app.ui?.programmingRegistersRobotId || null;
      const localId = this.localRobotId();

      if (gameState.phase !== "programming" && gameState.phase !== "ready") {
        this._localCommittedRound = null;
        this._localCommittedRegisters = null;
      } else if (
        this._localCommittedRound != null
        && this._localCommittedRound !== gameState.roundNumber
      ) {
        this._localCommittedRound = null;
        this._localCommittedRegisters = null;
      }

      if (!this.isHost()) {
        gameState = this.sanitizeStateForLocalView(gameState, localId);
      }

      if (!app.engine.board || app.engine.board.id !== boardData.id || enterPlay) {
        app.engine.loadCourse(
          boardData.id,
          roster.length ? roster : StorageManager.loadPlayers(),
          CONFIG.GAME_MODES.P2P,
          Math.max(roster.length, gameState.playerCount || 2),
          boardData,
          {
            startRound: false,
            startingLives: this.lobby?.settings?.startingLives,
            rngSeed: this.lobby?.settings?.seed,
          },
        );
      }
      app.engine.importGameState(gameState);

      // Preserve local committed status on guest if host snapshot has not reflected it yet
      if (
        !this.isHost()
        && localId
        && (app.engine.phase === "programming" || app.engine.phase === "ready")
      ) {
        const isLocallyCommitted = this._localCommittedRound === app.engine.roundNumber;
        if (isLocallyCommitted) {
          if (!app.engine.isRobotCommitted(localId)) {
            if (!app.engine.committedRobotIds) app.engine.committedRobotIds = [];
            if (!app.engine.committedRobotIds.includes(localId)) {
              app.engine.committedRobotIds.push(localId);
            }
            const localRobot = app.engine.robots.find((r) => r.id === localId);
            if (localRobot && this._localCommittedRegisters) {
              const unlocked = app.engine.getUnlockedRegisterCount(localRobot);
              app.engine.ensureLockedRegisterMemory(localRobot);
              localRobot.registers = [0, 1, 2, 3, 4].map((i) => {
                if (i >= unlocked) {
                  return app.engine.getCardForLockedRegister(localRobot, i);
                }
                return this._localCommittedRegisters[i]
                  ? { ...this._localCommittedRegisters[i] }
                  : null;
              });
              app.engine.syncLockedRegisters(localRobot);
            }
            if (app.engine.isSimultaneousProgramming()) {
              app.engine.refreshReadyPhaseFromCommits();
            }
            // Host snapshot did not have our commit yet -> re-transmit commit intent to host
            this.send("rr_intent_commit", {
              robotId: localId,
              userId: this.playerId,
              registers: (this._localCommittedRegisters || []).map((card) => (card ? { ...card } : null)),
            });
          }
        }
      }

      // Extra safety: wipe foreign hands after import (D-robotrally matrix-session pattern).
      if (!this.isHost() && localId) {
        app.engine.robots.forEach((robot) => {
          if (robot.id === localId) return;
          if (app.engine.phase === "programming" || app.engine.phase === "ready") {
            robot.hand = [];
            robot.registers = [0, 1, 2, 3, 4].map((i) => (
              app.engine.isRegisterLocked(robot, i)
                ? app.engine.getCardForLockedRegister(robot, i)
                : null
            ));
          }
        });
      }
      this.applyLocalHubProfile();
      app.sessionReady = true;

      if (app.ui) {
        app.ui.localP2pRobotId = localId;
        app.ui.p2pHostMode = this.isHost();
        app.ui.syncLocalP2pRobotId?.();
        if (app.engine.phase === "programming") {
          app.ui.programmingUnlockedRobotId = localId;
          const committed = app.engine.isRobotCommitted?.(localId);
          if (!committed && prevSelected && (prevRobotId === localId || !prevRobotId)) {
            const localRobot = app.engine.robots.find((r) => r.id === localId);
            const lockedInit = app.ui.buildInitialSelectedRegisters(localRobot);
            app.ui.selectedRegisters = prevSelected.map((card, i) => (
              localRobot && app.engine.isRegisterLocked(localRobot, i)
                ? (lockedInit[i] || card)
                : card
            ));
            app.ui.programmingRegistersRobotId = localId;
            app.ui.programmingRegistersKey = `${app.engine.roundNumber}:${localId}`;
          } else if (isNewRound) {
            const localRobot = app.engine.robots.find((r) => r.id === localId);
            if (localRobot) {
              app.ui.selectedRegisters = app.ui.buildInitialSelectedRegisters(localRobot);
              app.ui.programmingRegistersRobotId = localId;
              app.ui.programmingRegistersKey = `${app.engine.roundNumber}:${localId}`;
              app.ui.clearMergeInputs?.();
            }
          }
        }
        app.ui.resizeCanvas();
        app.ui.updateCardsUI();
        app.ui.render();
      }

      if (enterPlay) {
        SessionMenu.hideModal?.();
        Nav.switchTab("play");
        if (!this.isHost()) this.sendLocalProfileUpdate();
        app.ui?.scheduleScrollBoardToTop?.({ delay: 50 });
      }
    } finally {
      this.applyingSnapshot = false;
      this.lastSnapshotAt = Date.now();
    }
  },

  async publishSnapshot(opts = {}) {
    if (!this.isHost() || !window.RobotRallyApp?.engine) return;
    const gameState = window.RobotRallyApp.engine.exportGameState();
    // Replay frames are local-only; shipping them bloated Play end-snaps and
    // made guests miss the return-to-programming packet.
    gameState.currentRoundReplayFrames = [];
    gameState.lastRoundReplay = null;
    const boardData = window.RobotRallyApp.engine.serializeBoard();
    this.lobby = this.lobby || {};
    this.lobby.status = gameState.phase === "finished" ? "finished" : "playing";
    this.lobby.boardData = boardData;
    this.lobby.gameState = gameState;
    this.lobby.updatedAt = Date.now();
    this.broadcast("rr_state_snapshot", { boardData, gameState });
    const now = Date.now();
    if (now - this._deskSnapAt > 2500 || gameState.phase === "finished") {
      this._deskSnapAt = now;
      this.appendDesk("snap", { boardData, gameState });
    } else {
      this.persistDesk();
    }
    if (this.localSessionId) {
      StorageManager.updateSession(this.localSessionId, { boardData, gameState });
    }
    this.persistActiveRoom();
    return opts;
  },

  async sendCommit(registers) {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    const app = window.RobotRallyApp;
    if (this.isHost()) {
      app?.engine?.commitRegistersForRobot(robotId, registers);
      await this.publishSnapshot();
      await this.maybeAutoStartExecution();
      return;
    }
    const currentRound = app?.engine?.roundNumber || 1;
    this._localCommittedRound = currentRound;
    this._localCommittedRegisters = (registers || []).map((card) => (card ? { ...card } : null));
    if (app?.engine) {
      app.engine.commitRegistersForRobot(robotId, registers);
    }
    this.send("rr_intent_commit", {
      robotId,
      userId: this.playerId,
      registers: (registers || []).map((card) => (card ? { ...card } : null)),
    });
  },

  async sendMerge(cardIds) {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    const ids = (cardIds || []).filter(Boolean);
    if (this.isHost()) {
      const ok = window.RobotRallyApp.engine.mergeHandCards(robotId, ids);
      if (!ok) throw new Error("Merge mislukt");
      await this.publishSnapshot();
      return;
    }
    this.send("rr_intent_merge", {
      robotId,
      userId: this.playerId,
      cardIds: ids,
    });
  },

  async sendTogglePowerDown() {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    const app = window.RobotRallyApp;
    if (this.isHost()) {
      app?.engine?.togglePowerDown(robotId);
      await this.publishSnapshot();
      return;
    }
    if (app?.engine) {
      app.engine.togglePowerDown(robotId);
      app.ui?.updateCardsUI?.();
      app.ui?.render?.();
      app.ui?.renderPlayerStatusBar?.();
    }
    this.send("rr_intent_power_down", {
      robotId,
      userId: this.playerId,
    });
  },

  async maybeAutoStartExecution() {
    if (!this.isHost()) return;
    const engine = window.RobotRallyApp?.engine;
    if (!engine || engine.phase !== "ready") return;
    await this.sendPlay();
  },

  async sendPlay() {
    if (!this.isHost()) throw new Error("Alleen de host mag Play drukken.");
    if (window.RobotRallyApp?.engine?.phase !== "ready") return;
    window.RobotRallyApp.engine.startExecution();
    await this.publishSnapshot({ persist: true });
    // No heartbeat during executing — rebroadcast start tip once so a
    // single dropped CHECKPOINT does not leave guests stuck on ready.
    clearTimeout(this._playStartRetipTimer);
    this._playStartRetipTimer = setTimeout(() => {
      if (!this.isActive() || !this.isHost()) return;
      if (window.RobotRallyApp?.engine?.phase !== "executing") return;
      this.publishSnapshot({ persist: false }).catch(() => {});
    }, 400);
  },

  async sendMatchReady() {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    if (this.isHost()) {
      window.RobotRallyApp.engine.setMatchReady(robotId);
      await this.publishSnapshot({ persist: true });
      return;
    }
    this.send("rr_intent_match_ready", {
      robotId,
      userId: this.playerId,
    });
  },

  async maybeFinishMatchCountdown() {
    if (!this.isHost()) return;
    const engine = window.RobotRallyApp?.engine;
    if (!engine || (engine.phase !== "match_countdown" && engine.phase !== "match_ready")) return;
    const endsAt = engine.matchCountdownEndsAt;
    if (endsAt != null && Date.now() < endsAt) return;
    engine.startMatchFromCountdown();
    await this.publishSnapshot({ persist: true });
    clearTimeout(this._countdownEndRetipTimer);
    this._countdownEndRetipTimer = setTimeout(() => {
      if (!this.isActive() || !this.isHost()) return;
      if (window.RobotRallyApp?.engine?.phase !== "programming") return;
      this.publishSnapshot({ persist: false }).catch(() => {});
    }, 400);
  },

  async sendUpgrade(upgradeId) {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    if (this.isHost()) {
      const engine = window.RobotRallyApp.engine;
      if (engine.phase === "match_ready" || engine.phase === "match_countdown") {
        const ok = engine.confirmMatchUpgrade(robotId, upgradeId);
        if (!ok) throw new Error("Upgrade kiezen lukt nu niet.");
      } else {
        engine.chooseUpgrade(upgradeId);
      }
      await this.publishSnapshot({ persist: true });
      return;
    }
    const sent = this.send("rr_intent_upgrade", {
      robotId,
      userId: this.playerId,
      upgradeId,
    });
    if (sent === false) throw new Error("Verbinding kwijt — upgrade niet verstuurd.");
  },

  handleMessage(msg) {
    const type = msg.type;
    const payload = msg.payload || {};

    if (type === "rr_lobby") {
      this.lobby = payload;
      if (this.lobby?.settings && !this.isHost()) {
        const s = this.lobby.settings;
        if (this.localSessionId) {
          StorageManager.updateSession(this.localSessionId, {
            name: s.name,
            difficulty: s.difficulty,
            checkpointsCount: s.checkpointsCount,
            startingLives: s.startingLives,
          });
        }
      }
      this.renderLobbyUi();
      return;
    }

    if (type === "rr_seat_join" && this.isHost()) {
      const userId = payload.userId || msg.fromPeerId;
      const { profile } = payload;
      if (!userId) return;
      if (msg.fromPeerId) this.peerToPlayer[msg.fromPeerId] = userId;
      this.onlineIds.add(userId);
      const existing = (this.lobby.seats || []).find((s) => s.userId === userId);
      if (existing) {
        if (profile) {
          existing.name = profile.name || existing.name;
          if (profile.color) existing.color = profile.color;
          if (profile.colors) existing.colors = profile.colors;
          if (profile.style) existing.style = profile.style;
        }
        this.lobby.updatedAt = Date.now();
        this.broadcastLobby();
        this.renderLobbyUi();
        if (
          this.lobby.status === "playing" &&
          this.lobby.boardData &&
          this.lobby.gameState &&
          msg.fromPeerId
        ) {
          this.session.sendTo(msg.fromPeerId, "rr_game_start", {
            boardData: this.lobby.boardData,
            gameState: this.lobby.gameState,
            lobby: this.lobby,
          });
        }
        return;
      }
      if ((this.lobby.seats || []).length >= (CONFIG.P2P?.MAX_PLAYERS || 5)) return;
      if (this.lobby.status === "playing" || this.lobby.status === "finished") {
        return;
      }
      const seat = this.makeSeat(userId, this.lobby.seats.length, profile || {});
      this.hostMergeSeat(seat);
      return;
    }

    if (type === "rr_seat_update" && this.isHost()) {
      if (payload.seat) this.hostMergeSeat(payload.seat);
      return;
    }

    if (type === "rr_seat_ready" && this.isHost()) {
      if (payload.seat) this.hostMergeSeat(payload.seat);
      return;
    }

    if (type === "rr_game_start") {
      if (payload.lobby) this.lobby = payload.lobby;
      this.applyGameSnapshot(payload, { enterPlay: !this.isHost() });
      return;
    }

    if (type === "rr_state_snapshot") {
      if (this.isHost()) return;
      this.applyGameSnapshot(payload);
      return;
    }

    if (!this.isHost()) return;

    if (type === "rr_tip_ack") {
      const tip = Number(payload.tipSeq) || 0;
      if (!tip || tip !== (this._truthTipSeq || 0)) return;
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      const userId = String(bound?.userId || payload.userId || "");
      if (!userId || userId === this.playerId) return;
      if (!this._tipAckedUserIds) this._tipAckedUserIds = new Set();
      this._tipAckedUserIds.add(userId);
      window.RobotRallyApp?.ui?.renderPlaybackOverlay?.();
      return;
    }

    if (type === "rr_intent_commit") {
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      if (!bound) return;
      if (bound.userId === this.playerId) return;
      const engine = window.RobotRallyApp?.engine;
      if (!engine) return;

      if (engine.phase !== "programming" && engine.phase !== "ready") {
        this._pendingGuestCommits = this._pendingGuestCommits || {};
        this._pendingGuestCommits[bound.robotId] = {
          userId: bound.userId,
          registers: payload.registers,
        };
        return;
      }

      engine.commitRegistersForRobot(
        bound.robotId,
        payload.registers,
      );
      this.publishSnapshot({ persist: true })
        .then(() => this.maybeAutoStartExecution())
        .catch(() => {});
      return;
    }

    if (type === "rr_intent_merge") {
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      if (!bound) return;
      if (bound.userId === this.playerId) return;
      window.RobotRallyApp.engine.mergeHandCards(bound.robotId, payload.cardIds);
      this.publishSnapshot().catch(() => {});
      return;
    }

    if (type === "rr_intent_power_down") {
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      if (!bound) return;
      if (bound.userId === this.playerId) return;
      window.RobotRallyApp.engine.togglePowerDown(bound.robotId);
      this.publishSnapshot().catch(() => {});
      return;
    }

    if (type === "rr_intent_match_ready") {
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      if (!bound) return;
      if (bound.userId === this.playerId) return;
      window.RobotRallyApp.engine.setMatchReady(bound.robotId);
      this.publishSnapshot().catch(() => {});
      return;
    }

    if (type === "rr_intent_upgrade") {
      const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
        this.lobby,
        payload,
        msg.fromPeerId,
        this.peerToPlayer || {},
      );
      if (!bound) return;
      if (bound.userId === this.playerId) return;
      const engine = window.RobotRallyApp.engine;
      if (engine.phase === "match_ready" || engine.phase === "match_countdown") {
        engine.confirmMatchUpgrade(bound.robotId, payload.upgradeId);
        this.publishSnapshot({ persist: true }).catch(() => {});
        return;
      }
      const choice = engine.currentUpgradeChoice;
      if (choice && choice.robotId === bound.robotId) {
        engine.chooseUpgrade(payload.upgradeId);
        this.publishSnapshot({ persist: true }).catch(() => {});
      }
    }
  },

  buildShareUrl() {
    if (!this.lobby?.roomCode || !this.session?.buildShareUrl) return "";
    return this.session.buildShareUrl(this.GAME_PATH, this.lobby.roomCode);
  },

  renderLobbyUi() {
    /* Standalone P2P lobby removed — multiplayer via room shell. */
  },

  wireHostAutosnapshots() {
    const app = window.RobotRallyApp;
    if (!app?.engine) return;
    const syncPhaseHeartbeat = (phase) => {
      // Every playing phase — including executing — rebroadcasts frozen last tip.
      // Mid-Play must NOT re-export live engine state (would reset guest animation).
      const shouldBeat = phase && phase !== "finished";
      if (!shouldBeat) {
        if (this._phaseHeartbeatTimer) clearInterval(this._phaseHeartbeatTimer);
        this._phaseHeartbeatTimer = null;
        this._phaseHeartbeatPhase = "";
        return;
      }
      if (this._phaseHeartbeatTimer && this._phaseHeartbeatPhase === phase) return;
      if (this._phaseHeartbeatTimer) clearInterval(this._phaseHeartbeatTimer);
      this._phaseHeartbeatPhase = phase;
      this._phaseHeartbeatTimer = setInterval(() => {
        if (!this.isActive() || !this.isHost() || this.applyingSnapshot) return;
        if (this.lobby?.status !== "playing") return;
        const livePhase = app.engine.phase;
        if (!livePhase || livePhase === "finished") {
          clearInterval(this._phaseHeartbeatTimer);
          this._phaseHeartbeatTimer = null;
          this._phaseHeartbeatPhase = "";
          return;
        }
        if (livePhase === "match_ready" || livePhase === "match_countdown") {
          const endsAt = app.engine.matchCountdownEndsAt;
          if (endsAt != null && Date.now() >= endsAt) {
            this.maybeFinishMatchCountdown().catch(() => {});
            return;
          }
        }
        if (livePhase === "upgrade_choice") {
          const choice = app.engine.currentUpgradeChoice;
          if (choice?.deadline != null && Date.now() >= choice.deadline) {
            app.engine.resolveUpgradeChoiceTimeout?.();
            this.publishSnapshot({ persist: true }).catch(() => {});
            return;
          }
        }
        if (livePhase === "programming" && app.engine.isSimultaneousProgramming?.()) {
          if (app.engine.programmingDeadline != null && Date.now() >= app.engine.programmingDeadline) {
            app.engine.resolveProgrammingTimeout?.();
          }
          app.engine.refreshReadyPhaseFromCommits?.();
          if (app.engine.phase === "ready") {
            this.publishSnapshot({ persist: true })
              .then(() => this.maybeAutoStartExecution())
              .catch(() => {});
            return;
          }
        }
        if (typeof this.rebroadcastLastTruth === "function") {
          if (this.rebroadcastLastTruth()) return;
        }
        this.publishSnapshot({ persist: false }).catch(() => {});
      }, 1000);
    };
    const previous = app.engine.onStateChange;
    app.engine.onStateChange = () => {
      if (typeof previous === "function") previous();
      if (!this.isActive() || !this.isHost() || this.applyingSnapshot) return;
      if (this.lobby?.status !== "playing") return;
      const phase = app.engine.phase;
      syncPhaseHeartbeat(phase);
      const prevPhase = this._lastEnginePhase;
      this._lastEnginePhase = phase;

      if (phase === "programming" && this._pendingGuestCommits) {
        let appliedAny = false;
        Object.entries(this._pendingGuestCommits).forEach(([robotId, data]) => {
          if (data?.registers) {
            app.engine.commitRegistersForRobot(robotId, data.registers, { silent: true });
            appliedAny = true;
          }
        });
        this._pendingGuestCommits = {};
        if (appliedAny) {
          this.maybeAutoStartExecution();
        }
      }

      // Local Play: do not flood peers with micro-step snapshots.
      if (phase === "executing") return;
      // Critical phase exits → persist + tip checkpoint.
      if (
        prevPhase === "executing"
        || prevPhase === "match_countdown"
        || phase === "finished"
      ) {
        clearTimeout(this._snapTimer);
        this.publishSnapshot({ persist: true }).catch(() => {});
        return;
      }
      clearTimeout(this._snapTimer);
      this._snapTimer = setTimeout(() => {
        this.publishSnapshot({ persist: true }).catch(() => {});
      }, 200);
    };
    // Start heartbeat for the phase already in effect (race boot, etc.).
    this._lastEnginePhase = app.engine.phase;
    syncPhaseHeartbeat(app.engine.phase);
  },
};

window.P2pSessionController = P2pSessionController;
