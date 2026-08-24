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
  connectionStatus: "idle",
  lastError: null,
  applyingSnapshot: false,
  joinInFlight: false,
  _snapTimer: null,

  isActive() {
    return !!(this.session && this.lobby);
  },

  isHost() {
    return this.session?.role === "host";
  },

  localSeat() {
    if (!this.lobby?.seats || !this.localPeerId) return null;
    return this.lobby.seats.find((s) => s.userId === this.localPeerId) || null;
  },

  localRobotId() {
    return this.localSeat()?.robotId || null;
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
    if (!this.lobby?.roomCode || !this.localPeerId) return;
    try {
      localStorage.setItem(
        this.activeRoomKey(),
        JSON.stringify({
          roomCode: this.lobby.roomCode,
          localSessionId: this.localSessionId,
          hostId: this.lobby.hostId,
          localPeerId: this.localPeerId,
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

  setStatus(status, errorMsg = null) {
    this.connectionStatus = status;
    this.lastError = errorMsg;
    this.renderLobbyUi();
  },

  stop() {
    if (this._snapTimer) clearTimeout(this._snapTimer);
    this._snapTimer = null;
    if (this.session) {
      this.session.destroy().catch(() => {});
    }
    this.session = null;
    this.lobby = null;
    this.localSessionId = null;
    this.localPeerId = null;
    this.connectionStatus = "idle";
    this.lastError = null;
    this.clearPersistedRoom();
  },

  makeSeat(userId, index, profile) {
    const color = StorageManager.getPlayerColor(profile);
    return {
      userId,
      robotId: `player_${index + 1}`,
      name: (profile?.name || `Speler ${index + 1}`).trim().slice(0, 24),
      color,
      colors: profile?.colors || StorageManager.makeColors(color),
      style: profile?.style || "scout",
      ready: false,
    };
  },

  renumberRobotIds() {
    (this.lobby.seats || []).forEach((seat, index) => {
      seat.robotId = `player_${index + 1}`;
    });
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
      this.lobby.seats = (this.lobby.seats || []).filter((seat) => seat.userId !== peerId);
      this.renumberRobotIds();
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
        return {
          ...robot,
          hand: [],
          registers: hideSecrets
            ? (robot.registers || []).map(() => null)
            : robot.registers,
        };
      }),
    };
  },

  async createHostLobby(settings) {
    this.ensureBridge();
    this.setStatus("connecting");
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

    const hubChar = StorageManager.loadCharacter();
    this.lobby = {
      hostId: code,
      roomCode: code,
      status: "lobby",
      settings: {
        name: settings.name || "RobotRun",
        difficulty: settings.difficulty || "normal",
        checkpointsCount:
          settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
        startingLives:
          settings.startingLives || CONFIG.DEFAULT_STARTING_LIVES,
        seed: settings.seed || (Date.now() >>> 0),
      },
      seats: [this.makeSeat(code, 0, hubChar)],
      updatedAt: Date.now(),
    };

    const session = StorageManager.createSession(
      this.lobby.settings.name,
      hubChar.name,
      this.lobby.settings.difficulty,
      null,
      CONFIG.GAME_MODES.P2P,
      1,
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
    this.setStatus("online");
    this.renderLobbyUi();
    return { roomCode: code, session, lobby: this.lobby };
  },

  async joinRoom(roomCode) {
    if (this.joinInFlight) throw new Error("Join is al bezig…");
    this.joinInFlight = true;
    this.setStatus("connecting");
    try {
      this.ensureBridge();
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
        userId: this.localPeerId,
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
      if (saved.localPeerId === saved.hostId || saved.roomCode === saved.hostId) {
        await this.createHostLobby({
          name: "RobotRun",
          seed: Date.now() >>> 0,
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
      colors: StorageManager.makeColors(StorageManager.getPlayerColor(profile)),
      style: profile.style || seat.style,
    });
    if (this.isHost()) {
      this.lobby.updatedAt = Date.now();
      this.broadcastLobby();
    } else {
      this.send("rr_seat_update", { userId: this.localPeerId, seat: { ...seat } });
    }
    this.renderLobbyUi();
  },

  hostMergeSeat(seat) {
    if (!this.isHost() || !this.lobby || !seat?.userId) return;
    const seats = this.lobby.seats || [];
    const idx = seats.findIndex((s) => s.userId === seat.userId);
    if (idx >= 0) seats[idx] = { ...seats[idx], ...seat };
    else if (seats.length < (CONFIG.P2P?.MAX_PLAYERS || 5)) seats.push(seat);
    this.renumberRobotIds();
    this.lobby.seats = seats;
    this.lobby.updatedAt = Date.now();
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
        userId: this.localPeerId,
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
        startingLives: settings.startingLives,
        rngSeed: seed,
      },
    );

    this.lobby.status = "playing";
    this.lobby.boardData = boardData;
    this.lobby.gameState = app.engine.exportGameState();
    this.lobby.updatedAt = Date.now();

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

      const prevSelected = app.ui?.selectedRegisters
        ? app.ui.selectedRegisters.map((card) => (card ? { ...card } : null))
        : null;
      const prevRobotId = app.ui?.programmingRegistersRobotId || null;
      const localId = this.localRobotId();

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
      if (!this.isHost() && localId) {
        app.engine.robots.forEach((robot) => {
          if (robot.id === localId) return;
          if (app.engine.phase === "programming" || app.engine.phase === "ready") {
            robot.hand = [];
            robot.registers = [null, null, null, null, null];
          }
        });
      }
      app.sessionReady = true;

      if (app.ui) {
        app.ui.localP2pRobotId = localId;
        app.ui.p2pHostMode = this.isHost();
        if (app.engine.phase === "programming") {
          app.ui.programmingUnlockedRobotId = localId;
          const committed = app.engine.isRobotCommitted?.(localId);
          if (!committed && prevSelected && prevRobotId === localId) {
            app.ui.selectedRegisters = prevSelected;
            app.ui.programmingRegistersRobotId = localId;
          }
        }
        app.ui.resizeCanvas();
        app.ui.updateCardsUI();
        app.ui.render();
      }

      if (enterPlay) {
        SessionMenu.hideModal();
        Nav.switchTab("play");
      }
    } finally {
      this.applyingSnapshot = false;
    }
  },

  async publishSnapshot() {
    if (!this.isHost() || !window.RobotRallyApp?.engine) return;
    const gameState = window.RobotRallyApp.engine.exportGameState();
    const boardData = window.RobotRallyApp.engine.serializeBoard();
    this.lobby = this.lobby || {};
    this.lobby.status = gameState.phase === "finished" ? "finished" : "playing";
    this.lobby.boardData = boardData;
    this.lobby.gameState = gameState;
    this.lobby.updatedAt = Date.now();
    this.broadcast("rr_state_snapshot", { boardData, gameState });
    if (this.localSessionId) {
      StorageManager.updateSession(this.localSessionId, { boardData, gameState });
    }
    this.persistActiveRoom();
  },

  async sendCommit(registers) {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error("Geen robot gekoppeld.");
    if (this.isHost()) {
      window.RobotRallyApp.engine.commitRegistersForRobot(robotId, registers);
      await this.publishSnapshot();
      return;
    }
    this.send("rr_intent_commit", {
      robotId,
      userId: this.localPeerId,
      registers: (registers || []).map((card) => (card ? { ...card } : null)),
    });
  },

  async sendPlay() {
    if (!this.isHost()) throw new Error("Alleen de host mag Play drukken.");
    window.RobotRallyApp.engine.startExecution();
    await this.publishSnapshot();
  },

  async sendUpgrade(upgradeId) {
    const robotId = this.localRobotId();
    if (this.isHost()) {
      window.RobotRallyApp.engine.chooseUpgrade(upgradeId);
      await this.publishSnapshot();
      return;
    }
    this.send("rr_intent_upgrade", {
      robotId,
      userId: this.localPeerId,
      upgradeId,
    });
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
      const userId = msg.fromPeerId || payload.userId;
      const { profile } = payload;
      if (!userId) return;
      if ((this.lobby.seats || []).some((s) => s.userId === userId)) return;
      if ((this.lobby.seats || []).length >= (CONFIG.P2P?.MAX_PLAYERS || 5)) return;
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

    if (type === "rr_intent_commit") {
      if (payload.userId === this.localPeerId) return;
      window.RobotRallyApp.engine.commitRegistersForRobot(
        payload.robotId,
        payload.registers,
      );
      this.publishSnapshot().catch(() => {});
      return;
    }

    if (type === "rr_intent_upgrade") {
      if (payload.userId === this.localPeerId) return;
      const choice = window.RobotRallyApp.engine.currentUpgradeChoice;
      if (choice && choice.robotId === payload.robotId) {
        window.RobotRallyApp.engine.chooseUpgrade(payload.upgradeId);
        this.publishSnapshot().catch(() => {});
      }
    }
  },

  buildShareUrl() {
    if (!this.lobby?.roomCode || !this.session?.buildShareUrl) return "";
    return this.session.buildShareUrl(this.GAME_PATH, this.lobby.roomCode);
  },

  renderLobbyUi() {
    P2pLobbyUi?.render?.(this);
  },

  wireHostAutosnapshots() {
    const app = window.RobotRallyApp;
    if (!app?.engine) return;
    const previous = app.engine.onStateChange;
    app.engine.onStateChange = () => {
      if (typeof previous === "function") previous();
      if (!this.isActive() || !this.isHost() || this.applyingSnapshot) return;
      if (this.lobby?.status !== "playing") return;
      clearTimeout(this._snapTimer);
      this._snapTimer = setTimeout(() => {
        this.publishSnapshot().catch(() => {});
      }, 200);
    };
  },
};

window.P2pSessionController = P2pSessionController;
