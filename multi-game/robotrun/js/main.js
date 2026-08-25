window.RobotRallyApp = {
  engine: null,
  ui: null,
  autoSaveTimer: null,
  sessionReady: false,

  init() {
    this.engine = new RobotRallyEngine();
    const canvas = document.getElementById('board-canvas');

    if (canvas) {
      this.ui = new RobotRallyUI(canvas, this.engine);
    }

    this.setupAutoSave();

    Nav.init();
    SessionMenu.init();
    AppMenu.init();
    CharacterManager.init();

    this.renderCourseCards();
    this.initSettings();
    this.renderHelpUpgrades();

    // Refresh always lands on Home to pick a session — do not auto-resume.
    const players = StorageManager.loadPlayers();
    this.engine.loadCourse(null, players, CONFIG.GAME_MODES.HOTSEAT, 2);
    this.sessionReady = false;
    Toast.hide();

    if (this.ui) {
      this.ui.resizeCanvas();
      this.ui.updateCardsUI();
    }
  },

  setupAutoSave() {
    const previous = this.engine.onStateChange;
    this.engine.onStateChange = () => {
      if (typeof previous === 'function') previous();
      this.scheduleAutoSave();
      if (
        document.getElementById('screen-character')?.classList.contains('active')
      ) {
        CharacterManager?.refreshForCurrentTurn?.();
      }
    };

    window.addEventListener('pagehide', () => this.saveActiveSession());
    window.addEventListener('beforeunload', () => this.saveActiveSession());
  },

  scheduleAutoSave() {
    if (!this.sessionReady) return;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveActiveSession();
    }, 350);
  },

  applySession(session, { restoreState = true, regenerateBoard = false } = {}) {
    if (!session) return;

    const players = StorageManager.loadPlayers();
    const mode = StorageManager.normalizeGameMode(session);
    const playerCount = session.playerCount || 2;
    const slotCount = this.engine.getSlotCount(mode, playerCount);
    const difficulty = session.difficulty || session.boardData?.difficulty || 'normal';
    const checkpointsCount = Math.max(
      CONFIG.MIN_CHECKPOINTS,
      Math.min(
        CONFIG.MAX_CHECKPOINTS,
        Number(session.checkpointsCount || session.boardData?.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS)
      )
    );
    const startingLives = StorageManager.clampStartingLives(
      session.startingLives != null ? session.startingLives : CONFIG.DEFAULT_STARTING_LIVES
    );
    session.startingLives = startingLives;

    let boardData = session.boardData || null;
    if (regenerateBoard || !boardData) {
      boardData = this.engine.serializeBoard(
        this.engine.generateRandomBoard(slotCount, Date.now(), difficulty, checkpointsCount)
      );
      StorageManager.updateSession(session.id, {
        boardData,
        courseId: boardData.id,
        gameState: null,
        difficulty,
        checkpointsCount,
        startingLives
      });
      session.boardData = boardData;
      session.courseId = boardData.id;
      session.gameState = null;
      session.difficulty = difficulty;
      session.checkpointsCount = checkpointsCount;
      session.startingLives = startingLives;
    }

    const hasSave = !!(restoreState && session.gameState);
    this.engine.loadCourse(
      session.courseId || boardData.id,
      players,
      mode,
      playerCount,
      boardData,
      { startRound: !hasSave, startingLives }
    );

    if (hasSave) {
      const imported = this.engine.importGameState(session.gameState);
      if (imported) {
        this.engine.pushLog('Opgeslagen voortgang geladen — verder waar je was.');
      } else {
        this.engine.startNewRound();
        this.engine.pushLog('Save kon niet geladen worden; ronde opnieuw gestart op hetzelfde bord.');
      }
    }

    this.sessionReady = true;

    if (this.ui) {
      this.ui.robotAnimStates = {};
      this.ui.selectedRegisters = [null, null, null, null, null];
      this.ui.programmingUnlockedRobotId = null;
      this.ui.lastProgrammingRobotId = null;
      this.ui.resizeCanvas();
      this.ui.updateCardsUI();
    }

    this.renderCourseCards();
    this.saveActiveSession();
    CharacterManager?.refreshForCurrentTurn?.();
    Nav.switchTab('play');
  },

  onSessionChanged(session, options = {}) {
    this.applySession(session, options);
  },

  saveActiveSession() {
    const activeSession = StorageManager.getActiveSession();
    if (!this.sessionReady || !activeSession || !this.engine?.board) return false;

    const boardData = this.engine.serializeBoard();
    const gameState = this.engine.exportGameState();
    StorageManager.updateSession(activeSession.id, {
      boardData,
      courseId: boardData.id,
      gameState,
      difficulty: activeSession.difficulty || boardData.difficulty || 'normal',
      checkpointsCount: boardData.checkpointsCount || activeSession.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
      startingLives: StorageManager.clampStartingLives(
        activeSession.startingLives != null
          ? activeSession.startingLives
          : (this.engine.startingLives || CONFIG.DEFAULT_STARTING_LIVES)
      ),
      charName: this.engine.robots.find(r => !r.isBot)?.name || activeSession.charName,
      playerCount: this.engine.playerCount,
      gameMode: this.engine.gameMode,
      savedAt: new Date().toISOString()
    });
    return true;
  },

  regenerateBoardForActiveSession() {
    const activeSession = StorageManager.getActiveSession();
    if (!activeSession || !this.sessionReady) {
      Toast.show('Laad eerst een sessie via Home.');
      return;
    }
    if (!confirm('Nieuw random bord genereren? Huidige voortgang op dit bord gaat verloren.')) {
      return;
    }
    this.applySession(activeSession, { restoreState: false, regenerateBoard: true });
    Toast.show('Nieuw random bord klaar!');
  },

  onPlayersUpdated(players) {
    const roster = players || StorageManager.loadPlayers();
    this.engine.robots.forEach((robot) => {
      if (robot.isBot) return;
      const match = String(robot.id || '').match(/^player_(\d+)$/);
      const rosterIndex = match ? Number(match[1]) - 1 : -1;
      const profile = rosterIndex >= 0 ? roster[rosterIndex] : null;
      if (!profile) return;
      robot.name = profile.name;
      robot.colors = StorageManager.makeColors(StorageManager.getPlayerColor(profile));
      robot.color = robot.colors.head;
      robot.style = profile.style || robot.style;
    });
    const activeSession = StorageManager.getActiveSession();
    if (activeSession && roster[0]) {
      StorageManager.updateSession(activeSession.id, { charName: roster[0].name });
    }
    if (this.ui) {
      this.ui.updateCardsUI();
      this.ui.render();
    }
    this.scheduleAutoSave();
  },

  renderCourseCards() {
    const courseListEl = document.getElementById('course-list');
    if (!courseListEl) return;

    courseListEl.innerHTML = '';
    const activeSession = StorageManager.getActiveSession();
    const board = this.sessionReady ? this.engine?.board : null;
    const edgeLabel = {
      south: 'onderkant',
      north: 'bovenkant',
      west: 'linkerkant',
      east: 'rechterkant'
    };
    const difficultyLabel = {
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard'
    };

    const card = document.createElement('div');
    card.className = 'course-card active-course';
    if (board && this.sessionReady) {
      const starts = this.engine.getStartTiles(board);
      const diff = difficultyLabel[board.difficulty || activeSession?.difficulty] || 'Normal';
      card.innerHTML = `
        <h3>${board.name}</h3>
        <p>${board.desc || 'Parcours van deze sessie.'}</p>
        <div class="course-meta">
          <span>${board.width}x${board.height}</span>
          <span>CP ${board.checkpointsCount}</span>
          <span>${diff}</span>
        </div>
        <p class="course-extra">Starts S1–S${starts.length} naast elkaar aan de ${edgeLabel[board.startEdge] || 'rand'}. Moeilijkheid geldt alleen voor dit random bord.</p>
      `;
    } else {
      card.innerHTML = `<h3>Geen actieve sessie</h3><p>Open Home en laad of maak een sessie. Moeilijkheid bepaalt alleen hoe zwaar het random bord wordt.</p>`;
    }
    courseListEl.appendChild(card);

    if (activeSession && this.sessionReady) {
      const actions = document.createElement('div');
      actions.className = 'course-actions';
      actions.innerHTML = `
        <button type="button" class="btn success" id="btn-regen-board">Nieuw random bord</button>
        <button type="button" class="btn alt" id="btn-save-board-session">Sessie opslaan</button>
      `;
      courseListEl.appendChild(actions);
      actions.querySelector('#btn-regen-board')?.addEventListener('click', () => this.regenerateBoardForActiveSession());
      actions.querySelector('#btn-save-board-session')?.addEventListener('click', () => {
        this.saveActiveSession();
      });
    }
  },

  initSettings() {
    const soundToggle = document.getElementById('toggle-sound-settings');
    let soundOn = false;
    soundToggle?.addEventListener('click', () => {
      soundOn = !soundOn;
      soundToggle.textContent = `Geluid: ${soundOn ? 'AAN' : 'UIT'}`;
      soundToggle.setAttribute('aria-pressed', soundOn);
      Toast.show(`Geluid ${soundOn ? 'ingeschakeld' : 'uitgeschakeld'}`);
    });

    const resetBtn = document.getElementById('btn-reset-progress');
    resetBtn?.addEventListener('click', () => {
      if (confirm('Weet je zeker dat je alle sessies en instellingen wilt wissen?')) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        localStorage.removeItem(CONFIG.PLAYERS_KEY);
        Toast.show('Alle gegevens zijn gewist!');
        location.reload();
      }
    });
  },

  renderHelpUpgrades() {
    const list = document.getElementById('help-upgrade-list');
    if (!list || typeof UpgradeIcons === 'undefined' || !CONFIG.UPGRADES) return;

    list.innerHTML = CONFIG.UPGRADES.map(upgrade => `
      <div class="help-upgrade-row">
        <span class="help-upgrade-icon" aria-hidden="true">${UpgradeIcons.get(upgrade.id)}</span>
        <div class="help-upgrade-meta">
          <span class="help-upgrade-title">${upgrade.label}</span>
          <span class="help-upgrade-short">${upgrade.short}</span>
          <span class="help-upgrade-desc">${upgrade.desc}</span>
        </div>
      </div>
    `).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).get('embedded') === '1') return;
  window.RobotRallyApp.init();
});
