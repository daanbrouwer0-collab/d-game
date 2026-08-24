const StorageManager = {
  /** One player color → used for robot, highlight and name swatch. */
  makeColors(hex, fallbackHex = '#00ffff') {
    const value = this.normalizeHex(hex) || this.normalizeHex(fallbackHex) || '#00ffff';
    return { head: value, body: value, legs: value };
  },

  normalizeHex(value) {
    if (typeof value !== 'string') return null;
    const hex = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      const [, r, g, b] = hex;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
  },

  getPlayerColor(playerOrColors) {
    const colors = playerOrColors?.colors || playerOrColors || {};
    return this.normalizeHex(colors.head)
      || this.normalizeHex(colors.body)
      || this.normalizeHex(colors.legs)
      || '#00ffff';
  },

  normalizePlayer(raw, fallback) {
    const base = fallback || CONFIG.DEFAULT_PLAYERS[0];
    const rawColors = (raw && raw.colors) || {};
    // Prefer explicit single color; otherwise migrate old 3-color setups via body/head.
    const chosen = this.normalizeHex(raw && raw.color)
      || this.normalizeHex(rawColors.head)
      || this.normalizeHex(rawColors.body)
      || this.normalizeHex(rawColors.legs)
      || this.getPlayerColor(base);
    const colors = this.makeColors(chosen);
    const styleIds = CONFIG.ROBOT_STYLES.map(style => style.id);
    const style = styleIds.includes(raw && raw.style) ? raw.style : (base.style || 'scout');
    return {
      name: ((raw && raw.name) || base.name || 'Robot').trim().slice(0, 24) || base.name,
      color: colors.head,
      colors,
      style
    };
  },

  loadPlayers() {
    try {
      const raw = localStorage.getItem(CONFIG.PLAYERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return CONFIG.DEFAULT_PLAYERS.map((fallback, index) => (
            this.normalizePlayer(parsed[index], fallback)
          ));
        }
      }
    } catch {
      // fall through to migration / defaults
    }

    const hub = this.loadCharacter();
    const players = CONFIG.DEFAULT_PLAYERS.map((fallback, index) => {
      if (index === 0) {
        return this.normalizePlayer({
          name: hub.name,
          colors: hub.colors,
          style: hub.style || fallback.style
        }, fallback);
      }
      return this.normalizePlayer(fallback, fallback);
    });
    this.savePlayers(players);
    return players;
  },

  savePlayers(players) {
    const normalized = CONFIG.DEFAULT_PLAYERS.map((fallback, index) => (
      this.normalizePlayer(players && players[index], fallback)
    ));
    try {
      localStorage.setItem(CONFIG.PLAYERS_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.warn('Failed to save players', e);
    }
    this.saveCharacter({
      name: normalized[0].name,
      color: normalized[0].color,
      colors: normalized[0].colors,
      style: normalized[0].style
    });
    return normalized;
  },

  loadCharacter() {
    try {
      const raw = localStorage.getItem(CONFIG.CHAR_KEY);
      if (!raw) {
        return this.normalizePlayer(CONFIG.DEFAULT_CHARACTER, CONFIG.DEFAULT_CHARACTER);
      }
      const data = JSON.parse(raw);
      return this.normalizePlayer({
        name: data.name || CONFIG.DEFAULT_CHARACTER.name,
        color: data.color,
        colors: data.colors,
        style: data.style || CONFIG.DEFAULT_CHARACTER.style
      }, CONFIG.DEFAULT_CHARACTER);
    } catch {
      return this.normalizePlayer(CONFIG.DEFAULT_CHARACTER, CONFIG.DEFAULT_CHARACTER);
    }
  },

  saveCharacter(charData) {
    try {
      const normalized = this.normalizePlayer(charData, CONFIG.DEFAULT_CHARACTER);
      localStorage.setItem(CONFIG.CHAR_KEY, JSON.stringify({
        name: normalized.name,
        color: normalized.color,
        colors: normalized.colors,
        style: normalized.style
      }));
    } catch (e) {
      console.warn('Failed to save character', e);
    }
  },

  loadSessions() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveSessions(sessions) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to save sessions', e);
    }
  },

  getActiveSession() {
    const sessions = this.loadSessions();
    return sessions.find(s => s.active) || null;
  },

  setActiveSession(id) {
    const sessions = this.loadSessions();
    sessions.forEach(s => { s.active = (s.id === id); });
    this.saveSessions(sessions);
  },

  updateSession(id, patch) {
    const sessions = this.loadSessions();
    const target = sessions.find(session => session.id === id);
    if (!target) return null;
    Object.assign(target, patch || {});
    this.saveSessions(sessions);
    return target;
  },

  clampStartingLives(value) {
    return Math.max(
      CONFIG.MIN_STARTING_LIVES,
      Math.min(
        CONFIG.MAX_STARTING_LIVES,
        Number(value) || CONFIG.DEFAULT_STARTING_LIVES
      )
    );
  },

  createSession(name, charName, difficulty = 'normal', boardData = null, gameMode = 'hotseat', playerCount = 2, checkpointsCount = null, startingLives = null, extras = null) {
    const sessions = this.loadSessions();
    const flags = Math.max(
      CONFIG.MIN_CHECKPOINTS,
      Math.min(
        CONFIG.MAX_CHECKPOINTS,
        Number(checkpointsCount || boardData?.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS)
      )
    );
    const lives = this.clampStartingLives(
      startingLives != null ? startingLives : CONFIG.DEFAULT_STARTING_LIVES
    );
    const extra = extras && typeof extras === 'object' ? extras : {};
    const newSession = {
      id: 'session_' + Date.now(),
      name: name || 'Rally ' + (sessions.length + 1),
      charName: charName || 'CyberBot',
      difficulty,
      checkpointsCount: flags,
      startingLives: lives,
      courseId: boardData?.id || 'random',
      boardData: boardData || null,
      gameMode,
      playerCount,
      playTransport: gameMode === CONFIG.GAME_MODES.MATRIX
        ? CONFIG.PLAY_TRANSPORTS.MATRIX
        : CONFIG.PLAY_TRANSPORTS.LOCAL,
      matrixRoomId: extra.matrixRoomId || null,
      matrixHostId: extra.matrixHostId || null,
      matrixSeed: extra.matrixSeed || null,
      gameState: null,
      checkpoint: 1,
      wins: 0,
      active: true,
      createdAt: new Date().toISOString(),
      savedAt: null
    };
    sessions.forEach(s => { s.active = false; });
    sessions.push(newSession);
    this.saveSessions(sessions);
    return newSession;
  },

  normalizeGameMode(session) {
    if (!session) return CONFIG.GAME_MODES.HOTSEAT;
    if (session.gameMode === 'hotseat_2p') return CONFIG.GAME_MODES.HOTSEAT;
    if (session.gameMode === CONFIG.GAME_MODES.VS_AI) return CONFIG.GAME_MODES.VS_AI;
    if (session.gameMode === CONFIG.GAME_MODES.MATRIX || session.playTransport === CONFIG.PLAY_TRANSPORTS.MATRIX) {
      return CONFIG.GAME_MODES.MATRIX;
    }
    return CONFIG.GAME_MODES.HOTSEAT;
  },

  isMatrixSession(session) {
    return this.normalizeGameMode(session) === CONFIG.GAME_MODES.MATRIX;
  }
};
