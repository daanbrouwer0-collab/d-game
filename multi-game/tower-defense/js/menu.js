/* MERGE-BLOCK: menu.js */
const Menu = (() => {
  let overlay;
  let msgEl;
  let currentSessionId = null;
  let hasStarted = false;

  function init(getState, applyState) {
    overlay = document.getElementById('menu-overlay');
    msgEl = document.getElementById('menu-msg');

    Menu._getState = getState;
    Menu._applyState = applyState;

    bindEvents();
    autoBootSession();
  }

  function autoBootSession() {
    let session = null;
    const lastId = Storage.readLastSessionId();
    if (lastId) session = Storage.getSession(lastId);
    if (!session) {
      const all = Storage.readSessions();
      if (all.length) session = all[0];
    }
    if (!session) {
      session = createSession({
        sessionName: 'D-Tower',
        characterName: 'Commandant',
        difficulty: 'normal'
      });
      Storage.upsertSession(session);
    }
    applySessionToGame(session, !!session.gameState);
    hide();
  }

  function bindEvents() {
    document.getElementById('btn-session-resume')?.addEventListener('click', () => resumeGame());
    document.getElementById('btn-session-restart')?.addEventListener('click', () => restartCurrentLevel());
    document.getElementById('btn-session-to-sectors')?.addEventListener('click', () => {
      hide();
      Nav.switchTab('sectors');
    });

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) resumeGame();
    });
  }

  function show(view = 'pause') {
    overlay?.classList.remove('hidden');
    document.getElementById('pause-badge')?.classList.remove('hidden');
    updatePauseInfo();
  }

  function hide() {
    overlay?.classList.add('hidden');
    document.getElementById('pause-badge')?.classList.add('hidden');
    setMenuMessage('');
  }

  function isVisible() {
    return !!overlay && !overlay.classList.contains('hidden');
  }

  function isSessionActive() {
    return hasStarted && !!currentSessionId;
  }

  function hasStartedGame() {
    return hasStarted;
  }

  function getCurrentSessionId() {
    return currentSessionId;
  }

  function getActiveSessionId() {
    return currentSessionId;
  }

  function getActiveSession() {
    return currentSessionId ? Storage.getSession(currentSessionId) : null;
  }

  function normalizeDifficulty(val) {
    return val === 'easy' || val === 'hard' ? val : 'normal';
  }

  function createSession({ sessionName, characterName, difficulty }) {
    const now = Date.now();
    const session = {
      id: `session-${now}`,
      sessionName: sessionName || 'D-Tower',
      characterName: characterName || 'Commandant',
      difficulty: normalizeDifficulty(difficulty),
      castleColor: CFG.CASTLE.color,
      gameState: null,
      maxCompletedLevel: 0,
      currentLevel: 1,
      stats: { wavesSurvived: 0, sectorsSecured: 0 },
      createdAt: now,
      updatedAt: now
    };
    return Vip.syncSessionVip(session);
  }

  function applySessionToGame(session, fromSave = false) {
    try {
      Vip.syncSessionVip(session);
      session.updatedAt = Date.now();
      Storage.upsertSession(session);
      currentSessionId = session.id;
      Storage.writeLastSessionId(session.id);

      G.sessionMeta = {
        sessionName: session.sessionName,
        characterName: session.characterName,
        difficulty: session.difficulty,
        vip: session.vip,
        maxCompletedLevel: session.maxCompletedLevel || 0,
        stats: session.stats || { wavesSurvived: 0 }
      };

      if (session.castleColor) {
        G.setCastleColor(session.castleColor);
      }

      if (fromSave && session.gameState && Menu._applyState) {
        Menu._applyState(session.gameState);
      } else {
        G.startFreshLevel(session.currentLevel || 1);
      }

      hasStarted = true;
      hide();
      Nav.switchTab('play');
    } catch (err) {
      console.error('Session start mislukt:', err);
    }
  }

  function resumeGame() {
    hide();
    G.resumeFromMenu();
  }

  function restartCurrentLevel() {
    hide();
    G.retryLvl();
    Toast.show('Sector herstart');
  }

  function updatePauseInfo() {
    const metaEl = document.getElementById('pause-session-meta');
    if (!metaEl) return;
    const session = getActiveSession();
    if (!session) {
      metaEl.textContent = 'Gepauzeerd';
      return;
    }
    metaEl.textContent = `${session.characterName} · Sector ${G.lvl || 1}: ${GameConfig.getLevelName(G.lvl || 1)}`;
  }

  function setMenuMessage(msg) {
    if (msgEl) msgEl.textContent = msg || '';
  }

  function autoSaveGameState() {
    if (!currentSessionId || !hasStarted) return false;
    const session = Storage.getSession(currentSessionId);
    if (!session) return false;
    if (Menu._getState) {
      session.gameState = Menu._getState();
    }
    session.currentLevel = G.lvl || 1;
    if (G.lvl > (session.maxCompletedLevel || 0)) {
      session.maxCompletedLevel = Math.max(session.maxCompletedLevel || 0, G.lvl - 1);
    }
    session.stats = G.sessionMeta?.stats || session.stats;
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    Storage.writeLastSessionId(session.id);
    return true;
  }

  function saveFromApp() {
    autoSaveGameState();
    Toast.show('Voortgang opgeslagen');
  }

  function openStartScreen() {
    show('pause');
  }

  function resetAll() {
    Storage.forgetAll();
    currentSessionId = null;
    hasStarted = false;
    Toast.show('Geheugen gewist');
    setTimeout(() => location.reload(), 300);
  }

  return {
    init,
    show,
    hide,
    isVisible,
    isSessionActive,
    hasStarted: hasStartedGame,
    getCurrentSessionId,
    getActiveSessionId,
    getActiveSession,
    autoSave: autoSaveGameState,
    saveFromApp,
    openStartScreen,
    resetAll,
    setMenuMessage
  };
})();
/* END-MERGE-BLOCK */
