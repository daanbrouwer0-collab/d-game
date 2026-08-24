const CharacterManager = {
  init() {
    this.players = StorageManager.loadPlayers();
    this.activeIndex = 0;
    this.canEdit = true;

    this.canvas = document.getElementById('character-preview');
    this.ctx = this.canvas?.getContext('2d');
    this.nameInput = document.getElementById('character-display-name');
    this.playerTabs = document.getElementById('player-tabs');
    this.styleGrid = document.getElementById('robot-style-grid');
    this.frontHint = document.getElementById('character-front-hint');
    this.intro = document.querySelector('.character-intro');
    this.editorCard = document.getElementById('character-editor');

    this.colorInput = document.getElementById('color-primary');
    this.swatch = document.getElementById('swatch-color');
    this.valueLabel = document.getElementById('value-color');

    this.buildStyleGrid();
    this.bindEvents();
    this.refreshForCurrentTurn();
  },

  isFormFocused() {
    const active = document.activeElement;
    return active === this.colorInput || active === this.nameInput;
  },

  /**
   * Roster-index van de mens die nu mag programmeren / aan de beurt is.
   */
  getEditablePlayerIndex() {
    const app = window.RobotRallyApp;
    const engine = app?.engine;
    if (!app?.sessionReady || !engine?.robots?.length) {
      return 0;
    }

    const robot = (app.ui && typeof app.ui.getProgrammingRobot === 'function')
      ? app.ui.getProgrammingRobot()
      : engine.robots[engine.programmingPlayerIndex];

    if (!robot || robot.isBot) {
      const fallback = engine.robots.find(entry => !entry.isBot && !entry.eliminated);
      return fallback ? this.rosterIndexForRobot(fallback) : null;
    }

    return this.rosterIndexForRobot(robot);
  },

  rosterIndexForRobot(robot) {
    if (!robot) return null;
    const match = String(robot.id || '').match(/^player_(\d+)$/);
    if (match) {
      const index = Number(match[1]) - 1;
      if (index >= 0 && index < CONFIG.MAX_PLAYERS) return index;
    }

    const engine = window.RobotRallyApp?.engine;
    if (!engine?.robots) return 0;
    const robotIndex = engine.robots.findIndex(entry => entry.id === robot.id);
    if (robotIndex < 0) return 0;

    let humanIndex = 0;
    for (let i = 0; i < robotIndex; i++) {
      if (!engine.robots[i].isBot) humanIndex += 1;
    }
    return humanIndex;
  },

  refreshEditableSlots() {
    this.refreshForCurrentTurn();
  },

  refreshForCurrentTurn() {
    const keepFormValues = this.isFormFocused();
    this.players = StorageManager.loadPlayers();
    const editIndex = this.getEditablePlayerIndex();
    this.canEdit = editIndex != null;
    this.activeIndex = editIndex != null ? editIndex : 0;

    this.updateTurnBadge();
    this.updateIntro();
    this.setEditorEnabled(this.canEdit);

    if (!keepFormValues) {
      this.loadActivePlayerIntoForm();
    }

    this.updateStyleSelection();
    this.refreshStylePreviews();
    this.render();
  },

  updateTurnBadge() {
    if (!this.playerTabs) return;
    this.playerTabs.innerHTML = '';

    if (!this.canEdit) {
      const note = document.createElement('div');
      note.className = 'character-turn-note';
      note.textContent = 'Geen speler om aan te passen. Laad een sessie om verder te gaan.';
      this.playerTabs.appendChild(note);
      return;
    }

    const player = this.players[this.activeIndex];
    const color = StorageManager.getPlayerColor(player);
    const app = window.RobotRallyApp;
    const inSession = !!app?.sessionReady;
    const badge = document.createElement('div');
    badge.className = 'character-turn-badge';
    badge.innerHTML = `
      <span class="player-tab-swatch" style="background:${color}"></span>
      <span>${inSession ? 'Speler aan de beurt' : 'Speler'}: <strong>${player.name || `Speler ${this.activeIndex + 1}`}</strong> (P${this.activeIndex + 1})</span>
    `;
    this.playerTabs.appendChild(badge);
  },

  updateIntro() {
    if (!this.intro) return;
    this.intro.textContent = this.canEdit
      ? 'Je past alleen het karakter aan van de speler die (nu) aan de beurt is met kaarten. Kies naam, kleur en stijl.'
      : 'Laad een sessie om een karakter aan te passen.';
  },

  setEditorEnabled(enabled) {
    const disable = !enabled;
    if (this.nameInput) this.nameInput.disabled = disable;
    if (this.colorInput) this.colorInput.disabled = disable;
    document.getElementById('btn-reset-colors')?.toggleAttribute('disabled', disable);
    this.styleGrid?.querySelectorAll('.robot-style-card').forEach(card => {
      card.disabled = disable;
      card.classList.toggle('is-disabled', disable);
    });
    this.editorCard?.classList.toggle('is-locked', disable);
  },

  getActiveColor() {
    return StorageManager.getPlayerColor(this.players[this.activeIndex]);
  },

  setActiveColor(hex) {
    if (!this.canEdit) return;
    const colors = StorageManager.makeColors(hex, this.getActiveColor());
    this.players[this.activeIndex].color = colors.head;
    this.players[this.activeIndex].colors = colors;
  },

  buildStyleGrid() {
    if (!this.styleGrid) return;
    this.styleGrid.innerHTML = '';
    CONFIG.ROBOT_STYLES.forEach(style => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'robot-style-card';
      btn.dataset.style = style.id;
      btn.innerHTML = `
        <canvas class="robot-style-canvas" width="72" height="72" aria-hidden="true"></canvas>
        <span class="robot-style-label">${style.label}</span>
        <span class="robot-style-desc">${style.desc}</span>
      `;
      btn.addEventListener('click', () => {
        if (!this.canEdit) return;
        this.players[this.activeIndex].style = style.id;
        this.save();
        this.updateStyleSelection();
        this.render();
      });
      this.styleGrid.appendChild(btn);
    });
    this.refreshStylePreviews();
    this.updateStyleSelection();
  },

  refreshStylePreviews() {
    if (!this.styleGrid) return;
    const colors = this.players[this.activeIndex]?.colors || StorageManager.makeColors('#00ffff');
    this.styleGrid.querySelectorAll('.robot-style-card').forEach(card => {
      const mini = card.querySelector('canvas');
      const miniCtx = mini?.getContext('2d');
      if (!miniCtx) return;
      miniCtx.setTransform(1, 0, 0, 1, 0, 0);
      miniCtx.clearRect(0, 0, 72, 72);
      miniCtx.translate(36, 40);
      RobotDraw.draw(miniCtx, {
        size: 28,
        colors,
        style: card.dataset.style,
        showFrontMarker: true,
        glow: false
      });
    });
  },

  updateStyleSelection() {
    const activeStyle = this.players[this.activeIndex]?.style;
    this.styleGrid?.querySelectorAll('.robot-style-card').forEach(card => {
      card.classList.toggle('active', card.dataset.style === activeStyle);
    });
  },

  bindEvents() {
    this.nameInput?.addEventListener('input', (e) => {
      if (!this.canEdit) return;
      this.players[this.activeIndex].name = e.target.value.trim().slice(0, 24)
        || CONFIG.DEFAULT_PLAYERS[this.activeIndex].name;
      this.save();
      this.updateTurnBadge();
    });

    this.colorInput?.addEventListener('input', (e) => {
      if (!this.canEdit) return;
      this.setActiveColor(e.target.value);
      this.afterColorChange();
    });

    // Makkelijker tikken: swatch opent ook de kleurkiezer
    this.swatch?.addEventListener('click', () => {
      if (!this.canEdit || this.colorInput?.disabled) return;
      this.colorInput?.click();
    });

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      if (!this.canEdit) return;
      const fallback = CONFIG.DEFAULT_PLAYERS[this.activeIndex];
      this.setActiveColor(StorageManager.getPlayerColor(fallback));
      this.players[this.activeIndex].style = fallback.style;
      this.loadActivePlayerIntoForm();
      this.save();
      this.render();
      this.refreshStylePreviews();
      this.updateStyleSelection();
      this.updateTurnBadge();
      Toast.show('Robot gereset!');
    });
  },

  afterColorChange() {
    this.updateSummary();
    this.save();
    this.render();
    this.refreshStylePreviews();
    this.updateTurnBadge();
  },

  loadActivePlayerIntoForm() {
    const player = this.players[this.activeIndex] || CONFIG.DEFAULT_PLAYERS[0];
    const color = StorageManager.getPlayerColor(player);
    if (this.nameInput) this.nameInput.value = player.name;
    if (this.colorInput) this.colorInput.value = color;
    if (this.frontHint) {
      this.frontHint.textContent = `${player.name} · de witte pijl wijst naar de voorkant`;
    }
    this.updateSummary();
  },

  save() {
    if (!this.canEdit) return;
    this.players = StorageManager.savePlayers(this.players);
    if (window.RobotRallyApp) {
      window.RobotRallyApp.onPlayersUpdated(this.players);
    }
    // Matrix lobby: sync seat appearance to the room
    if (
      typeof P2pSessionController !== 'undefined'
      && P2pSessionController.isActive?.()
      && P2pSessionController.lobby?.status === 'lobby'
    ) {
      const player = this.players[this.activeIndex];
      P2pSessionController.updateLocalSeatProfile(player).catch(() => {});
    }
  },

  render() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    const player = this.players[this.activeIndex] || CONFIG.DEFAULT_PLAYERS[0];

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(0, 255, 255, 0.08)');
    bg.addColorStop(1, 'rgba(255, 0, 255, 0.05)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VOORKANT ↑', w / 2, 18);

    ctx.save();
    ctx.translate(w / 2, h / 2 + 8);
    RobotDraw.draw(ctx, {
      size: 70,
      colors: player.colors,
      style: player.style || 'scout',
      showFrontMarker: true,
      glow: true
    });
    ctx.restore();

    this.updateSummary();
  },

  updateSummary() {
    const color = this.getActiveColor();
    if (this.swatch) {
      this.swatch.style.background = color;
      this.swatch.style.cursor = this.canEdit ? 'pointer' : 'default';
    }
    if (this.valueLabel) this.valueLabel.textContent = color.toUpperCase();
    if (this.colorInput && !this.isFormFocused()) this.colorInput.value = color;
  }
};

window.CharacterManager = CharacterManager;
