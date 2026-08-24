/* MERGE-BLOCK: menu.js — session-based start/home/pause schermen */
const Menu = (() => {
  let overlay;
  let msgEl;
  let soundEnabled = false;
  let currentSessionId = null;
  let hasStarted = false;
  let activeView = 'new';
  let newSessionReturnView = 'home';
  let homeReturnView = null;

  const views = {};
  const els = {};

  function init(getState, applyState) {
    overlay = document.getElementById('menu-overlay');
    msgEl = document.getElementById('menu-msg');

    views.new = document.getElementById('menu-view-new');
    views.home = document.getElementById('menu-view-home');
    views.pause = document.getElementById('menu-view-pause');

    els.sessionName = document.getElementById('session-name');
    els.characterName = document.getElementById('character-name');
    els.sessionDifficulty = document.getElementById('session-difficulty');
    els.sessionSelect = document.getElementById('session-select');
    els.btnNewGo = document.getElementById('btn-session-new-go');
    els.btnNewBack = document.getElementById('btn-session-new-back');
    els.btnHomeGo = document.getElementById('btn-session-home-go');
    els.btnHomeNew = document.getElementById('btn-session-home-new');
    els.btnHomeBack = document.getElementById('btn-session-home-back');
    els.btnSave = document.getElementById('btn-session-save');
    els.btnResume = document.getElementById('btn-session-resume');
    els.btnPauseNew = document.getElementById('btn-session-pause-new');
    els.btnPauseLoad = document.getElementById('btn-session-pause-load');
    els.pauseTitle = document.getElementById('pause-session-title');
    els.pauseMeta = document.getElementById('pause-session-meta');

    Menu._getState = getState;
    Menu._applyState = applyState;

    loadSavedPreferences();
    bindEvents();
    show(getInitialView());
  }

  function getInitialView() {
    return Storage.readSessions().length ? 'home' : 'new';
  }

  function loadSavedPreferences() {
    const settings = Storage.readSettings();
    soundEnabled = !!settings.sound;
    updateSoundToggle();
  }

  function bindEvents() {
    els.btnNewGo?.addEventListener('click', () => startNewSession());
    els.btnNewBack?.addEventListener('click', () => goBackFromNewSession());
    els.btnHomeGo?.addEventListener('click', () => continueSelectedSession());
    els.btnHomeNew?.addEventListener('click', () => showNewFromHome());
    els.btnHomeBack?.addEventListener('click', () => goBackFromHome());
    els.btnSave?.addEventListener('click', () => saveCurrentSession());
    els.btnResume?.addEventListener('click', () => resumeGame());
    els.btnPauseNew?.addEventListener('click', () => showNewFromPause());
    els.btnPauseLoad?.addEventListener('click', () => showLoadFromPause());

    els.sessionName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.btnNewGo?.click();
    });
    els.characterName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.btnNewGo?.click();
    });

    overlay?.addEventListener('click', (e) => {
      if (activeView !== 'pause') return;
      if (e.target === overlay) resumeGame();
    });
  }

  function show(view = 'home') {
    if (view === 'pause' && !hasStarted) {
      view = Storage.readSessions().length ? 'home' : 'new';
    }

    activeView = view;
    overlay?.classList.remove('hidden');

    if (view === 'pause') {
      document.getElementById('pause-badge')?.classList.remove('hidden');
    } else {
      document.getElementById('pause-badge')?.classList.add('hidden');
    }

    Object.entries(views).forEach(([id, el]) => {
      el?.classList.toggle('hidden', id !== view);
    });

    if (view === 'new') {
      const showBack = Storage.readSessions().length > 0 || newSessionReturnView === 'pause';
      els.btnNewBack?.classList.toggle('hidden', !showBack);
    }

    if (view === 'home') {
      populateSessionSelect();
      els.btnHomeBack?.classList.toggle('hidden', homeReturnView !== 'pause');
    }

    if (view === 'pause') {
      updatePauseInfo();
    }

    setMenuMessage('');
    Nav.setStartNavActive?.(view === 'pause');
    overlay?.classList.toggle('menu-overlay-pause', view === 'pause');
  }

  function hide() {
    overlay?.classList.add('hidden');
    document.getElementById('pause-badge')?.classList.add('hidden');
    setMenuMessage('');
    Nav.setStartNavActive?.(false);
  }

  function resetNewSessionForm() {
    if (els.sessionName) els.sessionName.value = '';
    if (els.characterName) els.characterName.value = '';
    if (els.sessionDifficulty) els.sessionDifficulty.value = 'normal';
  }

  function showNewFromHome() {
    newSessionReturnView = 'home';
    homeReturnView = null;
    resetNewSessionForm();
    show('new');
  }

  function showNewFromPause() {
    newSessionReturnView = 'pause';
    resetNewSessionForm();
    show('new');
  }

  function showLoadFromPause() {
    homeReturnView = 'pause';
    populateSessionSelect();
    show('home');
  }

  function goBackFromHome() {
    if (homeReturnView === 'pause' && hasStarted) {
      homeReturnView = null;
      show('pause');
    }
  }

  function goBackFromNewSession() {
    if (newSessionReturnView === 'pause' && hasStarted) {
      show('pause');
      return;
    }
    show(Storage.readSessions().length ? 'home' : 'new');
  }

  function populateSessionSelect() {
    if (!els.sessionSelect) return;

    const sessions = Storage.readSessions().sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    els.sessionSelect.innerHTML = '';

    if (!sessions.length) {
      show('new');
      return;
    }

    const lastId = Storage.readLastSessionId();
    let defaultId = sessions[0].id;
    if (lastId && sessions.some((s) => s.id === lastId)) {
      defaultId = lastId;
    }

    for (const session of sessions) {
      const option = document.createElement('option');
      option.value = session.id;
      const diffLabel = GameConfig.difficulty[session.difficulty]?.label || session.difficulty;
      const level = Number(session.gameState?.level) || 1;
      option.textContent = `${session.sessionName} — ${session.characterName} (${diffLabel}, Lvl ${level})`;
      if (session.id === defaultId) option.selected = true;
      els.sessionSelect.appendChild(option);
    }
  }

  function normalizeDifficulty(value) {
    return GameConfig.difficulty[value] ? value : 'normal';
  }

  function trimName(value, max) {
    return String(value || '').trim().slice(0, max);
  }

  function createSession({ sessionName, characterName, difficulty }) {
    const now = Date.now();
    return {
      id: `session-${now}`,
      sessionName,
      characterName,
      difficulty: normalizeDifficulty(difficulty),
      gameState: null,
      createdAt: now,
      updatedAt: now
    };
  }

  function applySessionToGame(session, fromSave = false) {
    currentSessionId = session.id;
    homeReturnView = null;
    Storage.writeLastSessionId(session.id);
    SlotGame.setSessionMeta({
      sessionName: session.sessionName,
      characterName: session.characterName,
      difficulty: session.difficulty
    });

    if (fromSave && session.gameState) {
      SlotGame.importState(session.gameState);
      hasStarted = true;
      hide();
      SlotGame.start(true);
      Toast.show(`Session "${session.sessionName}" geladen`);
    } else {
      hasStarted = true;
      hide();
      SlotGame.start(false);
      Toast.show(`Session "${session.sessionName}" gestart`);
    }

    Nav.switchTab('items');
  }

  function startNewSession() {
    const maxName = GameConfig.session?.maxNameLength || 24;
    const maxChar = GameConfig.session?.maxCharacterLength || 18;

    const sessionName = trimName(els.sessionName?.value, maxName) || 'Nieuwe session';
    const characterName = trimName(els.characterName?.value, maxChar) || 'Held';
    const difficulty = normalizeDifficulty(els.sessionDifficulty?.value);

    if (els.sessionName) els.sessionName.value = sessionName;
    if (els.characterName) els.characterName.value = characterName;

    const session = createSession({ sessionName, characterName, difficulty });
    Storage.upsertSession(session);
    applySessionToGame(session, false);
  }

  function continueSelectedSession() {
    const id = els.sessionSelect?.value;
    if (!id) {
      setMenuMessage('Kies een session.');
      return;
    }

    const session = Storage.getSession(id);
    if (!session) {
      setMenuMessage('Session niet gevonden.');
      populateSessionSelect();
      return;
    }

    applySessionToGame(session, !!session.gameState);
  }

  function getActiveSession() {
    if (!currentSessionId) return null;
    return Storage.getSession(currentSessionId);
  }

  function saveCurrentSession() {
    const state = getState();
    if (!state || !currentSessionId) {
      setMenuMessage('Geen actieve session om op te slaan.');
      return;
    }

    const session = Storage.getSession(currentSessionId);
    if (!session) {
      setMenuMessage('Session niet gevonden.');
      return;
    }

    session.gameState = state;
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    Storage.writeLastSessionId(session.id);
    setMenuMessage('Session opgeslagen!');
    Toast.show('Session opgeslagen');
    updatePauseInfo();
  }

  function resumeGame() {
    if (!hasStarted) return;
    hide();
    SlotGame.resume();
  }

  function updatePauseInfo() {
    const session = getActiveSession();
    if (!session) {
      if (els.pauseTitle) els.pauseTitle.textContent = 'Session';
      if (els.pauseMeta) els.pauseMeta.textContent = '';
      return;
    }

    const diffLabel = GameConfig.difficulty[session.difficulty]?.label || session.difficulty;
    const level = Number(session.gameState?.level) || Number(getState()?.level) || 1;
    const savedAt = session.gameState ? Storage.formatTimestamp(session.updatedAt) : 'Nog niet opgeslagen';

    if (els.pauseTitle) els.pauseTitle.textContent = session.sessionName;
    if (els.pauseMeta) {
      els.pauseMeta.textContent = `${session.characterName} · ${diffLabel} · Level ${level} · ${savedAt}`;
    }
  }

  function getState() {
    return Menu._getState ? Menu._getState() : null;
  }

  function updateSoundToggle() {
    const settingsToggle = document.getElementById('toggle-sound-settings');
    if (settingsToggle) {
      settingsToggle.textContent = soundEnabled ? 'Geluid: AAN' : 'Geluid: UIT';
      settingsToggle.classList.toggle('active', soundEnabled);
      settingsToggle.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    }
  }

  function setMenuMessage(text) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
  }

  function isVisible() {
    return overlay && !overlay.classList.contains('hidden');
  }

  function saveFromApp() {
    saveCurrentSession();
  }

  function openStartScreen(fromGame = false) {
    if (fromGame && hasStarted && currentSessionId) {
      show('pause');
      return;
    }
    show(Storage.readSessions().length ? 'home' : 'new');
  }

  function resetAll() {
    Storage.forgetAll();
    currentSessionId = null;
    hasStarted = false;
    newSessionReturnView = 'home';
    soundEnabled = false;
    loadSavedPreferences();
    resetNewSessionForm();
    SlotGame.stopGame();
    AppMenu.refreshSettings?.();
    Character.refresh?.();
    Nav.switchTab('play');
    show('new');
    Toast.show('Alle data gewist');
  }

  return {
    init,
    show,
    hide,
    isVisible,
    saveFromApp,
    openStartScreen,
    resetAll,
    setMenuMessage
  };
})();
/* END-MERGE-BLOCK */
