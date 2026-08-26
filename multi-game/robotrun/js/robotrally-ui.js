class RobotRallyUI {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.tileSize = 48;
    this.selectedRegisters = [null, null, null, null, null];
    this.mergeInputs = [null, null, null];
    this.slotTab = 'program';
    this.programmingRegistersRobotId = null;
    this.programmingRegistersKey = null;
    this.autoStepTimer = null;
    this.robotAnimStates = {};
    this.effectBursts = [];
    this.lastLaserSignature = '';
    this.programmingUnlockedRobotId = null;
    this.lastProgrammingRobotId = null;
    this.localP2pRobotId = null;
    this.p2pHostMode = false;
    this.isReplaying = false;
    this.replayPoseById = null;
    this.replayRunToken = 0;
    this._programTimerInterval = null;
    this._programTimerKey = '';
    this._programTimerDeadline = 0;
    this._programTimerExpiring = false;
    this._matchCountdownInterval = null;
    this._matchCountdownKey = '';

    this.initElements();
    this.bindEvents();
    this.bindEngine();
    this.applyPanelState();
    this.startAnimLoop();
  }

  initElements() {
    this.app = document.getElementById('app');
    this.hudCheckpoint = document.getElementById('hud-checkpoint');
    this.hudHp = document.getElementById('hud-hp');
    this.hudEnergy = document.getElementById('hud-energy');
    this.hudRegister = document.getElementById('hud-register');
    this.hudTurnPlayer = document.getElementById('hud-turn-player');
    this.playerStatusBar = document.getElementById('player-status-bar');
    this.playerStatusSpacer = document.getElementById('player-status-spacer');
    this._preferBoardTop = true;
    this._pinningBoard = false;
    this.panelTitle = document.getElementById('panel-title-text');
    this.cardsHandWrap = document.getElementById('cards-hand');
    this.btnPowerDown = document.getElementById('btn-power-down');
    this.btnConfirmProgram = document.getElementById('btn-confirm-program');
    this.btnStartExecution = document.getElementById('btn-start-execution');
    this.btnMatchReady = document.getElementById('btn-match-ready');
    this.gameOverOverlay = document.getElementById('game-over-overlay');
    this.goCard = document.getElementById('go-card');
    this.goTitle = document.getElementById('go-title');
    this.goStats = document.getElementById('go-stats');
    this.turnSummary = document.getElementById('turn-summary');
    this.programBoard = document.getElementById('program-board');
    this.actionLog = document.getElementById('action-log');
    this.selectionHint = document.getElementById('selection-hint');
    this.programmingPanel = document.getElementById('programming-panel');
    this.programTimer = document.getElementById('program-timer');
    this.programTimerFill = document.getElementById('program-timer-fill');
    this.programTimerLabel = null;
    this.upgradeShop = document.getElementById('upgrade-shop');
    this.gameWrap = document.getElementById('game-wrap');
    this.activePlayerCard = document.getElementById('active-player-card');
    this.activePlayerSwatch = document.getElementById('active-player-swatch');
    this.activePlayerName = document.getElementById('active-player-name');
    this.activePlayerText = document.getElementById('active-player-text');
    this.activePlayerStatus = document.getElementById('active-player-status');
    this.boardFrame = document.getElementById('board-frame');
    this.btnBoardReplay = document.getElementById('btn-board-replay');
    this.btnMergeCards = document.getElementById('btn-merge-cards');
    this.btnRules = document.getElementById('btn-rr-rules');
    this.rulesOverlay = document.getElementById('rules-overlay');
    this.rulesBody = document.getElementById('rules-body');
    this.slotTabsEl = document.getElementById('slot-tabs');
    this.programSlotsRow = document.getElementById('registers-row-program');
    this.mergeSlotsRow = document.getElementById('registers-row-merge');
    this.mergeOutputSlot = document.getElementById('merge-output-slot');
    this.playbackOverlay = document.getElementById('playback-overlay');
    this.playbackStatusCard = this.playbackOverlay?.querySelector('.playback-status-card') || null;
    this.playbackTitle = document.getElementById('playback-title');
    this.playbackText = document.getElementById('playback-text');
    this.upgradeChoiceOverlay = document.getElementById('upgrade-choice-overlay');
    this.upgradeChoiceTitle = document.getElementById('upgrade-choice-title');
    this.upgradeChoiceText = document.getElementById('upgrade-choice-text');
    this.upgradeChoiceList = document.getElementById('upgrade-choice-list');
    this.upgradeChoiceYou = document.getElementById('upgrade-choice-you');
    this.upgradeChoiceYouName = document.getElementById('upgrade-choice-you-name');
    this.upgradeChoiceRobot = document.getElementById('upgrade-choice-robot');
    this.bindBoardTopPin();
  }

  bindBoardTopPin() {
    const scroller = document.getElementById('screen-play');
    if (!scroller || this._boardPinBound) return;
    this._boardPinBound = true;
    scroller.addEventListener('scroll', () => {
      if (this._pinningBoard) return;
      const spacerH = this.playerStatusSpacer?.offsetHeight
        || Number.parseFloat(this.gameWrap?.style?.getPropertyValue('--player-status-h'))
        || 0;
      // Alleen "loslaten" als de speler bewust de statusbalk in beeld scrollt.
      this._preferBoardTop = scroller.scrollTop >= Math.max(0, spacerH - 12);
    }, { passive: true });
  }

  bindEngine() {
    this.engine.onStateChange = () => {
      // Setting canvas.width/height clears the bitmap — never do that every Play step.
      if (this.engine.phase !== 'executing') {
        this.resizeCanvas();
      }
      this.updateCardsUI();
    };
    this.engine.onLogMessage = () => {
      this.renderActionLog();
      this.renderInfoPanels();
      this.renderPlaybackOverlay();
      const currentRobot = this.getFocusedRobot();
      if (currentRobot) {
        this.renderActivePlayer(currentRobot);
      }
    };
  }

  bindEvents() {
    this.btnStartExecution?.addEventListener('click', () => this.handlePrimaryOverlayAction());
    this.btnMatchReady?.addEventListener('click', () => this.handleMatchReady());
    this.btnConfirmProgram?.addEventListener('click', () => this.runProgram());
    document.getElementById('btn-rr-leave-game')?.addEventListener('click', () => {
      this.leaveGame();
    });
    this.btnRules?.addEventListener('click', () => this.openRulesOverlay());
    document.getElementById('btn-rules-close')?.addEventListener('click', () => this.closeRulesOverlay());
    this.rulesOverlay?.addEventListener('click', (event) => {
      if (event.target === this.rulesOverlay) this.closeRulesOverlay();
    });
    this.btnBoardReplay?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.startBoardReplay();
    });
    this.btnPowerDown?.addEventListener('click', () => {
      const robot = this.getProgrammingRobot();
      if (!robot) return;
      this.engine.togglePowerDown(robot.id);
    });

    this.slotTabsEl?.querySelectorAll('.slot-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setSlotTab(btn.dataset.slotTab);
        this.updateCardsUI();
      });
    });

    this.programSlotsRow?.querySelectorAll('.register-slot[data-index]').forEach((slot) => {
      slot.addEventListener('click', () => {
        if (this.engine.phase !== 'programming') return;
        if (this.slotTab !== 'program') return;
        const index = Number(slot.dataset.index);
        const robot = this.getProgrammingRobot();
        if (!robot || this.engine.isRegisterLocked(robot, index)) return;
        if (this.selectedRegisters[index]) {
          this.selectedRegisters[index] = null;
          this.updateCardsUI();
        }
      });
    });

    this.mergeSlotsRow?.querySelectorAll('.merge-input-slot').forEach((slot) => {
      slot.addEventListener('click', () => {
        if (this.engine.phase !== 'programming') return;
        if (this.slotTab !== 'merge') return;
        const index = Number(slot.dataset.mergeIndex);
        if (this.mergeInputs[index]) {
          this.mergeInputs[index] = null;
          this.updateCardsUI();
        }
      });
    });

    this.btnMergeCards?.addEventListener('click', () => this.confirmMerge());
    this.mergeOutputSlot?.addEventListener('click', () => {
      if (this.mergeOutputSlot?.classList.contains('is-ready')) this.confirmMerge();
    });

    document.getElementById('btn-go-restart')?.addEventListener('click', () => {
      this.gameOverOverlay?.classList.add('hidden');
      const activeSession = StorageManager.getActiveSession();
      if (window.RobotRallyApp && activeSession) {
        const players = StorageManager.loadPlayers();
        const mode = StorageManager.normalizeGameMode(activeSession);
        window.RobotRallyApp.engine.loadCourse(
          activeSession.courseId,
          players,
          mode,
          activeSession.playerCount || 2,
          activeSession.boardData
        );
        StorageManager.updateSession(activeSession.id, { gameState: null });
        this.selectedRegisters = [null, null, null, null, null];
        this.robotAnimStates = {};
        this.updateCardsUI();
        return;
      }
      const players = StorageManager.loadPlayers();
      this.engine.loadCourse(null, players, CONFIG.GAME_MODES.HOTSEAT, 2);
      this.selectedRegisters = [null, null, null, null, null];
      this.updateCardsUI();
    });

    document.getElementById('btn-go-menu')?.addEventListener('click', () => {
      this.gameOverOverlay?.classList.add('hidden');
      Nav.switchTab('courses');
    });

    window.addEventListener('resize', () => {
      this.resizeCanvas();
    });
  }

  resizeCanvas() {
    if (!this.canvas || !this.engine.board) return;
    const frame = this.canvas.parentElement;
    const host = frame?.parentElement || frame;
    if (!host) return;

    const gridW = this.engine.board.width;
    const gridH = this.engine.board.height;
    // Full-width zoals eerder; spelerbalk staat erboven in de layout (niet eroverheen).
    const maxW = Math.max(320, host.clientWidth || window.innerWidth);
    const tile = Math.floor(maxW / gridW);
    this.tileSize = Math.max(24, Math.min(tile, 72));
    const nextW = gridW * this.tileSize;
    const nextH = gridH * this.tileSize;
    // Assigning canvas.width/height clears the drawing buffer → visible blink.
    if (this.canvas.width !== nextW) this.canvas.width = nextW;
    if (this.canvas.height !== nextH) this.canvas.height = nextH;
  }

  /** Scroll #screen-play so the board top sits at the viewport top (player bar above). */
  scrollBoardToTop({ smooth = false } = {}) {
    const scroller = document.getElementById('screen-play');
    const target = this.boardFrame
      || document.getElementById('board-frame')
      || document.getElementById('canvas-container');
    if (!scroller || !target) return;
    this.syncPlayerStatusSpacer();
    const sRect = scroller.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const next = scroller.scrollTop + (tRect.top - sRect.top);
    this._pinningBoard = true;
    this._preferBoardTop = true;
    scroller.scrollTo({ top: Math.max(0, next), behavior: smooth ? 'smooth' : 'auto' });
    requestAnimationFrame(() => {
      this._pinningBoard = false;
    });
  }

  scheduleScrollBoardToTop({ smooth = false, delay = 0 } = {}) {
    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.scrollBoardToTop({ smooth }));
      });
    };
    if (delay > 0) setTimeout(run, delay);
    else run();
  }

  /** Keep scroll-up pad equal to status bar height so play view starts on the board. */
  syncPlayerStatusSpacer() {
    const bar = this.playerStatusBar || document.getElementById('player-status-bar');
    const spacer = this.playerStatusSpacer || document.getElementById('player-status-spacer');
    const wrap = this.gameWrap || document.getElementById('game-wrap');
    if (!bar || !spacer || !wrap) return;
    const h = Math.ceil(bar.getBoundingClientRect().height || bar.offsetHeight || 0);
    const px = `${Math.max(0, h)}px`;
    if (wrap.style.getPropertyValue('--player-status-h') !== px) {
      wrap.style.setProperty('--player-status-h', px);
    }
  }

  maybeKeepBoardPinned() {
    if (this._preferBoardTop === false) return;
    const scroller = document.getElementById('screen-play');
    if (!scroller) return;
    this.syncPlayerStatusSpacer();
    const spacerH = this.playerStatusSpacer?.offsetHeight
      || Number.parseFloat(this.gameWrap?.style?.getPropertyValue('--player-status-h'))
      || 0;
    // Alleen terugzetten als de grijze statusbalk weer in de viewport zou komen.
    if (scroller.scrollTop < Math.max(0, spacerH - 8)) {
      this.scrollBoardToTop();
    }
  }

  startAnimLoop() {
    const loop = () => {
      this.updateRobotAnimStates();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  updateRobotAnimStates() {
    if (!this.engine || !this.engine.robots) return;

    if (this.isReplaying && this.replayPoseById) {
      this.engine.robots.forEach((robot) => {
        const pose = this.replayPoseById[robot.id];
        if (!pose || pose.eliminated || pose.x < 0 || pose.y < 0) {
          delete this.robotAnimStates[robot.id];
          return;
        }
        const targetAngle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][pose.dir] || 0;
        const state = this.robotAnimStates[robot.id] || {
          x: pose.x,
          y: pose.y,
          angle: targetAngle,
        };
        state.x += (pose.x - state.x) * 0.35;
        state.y += (pose.y - state.y) * 0.35;
        let delta = targetAngle - state.angle;
        while (delta < -Math.PI) delta += Math.PI * 2;
        while (delta > Math.PI) delta -= Math.PI * 2;
        state.angle += delta * 0.4;
        this.robotAnimStates[robot.id] = state;
      });
      return;
    }

    this.engine.robots.forEach(robot => {
      if (robot.x < 0 || robot.y < 0 || robot.eliminated) {
        delete this.robotAnimStates[robot.id];
        return;
      }

      if (!this.robotAnimStates[robot.id]) {
        this.robotAnimStates[robot.id] = {
          x: robot.x,
          y: robot.y,
          angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][robot.dir]
        };
      }

      const state = this.robotAnimStates[robot.id];
      const follow = this.engine.phase === 'executing' ? 0.42 : 0.22;
      const turnFollow = this.engine.phase === 'executing' ? 0.5 : 0.3;
      state.x += (robot.x - state.x) * follow;
      state.y += (robot.y - state.y) * follow;

      const targetAngle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][robot.dir];
      let delta = targetAngle - state.angle;
      while (delta < -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      state.angle += delta * turnFollow;
    });
  }

  updateCardsUI() {
    this.syncLocalP2pRobotId();
    const currentRobot = this.getFocusedRobot();
    if (!currentRobot || !this.engine.board) {
      // P2P guest can briefly miss seat mapping; still keep upgrade/ready overlays honest.
      if (this.isP2pMode() && this.engine.board) {
        this.renderUpgradeChoiceOverlay();
        this.renderPlaybackOverlay();
      }
      return;
    }

    // Play: keep DOM light so each micro-step does not rebuild the whole panel.
    if (this.engine.phase === 'executing') {
      this.syncProgrammingPrivacy(currentRobot);
      this.captureLaserEffects();
      this.applyModeState();
      this.renderActivePlayer(currentRobot);
      this.updatePanelTitle(currentRobot);
      this.renderHud();
      this.renderActionLog();
      this.renderPlaybackOverlay();
      this.updateButtons();
      this.syncExecutionTimer();
      return;
    }

    this.syncProgrammingPrivacy(currentRobot);
    this.captureLaserEffects();
    this.applyModeState();
    this.renderActivePlayer(currentRobot);
    this.updatePanelTitle(currentRobot);
    this.renderHand(currentRobot);
    this.renderRegisterSlots();
    this.renderMergeSlots();
    this.renderHud();
    this.renderProgramBoard();
    this.renderUpgradeShop(currentRobot);
    this.renderInfoPanels();
    this.renderActionLog();
    this.renderPlaybackOverlay();
    this.renderUpgradeChoiceOverlay();
    this.updateButtons();
    this.syncExecutionTimer();
    this.syncProgrammingTimer();
    this.syncMatchCountdown();

    if (this.engine.phase === 'finished') {
      // Room shell shows the shared end overlay; keep the board visible underneath.
      if (document.documentElement.classList.contains('dgame-embedded')) {
        this.gameOverOverlay?.classList.add('hidden');
      } else {
        this.showGameOverScreen();
      }
    } else {
      this.gameOverOverlay?.classList.add('hidden');
    }
  }

  isP2pMode() {
    return !!(this.engine?.isP2pMode?.() || this.engine?.gameMode === CONFIG.GAME_MODES.P2P);
  }

  isP2pHost() {
    return this.isP2pMode() && !!(this.p2pHostMode || P2pSessionController?.isHost?.());
  }

  updatePanelTitle(currentRobot) {
    if (!this.panelTitle) return;

    if (this.engine.phase === 'match_ready') {
      this.panelTitle.textContent = 'Start-upgrade';
      if (this.selectionHint) {
        const readyCount = (this.engine.matchReadyRobotIds || []).length;
        const total = this.engine.getMatchReadyHumans?.().length || 0;
        this.selectionHint.textContent = `Iedereen kiest een upgrade (${readyCount}/${total}).`;
      }
      return;
    }

    if (this.engine.phase === 'match_countdown') {
      this.panelTitle.textContent = 'Start over…';
      if (this.selectionHint) {
        this.selectionHint.textContent = 'Even wachten — daarna programmeer je 60 seconden.';
      }
      return;
    }

    if (this.engine.phase === 'programming') {
      if (!this.isProgrammingUnlocked(currentRobot)) {
        this.panelTitle.textContent = `Programmeer ${this.getDisplayPlayerName(currentRobot)}`;
        if (this.selectionHint) {
          this.selectionHint.textContent = 'Kaarten blijven verborgen tot je op de programmeerknop drukt.';
        }
        return;
      }
      this.panelTitle.textContent = `Kaarten voor ${this.getDisplayPlayerName(currentRobot)}`;
      if (this.selectionHint) {
        const powerDownText = currentRobot.pendingPowerDown
          ? ' Power down staat ingepland voor de volgende ronde.'
          : '';
        if (this.isP2pMode()) {
          const readyCount = (this.engine.committedRobotIds || []).length;
          const total = this.engine.getProgrammableHumans?.().length || 0;
          this.selectionHint.textContent = `P2P: programmeer tegelijk. Ready ${readyCount}/${total}.${powerDownText}`;
        } else {
          this.selectionHint.textContent = `Selecteer 5 kaarten. Klik op een bezette slot om die kaart weer te verwijderen.${powerDownText}`;
        }
      }
      return;
    }

    if (this.engine.phase === 'ready') {
      this.panelTitle.textContent = 'Alles staat klaar';
      if (this.selectionHint) {
        this.selectionHint.textContent = this.isP2pMode()
          ? 'Iedereen is ready — ronde start automatisch.'
          : 'Alle spelers hebben bevestigd. Druk op Play om de ronde af te spelen.';
      }
      return;
    }

    if (this.engine.phase === 'executing') {
      this.panelTitle.textContent = `Executie fase - register ${Math.min(this.engine.registerIndex + 1, 5)} van 5`;
      if (this.selectionHint) {
        this.selectionHint.textContent = 'Alleen het bord blijft zichtbaar terwijl de acties rustig worden afgespeeld.';
      }
      return;
    }

    if (this.engine.phase === 'upgrade_choice') {
      this.panelTitle.textContent = 'Upgrade kiezen';
      if (this.selectionHint) {
        this.selectionHint.textContent = 'Kies 1 upgrade uit 5 opties.';
      }
      return;
    }

    this.panelTitle.textContent = 'Ronde afgerond';
    if (this.selectionHint) {
      this.selectionHint.textContent = 'Start opnieuw of kies een ander parcours.';
    }
  }

  renderHand(currentRobot) {
    if (!this.cardsHandWrap) return;

    this.cardsHandWrap.innerHTML = '';
    if (this.engine.phase === 'programming' && !this.isProgrammingUnlocked(currentRobot)) {
      const info = document.createElement('div');
      info.className = 'cards-hand-message';
      info.textContent = 'Kaarten zijn verborgen. Druk eerst op de programmeerknop voor deze speler.';
      this.cardsHandWrap.appendChild(info);
      return;
    }

    const committed = this.isP2pMode() && currentRobot && this.engine.isRobotCommitted?.(currentRobot.id);
    if (committed && (this.engine.phase === 'programming' || this.engine.phase === 'ready')) {
      const info = document.createElement('div');
      info.className = 'cards-hand-message';
      const readyCount = (this.engine.committedRobotIds || []).length;
      const total = this.engine.getProgrammableHumans?.().length || 0;
      info.textContent = this.engine.phase === 'ready'
        ? 'Jouw programma staat klaar. Ronde start automatisch…'
        : `Jouw programma staat klaar. Wachten op anderen (${readyCount}/${total})…`;
      this.cardsHandWrap.appendChild(info);
      return;
    }

    if (this.engine.phase !== 'programming' || currentRobot.isBot) {
      const info = document.createElement('div');
      info.className = 'cards-hand-message';
      if (this.engine.phase === 'match_ready') {
        info.textContent = 'Kies een start-upgrade. Daarna wachten we op de anderen.';
      } else if (this.engine.phase === 'match_countdown') {
        info.textContent = 'Iedereen is klaar — het spel start zo.';
      } else if (this.engine.phase === 'ready') {
        info.textContent = 'Alle kaarten zijn bevestigd. Druk op Play om de acties op het bord te starten.';
      } else if (this.engine.phase === 'executing') {
        info.textContent = 'Registers worden rustig afgespeeld op het bord.';
      } else if (this.engine.phase === 'upgrade_choice') {
        info.textContent = 'Kies eerst een upgrade op het bord.';
      } else {
        info.textContent = 'Geen hand beschikbaar.';
      }
      this.cardsHandWrap.appendChild(info);
      return;
    }

    if (!currentRobot.hand.length) {
      const info = document.createElement('div');
      info.className = 'cards-hand-message';
      const locked = 5 - this.engine.getUnlockedRegisterCount(currentRobot);
      info.textContent = locked >= 5
        ? 'Alle registers staan vast door schade. Bevestig om door te gaan.'
        : 'Geen kaarten deze ronde.';
      this.cardsHandWrap.appendChild(info);
      return;
    }

    currentRobot.hand.forEach(card => {
      const isUsed = this.selectedRegisters.some(entry => entry && entry.id === card.id)
        || this.mergeInputs.some(entry => entry && entry.id === card.id);
      const cardEl = document.createElement('div');
      cardEl.className = `card-item ${isUsed ? 'selected' : ''}`;
      cardEl.setAttribute('data-type', card.type);
      cardEl.innerHTML = `
        <div class="card-priority">${card.priority}</div>
        <div class="card-icon">${card.icon}</div>
        <div class="card-label">${card.label}</div>
      `;

      if (!isUsed) {
        cardEl.addEventListener('click', () => {
          if (this.slotTab === 'merge') {
            const emptyMerge = this.mergeInputs.findIndex((entry) => entry === null);
            if (emptyMerge !== -1) {
              this.mergeInputs[emptyMerge] = card;
              this.updateCardsUI();
            }
            return;
          }
          const emptySlot = this.selectedRegisters.findIndex((entry, index) => (
            entry === null && !this.engine.isRegisterLocked(currentRobot, index)
          ));
          if (emptySlot !== -1) {
            this.selectedRegisters[emptySlot] = card;
            this.updateCardsUI();
          }
        });
      }

      this.cardsHandWrap.appendChild(cardEl);
    });
  }

  setSlotTab(tab) {
    this.slotTab = tab === 'merge' ? 'merge' : 'program';
    this.slotTabsEl?.querySelectorAll('.slot-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.slotTab === this.slotTab);
    });
    this.programSlotsRow?.classList.toggle('hidden', this.slotTab !== 'program');
    this.mergeSlotsRow?.classList.toggle('hidden', this.slotTab !== 'merge');
    // Avoid recursive updateCardsUI when called from within it — callers refresh.
  }

  clearMergeInputs() {
    this.mergeInputs = [null, null, null];
  }

  /** Startprogrammering: open slots leeg, vastgezette slots met vorige kaart. */
  buildInitialSelectedRegisters(robot) {
    return [0, 1, 2, 3, 4].map((i) => {
      if (robot && this.engine.isRegisterLocked(robot, i)) {
        return this.engine.getCardForLockedRegister(robot, i);
      }
      return null;
    });
  }

  ensureProgrammingRegisters(robot) {
    if (!robot || this.engine.phase !== 'programming') return;
    const roundKey = `${this.engine.roundNumber}:${robot.id}`;
    if (this.programmingRegistersKey === roundKey) return;
    this.programmingRegistersKey = roundKey;
    this.programmingRegistersRobotId = robot.id;
    this.selectedRegisters = this.buildInitialSelectedRegisters(robot);
    this.clearMergeInputs();
  }

  paintSlotEl(slot, card, { locked = false, isActive = false, emptyTitle = '' } = {}) {
    slot.classList.toggle('filled', !!card);
    slot.classList.toggle('locked-register', locked);
    slot.classList.toggle('active-register', isActive);
    slot.title = locked ? 'Vastgezet door schade' : emptyTitle;
    if (card) {
      slot.innerHTML = `
        <span class="register-num">${slot.dataset.index != null ? Number(slot.dataset.index) + 1 : (slot.dataset.mergeIndex != null ? ['A', 'B', 'C'][Number(slot.dataset.mergeIndex)] : 'OUT')}</span>
        ${locked ? '<span class="register-lock">vast</span>' : ''}
        <div class="card-icon">${card.icon}</div>
        <div class="card-label register-card-label">${card.label}</div>
      `;
    } else {
      const num = slot.dataset.index != null
        ? Number(slot.dataset.index) + 1
        : (slot.dataset.mergeIndex != null ? ['A', 'B', 'C'][Number(slot.dataset.mergeIndex)] : 'OUT');
      slot.innerHTML = `
        <span class="register-num">${num}</span>
        ${locked ? '<span class="register-lock">vast</span>' : ''}
      `;
    }
  }

  renderMergeSlots() {
    const robot = this.getProgrammingRobot();
    const canMerge = this.engine.phase === 'programming'
      && this.isProgrammingUnlocked(robot)
      && !(this.isP2pMode() && robot && this.engine.isRobotCommitted?.(robot.id));

    this.mergeSlotsRow?.querySelectorAll('.merge-input-slot').forEach((slot) => {
      const index = Number(slot.dataset.mergeIndex);
      const card = this.mergeInputs[index];
      this.paintSlotEl(slot, card, { emptyTitle: 'Merge-input' });
      slot.style.pointerEvents = canMerge ? '' : 'none';
    });

    const recipe = canMerge ? this.engine.resolveMergeRecipe(this.mergeInputs, robot) : null;
    const preview = recipe && CONFIG.getCardTypeDef
      ? CONFIG.getCardTypeDef(recipe.output)
      : null;
    if (this.mergeOutputSlot) {
      this.mergeOutputSlot.classList.toggle('is-ready', !!preview);
      if (preview) {
        this.mergeOutputSlot.innerHTML = `
          <span class="register-num">OUT</span>
          <div class="card-icon">${preview.icon}</div>
          <div class="card-label register-card-label">${preview.label}</div>
        `;
        this.mergeOutputSlot.title = 'Tik om te mergen';
      } else {
        this.mergeOutputSlot.innerHTML = '<span class="register-num">OUT</span>';
        this.mergeOutputSlot.title = 'Geen geldig recept';
        this.mergeOutputSlot.classList.remove('filled');
      }
      this.mergeOutputSlot.classList.toggle('filled', !!preview);
    }

    const showMergeBtn = this.slotTab === 'merge' && !!preview && canMerge;
    this.btnMergeCards?.classList.toggle('hidden', !showMergeBtn);
    if (this.btnMergeCards) this.btnMergeCards.disabled = !showMergeBtn;
  }

  confirmMerge() {
    if (this.engine.phase !== 'programming') return;
    const robot = this.getProgrammingRobot();
    if (!robot) return;
    if (this.isP2pMode() && this.engine.isRobotCommitted?.(robot.id)) {
      Toast.show('Je programma staat al klaar.');
      return;
    }
    const ids = this.mergeInputs.filter(Boolean).map((c) => c.id);
    if (ids.length < 2) {
      Toast.show('Kies 2 of 3 kaarten om te mergen.');
      return;
    }

    if (this.isP2pMode() && P2pSessionController?.isActive?.()) {
      P2pSessionController.sendMerge(ids)
        .then(() => {
          this.clearMergeInputs();
          this.selectedRegisters = this.selectedRegisters.map((card) => (
            card && ids.includes(card.id) ? null : card
          ));
          this.updateCardsUI();
        })
        .catch((err) => Toast.show(err?.message || 'Merge mislukt'));
      return;
    }

    if (!this.engine.mergeHandCards(robot.id, ids)) {
      Toast.show('Geen geldige merge');
      return;
    }
    this.clearMergeInputs();
    this.selectedRegisters = this.selectedRegisters.map((card) => (
      card && ids.includes(card.id) ? null : card
    ));
    this.updateCardsUI();
  }

  renderRegisterSlots() {
    const currentRobot = this.getFocusedRobot();
    const committed = this.isP2pMode() && currentRobot && this.engine.isRobotCommitted?.(currentRobot.id);
    const hideCommittedCards = committed
      && (this.engine.phase === 'programming' || this.engine.phase === 'ready');

    let displayCards = [null, null, null, null, null];
    if (hideCommittedCards) {
      // Open slots verbergen na bevestigen; vastgezette schade-locks blijven zichtbaar.
      displayCards = this.buildInitialSelectedRegisters(currentRobot);
    } else if (this.engine.phase === 'programming' && currentRobot) {
      if (this.isProgrammingUnlocked(currentRobot)) {
        this.ensureProgrammingRegisters(currentRobot);
        displayCards = this.selectedRegisters;
      } else {
        // Privacy: toon wel vastgezette kaarten (die weet iedereen straks toch)
        displayCards = this.buildInitialSelectedRegisters(currentRobot);
      }
    } else {
      displayCards = (currentRobot && currentRobot.registers) || [null, null, null, null, null];
    }

    const slots = this.programSlotsRow
      ? this.programSlotsRow.querySelectorAll('.register-slot[data-index]')
      : document.querySelectorAll('#registers-row-program .register-slot[data-index]');
    slots.forEach((slot) => {
      const index = Number(slot.dataset.index);
      const card = displayCards[index];
      const locked = !!(currentRobot && this.engine.phase === 'programming'
        && this.engine.isRegisterLocked(currentRobot, index));
      const isActive = this.engine.phase === 'executing' && this.engine.registerIndex === index;
      slot.classList.toggle('filled', !!card);
      slot.classList.toggle('locked-register', locked);
      slot.classList.toggle('active-register', isActive);
      slot.classList.toggle('committed-empty', hideCommittedCards && !locked);
      slot.title = hideCommittedCards && !card
        ? 'Programma bevestigd'
        : (locked ? 'Vastgezet door schade' : '');

      if (card) {
        slot.innerHTML = `
          <span class="register-num">${index + 1}</span>
          ${locked ? '<span class="register-lock">vast</span>' : ''}
          <div class="card-icon">${card.icon}</div>
          <div class="card-label register-card-label">${card.label}</div>
        `;
      } else {
        slot.innerHTML = `
          <span class="register-num">${index + 1}</span>
          ${locked ? '<span class="register-lock">vast</span>' : ''}
          ${hideCommittedCards ? '<span class="register-lock">klaar</span>' : ''}
        `;
      }
    });
  }

  renderHud() {
    const focusRobot = this.getFocusedRobot();
    if (!this.engine.board || !this.engine.robots.length) return;
    const maxCp = this.engine.board.checkpointsCount;
    const alive = this.engine.robots.filter(robot => !robot.eliminated);

    if (this.hudTurnPlayer && focusRobot) {
      const color = this.getRobotColor(focusRobot);
      this.hudTurnPlayer.textContent = this.engine.phase === 'executing'
        ? `Actie: ${this.getExecutionHeadline()}`
        : this.getDisplayPlayerName(focusRobot);
      this.hudTurnPlayer.style.setProperty('--player-glow', color);
      this.hudTurnPlayer.style.borderColor = `${color}88`;
      this.hudTurnPlayer.style.color = color;
    }

    if (this.hudCheckpoint) {
      if (alive.length > 3) {
        this.hudCheckpoint.textContent = alive
          .map(robot => `${this.shortName(robot, 6)} ${Math.min(robot.checkpoint, maxCp)}`)
          .join(' · ');
      } else {
        this.hudCheckpoint.textContent = alive
          .map(robot => `${this.shortName(robot)} ${Math.min(robot.checkpoint, maxCp)}/${maxCp}`)
          .join(' · ');
      }
    }

    if (this.hudHp && focusRobot) {
      this.hudHp.textContent = `HP ${focusRobot.hp}/${focusRobot.maxHp} (${focusRobot.lives}❤)`;
    }

    if (this.hudRegister) {
      if (this.engine.phase === 'match_ready') {
        this.hudRegister.textContent = 'Upgrade kiezen';
      } else if (this.engine.phase === 'match_countdown') {
        this.hudRegister.textContent = 'Start over…';
      } else if (this.engine.phase === 'programming') {
        this.hudRegister.textContent = `R${this.engine.roundNumber} · programmeren`;
      } else if (this.engine.phase === 'ready') {
        this.hudRegister.textContent = `R${this.engine.roundNumber} · klaar`;
      } else if (this.engine.phase === 'executing') {
        this.hudRegister.textContent = `R${this.engine.roundNumber} · reg ${Math.min(this.engine.registerIndex + 1, 5)}`;
      } else if (this.engine.phase === 'upgrade_choice') {
        this.hudRegister.textContent = 'Upgrade kiezen';
      } else {
        this.hudRegister.textContent = 'Klaar';
      }
    }

    this.renderPlayerStatusBar();
  }

  getUpgradeIconSvg(upgradeId) {
    return UpgradeIcons.get(upgradeId);
  }

  renderPlayerStatusBar() {
    if (!this.playerStatusBar || !this.engine.board) return;

    const turnRobot = this.getProgrammingRobot();
    const maxCp = this.engine.board.checkpointsCount || 1;
    const maxLives = this.engine.startingLives || CONFIG.DEFAULT_STARTING_LIVES || CONFIG.STARTING_LIVES || 3;
    const maxUpgrades = CONFIG.MAX_UPGRADES || 4;
    const localId = this.isP2pMode() ? this.localP2pRobotId : null;
    let robots = this.engine.robots.filter(robot => !robot.eliminated);
    if (localId) {
      robots = [
        ...robots.filter((r) => r.id === localId),
        ...robots.filter((r) => r.id !== localId),
      ];
    }
    const scrollLeft = this.playerStatusBar.scrollLeft;

    if (!robots.length) {
      this.playerStatusBar.innerHTML = '<div class="player-status-empty">Geen actieve spelers</div>';
      this.syncPlayerStatusSpacer();
      this.maybeKeepBoardPinned();
      return;
    }

    this.playerStatusBar.innerHTML = robots.map(robot => {
      const color = this.getRobotColor(robot);
      const currentTarget = Math.max(1, robot.checkpoint || 1);
      const maxHp = Math.max(1, robot.maxHp || 9);
      const hp = Math.max(0, Math.min(maxHp, robot.hp != null ? robot.hp : maxHp));
      const lifeRatio = hp / maxHp;
      const livesLeft = Math.max(0, robot.lives || 0);
      const isYou = !!(localId && robot.id === localId);
      const matchGate = this.engine.phase === 'match_ready' || this.engine.phase === 'match_countdown';
      const isMatchReady = matchGate && this.engine.isRobotMatchReady?.(robot.id);
      const isTurn = matchGate
        ? (this.engine.phase === 'match_ready' && !isMatchReady)
        : this.isP2pMode()
          ? ((this.engine.phase === 'programming' || this.engine.phase === 'ready') && !this.engine.isRobotCommitted?.(robot.id))
          : (this.engine.phase === 'programming' && turnRobot && turnRobot.id === robot.id);
      const isReady = matchGate
        ? !!isMatchReady
        : (this.isP2pMode() && this.engine.isRobotCommitted?.(robot.id));
      const isDown = robot.needsRespawn || robot.x < 0;
      const owned = robot.upgrades || [];
      const displayName = this.shortName(robot, 12);

      const flags = Array.from({ length: maxCp }, (_, i) => {
        const num = i + 1;
        const collected = num < currentTarget;
        return `<span class="player-status-flag-num${collected ? ' is-collected' : ''}">${num}</span>`;
      }).join('');

      const lives = Array.from({ length: maxLives }, (_, i) => {
        const filled = i < livesLeft;
        return `<span class="player-status-heart${filled ? ' is-filled' : ''}" aria-hidden="true">♥</span>`;
      }).join('');

      const upgrades = Array.from({ length: maxUpgrades }, (_, i) => {
        const upgrade = owned[i];
        if (!upgrade) {
          return '<span class="player-status-upgrade is-empty" aria-hidden="true"></span>';
        }
        const label = upgrade.short || upgrade.label || upgrade.id;
        const tip = `${label}${upgrade.desc ? ` — ${upgrade.desc}` : ''}`.replace(/"/g, '&quot;');
        return `<span class="player-status-upgrade" title="${tip}" aria-label="${tip}">${this.getUpgradeIconSvg(upgrade.id)}</span>`;
      }).join('');

      const tipParts = [
        isYou ? 'Jij' : this.getDisplayPlayerName(robot),
        matchGate
          ? (isReady ? 'Upgrade gekozen' : 'Kiest…')
          : (isReady ? 'Ready' : (isTurn ? 'Programmeert' : '')),
      ].filter(Boolean);

      return `
        <div class="player-status-chip${isYou ? ' is-you' : ''}${isTurn ? ' is-turn' : ''}${isReady ? ' is-ready' : ''}${isDown ? ' is-down' : ''}" style="--chip-color:${color}" title="${tipParts.join(' · ')}">
          <div class="player-status-top">
            <span class="player-status-swatch" aria-hidden="true"></span>
            <span class="player-status-name">${isYou ? `Jij · ${displayName}` : displayName}</span>
            <span class="player-status-flags" title="Behaalde vlaggen">${flags}</span>
          </div>
          <div class="player-status-lives" title="Opnieuw beginnen: ${livesLeft}/${maxLives}">${lives}</div>
          <div class="player-status-upgrades" title="Upgrades">${upgrades}</div>
          <div class="player-status-life" title="Integrity ${hp}/${maxHp}">
            <div class="player-status-life-track">
              <div class="player-status-life-fill" style="transform:scaleX(${lifeRatio})"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.playerStatusBar.scrollLeft = scrollLeft;
    this.syncPlayerStatusSpacer();
    this.maybeKeepBoardPinned();
  }

  shortName(robot, max = 10) {
    const name = this.getDisplayPlayerName(robot);
    return name.length > max ? `${name.slice(0, Math.max(1, max - 1))}…` : name;
  }

  renderInfoPanels() {
    if (this.turnSummary) {
      const items = this.engine.activeRegisterCards || [];
      const robot = this.getFocusedRobot();
      const nextHand = robot ? this.engine.getHandSize(robot) : 0;
      const upgrades = robot && robot.upgrades.length
        ? robot.upgrades.map(upgrade => upgrade.short).join(', ')
        : 'geen';
      if (this.engine.phase === 'programming') {
        const unlockedRegs = robot ? this.engine.getUnlockedRegisterCount(robot) : 5;
        const lockedRegs = 5 - unlockedRegs;
        const lockText = lockedRegs > 0
          ? ` ${lockedRegs} register${lockedRegs === 1 ? '' : 's'} vastgezet.`
          : '';
        this.turnSummary.innerHTML = this.isProgrammingUnlocked(robot) ? `
          <div class="info-card-label">Robot Status</div>
          <div class="info-card-title">${this.getDisplayPlayerName(robot)}: ${robot.damage} schade</div>
          <div class="info-card-text">Hand: ${nextHand} kaarten.${lockText} Upgrades: ${upgrades}.${robot.pendingPowerDown ? ' Power down staat gepland.' : ''}</div>
        ` : `
          <div class="info-card-label">Verborgen Programma</div>
          <div class="info-card-title">${this.getDisplayPlayerName(robot)} kan nu veilig programmeren</div>
          <div class="info-card-text">Geef het toestel door en druk daarna op de programmeerknop om pas dan de kaarten te tonen.</div>
        `;
      } else if (this.engine.phase === 'ready') {
        this.turnSummary.innerHTML = `
          <div class="info-card-label">Klaar Voor Play</div>
          <div class="info-card-title">${this.getExecutionHeadline()}</div>
          <div class="info-card-text">Na Play zie je alleen het bord met rustigere animaties en laser-effecten.</div>
        `;
      } else if (this.engine.phase === 'upgrade_choice') {
        this.turnSummary.innerHTML = `
          <div class="info-card-label">Upgrade Vakje</div>
          <div class="info-card-title">${this.getDisplayPlayerName(robot)} kiest een upgrade</div>
          <div class="info-card-text">Deze upgrade blijft actief voor de rest van de game.</div>
        `;
      } else if (items.length > 0) {
        this.turnSummary.innerHTML = `
          <div class="info-card-label">Actief Register · hoogste nummer eerst</div>
          <div class="info-card-title">${items.map(item => `${this.getDisplayPlayerNameById(item.robotId)}: ${item.cardLabel} (${item.priority})`).join(' → ')}</div>
          <div class="info-card-text">${this.getActiveActionText()}</div>
        `;
      } else {
        this.turnSummary.innerHTML = `
          <div class="info-card-label">Status</div>
          <div class="info-card-title">Wachten op volgende ronde</div>
          <div class="info-card-text">Nieuwe kaarten worden gedeeld zodra de ronde eindigt.</div>
        `;
      }
    }
  }

  renderProgramBoard() {
    if (!this.programBoard) return;
    this.programBoard.innerHTML = '';
    this.programBoard.style.display = this.engine.phase === 'programming' ? 'none' : 'flex';
    if (this.engine.phase === 'programming') return;

    this.engine.robots.forEach(robot => {
      const row = document.createElement('div');
      const isCurrent = this.engine.phase === 'executing'
        && (this.engine.activeRegisterCards || []).some(item => item.robotId === robot.id);
      row.className = `program-row${isCurrent ? ' is-active-turn' : ''}`;

      row.innerHTML = `
        <div class="program-row-head ${isCurrent ? 'active' : ''}">
          <span class="program-robot-name">${this.getDisplayPlayerName(robot)}</span>
          <span class="program-robot-meta">CP ${Math.min(robot.checkpoint, this.engine.board.checkpointsCount)} • HP ${robot.hp}/${robot.maxHp} • DMG ${robot.damage}</span>
        </div>
        <div class="program-register-strip">
          ${[0, 1, 2, 3, 4].map((index) => {
            const active = this.engine.phase === 'executing' && this.engine.registerIndex === index;
            const locked = this.engine.phase === 'programming' && this.engine.isRegisterLocked(robot, index);
            const card = locked
              ? this.engine.getCardForLockedRegister(robot, index)
              : (robot.registers && robot.registers[index]);
            const classes = ['program-register-card'];
            if (card) classes.push('filled');
            if (active) classes.push('current');
            if (locked) classes.push('locked');
            return `
              <div class="${classes.join(' ')}" title="${locked ? 'Vastgezet door schade — laatste move blijft' : ''}">
                <span class="program-register-num">${index + 1}</span>
                <span class="program-register-icon">${card ? card.icon : '·'}</span>
                <span class="program-register-text">${card ? card.label : (locked ? 'VAST' : 'LEEG')}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      this.programBoard.appendChild(row);
    });
  }

  renderActionLog() {
    if (!this.actionLog) return;
    const messages = this.engine.actionLog || [];
    this.actionLog.innerHTML = messages.length
      ? messages.map(msg => `<div class="action-log-item">${msg}</div>`).join('')
      : '<div class="action-log-item muted">Nog geen acties.</div>';
  }

  updateButtons() {
    const currentRobot = this.getProgrammingRobot();
    const unlocked = this.isProgrammingUnlocked(currentRobot);
    if (unlocked && currentRobot) this.ensureProgrammingRegisters(currentRobot);

    const openEmpty = currentRobot
      ? this.selectedRegisters.filter((card, index) => (
        !this.engine.isRegisterLocked(currentRobot, index) && card === null
      )).length
      : 5;
    const allOpenFilled = openEmpty === 0;

    if (this.btnPowerDown) {
      const alreadyCommitted = this.isP2pMode() && currentRobot && this.engine.isRobotCommitted?.(currentRobot.id);
      const canToggle = this.engine.phase === 'programming' && unlocked && currentRobot && !currentRobot.isBot && !currentRobot.eliminated && !currentRobot.shutdownActive && !alreadyCommitted;
      const isArmed = !!(currentRobot && currentRobot.pendingPowerDown);
      this.btnPowerDown.classList.toggle('hidden', !!alreadyCommitted && this.isP2pMode());
      this.btnPowerDown.disabled = !canToggle;
      this.btnPowerDown.classList.toggle('danger', isArmed);
      this.btnPowerDown.classList.toggle('alt', !isArmed);
      this.btnPowerDown.classList.remove('success');
      this.btnPowerDown.textContent = isArmed
        ? 'Power Down Gepland'
        : 'Power Down Volgende Ronde';
    }

    if (this.btnConfirmProgram) {
      const alreadyCommitted = this.isP2pMode() && currentRobot && this.engine.isRobotCommitted?.(currentRobot.id);
      const showConfirm = this.engine.phase === 'programming' && unlocked && currentRobot && !currentRobot.isBot && !alreadyCommitted;
      this.btnConfirmProgram.classList.toggle('hidden', !showConfirm);
      this.btnConfirmProgram.disabled = !allOpenFilled || !!alreadyCommitted;
      this.btnConfirmProgram.classList.toggle('success', allOpenFilled && !alreadyCommitted);
      const lockedCount = currentRobot ? 5 - this.engine.getUnlockedRegisterCount(currentRobot) : 0;
      this.btnConfirmProgram.textContent = alreadyCommitted
        ? 'Programma klaar'
        : (allOpenFilled
          ? (lockedCount ? `Bevestig (${lockedCount} vast)` : 'Bevestig Programma')
          : `Kies nog ${openEmpty} kaarten`);
    }

    if (this.btnBoardReplay) {
      const showReplay = this.canOfferBoardReplay();
      this.btnBoardReplay.classList.toggle('hidden', !showReplay);
      this.btnBoardReplay.disabled = !showReplay || this.isReplaying;
    }
  }

  runProgram({ allowPartial = false } = {}) {
    if (this.engine.phase !== 'programming' && !(this.isP2pMode() && this.engine.phase === 'ready')) return;
    const robot = this.getProgrammingRobot();
    if (!robot) return;
    if (this.isP2pMode() && this.engine.isRobotCommitted?.(robot.id)) {
      Toast.show('Je programma staat al klaar.');
      return;
    }
    this.ensureProgrammingRegisters(robot);
    const openEmpty = this.selectedRegisters.some((card, index) => (
      !this.engine.isRegisterLocked(robot, index) && card === null
    ));
    if (openEmpty && !allowPartial) {
      Toast.show('Vul eerst alle open registers in.');
      return;
    }

    if (this.isP2pMode() && P2pSessionController?.isActive?.()) {
      P2pSessionController.sendCommit(this.selectedRegisters)
        .then(() => {
          this.selectedRegisters = [null, null, null, null, null];
          this.clearMergeInputs();
          this.setSlotTab('program');
          this.programmingRegistersRobotId = null;
          this.programmingRegistersKey = null;
          this._programTimerExpiring = false;
          this.clearProgrammingTimer();
          this.updateCardsUI();
        })
        .catch((err) => {
          this._programTimerExpiring = false;
          Toast.show(err.message || 'Bevestigen mislukt');
          this.updateCardsUI();
        });
      return;
    }

    this.engine.commitCurrentPlayerRegisters(this.selectedRegisters);
    this.selectedRegisters = [null, null, null, null, null];
    this.clearMergeInputs();
    this.setSlotTab('program');
    this.programmingRegistersRobotId = null;
    this.programmingRegistersKey = null;
    this._programTimerExpiring = false;
    this.clearProgrammingTimer();
    this.updateCardsUI();
    this.scheduleScrollBoardToTop({ smooth: true });
  }

  leaveGame() {
    if (document.documentElement.classList.contains('dgame-embedded')) {
      window.parent.postMessage({ type: 'dgame:leave-game' }, '*');
      return;
    }
    if (typeof Nav !== 'undefined' && Nav.switchTab) {
      Nav.switchTab('courses');
      return;
    }
    Toast.show('Terug naar menu');
  }

  openRulesOverlay() {
    if (!this.rulesOverlay || !this.rulesBody) return;
    this.rulesBody.innerHTML = this.buildRulesHtml();
    this.rulesOverlay.classList.remove('hidden');
    this.rulesOverlay.setAttribute('aria-hidden', 'false');
  }

  closeRulesOverlay() {
    this.rulesOverlay?.classList.add('hidden');
    this.rulesOverlay?.setAttribute('aria-hidden', 'true');
  }

  formatCardTypeLabel(type) {
    const def = CONFIG.getCardTypeDef?.(type);
    return def ? def.label : String(type).toUpperCase();
  }

  buildRulesHtml() {
    const upgrades = (CONFIG.UPGRADES || []).map((upgrade) => {
      const icon = typeof UpgradeIcons !== 'undefined' ? UpgradeIcons.get(upgrade.id) : '';
      return `
        <div class="rules-upgrade">
          <strong>${icon ? `<span class="rules-upgrade-icon">${icon}</span> ` : ''}${upgrade.short || upgrade.label}</strong>
          <div>${upgrade.desc || ''}</div>
        </div>
      `;
    }).join('');

    const recipes = (CONFIG.MERGE_RECIPES || []).map((recipe) => {
      const inputs = (recipe.inputs || []).map((t) => this.formatCardTypeLabel(t)).join(' + ');
      const output = this.formatCardTypeLabel(recipe.output);
      const gate = recipe.requiresUpgrade
        ? ` · unlock: ${(CONFIG.UPGRADES || []).find((u) => u.id === recipe.requiresUpgrade)?.short || recipe.requiresUpgrade}`
        : ' · standaard';
      return `
        <div class="rules-recipe">
          <strong>${inputs} → ${output}</strong>
          <div>${gate}</div>
        </div>
      `;
    }).join('');

    return `
      <section class="rules-section">
        <h3>Kern</h3>
        <ul>
          <li>Programmeer tot 5 registers, hoogste priority beweegt eerst.</li>
          <li>Daarna banden/draaischijven, dan lasers.</li>
          <li>Schade verkleint je hand; te veel schade lockt de laatste registers met de vorige move.</li>
          <li><strong>Merge-tab:</strong> combineer 2–3 handkaarten tot één nieuwe kaart.</li>
        </ul>
      </section>
      <section class="rules-section">
        <h3>Upgrades</h3>
        ${upgrades || '<p>Geen upgrades geladen.</p>'}
      </section>
      <section class="rules-section">
        <h3>Merge-recepten</h3>
        ${recipes || '<p>Geen recepten geladen.</p>'}
      </section>
    `;
  }

  canOfferBoardReplay() {
    const replay = this.engine?.lastRoundReplay;
    if (!replay?.frames?.length) return false;
    if (this.isReplaying) return false;
    if (this.engine.phase === 'executing') return false;
    return true;
  }

  async startBoardReplay() {
    const frames = this.engine?.lastRoundReplay?.frames;
    if (!frames?.length || this.isReplaying) return;
    this.isReplaying = true;
    const token = ++this.replayRunToken;
    Toast.show(`Replay ronde ${this.engine.lastRoundReplay.roundNumber}`);
    this.updateButtons();

    for (let i = 0; i < frames.length; i++) {
      if (token !== this.replayRunToken) return;
      const frame = frames[i];
      this.replayPoseById = {};
      (frame.robots || []).forEach((pose) => {
        this.replayPoseById[pose.id] = { ...pose };
      });
      this.render();
      await new Promise((resolve) => setTimeout(resolve, 900));
    }

    if (token !== this.replayRunToken) return;
    this.isReplaying = false;
    this.replayPoseById = null;
    this.updateCardsUI();
    Toast.show('Replay klaar');
  }

  clearRegisters() {
    if (this.engine.phase !== 'programming') return;
    const robot = this.getProgrammingRobot();
    if (!robot) return;
    this.selectedRegisters = this.selectedRegisters.map((card, index) => (
      this.engine.isRegisterLocked(robot, index)
        ? (this.engine.getCardForLockedRegister(robot, index) || card)
        : null
    ));
    this.updateCardsUI();
  }

  showGameOverScreen() {
    if (this.autoStepTimer) {
      clearInterval(this.autoStepTimer);
      this.autoStepTimer = null;
    }

    this.gameOverOverlay?.classList.remove('hidden');
    const winner = this.engine.winner;
    if (this.goCard) {
      this.goCard.className = `go-card ${winner ? 'victory' : 'defeat'}`;
    }
    if (this.goTitle) {
      this.goTitle.textContent = winner ? `${this.getDisplayPlayerName(winner)} wint!` : 'Game over';
    }
    if (this.goStats) {
      this.goStats.innerHTML = winner
        ? `<b>${this.getDisplayPlayerName(winner)}</b> heeft alle checkpoints gehaald.`
        : 'Alle robots zijn uitgeschakeld of niemand haalde het parcours.';
    }
  }

  render() {
    if (!this.ctx || !this.engine.board) return;
    const ctx = this.ctx;
    const ts = this.tileSize;
    const board = this.engine.board;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBoardBackground(ctx, board, ts);

    const targetCheckpoint = this.getTargetCheckpointInfo();

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const tile = board.grid[y][x];
        const isTarget = !!(
          targetCheckpoint &&
          tile.type === CONFIG.TILE_TYPES.CHECKPOINT &&
          tile.num === targetCheckpoint.num
        );
        this.drawTile(ctx, tile, x * ts, y * ts, ts, isTarget ? targetCheckpoint : null);
      }
    }

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        this.drawWalls(ctx, board.grid[y][x], x * ts, y * ts, ts);
      }
    }

    if (targetCheckpoint) {
      this.drawTargetCheckpointHighlight(ctx, ts, targetCheckpoint);
    }

    this.drawLaserEffects(ctx, ts);
    this.drawRobots(ctx, ts);
  }

  getTargetCheckpointInfo() {
    const board = this.engine?.board;
    const robot = this.getFocusedRobot();
    if (!board || !robot || robot.eliminated || robot.x < 0) return null;

    const targetNum = robot.checkpoint;
    if (!targetNum || targetNum > board.checkpointsCount) return null;

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const tile = board.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.CHECKPOINT && tile.num === targetNum) {
          return {
            x,
            y,
            num: targetNum,
            robotName: this.getDisplayPlayerName(robot)
          };
        }
      }
    }
    return null;
  }

  drawTargetCheckpointHighlight(ctx, ts, target) {
    const px = target.x * ts;
    const py = target.y * ts;
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 420);
    const color = '#4a8f64';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4 + pulse * 0.3;
    ctx.lineWidth = Math.max(3, ts * 0.07);
    ctx.strokeRect(px + 3, py + 3, ts - 6, ts - 6);
    ctx.restore();
  }

  drawBoardBackground(ctx, board, ts) {
    const width = board.width * ts;
    const height = board.height * ts;
    ctx.fillStyle = '#1a1e24';
    ctx.fillRect(0, 0, width, height);
  }

  drawFloorPlate(ctx, px, py, ts) {
    const g = ctx.createLinearGradient(px, py, px + ts, py + ts);
    g.addColorStop(0, '#2a3038');
    g.addColorStop(0.5, '#232830');
    g.addColorStop(1, '#1c2028');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, ts, ts);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
    const rivet = Math.max(1.6, ts * 0.045);
    const inset = ts * 0.12;
    [[px + inset, py + inset], [px + ts - inset, py + inset], [px + inset, py + ts - inset], [px + ts - inset, py + ts - inset]].forEach(([x, y]) => {
      ctx.fillStyle = '#4a5562';
      ctx.beginPath();
      ctx.arc(x, y, rivet, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1e24';
      ctx.beginPath();
      ctx.arc(x, y, rivet * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawTile(ctx, tile, px, py, ts, targetInfo = null) {
    this.drawFloorPlate(ctx, px, py, ts);
    switch (tile.type) {
      case CONFIG.TILE_TYPES.START: this.drawStartTile(ctx, tile, px, py, ts); break;
      case CONFIG.TILE_TYPES.CONVEYOR_1:
      case CONFIG.TILE_TYPES.CONVEYOR_2: this.drawConveyorTile(ctx, tile, px, py, ts); break;
      case CONFIG.TILE_TYPES.GEAR_CW:
      case CONFIG.TILE_TYPES.GEAR_CCW: this.drawGearTile(ctx, tile, px, py, ts); break;
      case CONFIG.TILE_TYPES.LASER: this.drawLaserTile(ctx, tile, px, py, ts); break;
      case CONFIG.TILE_TYPES.PIT: this.drawPitTile(ctx, px, py, ts); break;
      case CONFIG.TILE_TYPES.CHECKPOINT: this.drawCheckpointTile(ctx, tile, px, py, ts, targetInfo); break;
      case CONFIG.TILE_TYPES.REPAIR: this.drawRepairTile(ctx, px, py, ts); break;
      case CONFIG.TILE_TYPES.UPGRADE: this.drawUpgradeTile(ctx, px, py, ts); break;
      default: break;
    }
  }

  drawStartTile(ctx, tile, px, py, ts) {
    ctx.fillStyle = 'rgba(56, 100, 140, 0.25)';
    ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
    ctx.strokeStyle = '#5b8fb8';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 6, py + 6, ts - 12, ts - 12);
    ctx.fillStyle = '#d7e7f5';
    ctx.font = `800 ${Math.floor(ts * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`S${tile.startId || ''}`, px + ts / 2, py + ts / 2);
  }

  /** Gedeelde animatiefase (seconden) voor banden en draaischijven. */
  getBoardAnimTime() {
    return performance.now() / 1000;
  }

  drawConveyorTile(ctx, tile, px, py, ts) {
    const isExpress = tile.type === CONFIG.TILE_TYPES.CONVEYOR_2;
    const color = isExpress ? '#4da6ff' : '#3dff6a';
    if (tile.curve && tile.curveFrom != null) {
      this.drawCurvedConveyorBelt(ctx, px, py, ts, tile.curveFrom, tile.dir, color, isExpress);
      return;
    }
    this.drawStraightConveyorBelt(ctx, px, py, ts, tile.dir, color, isExpress);
  }

  drawStraightConveyorBelt(ctx, px, py, ts, dir, color, isExpress) {
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    // Edge-to-edge zodat aangrenzende vakjes visueel één band vormen
    const halfL = ts / 2;
    const halfW = ts * 0.36;
    const speed = isExpress ? 0.7 : 0.42;
    const drift = ((this.getBoardAnimTime() * speed * ts) % ts + ts) % ts;

    ctx.save();
    ctx.translate(cx, cy);
    // Band-sprite ligt langs lokale +X (chevron wijst +X). Dat is 90° anders
    // dan robot/pijl-sprites die standaard naar -Y (noord) wijzen.
    ctx.rotate([-Math.PI / 2, 0, Math.PI / 2, Math.PI][dir]);

    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(-halfL, -halfW, halfL * 2, halfW * 2);

    const rollerR = Math.max(1.4, ts * 0.032);
    const rollerStep = ts * 0.22;
    ctx.fillStyle = '#9aa3ad';
    ctx.save();
    ctx.beginPath();
    ctx.rect(-halfL, -halfW - rollerR, halfL * 2, halfW * 2 + rollerR * 2);
    ctx.clip();
    for (let x = -halfL - rollerStep + (drift % rollerStep); x <= halfL + rollerStep; x += rollerStep) {
      ctx.beginPath();
      ctx.arc(x, -halfW, rollerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, halfW, rollerR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const drawChevron = (xCenter, yOff) => {
      ctx.beginPath();
      ctx.moveTo(xCenter - ts * 0.14, yOff - ts * 0.11);
      ctx.lineTo(xCenter + ts * 0.18, yOff);
      ctx.lineTo(xCenter - ts * 0.14, yOff + ts * 0.11);
      ctx.stroke();
    };
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.8, ts * 0.06);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.save();
    ctx.beginPath();
    ctx.rect(-halfL, -halfW, halfL * 2, halfW * 2);
    ctx.clip();
    const chevronStep = ts * 0.55;
    const rows = isExpress ? [-ts * 0.13, ts * 0.13] : [0];
    for (let x = -halfL - chevronStep + (drift % chevronStep); x <= halfL + chevronStep; x += chevronStep) {
      rows.forEach(yOff => drawChevron(x, yOff));
    }
    ctx.restore();
    ctx.restore();
  }

  drawCurvedConveyorBelt(ctx, px, py, ts, fromDir, exitDir, color, isExpress) {
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    const enterSide = (fromDir + 2) % 4;
    const beltW = ts * 0.72;
    const halfW = beltW / 2;
    const radius = ts / 2;
    const arcLen = radius * Math.PI / 2;
    const speed = isExpress ? 0.7 : 0.42;
    // Zelfde lineaire snelheid als rechte banden (px/s ≈ speed * ts)
    const driftDist = this.getBoardAnimTime() * speed * ts;
    const isCw = ((fromDir + 1) % 4) === exitDir;

    const edgeMid = (side) => {
      if (side === CONFIG.DIRECTIONS.NORTH) return { x: cx, y: py };
      if (side === CONFIG.DIRECTIONS.EAST) return { x: px + ts, y: cy };
      if (side === CONFIG.DIRECTIONS.SOUTH) return { x: cx, y: py + ts };
      return { x: px, y: cy };
    };

    // Hoekpunt van de kwartcirkel: snijpunt van inkomende en uitgaande rand
    let cornerX = cx;
    let cornerY = cy;
    if (enterSide === CONFIG.DIRECTIONS.WEST || exitDir === CONFIG.DIRECTIONS.WEST) cornerX = px;
    if (enterSide === CONFIG.DIRECTIONS.EAST || exitDir === CONFIG.DIRECTIONS.EAST) cornerX = px + ts;
    if (enterSide === CONFIG.DIRECTIONS.NORTH || exitDir === CONFIG.DIRECTIONS.NORTH) cornerY = py;
    if (enterSide === CONFIG.DIRECTIONS.SOUTH || exitDir === CONFIG.DIRECTIONS.SOUTH) cornerY = py + ts;

    const enter = edgeMid(enterSide);
    const exit = edgeMid(exitDir);
    const startAng = Math.atan2(enter.y - cornerY, enter.x - cornerX);
    const endAng = Math.atan2(exit.y - cornerY, exit.x - cornerX);
    // Canvas: positive = clockwise. CW-band → clockwise sweep.
    const anticlockwise = !isCw;

    const pointOnArc = (ang) => ({
      x: cornerX + Math.cos(ang) * radius,
      y: cornerY + Math.sin(ang) * radius
    });

    // Hoek interpoleren langs de kwartbocht in rijrichting
    const lerpArcAngle = (t) => {
      const delta = anticlockwise ? -Math.PI / 2 : Math.PI / 2;
      return startAng + delta * t;
    };

    const tangentAngle = (t) => {
      // Raaklijn in rijrichting (loodrecht op radius, mee met sweep)
      const ang = lerpArcAngle(t);
      return anticlockwise ? ang - Math.PI / 2 : ang + Math.PI / 2;
    };

    ctx.save();

    // Bandlichaam: dikke kwartcirkel, zelfde breedte als rechte banden
    ctx.strokeStyle = '#0b0d10';
    ctx.lineWidth = beltW;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(cornerX, cornerY, radius, startAng, endAng, anticlockwise);
    ctx.stroke();

    // Rollers langs binnen- en buitenboog (zelfde spacing als recht)
    const rollerR = Math.max(1.4, ts * 0.032);
    const rollerStep = ts * 0.22;
    const rollerPhase = ((driftDist % rollerStep) + rollerStep) % rollerStep;
    ctx.fillStyle = '#9aa3ad';
    for (let d = -rollerStep + rollerPhase; d <= arcLen + rollerStep; d += rollerStep) {
      if (d < 0 || d > arcLen) continue;
      const t = d / arcLen;
      const ang = lerpArcAngle(t);
      const inner = radius - halfW;
      const outer = radius + halfW;
      [inner, outer].forEach(r => {
        ctx.beginPath();
        ctx.arc(cornerX + Math.cos(ang) * r, cornerY + Math.sin(ang) * r, rollerR, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Weinig chevrons, zelfde snelheid/spacing als rechte banden
    const drawChevronAt = (t, lateral = 0) => {
      const p = pointOnArc(lerpArcAngle(t));
      const tang = tangentAngle(t);
      const nx = Math.cos(tang);
      const ny = Math.sin(tang);
      const pxn = -ny;
      const pyn = nx;
      const tip = ts * 0.16;
      const back = ts * 0.12;
      const spread = ts * 0.1;
      const ox = p.x + pxn * lateral;
      const oy = p.y + pyn * lateral;
      ctx.beginPath();
      ctx.moveTo(ox - nx * back + pxn * spread, oy - ny * back + pyn * spread);
      ctx.lineTo(ox + nx * tip, oy + ny * tip);
      ctx.lineTo(ox - nx * back - pxn * spread, oy - ny * back - pyn * spread);
      ctx.stroke();
    };

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.8, ts * 0.06);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const chevronStep = ts * 0.55;
    const chevronPhase = ((driftDist % chevronStep) + chevronStep) % chevronStep;
    const rows = isExpress ? [-ts * 0.11, ts * 0.11] : [0];
    for (let d = -chevronStep + chevronPhase; d <= arcLen + chevronStep; d += chevronStep) {
      if (d < ts * 0.08 || d > arcLen - ts * 0.08) continue;
      const t = d / arcLen;
      rows.forEach(lat => drawChevronAt(t, lat));
    }

    ctx.restore();
  }

  drawGearTile(ctx, tile, px, py, ts) {
    const cw = tile.type === CONFIG.TILE_TYPES.GEAR_CW;
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    const accent = '#ff3b3b';
    const teeth = 10;
    const outerR = ts * 0.38;
    const innerR = ts * 0.22;
    const hubR = ts * 0.1;
    const spin = this.getBoardAnimTime() * (cw ? 0.7 : -0.7);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.fillStyle = '#c5cdd6';
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : outerR * 0.78;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8b949e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#9aa3ad';
    ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a3038';
    ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.fill();
    // Kleine naafmarkering zodat de draaiing zichtbaar blijft
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(2, ts * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, -hubR * 0.2);
    ctx.lineTo(0, -innerR * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawLaserTile(ctx, tile, px, py, ts) {
    ctx.fillStyle = 'rgba(120, 40, 40, 0.28)';
    ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
    ctx.strokeStyle = '#c45c5c';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 6, py + 6, ts - 12, ts - 12);
    ctx.fillStyle = '#f0b0b0';
    this.drawArrow(ctx, px + ts / 2, py + ts / 2, tile.dir, ts * 0.28);
  }

  drawPitTile(ctx, px, py, ts) {
    const pitGradient = ctx.createRadialGradient(px + ts / 2, py + ts / 2, ts * 0.08, px + ts / 2, py + ts / 2, ts * 0.48);
    pitGradient.addColorStop(0, '#050608');
    pitGradient.addColorStop(1, '#12151a');
    ctx.fillStyle = pitGradient;
    ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
    ctx.strokeStyle = '#6b4c4c';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, ts - 8, ts - 8);
    ctx.strokeStyle = 'rgba(140, 80, 80, 0.5)';
    ctx.beginPath();
    ctx.moveTo(px + 10, py + 10); ctx.lineTo(px + ts - 10, py + ts - 10);
    ctx.moveTo(px + ts - 10, py + 10); ctx.lineTo(px + 10, py + ts - 10);
    ctx.stroke();
  }

  drawCheckpointTile(ctx, tile, px, py, ts, targetInfo = null) {
    const isTarget = !!targetInfo;
    const accent = isTarget ? '#3dff6a' : '#4a8f64';
    ctx.fillStyle = isTarget ? 'rgba(40, 100, 60, 0.35)' : 'rgba(40, 60, 50, 0.28)';
    ctx.fillRect(px + 3, py + 3, ts - 6, ts - 6);
    ctx.strokeStyle = accent;
    ctx.lineWidth = isTarget ? 3 : 2;
    ctx.strokeRect(px + 5, py + 5, ts - 10, ts - 10);
    const poleX = px + ts * 0.22;
    ctx.strokeStyle = '#d0d6dc';
    ctx.lineWidth = Math.max(2, Math.floor(ts * 0.045));
    ctx.beginPath();
    ctx.moveTo(poleX, py + ts * 0.42);
    ctx.lineTo(poleX, py + ts * 0.16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(poleX, py + ts * 0.16);
    ctx.lineTo(px + ts * 0.42, py + ts * 0.22);
    ctx.lineTo(poleX, py + ts * 0.34);
    ctx.closePath();
    ctx.fill();
    const fontSize = Math.max(18, Math.floor(ts * 0.58));
    ctx.font = `900 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, Math.floor(ts * 0.1));
    ctx.strokeStyle = 'rgba(10, 16, 12, 0.9)';
    ctx.strokeText(`${tile.num}`, px + ts / 2, py + ts * 0.62);
    ctx.fillStyle = '#f2faf4';
    ctx.fillText(`${tile.num}`, px + ts / 2, py + ts * 0.62);
  }

  drawRepairTile(ctx, px, py, ts) {
    ctx.fillStyle = 'rgba(180, 150, 40, 0.22)';
    ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 6, py + 6, ts - 12, ts - 12);
    ctx.fillStyle = '#f5e6a0';
    ctx.font = `${Math.floor(ts * 0.34)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔧', px + ts * 0.35, py + ts / 2);
    ctx.fillText('⚡', px + ts * 0.68, py + ts / 2);
  }

  drawUpgradeTile(ctx, px, py, ts) {
    ctx.fillStyle = 'rgba(180, 150, 40, 0.22)';
    ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 6, py + 6, ts - 12, ts - 12);
    ctx.fillStyle = '#f5e6a0';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * ((Math.PI * 2) / 5);
      const outerX = px + ts / 2 + Math.cos(angle) * ts * 0.22;
      const outerY = py + ts / 2 + Math.sin(angle) * ts * 0.22;
      const innerAngle = angle + Math.PI / 5;
      const innerX = px + ts / 2 + Math.cos(innerAngle) * ts * 0.09;
      const innerY = py + ts / 2 + Math.sin(innerAngle) * ts * 0.09;
      if (i === 0) ctx.moveTo(outerX, outerY); else ctx.lineTo(outerX, outerY);
      ctx.lineTo(innerX, innerY);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawWalls(ctx, tile, px, py, ts) {
    if (!tile.walls) return;
    const thickness = Math.max(4, Math.floor(ts * 0.1));
    const drawHazard = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const steps = Math.max(4, Math.floor(len / (ts * 0.12)));
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        ctx.strokeStyle = i % 2 === 0 ? '#f5d000' : '#141414';
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0);
        ctx.lineTo(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
        ctx.stroke();
      }
    };
    if (tile.walls[CONFIG.DIRECTIONS.NORTH]) drawHazard(px, py + 1, px + ts, py + 1);
    if (tile.walls[CONFIG.DIRECTIONS.EAST]) drawHazard(px + ts - 1, py, px + ts - 1, py + ts);
    if (tile.walls[CONFIG.DIRECTIONS.SOUTH]) drawHazard(px, py + ts - 1, px + ts, py + ts - 1);
    if (tile.walls[CONFIG.DIRECTIONS.WEST]) drawHazard(px + 1, py, px + 1, py + ts);
  }

  drawRobots(ctx, ts) {
    const activeIds = new Set((this.engine.activeRegisterCards || []).map(item => item.robotId));
    const programmingRobot = this.getProgrammingRobot();
    const isProgrammingPhase = this.engine.phase === 'programming';

    this.engine.robots.forEach(robot => {
      if (robot.eliminated || robot.hp <= 0 || robot.x < 0 || robot.y < 0) return;

      const anim = this.robotAnimStates[robot.id] || {
        x: robot.x,
        y: robot.y,
        angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][robot.dir]
      };

      const rx = anim.x * ts + ts / 2;
      const ry = anim.y * ts + ts / 2;
      const bodySize = ts * 0.72;
      const isTurn = isProgrammingPhase && programmingRobot && robot.id === programmingRobot.id;
      const isActing = activeIds.has(robot.id);
      const vivid = this.getVividRobotColors(robot);

      ctx.save();
      if (isProgrammingPhase && !isTurn) {
        ctx.globalAlpha = 0.82;
      }

      // Neon-halo zodat de robot loskomt van het grijze bord
      ctx.save();
      ctx.fillStyle = vivid.head;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(rx, ry, bodySize * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (isTurn || isActing) {
        ctx.save();
        ctx.strokeStyle = vivid.head;
        ctx.globalAlpha = isTurn ? 0.75 : 0.5;
        ctx.lineWidth = Math.max(2.5, ts * 0.06);
        ctx.beginPath();
        ctx.arc(rx, ry, bodySize * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(anim.angle);
      RobotDraw.draw(ctx, {
        size: bodySize,
        colors: vivid,
        style: robot.style || 'scout',
        showFrontMarker: true,
        glow: true
      });
      ctx.restore();

      ctx.restore();
    });
  }

  getVividRobotColors(robot) {
    // Keep Me-tab triple: head → pijl, body → lichaam, legs → ogen.
    const raw = robot?.colors || {};
    const head = raw.head || robot?.color || '#00ffff';
    const body = raw.body || head;
    const legs = raw.legs || body;
    return { head, body, legs };
  }

  neonHex(hex) {
    const value = String(hex || '#00ffff').replace('#', '');
    if (value.length !== 6) return '#00ffff';
    let r = parseInt(value.slice(0, 2), 16) / 255;
    let g = parseInt(value.slice(2, 4), 16) / 255;
    let b = parseInt(value.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta > 0.0001) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    // Pure neon: volle saturatie, heldere mid-lightness (geen pastel, geen donker)
    const s = 1;
    const l = 0.54;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (h < 60) { rr = c; gg = x; }
    else if (h < 120) { rr = x; gg = c; }
    else if (h < 180) { gg = c; bb = x; }
    else if (h < 240) { gg = x; bb = c; }
    else if (h < 300) { rr = x; bb = c; }
    else { rr = c; bb = x; }

    const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
  }

  drawArrow(ctx, x, y, dir, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate([0, Math.PI / 2, Math.PI, -Math.PI / 2][dir]);
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.lineTo(0, size / 4);
    ctx.lineTo(-size / 2, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawLaserEffects(ctx, ts) {
    const now = performance.now();
    this.effectBursts = this.effectBursts.filter(burst => now - burst.startedAt < 1100);
    this.effectBursts.forEach(burst => {
      const age = now - burst.startedAt;
      const alpha = Math.max(0, 1 - age / 1100);
      const ox = (burst.offsetX || 0) * ts;
      const oy = (burst.offsetY || 0) * ts;
      const sx = burst.startX * ts + ts / 2 + ox;
      const sy = burst.startY * ts + ts / 2 + oy;
      const ex = burst.endX * ts + ts / 2 + ox;
      const ey = burst.endY * ts + ts / 2 + oy;

      ctx.save();
      ctx.strokeStyle = burst.reason === 'robotlaser'
        ? `rgba(244, 114, 182, ${0.95 * alpha})`
        : `rgba(248, 113, 113, ${0.9 * alpha})`;
      ctx.lineWidth = Math.max(3, ts * 0.1);
      ctx.shadowColor = burst.reason === 'robotlaser' ? '#f472b6' : '#f87171';
      ctx.shadowBlur = 22 * alpha;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      if (burst.hit) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * alpha})`;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(5, ts * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  getFocusedRobot() {
    if (this.engine.phase === 'upgrade_choice' && this.engine.currentUpgradeChoice) {
      return this.engine.robots.find(robot => robot.id === this.engine.currentUpgradeChoice.robotId) || null;
    }
    return this.getProgrammingRobot() || (!this.isP2pMode() ? (this.engine.robots[0] || null) : null);
  }

  getProgrammingRobot() {
    if (this.isP2pMode()) {
      this.syncLocalP2pRobotId();
      const localId = this.localP2pRobotId;
      const playerId = P2pSessionController?.playerId;
      if (localId) {
        const byId = this.engine.robots.find((robot) => robot.id === localId);
        if (byId) return byId;
      }
      if (playerId) {
        const byPeer = this.engine.robots.find((robot) => robot.peerUserId === playerId);
        if (byPeer) {
          this.localP2pRobotId = byPeer.id;
          return byPeer;
        }
      }
      // Never fall back to robots[0] in P2P — that is usually the host seat.
      return null;
    }
    return this.engine.robots[this.engine.programmingPlayerIndex] || this.engine.robots[0] || null;
  }

  /** Keep UI seat identity aligned with room playerId / lobby seat. */
  syncLocalP2pRobotId() {
    if (!this.isP2pMode()) return;
    const fromSeat = P2pSessionController?.localRobotId?.();
    if (fromSeat) {
      this.localP2pRobotId = fromSeat;
      return;
    }
    const playerId = P2pSessionController?.playerId;
    if (!playerId || !this.engine?.robots) return;
    const hit = this.engine.robots.find((robot) => robot.peerUserId === playerId);
    if (hit) this.localP2pRobotId = hit.id;
  }

  applyModeState() {
    this.applyPanelState();
  }

  applyPanelState() {
    const phase = this.engine.phase;
    const prevPhase = this._panelPhase;
    const privacyLocked = this.isPrivacyGateVisible();
    const matchGate = phase === 'match_ready' || phase === 'match_countdown';
    const shouldCollapse = phase === 'executing' || phase === 'ready' || phase === 'upgrade_choice'
      || privacyLocked || matchGate;
    this.gameWrap?.classList.toggle('panel-collapsed', shouldCollapse);
    this.gameWrap?.classList.toggle('ready-mode', phase === 'ready');
    this.gameWrap?.classList.toggle('executing-mode', phase === 'executing');
    this.gameWrap?.classList.toggle('upgrade-choice-mode', phase === 'upgrade_choice'
      || (phase === 'match_ready' && !!(this.getProgrammingRobot()
        && !this.engine.isRobotMatchReady?.(this.getProgrammingRobot().id)
        && this.engine.getMatchUpgradeOffer?.(this.getProgrammingRobot().id)?.length)));
    this.gameWrap?.classList.toggle('match-ready-mode', phase === 'match_ready');
    this.gameWrap?.classList.toggle('match-countdown-mode', phase === 'match_countdown');
    this.gameWrap?.classList.toggle('privacy-locked', privacyLocked);
    this.app?.classList.toggle('playback-only', phase === 'executing');
    this.updateBoardBorder();
    this._panelPhase = phase;
    // Only resize when layout mode changes — per-step resize caused Play flicker.
    if (prevPhase !== phase) {
      requestAnimationFrame(() => {
        this.resizeCanvas();
        // Open on the board; player status sits above and is reached by scrolling up.
        if (phase === 'programming' || phase === 'match_ready' || phase === 'match_countdown'
          || phase === 'ready' || phase === 'executing') {
          this.scheduleScrollBoardToTop();
        }
      });
    }
  }

  updateBoardBorder() {
    if (!this.boardFrame) return;
    const phase = this.engine.phase;
    const rainbow = phase === 'ready';
    this.boardFrame.classList.toggle('board-frame-rainbow', rainbow);

    if (rainbow) {
      this.boardFrame.style.removeProperty('--board-edge');
      return;
    }

    if (phase === 'programming' || phase === 'upgrade_choice') {
      const robot = this.getFocusedRobot();
      const color = robot ? this.getRobotColor(robot) : 'rgba(56, 189, 248, 0.55)';
      this.boardFrame.style.setProperty('--board-edge', color);
      return;
    }

    this.boardFrame.style.setProperty('--board-edge', 'rgba(56, 189, 248, 0.45)');
  }

  syncExecutionTimer() {
    // Everyone runs local Play animation. Guests must not finalize the round
    // (host end-snapshot is truth).
    const allowFinalize = !(this.isP2pMode() && !this.isP2pHost());

    if (this.engine.phase === 'executing') {
      if (!this.autoStepTimer) {
        this.autoStepTimer = setInterval(() => {
          if (this.engine.phase !== 'executing') {
            clearInterval(this.autoStepTimer);
            this.autoStepTimer = null;
            this.selectedRegisters = [null, null, null, null, null];
            this.updateCardsUI();
            return;
          }
          this.engine.advanceExecutionStep({ allowFinalize });
          // Guest finished local playback — stop timer and wait for host snap.
          if (
            !allowFinalize
            && this.engine.phase === 'executing'
            && this.engine.execHeadline === 'Wachten op host…'
          ) {
            clearInterval(this.autoStepTimer);
            this.autoStepTimer = null;
            this.updateCardsUI();
            // If the end-snap was dropped, ask host for a full log dump.
            P2pSessionController?.requestLogResync?.();
            this.scheduleWaitHostResync();
            return;
          }
          if (this.engine.phase !== 'executing') {
            clearInterval(this.autoStepTimer);
            this.autoStepTimer = null;
            this.selectedRegisters = [null, null, null, null, null];
            this.updateCardsUI();
          }
        }, CONFIG.EXECUTION_STEP_MS || 560);
      }
      return;
    }

    if (this.autoStepTimer) {
      clearInterval(this.autoStepTimer);
      this.autoStepTimer = null;
    }
    if (this.engine.phase !== 'executing') {
      this.clearWaitHostResync();
    }
  }

  scheduleWaitHostResync() {
    this.clearWaitHostResync();
    if (!(this.isP2pMode() && !this.isP2pHost())) return;
    this._waitHostResyncTimer = setInterval(() => {
      if (
        this.engine.phase === 'executing'
        && this.engine.execHeadline === 'Wachten op host…'
      ) {
        P2pSessionController?.requestLogResync?.();
        return;
      }
      this.clearWaitHostResync();
    }, 2000);
  }

  clearWaitHostResync() {
    if (this._waitHostResyncTimer != null) {
      clearInterval(this._waitHostResyncTimer);
      this._waitHostResyncTimer = null;
    }
  }

  clearProgrammingTimer() {
    if (this._programTimerInterval != null) {
      clearTimeout(this._programTimerInterval);
      this._programTimerInterval = null;
    }
    this._programTimerKey = '';
    this._programTimerDeadline = 0;
    this._programTimerExpiring = false;
    this.programTimer?.classList.add('hidden');
    this.programTimer?.classList.remove('is-urgent');
    if (this.programTimerFill) this.programTimerFill.style.width = '100%';
  }

  syncProgrammingTimer() {
    const robot = this.getProgrammingRobot();
    const seconds = CONFIG.PROGRAMMING_SECONDS || 60;
    const shouldRun = this.engine.phase === 'programming'
      && robot
      && !robot.isBot
      && !robot.eliminated
      && !robot.shutdownActive
      && this.isProgrammingUnlocked(robot)
      && !(this.isP2pMode() && this.engine.isRobotCommitted?.(robot.id));

    if (!shouldRun) {
      if (!this._programTimerExpiring) this.clearProgrammingTimer();
      return;
    }

    if (this._programTimerExpiring) {
      this.programTimer?.classList.remove('hidden');
      this.programTimer?.classList.add('is-urgent');
      if (this.programTimerFill) this.programTimerFill.style.width = '0%';
      return;
    }

    const key = `${this.engine.roundNumber}:${robot.id}`;
    this.programTimer?.classList.remove('hidden');

    if (key === this._programTimerKey && this._programTimerInterval != null) {
      return;
    }

    if (this._programTimerInterval != null) {
      clearTimeout(this._programTimerInterval);
      this._programTimerInterval = null;
    }

    this._programTimerKey = key;
    this._programTimerDeadline = Date.now() + seconds * 1000;
    this.programTimer?.classList.remove('is-urgent');
    if (this.programTimerFill) this.programTimerFill.style.width = '100%';

    const tick = () => {
      if (this._programTimerKey !== key) return;
      const leftMs = Math.max(0, this._programTimerDeadline - Date.now());
      const leftSec = Math.ceil(leftMs / 1000);
      if (this.programTimerFill) {
        this.programTimerFill.style.width = `${(leftMs / (seconds * 1000)) * 100}%`;
      }
      this.programTimer?.classList.toggle('is-urgent', leftSec <= 10);

      if (leftMs <= 0) {
        this._programTimerInterval = null;
        this.onProgrammingTimerExpire(robot);
        return;
      }
      this._programTimerInterval = setTimeout(tick, Math.min(250, leftMs));
    };

    this._programTimerInterval = setTimeout(tick, 200);
  }

  fillEmptyRegistersRandomly(robot) {
    if (!robot) return;
    this.ensureProgrammingRegisters(robot);
    const usedIds = new Set(
      this.selectedRegisters.filter(Boolean).map((card) => card.id),
    );
    const pool = (robot.hand || [])
      .filter((card) => card && !usedIds.has(card.id))
      .map((card) => ({ ...card }));

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    for (let index = 0; index < 5; index++) {
      if (this.engine.isRegisterLocked(robot, index)) continue;
      if (this.selectedRegisters[index]) continue;
      const next = pool.shift();
      if (!next) break;
      this.selectedRegisters[index] = next;
    }
  }

  onProgrammingTimerExpire(robot) {
    if (this._programTimerExpiring) return;
    if (this.engine.phase !== 'programming') {
      this.clearProgrammingTimer();
      return;
    }
    const current = this.getProgrammingRobot();
    if (!current || current.id !== robot?.id) {
      this.clearProgrammingTimer();
      return;
    }
    if (this.isP2pMode() && this.engine.isRobotCommitted?.(current.id)) {
      this.clearProgrammingTimer();
      return;
    }

    this._programTimerExpiring = true;
    if (this._programTimerInterval != null) {
      clearTimeout(this._programTimerInterval);
      this._programTimerInterval = null;
    }
    this.fillEmptyRegistersRandomly(current);
    Toast.show('Tijd om! Lege slots zijn random gevuld.');
    this.runProgram({ allowPartial: true });
  }

  renderUpgradeShop(currentRobot) {
    if (!this.upgradeShop || !currentRobot) return;

    if (this.engine.phase === 'programming' && !this.isProgrammingUnlocked(currentRobot)) {
      this.upgradeShop.style.display = 'none';
      return;
    }

    if (!currentRobot.upgrades.length) {
      this.upgradeShop.innerHTML = '';
      this.upgradeShop.style.display = 'none';
      return;
    }

    this.upgradeShop.style.display = 'flex';
    this.upgradeShop.innerHTML = `
      <div class="upgrade-shop-head">
        <span class="upgrade-shop-title">Upgrades voor ${this.getDisplayPlayerName(currentRobot)}</span>
        <span class="upgrade-shop-meta">Actief ${currentRobot.upgrades.length}/${CONFIG.MAX_UPGRADES}</span>
      </div>
      <div class="upgrade-owned">${currentRobot.upgrades.map(upgrade => upgrade.short).join(', ')}</div>
    `;
  }

  getRobotColor(robot) {
    if (typeof StorageManager !== 'undefined' && StorageManager.getPlayerColor) {
      return StorageManager.getPlayerColor(robot);
    }
    return robot?.colors?.head || robot?.colors?.body || '#00ffff';
  }

  renderActivePlayer(currentRobot) {
    if (!currentRobot) return;
    const color = this.getRobotColor(currentRobot);
    if (this.activePlayerSwatch) this.activePlayerSwatch.style.background = color;
    if (this.activePlayerName) this.activePlayerName.textContent = this.getDisplayPlayerName(currentRobot);
    if (this.activePlayerStatus && this.engine.board) {
      const cp = Math.min(currentRobot.checkpoint, this.engine.board.checkpointsCount);
      this.activePlayerStatus.textContent = `HP ${currentRobot.hp}/${currentRobot.maxHp} • DMG ${currentRobot.damage} • CP ${cp}/${this.engine.board.checkpointsCount}`;
    }
    if (this.activePlayerText) {
      if (this.engine.phase === 'match_ready') {
        const iAmReady = this.engine.isRobotMatchReady?.(currentRobot.id);
        this.activePlayerText.textContent = iAmReady
          ? 'Upgrade gekozen — wacht op de anderen.'
          : 'Kies een start-upgrade om verder te gaan.';
      } else if (this.engine.phase === 'match_countdown') {
        this.activePlayerText.textContent = 'Iedereen is klaar — het spel start zo.';
      } else if (this.engine.phase === 'programming' && !this.isProgrammingUnlocked(currentRobot)) {
        this.activePlayerText.textContent = `Geef het toestel door en druk op "Programmeer ${this.getDisplayPlayerName(currentRobot)}".`;
      } else if (this.engine.phase === 'programming') {
        this.activePlayerText.textContent = 'Jouw beurt: scroll naar beneden en kies 5 kaarten.';
      } else if (this.engine.phase === 'ready') {
        this.activePlayerText.textContent = 'Alle programma\'s zijn bevestigd. Druk op Play.';
      } else if (this.engine.phase === 'executing') {
        this.activePlayerText.textContent = this.getActiveActionText();
      } else if (this.engine.phase === 'upgrade_choice') {
        this.activePlayerText.textContent = 'Kies 1 upgrade voor de rest van de game.';
      } else {
        this.activePlayerText.textContent = 'Ronde afgelopen.';
      }
    }
    if (this.activePlayerCard) {
      const isTurn = this.engine.phase === 'programming';
      this.activePlayerCard.classList.toggle('is-turn', isTurn);
      this.activePlayerCard.style.borderColor = `${color}99`;
      this.activePlayerCard.style.boxShadow = `0 0 0 1px ${color}33 inset, 0 0 18px ${color}22`;
    }
  }

  renderPlaybackOverlay() {
    if (!this.playbackOverlay) return;
    const phase = this.engine.phase;
    const currentRobot = this.getFocusedRobot();
    const localRobot = this.getProgrammingRobot();
    const privacyLocked = this.isPrivacyGateVisible(currentRobot);
    const readyMode = phase === 'ready';
    const matchReadyPhase = phase === 'match_ready';
    const matchCountdownPhase = phase === 'match_countdown';
    const iAmReady = !!(localRobot && this.engine.isRobotMatchReady?.(localRobot.id));
    const matchUpgradePending = matchReadyPhase && localRobot && !iAmReady
      && (this.engine.getMatchUpgradeOffer?.(localRobot.id)?.length > 0);
    // Tijdens start-upgrade kiezen: geen Ready-overlay (upgrade-overlay is de UI).
    const matchGate = (matchReadyPhase || matchCountdownPhase) && !matchUpgradePending;
    const readyCount = (this.engine.matchReadyRobotIds || []).length;
    const readyTotal = this.engine.getMatchReadyHumans?.().length || 0;
    const p2pAutoReady = this.isP2pMode() && readyMode;
    // Hotseat privacy / Play, of P2P match-ready gate.
    const showPlay = privacyLocked || (readyMode && !this.isP2pMode());
    const show = showPlay || matchGate;

    this.playbackOverlay.classList.toggle('hidden', !show);
    this.playbackOverlay.classList.toggle('is-privacy-gate', privacyLocked);
    this.playbackOverlay.classList.toggle('is-ready-gate', readyMode && !this.isP2pMode());
    this.playbackOverlay.classList.toggle('is-match-ready-gate', matchGate);
    this.playbackOverlay.classList.toggle('is-match-countdown', matchCountdownPhase);

    if (matchGate) {
      this.playbackStatusCard?.classList.remove('hidden');
      if (matchCountdownPhase) {
        const endsAt = this.engine.matchCountdownEndsAt;
        const leftSec = endsAt != null
          ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
          : (CONFIG.MATCH_COUNTDOWN_SECONDS || 10);
        if (this.playbackTitle) this.playbackTitle.textContent = 'Iedereen is klaar';
        if (this.playbackText) this.playbackText.textContent = String(leftSec);
      } else if (iAmReady) {
        if (this.playbackTitle) this.playbackTitle.textContent = 'Upgrade gekozen';
        if (this.playbackText) {
          this.playbackText.textContent = `Wacht op anderen (${readyCount}/${readyTotal})…`;
        }
      } else {
        if (this.playbackTitle) this.playbackTitle.textContent = 'Start-upgrade';
        if (this.playbackText) {
          this.playbackText.textContent = `Wacht op je upgrade-keuze (${readyCount}/${readyTotal})…`;
        }
      }
    } else {
      this.playbackStatusCard?.classList.add('hidden');
    }

    this.btnStartExecution?.classList.toggle('hidden', !showPlay);
    // Ready-knop verwijderd: start-upgrade is de ready-actie.
    this.btnMatchReady?.classList.add('hidden');
    if (this.btnMatchReady) this.btnMatchReady.disabled = true;

    if (p2pAutoReady && this.selectionHint) {
      this.selectionHint.textContent = 'Iedereen is ready — ronde start automatisch.';
    }

    if (!showPlay) return;

    if (this.btnStartExecution) {
      this.btnStartExecution.disabled = false;
      this.btnStartExecution.classList.toggle('success', false);
      this.btnStartExecution.classList.toggle('player-turn-btn', privacyLocked);
      this.btnStartExecution.classList.toggle('rainbow-play-btn', readyMode && !this.isP2pMode());

      if (privacyLocked && currentRobot) {
        const color = this.getRobotColor(currentRobot);
        this.btnStartExecution.style.setProperty('--player-btn-color', color);
        this.btnStartExecution.style.setProperty('--player-btn-color-dark', this.shadeHex(color, -0.22));
        this.btnStartExecution.textContent = this.getDisplayPlayerName(currentRobot);
      } else if (readyMode) {
        this.btnStartExecution.style.removeProperty('--player-btn-color');
        this.btnStartExecution.style.removeProperty('--player-btn-color-dark');
        this.btnStartExecution.textContent = 'Play ▶';
      } else {
        this.btnStartExecution.style.removeProperty('--player-btn-color');
        this.btnStartExecution.style.removeProperty('--player-btn-color-dark');
      }
    }
  }

  clearMatchCountdown() {
    if (this._matchCountdownInterval != null) {
      clearTimeout(this._matchCountdownInterval);
      this._matchCountdownInterval = null;
    }
    this._matchCountdownKey = '';
  }

  syncMatchCountdown() {
    const phase = this.engine.phase;
    if (phase !== 'match_countdown') {
      this.clearMatchCountdown();
      return;
    }

    const endsAt = this.engine.matchCountdownEndsAt;
    const key = String(endsAt || 'pending');
    if (key !== this._matchCountdownKey) {
      this.clearMatchCountdown();
      this._matchCountdownKey = key;
    }

    const tick = () => {
      if (this.engine.phase !== 'match_countdown') {
        this.clearMatchCountdown();
        return;
      }
      const deadline = this.engine.matchCountdownEndsAt;
      const leftMs = deadline != null ? Math.max(0, deadline - Date.now()) : 0;
      this.renderPlaybackOverlay();

      if (leftMs <= 0) {
        this._matchCountdownInterval = null;
        if (this.isP2pHost() && P2pSessionController?.maybeFinishMatchCountdown) {
          P2pSessionController.maybeFinishMatchCountdown().catch(() => {});
        }
        return;
      }
      this._matchCountdownInterval = setTimeout(tick, Math.min(250, leftMs));
    };

    if (this._matchCountdownInterval == null) {
      this._matchCountdownInterval = setTimeout(tick, 50);
    }
  }

  handleMatchReady() {
    // Ready-knop is vervangen door start-upgrade kiezen.
  }

  shadeHex(hex, amount) {
    const value = String(hex || '#38bdf8').replace('#', '');
    if (value.length !== 6) return hex;
    const to = (part) => {
      const n = Math.max(0, Math.min(255, Math.round(parseInt(part, 16) * (1 + amount))));
      return n.toString(16).padStart(2, '0');
    };
    return `#${to(value.slice(0, 2))}${to(value.slice(2, 4))}${to(value.slice(4, 6))}`;
  }

  renderUpgradeChoiceOverlay() {
    if (!this.upgradeChoiceOverlay || !this.upgradeChoiceList) return;
    const phase = this.engine.phase;
    const localRobot = this.getProgrammingRobot();
    const midChoice = phase === 'upgrade_choice' ? this.engine.currentUpgradeChoice : null;
    const matchOptions = phase === 'match_ready' && localRobot && !this.engine.isRobotMatchReady?.(localRobot.id)
      ? (this.engine.getMatchUpgradeOffer?.(localRobot.id) || [])
      : [];
    const matchPick = matchOptions.length > 0;
    const show = !!midChoice || matchPick;
    this.upgradeChoiceOverlay.classList.toggle('hidden', !show);
    if (!show) return;

    const choiceRobotId = midChoice ? midChoice.robotId : localRobot.id;
    const options = midChoice ? midChoice.options : matchOptions;
    const robot = this.engine.robots.find(entry => entry.id === choiceRobotId);
    const playerName = this.getDisplayPlayerName(robot);
    const labelEl = this.upgradeChoiceOverlay.querySelector('.upgrade-choice-label');
    if (labelEl) {
      labelEl.classList.toggle('hidden', matchPick);
      if (!matchPick) labelEl.textContent = 'Upgrade Vakje';
    }
    if (this.upgradeChoiceYou) {
      this.upgradeChoiceYou.classList.toggle('hidden', !matchPick);
      if (matchPick) {
        if (this.upgradeChoiceYouName) {
          this.upgradeChoiceYouName.textContent = playerName;
        }
        this.paintUpgradeChoiceRobot(robot);
      }
    }
    if (this.upgradeChoiceTitle) {
      this.upgradeChoiceTitle.classList.toggle('hidden', matchPick);
      if (!matchPick) {
        this.upgradeChoiceTitle.textContent = `${playerName} kiest een upgrade`;
      }
    }
    if (this.upgradeChoiceText) {
      this.upgradeChoiceText.classList.toggle('hidden', matchPick);
      if (!matchPick) {
        const n = options.length;
        this.upgradeChoiceText.textContent =
          `Je staat op een upgrade-vakje. Kies 1 van deze ${n} upgrades (blijft actief tot het einde).`;
      }
    }

    this.upgradeChoiceList.innerHTML = options.map(option => `
      <button class="upgrade-card upgrade-choice-button" type="button" data-upgrade-choice="${option.id}">
        <span class="upgrade-card-title">${option.label}</span>
        <span class="upgrade-card-desc">${option.desc}</span>
        <span class="upgrade-card-cost">Blijft actief tot het einde van de game</span>
      </button>
    `).join('');

    this.upgradeChoiceList.querySelectorAll('[data-upgrade-choice]').forEach(button => {
      button.addEventListener('click', () => {
        const upgradeId = button.getAttribute('data-upgrade-choice');
        if (!upgradeId) return;
        if (this.isP2pMode() && P2pSessionController?.isActive?.()) {
          P2pSessionController.sendUpgrade(upgradeId)
            .catch((err) => Toast.show(err.message || 'Upgrade kiezen mislukt'));
          return;
        }
        const chosen = matchPick
          ? this.engine.confirmMatchUpgrade(choiceRobotId, upgradeId)
          : this.engine.chooseUpgrade(upgradeId);
        if (!chosen) {
          Toast.show('Upgrade kiezen lukt nu niet.');
        }
      });
    });
  }

  paintUpgradeChoiceRobot(robot) {
    const canvas = this.upgradeChoiceRobot;
    if (!canvas || typeof RobotDraw === 'undefined' || !robot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2 + 4);
    RobotDraw.draw(ctx, {
      size: Math.min(w, h) * 0.72,
      colors: this.getVividRobotColors(robot),
      style: robot.style || 'scout',
      showFrontMarker: true,
      glow: true,
    });
    ctx.restore();
  }

  startExecution() {
    if (this.engine.phase !== 'ready') return;
    if (this.isP2pMode()) {
      if (!this.isP2pHost()) {
        Toast.show('Alleen de host kan Play drukken.');
        return;
      }
      P2pSessionController.sendPlay()
        .then(() => this.syncExecutionTimer())
        .catch((err) => Toast.show(err.message || 'Play mislukt'));
      return;
    }
    this.engine.startExecution();
    this.syncExecutionTimer();
  }

  handlePrimaryOverlayAction() {
    const currentRobot = this.getFocusedRobot();
    if (this.isPrivacyGateVisible(currentRobot)) {
      this.unlockProgrammingForCurrentPlayer();
      return;
    }
    if (this.engine.phase === 'programming') {
      this.runProgram();
      return;
    }
    if (this.isP2pMode() && !this.isP2pHost()) {
      Toast.show('Alleen de host kan Play drukken.');
      return;
    }
    this.startExecution();
  }

  captureLaserEffects() {
    const bursts = this.engine.lastLaserBursts || [];
    const signature = `${this.engine.phase}|${this.engine.registerIndex}|${this.engine.execPhase}|${JSON.stringify(bursts)}`;
    if (signature === this.lastLaserSignature) return;
    this.lastLaserSignature = signature;
    if (bursts.length) {
      const startedAt = performance.now();
      this.effectBursts = bursts.map(burst => ({ ...burst, startedAt }));
    }
  }

  getExecutionHeadline() {
    if (this.engine.execHeadline) return this.engine.execHeadline;
    const items = this.engine.activeRegisterCards || [];
    if (!items.length) return 'Wachten op actie';
    return items
      .map(item => `${this.getDisplayPlayerNameById(item.robotId)} ${item.cardLabel} (${item.priority})`)
      .join(' → ');
  }

  getActiveActionText() {
    const latest = this.engine.actionLog && this.engine.actionLog[0];
    if (latest) return latest;
    return 'De ronde wordt stap voor stap afgespeeld.';
  }

  syncProgrammingPrivacy(currentRobot) {
    if (this.isP2pMode()) {
      // Everyone programs on their own device — no hotseat privacy gate.
      if (this.engine.phase === 'programming' && currentRobot) {
        this.programmingUnlockedRobotId = currentRobot.id;
        this.lastProgrammingRobotId = currentRobot.id;
      }
      return;
    }

    if (this.engine.phase !== 'programming') {
      this.lastProgrammingRobotId = null;
      this.programmingUnlockedRobotId = null;
      this.programmingRegistersRobotId = null;
      this.programmingRegistersKey = null;
      return;
    }

    if (!currentRobot) return;
    if (this.lastProgrammingRobotId !== currentRobot.id) {
      this.lastProgrammingRobotId = currentRobot.id;
      this.programmingUnlockedRobotId = null;
      this.programmingRegistersRobotId = null;
      this.programmingRegistersKey = null;
      CharacterManager?.refreshForCurrentTurn?.();
    }
  }

  unlockProgrammingForCurrentPlayer() {
    const currentRobot = this.getProgrammingRobot();
    if (!currentRobot || this.engine.phase !== 'programming') return;
    this.lastProgrammingRobotId = currentRobot.id;
    this.programmingUnlockedRobotId = currentRobot.id;
    this.applyModeState();
    this.updateCardsUI();
    this.resizeCanvas();
    CharacterManager?.refreshForCurrentTurn?.();
    requestAnimationFrame(() => {
      const screen = document.getElementById('screen-play');
      if (screen && this.programmingPanel) {
        const top = this.programmingPanel.offsetTop - 12;
        screen.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      } else {
        this.programmingPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  isProgrammingUnlocked(robot = this.getProgrammingRobot()) {
    if (this.isP2pMode()) return this.engine.phase === 'programming' || this.engine.phase === 'ready';
    if (this.engine.phase !== 'programming') return true;
    if (!robot) return false;
    return this.programmingUnlockedRobotId === robot.id;
  }

  isPrivacyGateVisible(robot = this.getFocusedRobot()) {
    if (this.isP2pMode()) return false;
    return this.engine.phase === 'programming' && !this.isProgrammingUnlocked(robot);
  }

  getDisplayPlayerName(robot) {
    if (!robot) return '';
    return robot.name || CONFIG.DEFAULT_CHARACTER.name;
  }

  getDisplayPlayerNameById(robotId) {
    const robot = this.engine.robots.find(entry => entry.id === robotId);
    return this.getDisplayPlayerName(robot);
  }
}
