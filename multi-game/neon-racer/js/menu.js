/* MERGE-BLOCK: menu.js */
const Menu = (() => {
  let overlay;
  let msgEl;
  let currentSessionId = null;
  let hasStarted = false;
  let soundEnabled = false;

  function init() {
    overlay = document.getElementById('menu-overlay');
    msgEl = document.getElementById('menu-msg');

    bindEvents();
    loadSavedPreferences();
    autoBootSession();
  }

  function loadSavedPreferences() {
    const settings = Storage.readSettings();
    soundEnabled = !!settings.sound;
    AppMenu.refreshSettings?.();
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
        sessionName: 'Neon Racer',
        characterName: 'Racer',
        difficulty: 'normal'
      });
      Storage.upsertSession(session);
    }
    applySessionToGame(session, false, false);
    hide();
  }

  function bindEvents() {
    document.getElementById('btn-session-resume')?.addEventListener('click', () => resumeGame());
    document.getElementById('btn-session-pause-restart')?.addEventListener('click', () => restartCurrentSession());
    document.getElementById('btn-session-to-tracks')?.addEventListener('click', () => {
      hide();
      Nav.switchTab('tracks');
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

  function getActiveSessionId() {
    return currentSessionId;
  }

  function getActiveSession() {
    return currentSessionId ? Storage.getSession(currentSessionId) : null;
  }

  function normalizeDifficulty(val) {
    return val === 'easy' || val === 'hard' ? val : 'normal';
  }

  function trimName(value, max) {
    return String(value || '').trim().slice(0, max);
  }

  function createSession({ sessionName, characterName, difficulty }) {
    const now = Date.now();
    const session = {
      id: `session-${now}`,
      sessionName: sessionName || 'Neon Racer',
      characterName: characterName || 'Racer',
      difficulty: normalizeDifficulty(difficulty),
      gameState: null,
      createdAt: now,
      updatedAt: now
    };
    return Vip.syncSessionVip(session);
  }

  function applySessionToGame(session, fromSave = false, switchToPlay = true) {
    try {
      Vip.syncSessionVip(session);
      session.updatedAt = Date.now();
      Storage.upsertSession(session);
      currentSessionId = session.id;
      Storage.writeLastSessionId(session.id);

      NeonRacerGame.setSessionMeta({
        sessionName: session.sessionName,
        characterName: session.characterName,
        difficulty: session.difficulty,
        vip: session.vip
      });

      if (session.gameState?.bestTimes) {
        NeonRacerGame.importState({ bestTimes: session.gameState.bestTimes }, true);
      }

      hasStarted = true;
      hide();
      NeonRacerGame.start(false);
      if (switchToPlay) Nav.switchTab('play');
    } catch (err) {
      console.error('Session start mislukt:', err);
    }
  }

  function startLastSession(switchToPlay = true) {
    const session = getActiveSession();
    if (!session) return false;
    applySessionToGame(session, true, switchToPlay);
    return true;
  }

  function resumeGame() {
    hide();
    NeonRacerGame.resume();
  }

  function restartCurrentSession() {
    if (!currentSessionId) return;
    const session = Storage.getSession(currentSessionId);
    if (!session) return;
    hide();
    NeonRacerGame.resetSessionRun();
    Toast.show('Nieuwe run gestart');
  }

  function updatePauseInfo() {
    const metaEl = document.getElementById('pause-session-meta');
    if (!metaEl) return;
    const session = getActiveSession();
    if (!session) {
      metaEl.textContent = 'Gepauzeerd';
      return;
    }
    const track = GameConfig.getTrack(NeonRacerGame.getCurrentLevel?.() || 1);
    metaEl.textContent = `${session.characterName} · Baan: ${track?.name || 'Neon Start'}`;
  }

  function setMenuMessage(msg) {
    if (msgEl) msgEl.textContent = msg || '';
  }

  function autoSaveGameState() {
    if (!currentSessionId || !hasStarted) return false;
    const session = Storage.getSession(currentSessionId);
    if (!session) return false;
    session.gameState = NeonRacerGame.exportState();
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    Storage.writeLastSessionId(session.id);
    return true;
  }

  function saveFromApp() {
    autoSaveGameState();
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

  function updateCharacterName(name) {
    if (!currentSessionId) return false;
    const session = Storage.getSession(currentSessionId);
    if (!session) return false;
    const maxChar = GameConfig.session?.maxCharacterLength || 18;
    const characterName = trimName(name, maxChar) || 'Racer';
    session.characterName = characterName;
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    NeonRacerGame.setSessionMeta({
      sessionName: session.sessionName,
      characterName,
      difficulty: session.difficulty,
      vip: session.vip
    });
    NeonRacerGame.updatePanelStats?.();
    return true;
  }

  return {
    init,
    show,
    hide,
    isVisible,
    isSessionActive,
    getActiveSessionId,
    getActiveSession,
    startLastSession,
    autoSaveGameState,
    saveFromApp,
    openStartScreen,
    resetAll,
    setMenuMessage,
    updateCharacterName
  };
})();
/* END-MERGE-BLOCK */
