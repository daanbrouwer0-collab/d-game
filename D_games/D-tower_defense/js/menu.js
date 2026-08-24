/* MERGE-BLOCK: menu.js */
const Menu = (() => {
  let overlay;
  let msgEl;
  let currentSessionId = null;
  let hasStarted = false;
  let activeView = 'new';
  let newSessionReturnView = 'home';
  let homeReturnView = null;
  let pickerMaxLevel = 1;

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
    els.levelInput = document.getElementById('session-level-input');
    els.levelName = document.getElementById('session-level-name');
    els.levelStatus = document.getElementById('session-level-status');
    els.levelHint = document.getElementById('session-level-hint');
    els.btnLevelPrev = document.getElementById('btn-level-prev');
    els.btnLevelNext = document.getElementById('btn-level-next');
    els.pauseLevelInput = document.getElementById('pause-level-input');
    els.pauseLevelName = document.getElementById('pause-level-name');
    els.pauseLevelStatus = document.getElementById('pause-level-status');
    els.pauseLevelHint = document.getElementById('pause-level-hint');
    els.btnPauseLevelPrev = document.getElementById('btn-pause-level-prev');
    els.btnPauseLevelNext = document.getElementById('btn-pause-level-next');
    els.btnNewGo = document.getElementById('btn-session-new-go');
    els.btnNewBack = document.getElementById('btn-session-new-back');
    els.btnHomeGo = document.getElementById('btn-session-home-go');
    els.btnHomeNew = document.getElementById('btn-session-home-new');
    els.btnHomeBack = document.getElementById('btn-session-home-back');
    els.btnSave = document.getElementById('btn-session-save');
    els.btnResume = document.getElementById('btn-session-resume');
    els.btnPauseNew = document.getElementById('btn-session-pause-new');
    els.btnPauseLoad = document.getElementById('btn-session-pause-load');
    els.btnRestart = document.getElementById('btn-session-restart');
    els.pauseTitle = document.getElementById('pause-session-title');
    els.pauseMeta = document.getElementById('pause-session-meta');

    Menu._getState = getState;
    Menu._applyState = applyState;

    bindEvents();
    show(getInitialView());
  }

  function getInitialView() {
    return Storage.readSessions().length ? 'home' : 'new';
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
    els.btnRestart?.addEventListener('click', () => restartCurrentLevel());

    els.sessionName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.btnNewGo?.click();
    });
    els.characterName?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.btnNewGo?.click();
    });
    els.sessionSelect?.addEventListener('change', () => {
      const session = Storage.getSession(els.sessionSelect?.value);
      if (session) syncLevelPicker(session);
    });

    els.btnLevelPrev?.addEventListener('click', () => stepLevel('home', -1));
    els.btnLevelNext?.addEventListener('click', () => stepLevel('home', 1));
    els.levelInput?.addEventListener('change', () => clampLevelInput('home'));
    els.levelInput?.addEventListener('blur', () => clampLevelInput('home'));
    els.levelInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clampLevelInput('home');
        els.btnHomeGo?.click();
      }
    });

    els.btnPauseLevelPrev?.addEventListener('click', () => stepLevel('pause', -1));
    els.btnPauseLevelNext?.addEventListener('click', () => stepLevel('pause', 1));
    els.pauseLevelInput?.addEventListener('change', () => clampLevelInput('pause'));
    els.pauseLevelInput?.addEventListener('blur', () => clampLevelInput('pause'));
    els.pauseLevelInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clampLevelInput('pause');
        restartCurrentLevel();
      }
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

    document.getElementById('pause-badge')?.classList.toggle('hidden', view !== 'pause');

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
      syncPauseLevelPicker();
    }

    setMenuMessage('');
    Nav.setStartNavActive?.(view === 'pause');
    overlay?.classList.toggle('menu-overlay-pause', view === 'pause');
    document.body.classList.toggle('game-active', false);
  }

  function hide() {
    overlay?.classList.add('hidden');
    document.getElementById('pause-badge')?.classList.add('hidden');
    setMenuMessage('');
    Nav.setStartNavActive?.(false);
    document.body.classList.toggle('game-active', Nav.getActiveTab() === 'play');
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

  function getMaxSelectableLevel(session) {
    if (Vip.resolveVip(session)) return Vip.getMaxLevel();
    const completed = Number(session?.maxCompletedLevel) || 0;
    const progress = Number(session?.currentLevel || session?.gameState?.lvl || 1);
    const nextUnlocked = completed + 1;
    return Math.max(nextUnlocked, progress, 1);
  }

  function getPreferredLevel(session) {
    const max = getMaxSelectableLevel(session);
    const completed = Number(session?.maxCompletedLevel) || 0;
    const hasSave = !!(session?.gameState?.map?.length);
    const savedLvl = hasSave ? Number(session.gameState.lvl) : 0;
    const currentLvl = Number(session?.currentLevel) || 0;
    let preferred = 1;
    if (currentLvl) preferred = currentLvl;
    else if (savedLvl) preferred = savedLvl;
    else if (completed > 0) preferred = completed + 1;
    return Math.min(Math.max(1, preferred), max);
  }

  function getSelectedSession() {
    const id = els.sessionSelect?.value;
    return id ? Storage.getSession(id) : null;
  }

  function getPickerEls(mode) {
    if (mode === 'pause') {
      return {
        input: els.pauseLevelInput,
        name: els.pauseLevelName,
        status: els.pauseLevelStatus,
        hint: els.pauseLevelHint,
        btnPrev: els.btnPauseLevelPrev,
        btnNext: els.btnPauseLevelNext
      };
    }
    return {
      input: els.levelInput,
      name: els.levelName,
      status: els.levelStatus,
      hint: els.levelHint,
      btnPrev: els.btnLevelPrev,
      btnNext: els.btnLevelNext
    };
  }

  function getSessionForPicker(mode) {
    return mode === 'pause' ? getActiveSession() : getSelectedSession();
  }

  function getPreferredLevelForPicker(session, mode) {
    if (mode === 'pause') {
      const current = Number(G.lvl) || 0;
      if (current) return Math.min(Math.max(1, current), getMaxSelectableLevel(session));
    }
    return getPreferredLevel(session);
  }

  function getSelectedLevel(mode = 'home') {
    const session = getSessionForPicker(mode);
    const max = session ? getMaxSelectableLevel(session) : pickerMaxLevel;
    const picker = getPickerEls(mode);
    const raw = Number(picker.input?.value) || 1;
    return Math.min(Math.max(1, Math.floor(raw)), max);
  }

  function stepLevel(mode, delta) {
    const session = getSessionForPicker(mode);
    if (!session) return;
    const max = getMaxSelectableLevel(session);
    const next = Math.min(max, Math.max(1, getSelectedLevel(mode) + delta));
    setPickerLevel(next, session, mode);
  }

  function clampLevelInput(mode = 'home') {
    const session = getSessionForPicker(mode);
    if (!session) return;
    setPickerLevel(getSelectedLevel(mode), session, mode);
  }

  function getLevelStatusText(session, lvl) {
    const completed = Number(session.maxCompletedLevel) || 0;
    const hasSave = !!(session.gameState?.map?.length);
    const savedLvl = hasSave ? Number(session.gameState.lvl) : 0;
    const currentLvl = Number(session.currentLevel) || 0;

    if (lvl <= completed) return '✓ Level voltooid';
    if (hasSave && lvl === savedLvl) return 'Opgeslagen voortgang';
    if (lvl === currentLvl || lvl === completed + 1) return 'Huidige voortgang';
    return '';
  }

  function setPickerLevel(lvl, session, mode = 'home') {
    const picker = getPickerEls(mode);
    if (!picker.input || !session) return;

    pickerMaxLevel = getMaxSelectableLevel(session);
    const level = Math.min(Math.max(1, lvl), pickerMaxLevel);

    picker.input.value = String(level);
    picker.input.min = '1';
    picker.input.max = String(pickerMaxLevel);

    if (picker.name) {
      picker.name.textContent = GameConfig.getLevelName(level);
    }
    if (picker.status) {
      picker.status.textContent = getLevelStatusText(session, level);
    }
    if (picker.btnPrev) picker.btnPrev.disabled = level <= 1;
    if (picker.btnNext) picker.btnNext.disabled = level >= pickerMaxLevel;
  }

  function syncLevelPickerHint(session, mode = 'home') {
    const picker = getPickerEls(mode);
    if (!picker.hint || !session) return;

    const completed = Number(session.maxCompletedLevel) || 0;
    const maxLevel = getMaxSelectableLevel(session);
    if (Vip.resolveVip(session)) {
      picker.hint.textContent = `★ VIP session — kies elk level 1–${maxLevel}`;
    } else {
      picker.hint.textContent = completed
        ? `${completed} level${completed === 1 ? '' : 's'} voltooid · kies level 1–${maxLevel}`
        : 'Nog geen levels voltooid · start bij level 1';
    }
  }

  function syncLevelPicker(session, mode = 'home') {
    if (!session) return;

    const preferred = getPreferredLevelForPicker(session, mode);
    setPickerLevel(preferred, session, mode);
    syncLevelPickerHint(session, mode);
  }

  function syncPauseLevelPicker() {
    const session = getActiveSession();
    if (!session) return;
    syncLevelPicker(session, 'pause');
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
    if (lastId && sessions.some((s) => s.id === lastId)) defaultId = lastId;

    for (const session of sessions) {
      Vip.syncSessionVip(session);
      const option = document.createElement('option');
      option.value = session.id;
      const diffLabel = GameConfig.difficulty[session.difficulty]?.label || session.difficulty;
      const level = session.gameState?.lvl || session.currentLevel || 1;
      const wave = session.gameState?.wave || session.currentWave || 1;
      const vipTag = session.vip ? ' ★ VIP' : '';
      option.textContent = `${session.sessionName}${vipTag} — ${session.characterName} (${diffLabel}, Lvl ${level} W${wave})`;
      if (session.id === defaultId) option.selected = true;
      els.sessionSelect.appendChild(option);
    }

    const active = sessions.find((s) => s.id === defaultId) || sessions[0];
    syncLevelPicker(active);
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
      currentLevel: 1,
      currentWave: 1,
      maxCompletedLevel: 0,
      vip: false,
      castleColor: CFG.CASTLE.color,
      stats: { wavesSurvived: 0, sectorsSecured: 0, totalEarned: 0 },
      gameState: null,
      createdAt: now,
      updatedAt: now
    };
  }

  function applySessionToGame(session, fromSave = false) {
    Vip.syncSessionVip(session);
    const selectedLevel = getSelectedLevel('home');

    if (!Vip.canAccessLevel(selectedLevel, session)) {
      setMenuMessage(Vip.getLockReason(selectedLevel, session) || 'Dit level is nog niet vrijgespeeld.');
      syncLevelPicker(session, 'home');
      return;
    }

    currentSessionId = session.id;
    homeReturnView = null;
    Storage.writeLastSessionId(session.id);

    G.setSessionMeta({
      sessionName: session.sessionName,
      characterName: session.characterName,
      difficulty: session.difficulty,
      vip: !!session.vip,
      maxCompletedLevel: session.maxCompletedLevel || 0,
      castleColor: session.castleColor || session.gameState?.castleColor || CFG.CASTLE.color,
      stats: session.stats || { wavesSurvived: 0, sectorsSecured: 0, totalEarned: 0 }
    });

    hasStarted = true;

    const savedLevel = Number(session.gameState?.lvl) || 0;
    const canResumeSave = !!(session.gameState?.map?.length && savedLevel === selectedLevel);

    if (canResumeSave) {
      G.importState(session.gameState);
      hide();
      G.resumeFromMenu();
      Toast.show(`Session "${session.sessionName}" hervat — level ${selectedLevel}`);
    } else {
      if (session.gameState?.map?.length && savedLevel !== selectedLevel) {
        session.gameState = null;
      }
      session.currentLevel = selectedLevel;
      session.currentWave = 1;
      session.updatedAt = Date.now();
      Storage.upsertSession(session);

      hide();
      G.startFresh(selectedLevel);
      autoSave();
      Toast.show(fromSave && !canResumeSave
        ? `Level ${selectedLevel} gestart`
        : `Session "${session.sessionName}" — level ${selectedLevel}`);
    }

    Character.refresh?.();
  }

  function startNewSession() {
    const maxName = GameConfig.session?.maxNameLength || 24;
    const maxChar = GameConfig.session?.maxCharacterLength || 18;

    const sessionName = trimName(els.sessionName?.value, maxName) || 'Nieuwe session';
    const characterName = trimName(els.characterName?.value, maxChar) || 'Operator';
    const difficulty = normalizeDifficulty(els.sessionDifficulty?.value);

    if (els.sessionName) els.sessionName.value = sessionName;
    if (els.characterName) els.characterName.value = characterName;

    const session = createSession({ sessionName, characterName, difficulty });
    Vip.syncSessionVip(session);
    Storage.upsertSession(session);
    applySessionToGame(session, false);
    if (session.vip) Toast.show('★ VIP session — alle levels beschikbaar');
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

    applySessionToGame(session, true);
  }

  function getActiveSession() {
    if (!currentSessionId) return null;
    return Storage.getSession(currentSessionId);
  }

  function getCurrentSessionId() {
    return currentSessionId;
  }

  function saveCurrentSession() {
    const state = Menu._getState?.();
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
    session.currentLevel = G.lvl || 1;
    session.currentWave = G.wave || 1;
    session.maxCompletedLevel = Math.max(session.maxCompletedLevel || 0, G.sessionMeta?.maxCompletedLevel || 0);
    session.castleColor = G.getCastleColor();
    session.stats = { ...G.sessionMeta?.stats };
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    Storage.writeLastSessionId(session.id);
    setMenuMessage('Session opgeslagen!');
    Toast.show('Session opgeslagen');
    updatePauseInfo();
  }

  function autoSave() {
    if (!hasStarted || !currentSessionId) return;
    const session = Storage.getSession(currentSessionId);
    if (!session) return;
    session.gameState = Menu._getState?.();
    session.currentLevel = G.lvl || 1;
    session.currentWave = G.wave || 1;
    session.maxCompletedLevel = Math.max(session.maxCompletedLevel || 0, G.sessionMeta?.maxCompletedLevel || 0);
    session.castleColor = G.getCastleColor();
    session.stats = { ...G.sessionMeta?.stats };
    session.updatedAt = Date.now();
    Storage.upsertSession(session);
    Character.refresh?.();
  }

  function recordLevelComplete(level) {
    if (!G.sessionMeta) return;
    G.sessionMeta.maxCompletedLevel = Math.max(G.sessionMeta.maxCompletedLevel || 0, level);
    G.sessionMeta.stats.sectorsSecured = (G.sessionMeta.stats.sectorsSecured || 0) + 1;
    if (currentSessionId) {
      const session = Storage.getSession(currentSessionId);
      if (session) {
        session.maxCompletedLevel = G.sessionMeta.maxCompletedLevel;
        session.currentLevel = level + 1;
        session.currentWave = 1;
        session.gameState = null;
        session.updatedAt = Date.now();
        Storage.upsertSession(session);
      }
    }
    Character.refresh?.();
  }

  function resumeGame() {
    if (!hasStarted) return;
    hide();
    G.resumeFromMenu();
  }

  function restartCurrentLevel() {
    if (!hasStarted || !currentSessionId) {
      setMenuMessage('Geen actieve session.');
      return;
    }

    const session = getActiveSession();
    if (!session) {
      setMenuMessage('Session niet gevonden.');
      return;
    }

    const previousLevel = Number(G.lvl) || 1;
    const selectedLevel = getSelectedLevel('pause');
    if (!Vip.canAccessLevel(selectedLevel, session)) {
      setMenuMessage(Vip.getLockReason(selectedLevel, session) || 'Dit level is nog niet vrijgespeeld.');
      syncPauseLevelPicker();
      return;
    }

    const savedLevel = Number(session.gameState?.lvl) || 0;
    if (session.gameState?.map?.length && savedLevel !== selectedLevel) {
      session.gameState = null;
    }
    session.currentLevel = selectedLevel;
    session.currentWave = 1;
    session.updatedAt = Date.now();
    Storage.upsertSession(session);

    G.lvl = selectedLevel;
    G.retryLvl();
    hide();
    Nav.switchTab('play');
    Toast.show(selectedLevel === previousLevel ? 'Level opnieuw gestart' : `Level ${selectedLevel} gestart`);
  }

  function updatePauseInfo() {
    const session = getActiveSession();
    if (!session) {
      if (els.pauseTitle) els.pauseTitle.textContent = 'Session';
      if (els.pauseMeta) els.pauseMeta.textContent = '';
      return;
    }

    const diffLabel = GameConfig.difficulty[session.difficulty]?.label || session.difficulty;
    const level = Number(G.lvl) || 1;
    const savedAt = session.gameState ? Storage.formatTimestamp(session.updatedAt) : 'Nog niet opgeslagen';

    if (els.pauseTitle) els.pauseTitle.textContent = session.sessionName;
    if (els.pauseMeta) {
      els.pauseMeta.textContent = `${session.characterName} · ${diffLabel} · Level ${level} · ${savedAt}`;
    }
  }

  function setMenuMessage(text) {
    if (msgEl) msgEl.textContent = text || '';
  }

  function isVisible() {
    return overlay && !overlay.classList.contains('hidden');
  }

  function saveFromApp() {
    saveCurrentSession();
  }

  function openStartScreen(fromGame = false) {
    if (fromGame && hasStarted && currentSessionId) {
      autoSave();
      show('pause');
      return;
    }
    show(Storage.readSessions().length ? 'home' : 'new');
  }

  function resumeFromSave() {
    if (!hasStarted || !currentSessionId) {
      Toast.show('Start eerst een session via het huis-icoon');
      Nav.openStartScreen();
      return;
    }

    const session = Storage.getSession(currentSessionId);
    if (!session?.gameState?.map?.length) {
      Toast.show('Geen opgeslagen voortgang — speel verder vanaf huidig level');
      return;
    }

    G.importState(session.gameState);
    hide();
    Nav.switchTab('play');
    G.resumeFromMenu();
    Toast.show('Voortgang hervat');
    Character.refresh?.();
  }

  function replayLevel(level) {
    if (!hasStarted || !currentSessionId) {
      Toast.show('Start eerst een session via het huis-icoon');
      Nav.openStartScreen();
      return;
    }

    const session = getActiveSession();
    if (!Vip.canAccessLevel(level, session)) {
      Toast.show(Vip.getLockReason(level, session) || 'Dit level is nog niet vrijgespeeld');
      return;
    }

    G.startAtLevel(level);
    Nav.switchTab('play');
    autoSave();
  }

  function resetAll() {
    Storage.forgetAll();
    currentSessionId = null;
    hasStarted = false;
    newSessionReturnView = 'home';
    resetNewSessionForm();
    G.stopGame();
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
    setMenuMessage,
    getActiveSession,
    getCurrentSessionId,
    autoSave,
    recordLevelComplete,
    resumeFromSave,
    replayLevel,
    hasStarted: () => hasStarted
  };
})();
/* END-MERGE-BLOCK */
