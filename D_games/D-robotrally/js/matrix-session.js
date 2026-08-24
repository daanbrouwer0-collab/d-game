/**
 * Matrix session controller for D-RobotRally.
 * Host is authoritative for game snapshots; guests send intents.
 * Includes: heartbeat/presence, rejoin, join-retry, hand redaction on import.
 */
const MatrixSessionController = {
  roomId: null,
  lobby: null,
  auth: null,
  syncToken: null,
  pollTimer: null,
  heartbeatTimer: null,
  seenEventIds: new Set(),
  localSessionId: null,
  applyingSnapshot: false,
  lastSnapshotAt: 0,
  lastHostHeartbeat: 0,
  connectionStatus: 'idle', // idle | connecting | online | host_offline | error
  lastError: null,
  joinInFlight: false,

  isActive() {
    return !!(this.roomId && this.auth);
  },

  isHost() {
    return !!(this.auth && this.lobby && this.lobby.hostId === this.auth.userId);
  },

  localSeat() {
    if (!this.lobby || !this.auth) return null;
    return (this.lobby.seats || []).find(seat => seat.userId === this.auth.userId) || null;
  },

  localRobotId() {
    return this.localSeat()?.robotId || null;
  },

  activeRoomKey() {
    return CONFIG.MATRIX?.ACTIVE_ROOM_KEY || 'd-games-rr-matrix-active';
  },

  persistActiveRoom() {
    if (!this.roomId || !this.auth) return;
    try {
      localStorage.setItem(this.activeRoomKey(), JSON.stringify({
        roomId: this.roomId,
        localSessionId: this.localSessionId,
        hostId: this.lobby?.hostId || null,
        userId: this.auth.userId,
        savedAt: Date.now()
      }));
    } catch {
      // ignore
    }
  },

  loadPersistedRoom() {
    try {
      const raw = localStorage.getItem(this.activeRoomKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  clearPersistedRoom() {
    try {
      localStorage.removeItem(this.activeRoomKey());
    } catch {
      // ignore
    }
  },

  setStatus(status, errorMsg = null) {
    this.connectionStatus = status;
    this.lastError = errorMsg;
    this.renderLobbyUi();
  },

  stop() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.roomId = null;
    this.lobby = null;
    this.syncToken = null;
    this.seenEventIds = new Set();
    this.localSessionId = null;
    this.lastHostHeartbeat = 0;
    this.connectionStatus = 'idle';
    this.lastError = null;
    this.clearPersistedRoom();
  },

  async ensureAuth() {
    this.auth = RobotRallyMatrix.loadSession();
    if (!this.auth) {
      throw new Error('Log eerst in met Matrix op de Multi Device-pagina.');
    }
    return this.auth;
  },

  async withRetry(label, fn, attempts = CONFIG.MATRIX?.JOIN_RETRY_ATTEMPTS || 4) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn(i);
      } catch (err) {
        lastErr = err;
        const retryable = !err?.status || err.status >= 500 || err.status === 429 || err.name === 'TypeError';
        if (!retryable || i === attempts - 1) break;
        await new Promise((r) => setTimeout(r, 400 * (i + 1) * (i + 1)));
      }
    }
    throw lastErr || new Error(`${label} mislukt`);
  },

  /**
   * Guests should not see other players' hands/registers while programming.
   * (Room events remain readable via Matrix API; this blocks casual UI/network dumps in-app.)
   */
  sanitizeStateForLocalView(gameState, localRobotId) {
    if (!gameState || !Array.isArray(gameState.robots)) return gameState;
    const phase = gameState.phase;
    const hideSecrets = phase === 'programming' || phase === 'ready';
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
            : robot.registers
        };
      })
    };
  },

  async createHostLobby(settings) {
    await this.ensureAuth();
    this.setStatus('connecting');
    const { roomId, lobby } = await this.withRetry('Lobby aanmaken', () => (
      RobotRallyMatrix.createLobbyRoom(this.auth, settings)
    ));
    this.roomId = roomId;
    this.lobby = lobby;
    this.seenEventIds = new Set();
    this.lastHostHeartbeat = Date.now();
    this.lobby.hostHeartbeat = this.lastHostHeartbeat;

    const hubChar = StorageManager.loadCharacter();
    const session = StorageManager.createSession(
      settings.name || 'Matrix Rally',
      hubChar.name,
      settings.difficulty || 'normal',
      null,
      CONFIG.GAME_MODES.MATRIX,
      1,
      settings.checkpointsCount,
      settings.startingLives,
      {
        matrixRoomId: roomId,
        matrixHostId: this.auth.userId,
        matrixSeed: lobby.settings.seed
      }
    );
    this.localSessionId = session.id;
    this.persistActiveRoom();
    this.startPolling();
    this.startHostHeartbeat();
    this.setStatus('online');
    this.renderLobbyUi();
    return { roomId, session, lobby };
  },

  async joinRoom(roomId, { acceptInvite = false } = {}) {
    if (this.joinInFlight) throw new Error('Join is al bezig…');
    this.joinInFlight = true;
    this.setStatus('connecting');
    try {
      await this.ensureAuth();
      await this.withRetry('Room joinen', async () => {
        try {
          await RobotRallyMatrix.joinRoom(this.auth, roomId);
        } catch (err) {
          // Already in room is OK; other errors bubble for retry/fail
          const msg = String(err?.message || '').toLowerCase();
          const already = err?.errcode === 'M_FORBIDDEN' && msg.includes('already');
          if (!already && err?.status !== 404) {
            // Some servers return 403 if already joined — probe lobby state next
            if (err?.status === 403 || err?.errcode === 'M_FORBIDDEN') {
              const probe = await RobotRallyMatrix.getLobbyState(this.auth, roomId);
              if (probe) return;
            }
            throw err;
          }
        }
      });

      this.roomId = roomId;
      this.lobby = await this.withRetry('Lobby laden', () => (
        RobotRallyMatrix.getLobbyState(this.auth, roomId)
      ));
      if (!RobotRallyMatrix.isRallyLobby(this.lobby)) {
        throw new Error('Dit is geen RobotRally Matrix-lobby.');
      }

      if (!(this.lobby.seats || []).some(seat => seat.userId === this.auth.userId)) {
        if ((this.lobby.seats || []).length >= (CONFIG.MATRIX?.MAX_PLAYERS || 5)) {
          throw new Error('Lobby is vol (max 5 spelers).');
        }
        if (this.lobby.status !== 'lobby') {
          throw new Error('Deze race is al gestart. Spectaten wordt nog niet ondersteund.');
        }
        const hubChar = StorageManager.loadCharacter();
        const seat = RobotRallyMatrix.makeSeat(this.auth.userId, this.lobby.seats.length, {
          name: hubChar.name,
          colors: hubChar.colors,
          style: hubChar.style,
          ready: false
        });
        this.lobby.seats.push(seat);
        this.lobby.updatedAt = Date.now();
        await this.withRetry('Seat claimen', () => (
          RobotRallyMatrix.sendEvent(this.auth, roomId, {
            op: 'seat_join',
            seat
          })
        ));
      }

      const hubChar = StorageManager.loadCharacter();
      const session = StorageManager.createSession(
        this.lobby.settings?.name || 'Matrix Rally',
        hubChar.name,
        this.lobby.settings?.difficulty || 'normal',
        this.lobby.boardData || null,
        CONFIG.GAME_MODES.MATRIX,
        (this.lobby.seats || []).length,
        this.lobby.settings?.checkpointsCount,
        this.lobby.settings?.startingLives,
        {
          matrixRoomId: roomId,
          matrixHostId: this.lobby.hostId,
          matrixSeed: this.lobby.settings?.seed
        }
      );
      this.localSessionId = session.id;
      this.lastHostHeartbeat = this.lobby.hostHeartbeat || Date.now();
      this.persistActiveRoom();
      this.startPolling();
      this.setStatus(this.isHostOnline() ? 'online' : 'host_offline');
      this.renderLobbyUi();

      if (this.lobby.status === 'playing' && this.lobby.gameState && this.lobby.boardData) {
        this.applyGameSnapshot(this.lobby, { enterPlay: true });
      }
      return { roomId, session, lobby: this.lobby };
    } catch (err) {
      this.setStatus('error', err.message || 'Joinen mislukt');
      throw err;
    } finally {
      this.joinInFlight = false;
    }
  },

  async tryResumeActiveRoom() {
    const saved = this.loadPersistedRoom();
    if (!saved?.roomId) return false;
    try {
      await this.ensureAuth();
      if (saved.userId && saved.userId !== this.auth.userId) {
        this.clearPersistedRoom();
        return false;
      }
      await this.joinRoom(saved.roomId, { acceptInvite: true });
      if (saved.localSessionId) this.localSessionId = saved.localSessionId;
      if (this.isHost()) {
        this.startHostHeartbeat();
        this.wireHostAutosnapshots();
      }
      Toast.show('Matrix-lobby hervat');
      return true;
    } catch (err) {
      this.setStatus('error', err.message || 'Hervatten mislukt');
      return false;
    }
  },

  isHostOnline() {
    if (this.isHost()) return true;
    if (!this.lastHostHeartbeat) return true; // unknown yet
    const stale = CONFIG.MATRIX?.HOST_STALE_MS || 25000;
    return (Date.now() - this.lastHostHeartbeat) < stale;
  },

  startHostHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (!this.isHost()) return;
    const beat = async () => {
      if (!this.isHost() || !this.roomId || !this.lobby) return;
      try {
        this.lobby.hostHeartbeat = Date.now();
        this.lobby.updatedAt = Date.now();
        this.lastHostHeartbeat = this.lobby.hostHeartbeat;
        await RobotRallyMatrix.putLobbyState(this.auth, this.roomId, this.lobby);
        await RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
          op: 'host_heartbeat',
          at: this.lobby.hostHeartbeat,
          userId: this.auth.userId
        });
        this.setStatus('online');
      } catch {
        this.setStatus('error', 'Host heartbeat mislukt — check je verbinding');
      }
    };
    beat();
    this.heartbeatTimer = setInterval(beat, CONFIG.MATRIX?.HOST_HEARTBEAT_MS || 8000);
  },

  async invite(matrixAddress) {
    if (!this.isHost()) throw new Error('Alleen de host kan uitnodigen.');
    const parsed = RobotRallyMatrix.parseMatrixId(matrixAddress);
    await this.withRetry('Uitnodigen', () => (
      RobotRallyMatrix.inviteUser(this.auth, this.roomId, parsed.userId)
    ));
    Toast.show(`Uitnodiging gestuurd naar ${RobotRallyMatrix.shortId(parsed.userId)}`);
  },

  async setReady(ready) {
    const seat = this.localSeat();
    if (!seat) throw new Error('Je zit niet in deze lobby.');
    seat.ready = !!ready;
    await this.withRetry('Ready sturen', () => (
      RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
        op: 'seat_ready',
        userId: this.auth.userId,
        ready: !!ready,
        seat: { ...seat }
      })
    ));
    if (this.isHost()) {
      await this.hostMergeSeat(seat);
    }
    this.renderLobbyUi();
  },

  async updateLocalSeatProfile(profile) {
    const seat = this.localSeat();
    if (!seat) return;
    Object.assign(seat, {
      name: profile.name || seat.name,
      color: StorageManager.getPlayerColor(profile),
      colors: StorageManager.makeColors(StorageManager.getPlayerColor(profile)),
      style: profile.style || seat.style
    });
    await RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
      op: 'seat_update',
      userId: this.auth.userId,
      seat: { ...seat }
    });
    if (this.isHost()) {
      await this.hostMergeSeat(seat);
    }
    this.renderLobbyUi();
  },

  async hostMergeSeat(seat) {
    if (!this.isHost() || !this.lobby) return;
    const seats = this.lobby.seats || [];
    const idx = seats.findIndex(s => s.userId === seat.userId);
    if (idx >= 0) seats[idx] = { ...seats[idx], ...seat };
    else if (seats.length < (CONFIG.MATRIX?.MAX_PLAYERS || 5)) seats.push(seat);
    this.renumberRobotIds();
    this.lobby.seats = seats;
    this.lobby.updatedAt = Date.now();
    this.lobby.hostHeartbeat = Date.now();
    await RobotRallyMatrix.putLobbyState(this.auth, this.roomId, this.lobby);
    this.persistActiveRoom();
    this.renderLobbyUi();
  },

  renumberRobotIds() {
    (this.lobby.seats || []).forEach((seat, index) => {
      seat.robotId = `player_${index + 1}`;
    });
  },

  async startRace() {
    if (!this.isHost()) throw new Error('Alleen de host start de race.');
    const seats = this.lobby?.seats || [];
    const minPlayers = CONFIG.MATRIX?.MIN_PLAYERS || 2;
    if (seats.length < minPlayers) {
      throw new Error(`Je hebt minstens ${minPlayers} spelers in de room nodig.`);
    }
    if (!seats.every(seat => seat.ready)) {
      throw new Error('Niet iedereen is ready.');
    }

    const app = window.RobotRallyApp;
    if (!app?.engine) throw new Error('Engine niet klaar.');

    const settings = this.lobby.settings || {};
    const seed = settings.seed || (Date.now() >>> 0);
    settings.seed = seed;
    this.lobby.settings = settings;

    const roster = seats.map((seat, index) => ({
      robotId: seat.robotId || `player_${index + 1}`,
      name: seat.name,
      colors: seat.colors || StorageManager.makeColors(seat.color),
      style: seat.style || 'scout',
      matrixUserId: seat.userId,
      userId: seat.userId
    }));

    const slotCount = roster.length;
    const boardData = app.engine.serializeBoard(
      app.engine.generateRandomBoard(
        slotCount,
        seed,
        settings.difficulty || 'normal',
        settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS
      )
    );

    app.engine.setRngSeed(seed);
    app.engine.loadCourse(
      boardData.id,
      roster,
      CONFIG.GAME_MODES.MATRIX,
      roster.length,
      boardData,
      {
        startRound: true,
        startingLives: settings.startingLives,
        rngSeed: seed
      }
    );

    this.lobby.status = 'playing';
    this.lobby.boardData = boardData;
    this.lobby.gameState = app.engine.exportGameState();
    this.lobby.hostHeartbeat = Date.now();
    this.lobby.updatedAt = Date.now();
    await RobotRallyMatrix.putLobbyState(this.auth, this.roomId, this.lobby);
    await RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
      op: 'game_start',
      boardData,
      gameState: this.lobby.gameState
    });

    if (this.localSessionId) {
      StorageManager.updateSession(this.localSessionId, {
        boardData,
        gameState: this.lobby.gameState,
        playerCount: roster.length,
        gameMode: CONFIG.GAME_MODES.MATRIX,
        matrixSeed: seed
      });
      StorageManager.setActiveSession(this.localSessionId);
    }

    this.persistActiveRoom();
    app.sessionReady = true;
    if (app.ui) {
      app.ui.localMatrixRobotId = this.localRobotId();
      app.ui.matrixHostMode = true;
      app.ui.programmingUnlockedRobotId = this.localRobotId();
      app.ui.resizeCanvas();
      app.ui.updateCardsUI();
    }
    SessionMenu.hideModal();
    Nav.switchTab('play');
    Toast.show('Race gestart — iedereen programmeert tegelijk.');
    this.setStatus('online');
    this.renderLobbyUi();
  },

  applyGameSnapshot(lobbyOrPayload, { enterPlay = false } = {}) {
    const app = window.RobotRallyApp;
    if (!app?.engine) return;
    const boardData = lobbyOrPayload.boardData;
    let gameState = lobbyOrPayload.gameState;
    if (!boardData || !gameState) return;

    this.applyingSnapshot = true;
    try {
      const seats = this.lobby?.seats || [];
      const roster = seats.map((seat, index) => ({
        robotId: seat.robotId || `player_${index + 1}`,
        name: seat.name,
        colors: seat.colors || StorageManager.makeColors(seat.color),
        style: seat.style || 'scout',
        matrixUserId: seat.userId,
        userId: seat.userId
      }));

      const prevSelected = app.ui?.selectedRegisters
        ? app.ui.selectedRegisters.map(card => (card ? { ...card } : null))
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
          CONFIG.GAME_MODES.MATRIX,
          Math.max(roster.length, gameState.playerCount || 2),
          boardData,
          {
            startRound: false,
            startingLives: this.lobby?.settings?.startingLives,
            rngSeed: this.lobby?.settings?.seed
          }
        );
      }
      app.engine.importGameState(gameState);
      // Extra safety: wipe foreign hands after import too
      if (!this.isHost() && localId) {
        app.engine.robots.forEach((robot) => {
          if (robot.id === localId) return;
          if (app.engine.phase === 'programming' || app.engine.phase === 'ready') {
            robot.hand = [];
            robot.registers = [null, null, null, null, null];
          }
        });
      }
      app.sessionReady = true;

      if (app.ui) {
        app.ui.localMatrixRobotId = localId;
        app.ui.matrixHostMode = this.isHost();
        if (app.engine.phase === 'programming') {
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
        Nav.switchTab('play');
      }
    } finally {
      this.applyingSnapshot = false;
      this.lastSnapshotAt = Date.now();
    }
  },

  async publishSnapshot() {
    if (!this.isHost() || !this.roomId || !window.RobotRallyApp?.engine) return;
    const gameState = window.RobotRallyApp.engine.exportGameState();
    const boardData = window.RobotRallyApp.engine.serializeBoard();
    this.lobby = this.lobby || {};
    this.lobby.status = gameState.phase === 'finished' ? 'finished' : 'playing';
    this.lobby.boardData = boardData;
    this.lobby.gameState = gameState;
    this.lobby.hostHeartbeat = Date.now();
    this.lobby.updatedAt = Date.now();
    await RobotRallyMatrix.putLobbyState(this.auth, this.roomId, this.lobby);
    await RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
      op: 'state_snapshot',
      gameState,
      boardData,
      at: Date.now()
    });
    if (this.localSessionId) {
      StorageManager.updateSession(this.localSessionId, { boardData, gameState });
    }
    this.persistActiveRoom();
  },

  async sendCommit(registers) {
    const robotId = this.localRobotId();
    if (!robotId) throw new Error('Geen robot gekoppeld.');
    if (!this.isHostOnline() && !this.isHost()) {
      throw new Error('Host lijkt offline. Wacht tot de host terug is.');
    }
    await this.withRetry('Commit sturen', () => (
      RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
        op: 'intent_commit',
        robotId,
        userId: this.auth.userId,
        registers: (registers || []).map(card => (card ? { ...card } : null))
      })
    ));
    if (this.isHost()) {
      window.RobotRallyApp.engine.commitRegistersForRobot(robotId, registers);
      await this.publishSnapshot();
    }
  },

  async sendPlay() {
    if (!this.isHost()) throw new Error('Alleen de host mag Play drukken.');
    await RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
      op: 'intent_play',
      userId: this.auth.userId
    });
    window.RobotRallyApp.engine.startExecution();
    await this.publishSnapshot();
  },

  async sendUpgrade(upgradeId) {
    const robotId = this.localRobotId();
    if (!this.isHostOnline() && !this.isHost()) {
      throw new Error('Host lijkt offline. Wacht tot de host terug is.');
    }
    await this.withRetry('Upgrade sturen', () => (
      RobotRallyMatrix.sendEvent(this.auth, this.roomId, {
        op: 'intent_upgrade',
        robotId,
        userId: this.auth.userId,
        upgradeId
      })
    ));
    if (this.isHost()) {
      window.RobotRallyApp.engine.chooseUpgrade(upgradeId);
      await this.publishSnapshot();
    }
  },

  async handleTimelineEvent(ev) {
    if (!ev || ev.type !== RobotRallyMatrix.EVENT_TYPE) return;
    if (ev.event_id && this.seenEventIds.has(ev.event_id)) return;
    if (ev.event_id) this.seenEventIds.add(ev.event_id);

    const content = ev.content || {};
    const op = content.op;

    if (op === 'host_heartbeat') {
      this.lastHostHeartbeat = content.at || Date.now();
      if (!this.isHost()) this.setStatus('online');
      return;
    }

    if (op === 'seat_join' || op === 'seat_update' || op === 'seat_ready') {
      if (this.isHost() && content.seat) {
        await this.hostMergeSeat(content.seat);
      }
      return;
    }

    if (op === 'game_start' || op === 'state_snapshot') {
      if (this.isHost() && op === 'state_snapshot' && ev.sender === this.auth.userId) return;
      this.lobby = this.lobby || {};
      if (content.boardData) this.lobby.boardData = content.boardData;
      if (content.gameState) this.lobby.gameState = content.gameState;
      this.lobby.status = 'playing';
      this.lastHostHeartbeat = Date.now();
      this.applyGameSnapshot(this.lobby, { enterPlay: op === 'game_start' && !this.isHost() });
      return;
    }

    if (!this.isHost()) return;

    if (op === 'intent_commit') {
      if (content.userId === this.auth.userId) return;
      window.RobotRallyApp.engine.commitRegistersForRobot(content.robotId, content.registers);
      await this.publishSnapshot();
      return;
    }

    if (op === 'intent_upgrade') {
      if (content.userId === this.auth.userId) return;
      const choice = window.RobotRallyApp.engine.currentUpgradeChoice;
      if (choice && choice.robotId === content.robotId) {
        window.RobotRallyApp.engine.chooseUpgrade(content.upgradeId);
        await this.publishSnapshot();
      }
    }
  },

  async poll() {
    if (!this.auth) return;
    try {
      const data = await RobotRallyMatrix.syncOnce(
        this.auth,
        this.syncToken,
        this.roomId ? 20000 : 0
      );
      this.syncToken = data.next_batch || this.syncToken;

      if (this.roomId) {
        const join = data.rooms?.join?.[this.roomId];
        if (join) {
          const stateEv = [...(join.state?.events || []), ...(join.timeline?.events || [])]
            .reverse()
            .find(ev => ev.type === RobotRallyMatrix.EVENT_TYPE && (ev.state_key === '' || ev.state_key == null) && ev.content?.seats);
          if (stateEv?.content) {
            const prevStatus = this.lobby?.status;
            this.lobby = stateEv.content;
            if (this.lobby.hostHeartbeat) {
              this.lastHostHeartbeat = this.lobby.hostHeartbeat;
            }
            this.renderLobbyUi();
            if (this.lobby.status === 'playing' && this.lobby.gameState) {
              if (!this.isHost()) {
                this.applyGameSnapshot(this.lobby, { enterPlay: prevStatus === 'lobby' });
              } else if (prevStatus === 'lobby') {
                this.applyGameSnapshot(this.lobby, { enterPlay: true });
              }
            }
          }
          for (const ev of (join.timeline?.events || [])) {
            await this.handleTimelineEvent(ev);
          }
        }

        if (!this.isHost()) {
          this.setStatus(this.isHostOnline() ? 'online' : 'host_offline');
        } else if (this.connectionStatus !== 'error') {
          this.setStatus('online');
        }
      }

      MatrixLobbyUi?.ingestSync?.(data);
    } catch (err) {
      if (err?.status === 401) {
        Toast.show('Matrix-sessie verlopen. Log opnieuw in.');
        this.stop();
        return;
      }
      this.setStatus('error', err.message || 'Verbinding verbroken — opnieuw proberen…');
    }
    const delay = !this.roomId
      ? 12000
      : (this.connectionStatus === 'error' || this.connectionStatus === 'host_offline'
        ? 2000
        : (this.lobby?.status === 'playing' ? 800 : 400));
    this.pollTimer = setTimeout(() => this.poll(), delay);
  },

  startPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.poll();
  },

  startInviteWatch() {
    this.ensureAuth().then(() => this.startPolling()).catch(() => {});
  },

  renderLobbyUi() {
    MatrixLobbyUi?.render?.(this);
  },

  wireHostAutosnapshots() {
    const app = window.RobotRallyApp;
    if (!app?.engine) return;
    const previous = app.engine.onStateChange;
    app.engine.onStateChange = () => {
      if (typeof previous === 'function') previous();
      if (!this.isActive() || !this.isHost() || this.applyingSnapshot) return;
      if (this.lobby?.status !== 'playing') return;
      clearTimeout(this._snapTimer);
      this._snapTimer = setTimeout(() => {
        this.publishSnapshot().catch(() => {});
      }, 200);
    };
  }
};

window.MatrixSessionController = MatrixSessionController;
