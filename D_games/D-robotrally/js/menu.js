const SessionMenu = {
  selectedTransport: 'local',

  init() {
    this.overlay = document.getElementById('menu-overlay');
    this.viewNew = document.getElementById('menu-view-new');
    this.viewHome = document.getElementById('menu-view-home');
    this.viewPause = document.getElementById('menu-view-pause');
    this.viewMatrixLobby = document.getElementById('menu-view-matrix-lobby');

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
    document.getElementById('btn-session-home-back')?.addEventListener('click', () => this.hideModal());
    document.getElementById('btn-session-matrix-lobby')?.addEventListener('click', () => this.openMatrixLobbyView());

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

    MatrixLobbyUi.init();

    const sessions = StorageManager.loadSessions();
    if (sessions.length === 0) {
      this.showModal('new');
    } else {
      this.showModal('home');
    }

    this.setTransport('local');
    this.updatePlayerHelp();
    this.updateDifficultyHelp();

    // Background sync to discover invites even before opening lobby view
    this.bootstrapMatrixInviteWatch();
    this.handleIncomingMatrixLink().then(() => this.tryResumeMatrixLobby());
  },

  async tryResumeMatrixLobby() {
    if (typeof MatrixSessionController === 'undefined') return;
    // Don't steal focus if we just joined via invite link
    if (MatrixSessionController.isActive()) return;
    const saved = MatrixSessionController.loadPersistedRoom?.();
    if (!saved?.roomId) return;
    const auth = RobotRallyMatrix.loadSession();
    if (!auth) return;
    const resumed = await MatrixSessionController.tryResumeActiveRoom();
    if (resumed) this.showModal('matrix-lobby');
  },

  async handleIncomingMatrixLink() {
    if (typeof InviteShare === 'undefined') return;
    const invite = InviteShare.parseInviteFromLocation() || InviteShare.loadPendingInvite();
    if (!invite?.roomId) return;
    if (invite.game && invite.game !== 'robotrally') return;

    InviteShare.savePendingInvite({ ...invite, game: 'robotrally' });
    const auth = typeof RobotRallyMatrix !== 'undefined' ? RobotRallyMatrix.loadSession() : null;
    if (!auth) {
      this.openMatrixLobbyView();
      Toast.show('Log in via Multi Device om de uitnodiging te joinen.');
      return;
    }

    try {
      await MatrixSessionController.joinRoom(invite.roomId, { acceptInvite: true });
      InviteShare.clearPendingInvite();
      // Clean query params
      const url = new URL(window.location.href);
      ['join', 'matrixRoom', 'game', 'min', 'room'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + url.search);
      this.showModal('matrix-lobby');
      Toast.show('Lobby gejoined via uitnodigingslink');
    } catch (err) {
      this.openMatrixLobbyView();
      Toast.show(err.message || 'Joinen via link mislukt');
    }
  },

  bootstrapMatrixInviteWatch() {
    if (typeof MatrixSessionController === 'undefined') return;
    MatrixSessionController.startInviteWatch();
  },

  setTransport(transport) {
    this.selectedTransport = transport === 'matrix' ? 'matrix' : 'local';
    document.querySelectorAll('.transport-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.transport === this.selectedTransport);
    });
    this.localFields?.classList.toggle('hidden', this.selectedTransport === 'matrix');
    const goBtn = document.getElementById('btn-session-new-go');
    if (goBtn) {
      goBtn.textContent = this.selectedTransport === 'matrix' ? 'Maak Matrix lobby' : 'Start Game';
    }
    if (this.transportHelp) {
      this.transportHelp.textContent = this.selectedTransport === 'matrix'
        ? 'Matrix: 2–5 spelers op eigen devices. Iedereen programmeert tegelijk; host drukt Play.'
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
        const modeLabel = StorageManager.isMatrixSession(active) ? 'Matrix' : '1 toestel';
        meta.textContent = `${modeLabel} · ${players} speler${players === 1 ? '' : 's'} · ${flags} vlaggen · ${lives}♥ · ${boardName} · ${diff}${progress}`;
      }
      return;
    }

    const sessions = StorageManager.loadSessions();
    this.showModal(sessions.length ? 'home' : 'new');
  },

  openMatrixLobbyView() {
    const auth = RobotRallyMatrix.loadSession();
    document.getElementById('matrix-auth-warning')?.classList.toggle('hidden', !!auth);
    if (auth && !MatrixSessionController.isActive()) {
      MatrixSessionController.auth = auth;
      MatrixSessionController.startPolling();
    }
    MatrixLobbyUi.render(MatrixSessionController);
    this.showView('matrix-lobby');
  },

  showView(viewName) {
    if (this.viewNew) this.viewNew.classList.toggle('hidden', viewName !== 'new');
    if (this.viewHome) this.viewHome.classList.toggle('hidden', viewName !== 'home');
    if (this.viewPause) this.viewPause.classList.toggle('hidden', viewName !== 'pause');
    if (this.viewMatrixLobby) this.viewMatrixLobby.classList.toggle('hidden', viewName !== 'matrix-lobby');

    if (viewName === 'home') {
      this.populateSessionSelect();
    }
    if (viewName === 'matrix-lobby') {
      MatrixLobbyUi.render(MatrixSessionController);
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
      const modeTag = StorageManager.isMatrixSession(s) ? 'Matrix · ' : '';
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

    if (this.selectedTransport === 'matrix') {
      try {
        await MatrixSessionController.createHostLobby({
          name,
          difficulty,
          checkpointsCount,
          startingLives,
          seed: Date.now() >>> 0
        });
        MatrixSessionController.wireHostAutosnapshots();
        Toast.hide();
        this.showView('matrix-lobby');
        Toast.show('Matrix lobby aangemaakt');
      } catch (err) {
        Toast.show(err.message || 'Matrix lobby mislukt');
        if (String(err.message || '').includes('Log eerst in')) {
          this.openMatrixLobbyView();
        }
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

    if (StorageManager.isMatrixSession(session) && session.matrixRoomId) {
      MatrixSessionController.joinRoom(session.matrixRoomId, { acceptInvite: false })
        .then(() => {
          Toast.hide();
          if (MatrixSessionController.lobby?.status === 'lobby') {
            this.showView('matrix-lobby');
          } else {
            this.hideModal();
          }
        })
        .catch((err) => {
          Toast.show(err.message || 'Matrix sessie laden mislukt');
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
