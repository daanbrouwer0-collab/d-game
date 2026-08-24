const SessionMenu = {
  selectedTransport: 'local',

  init() {
    this.overlay = document.getElementById('menu-overlay');
    this.viewNew = document.getElementById('menu-view-new');
    this.viewHome = document.getElementById('menu-view-home');
    this.viewPause = document.getElementById('menu-view-pause');
    this.viewP2pLobby = document.getElementById('menu-view-p2p-lobby');

    this.sessionNameInput = document.getElementById('session-name');
    this.sessionDifficultySelect = document.getElementById('session-difficulty');
    this.sessionCheckpointsSelect = document.getElementById('session-checkpoints');
    this.sessionLivesSelect = document.getElementById('session-lives');
    this.sessionSelect = document.getElementById('session-select');
    this.playerCountSelect = document.getElementById('session-player-count');
    this.playerHelp = document.getElementById('session-player-help');
    this.difficultyHelp = document.getElementById('session-difficulty-help');
    this.transportHelp = document.getElementById('session-transport-help');
    this.localFields = document.getElementById('local-session-fields');

    document.getElementById('btn-session-new-go')?.addEventListener('click', () => this.handleCreateSession());
    document.getElementById('btn-session-home-go')?.addEventListener('click', () => this.handleLoadSession());
    document.getElementById('btn-session-home-new')?.addEventListener('click', () => this.showView('new'));
    document.getElementById('btn-session-p2p-lobby')?.addEventListener('click', () => this.openP2pLobbyView());

    document.getElementById('btn-session-resume')?.addEventListener('click', () => this.hideModal());
    document.getElementById('btn-session-save')?.addEventListener('click', () => {
      if (window.RobotRallyApp?.saveActiveSession()) {
        this.populateSessionSelect();
      }
      this.hideModal();
    });
    document.getElementById('btn-session-pause-new')?.addEventListener('click', () => this.showView('new'));
    document.getElementById('btn-session-pause-load')?.addEventListener('click', () => this.showView('home'));
    this.playerCountSelect?.addEventListener('change', () => this.updatePlayerHelp());
    this.sessionDifficultySelect?.addEventListener('change', () => this.updateDifficultyHelp());

    document.querySelectorAll('.transport-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTransport(btn.dataset.transport || 'local');
      });
    });

    P2pLobbyUi.init();

    const sessions = StorageManager.loadSessions();
    if (sessions.length === 0) {
      this.showModal('new');
    } else {
      this.showModal('home');
    }

    this.setTransport('local');
    this.updatePlayerHelp();
    this.updateDifficultyHelp();

    this.handleIncomingP2pLink();
  },

  async handleIncomingP2pLink() {
    const room =
      window.RobotRunP2P?.readRoomFromUrl?.() ||
      new URLSearchParams(window.location.search).get("room");
    if (!room?.trim()) return;
    const asHost = Boolean(window.RobotRunP2P?.readHostIntentFromUrl?.());
    try {
      if (asHost) {
        await P2pSessionController.createHostLobby({
          name: "RobotRun",
          roomCode: room.trim().toUpperCase(),
        });
        P2pSessionController.wireHostAutosnapshots();
        Toast.show("Room opnieuw gehost");
      } else {
        await P2pSessionController.joinRoom(room.trim());
        Toast.show("Lobby gejoined via link");
      }
      if (window.RobotRunP2P?.clearRoomFromUrl) {
        window.RobotRunP2P.clearRoomFromUrl("/robotrun/");
      } else {
        const params = new URLSearchParams(window.location.search);
        params.delete("room");
        params.delete("as");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
      this.showModal("p2p-lobby");
    } catch (err) {
      Toast.show(err.message || (asHost ? "Hosten via link mislukt" : "Joinen via link mislukt"));
      this.openP2pLobbyView();
    }
  },

  setTransport(transport) {
    this.selectedTransport = transport === 'p2p' ? 'p2p' : 'local';
    document.querySelectorAll('.transport-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.transport === this.selectedTransport);
    });
    this.localFields?.classList.toggle('hidden', this.selectedTransport === 'p2p');
    const goBtn = document.getElementById('btn-session-new-go');
    if (goBtn) {
      goBtn.textContent = this.selectedTransport === 'p2p' ? 'Maak P2P lobby' : 'Start Game';
    }
    if (this.transportHelp) {
      this.transportHelp.textContent = this.selectedTransport === 'p2p'
        ? 'P2P: 2–5 spelers op eigen devices. Iedereen programmeert tegelijk; host drukt Play.'
        : 'Op één toestel: om de beurt programmeren (of 1vAI).';
    }
  },

  showModal(view = 'home') {
    this.overlay?.classList.remove('hidden');
    this.showView(view);
  },

  hideModal() {
    this.overlay?.classList.add('hidden');
  },

  openStartModal() {
    const app = window.RobotRallyApp;
    const active = StorageManager.getActiveSession();
    if (active && app?.sessionReady) {
      this.showModal('pause');
      const title = document.getElementById('pause-session-title');
      const meta = document.getElementById('pause-session-meta');
      if (title) title.textContent = active.name;
      if (meta) {
        const players = active.playerCount || (active.gameMode === CONFIG.GAME_MODES.VS_AI ? 1 : 2);
        const boardName = active.boardData?.name || 'Random Rally';
        const diff = active.difficulty || active.boardData?.difficulty || 'normal';
        const flags = active.checkpointsCount || active.boardData?.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS;
        const lives = StorageManager.clampStartingLives(
          active.startingLives != null ? active.startingLives : CONFIG.DEFAULT_STARTING_LIVES
        );
        const progress = active.gameState
          ? ` · ronde ${active.gameState.roundNumber || '?'}`
          : '';
        const modeLabel = StorageManager.isP2pSession(active) ? 'P2P' : '1 toestel';
        meta.textContent = `${modeLabel} · ${players} speler${players === 1 ? '' : 's'} · ${flags} vlaggen · ${lives}♥ · ${boardName} · ${diff}${progress}`;
      }
      return;
    }

    const sessions = StorageManager.loadSessions();
    this.showModal(sessions.length ? 'home' : 'new');
  },

  openP2pLobbyView() {
    P2pLobbyUi.render(P2pSessionController);
    this.showView('p2p-lobby');
  },

  showView(viewName) {
    if (this.viewNew) this.viewNew.classList.toggle('hidden', viewName !== 'new');
    if (this.viewHome) this.viewHome.classList.toggle('hidden', viewName !== 'home');
    if (this.viewPause) this.viewPause.classList.toggle('hidden', viewName !== 'pause');
    if (this.viewP2pLobby) this.viewP2pLobby.classList.toggle('hidden', viewName !== 'p2p-lobby');

    if (viewName === 'home') {
      this.populateSessionSelect();
    }
    if (viewName === 'p2p-lobby') {
      P2pLobbyUi.render(P2pSessionController);
    }
  },

  populateSessionSelect() {
    if (!this.sessionSelect) return;
    const sessions = StorageManager.loadSessions();
    this.sessionSelect.innerHTML = '';

    if (sessions.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Geen opgeslagen sessies';
      this.sessionSelect.appendChild(opt);
      return;
    }

    const ordered = [...sessions].sort((a, b) => {
      const aTime = Date.parse(a.savedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.savedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    });

    ordered.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      const players = s.playerCount || (s.gameMode === CONFIG.GAME_MODES.VS_AI || s.gameMode === 'vs_ai' ? 1 : 2);
      const diff = s.difficulty || s.boardData?.difficulty || 'normal';
      const flags = s.checkpointsCount || s.boardData?.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS;
      const lives = StorageManager.clampStartingLives(
        s.startingLives != null ? s.startingLives : CONFIG.DEFAULT_STARTING_LIVES
      );
      const boardName = s.boardData?.name || 'bord';
      const modeTag = StorageManager.isP2pSession(s) ? 'P2P · ' : '';
      let progress = 'nieuw';
      if (s.gameState) {
        const round = s.gameState.roundNumber || 1;
        const phase = s.gameState.phase || 'saved';
        progress = `R${round} · ${phase}`;
      }
      opt.textContent = `${s.gameState ? '💾 ' : ''}${modeTag}${s.name} (${players}p · ${flags}🚩 · ${lives}♥ · ${diff} · ${boardName} · ${progress})`;
      if (s.active) opt.selected = true;
      this.sessionSelect.appendChild(opt);
    });
  },

  updatePlayerHelp() {
    if (!this.playerHelp || !this.playerCountSelect) return;
    const playerCount = Number(this.playerCountSelect.value || 2);
    if (playerCount === 1) {
      this.playerHelp.textContent = 'Solo tegen de computer. Random bord met 2 startvakjes (jij + CPU).';
    } else {
      this.playerHelp.textContent = `${playerCount} spelers op één toestel. Random bord met S1–S${playerCount} naast elkaar. Voortgang wordt automatisch opgeslagen.`;
    }
  },

  updateDifficultyHelp() {
    if (!this.difficultyHelp || !this.sessionDifficultySelect) return;
    const difficulty = this.sessionDifficultySelect.value || 'normal';
    const text = {
      easy: 'Easy: minder lopende banden, muren, lasers en draaischijven.',
      normal: 'Normal: standaard hoeveelheid banden, muren, lasers en draaischijven.',
      hard: 'Hard: meer lopende banden, muren, lasers en draaischijven.'
    };
    this.difficultyHelp.textContent = text[difficulty] || text.normal;
  },

  async handleCreateSession() {
    const name = this.sessionNameInput?.value.trim() || 'Rally Session';
    const difficulty = this.sessionDifficultySelect?.value || 'normal';
    const checkpointsCount = Math.max(
      CONFIG.MIN_CHECKPOINTS,
      Math.min(CONFIG.MAX_CHECKPOINTS, Number(this.sessionCheckpointsSelect?.value || CONFIG.DEFAULT_CHECKPOINTS))
    );
    const startingLives = StorageManager.clampStartingLives(
      this.sessionLivesSelect?.value || CONFIG.DEFAULT_STARTING_LIVES
    );

    if (this.selectedTransport === 'p2p') {
      try {
        await P2pSessionController.createHostLobby({
          name,
          difficulty,
          checkpointsCount,
          startingLives,
          seed: Date.now() >>> 0
        });
        P2pSessionController.wireHostAutosnapshots();
        Toast.hide();
        this.showView('p2p-lobby');
        Toast.show('P2P lobby aangemaakt');
      } catch (err) {
        Toast.show(err.message || 'P2P lobby mislukt');
        this.openP2pLobbyView();
      }
      return;
    }

    const playerCount = Number(this.playerCountSelect?.value || 2);
    const gameMode = playerCount === 1 ? CONFIG.GAME_MODES.VS_AI : CONFIG.GAME_MODES.HOTSEAT;
    const players = StorageManager.loadPlayers();
    const charName = players[0]?.name || 'CyberBot';

    const engine = window.RobotRallyApp?.engine;
    const slotCount = engine
      ? engine.getSlotCount(gameMode, playerCount)
      : (playerCount === 1 ? 2 : playerCount);
    const boardData = engine
      ? engine.serializeBoard(engine.generateRandomBoard(slotCount, Date.now(), difficulty, checkpointsCount))
      : null;

    const session = StorageManager.createSession(
      name,
      charName,
      difficulty,
      boardData,
      gameMode,
      playerCount,
      checkpointsCount,
      startingLives
    );
    Toast.hide();
    this.hideModal();

    if (window.RobotRallyApp) {
      window.RobotRallyApp.onSessionChanged(session, { restoreState: false });
    }
  },

  handleLoadSession() {
    const selectedId = this.sessionSelect?.value;
    if (!selectedId) {
      this.showView('new');
      return;
    }
    StorageManager.setActiveSession(selectedId);
    const session = StorageManager.getActiveSession();
    if (!session) return;

    if (StorageManager.isP2pSession(session) && session.p2pRoomCode) {
      const saved = P2pSessionController.loadPersistedRoom?.();
      const asHost =
        saved?.roomCode === session.p2pRoomCode && saved?.role === "host";
      const start = asHost
        ? P2pSessionController.createHostLobby({
            name: session.name || "RobotRun",
            roomCode: session.p2pRoomCode,
          }).then(() => {
            P2pSessionController.wireHostAutosnapshots();
          })
        : P2pSessionController.joinRoom(session.p2pRoomCode);
      start
        .then(() => {
          Toast.hide();
          if (P2pSessionController.lobby?.status === "lobby") {
            this.showView("p2p-lobby");
          } else {
            this.hideModal();
          }
        })
        .catch((err) => {
          Toast.show(err.message || "P2P sessie laden mislukt");
        });
      return;
    }

    Toast.hide();
    this.hideModal();

    if (window.RobotRallyApp) {
      window.RobotRallyApp.onSessionChanged(session, { restoreState: true });
    }
  }
};
