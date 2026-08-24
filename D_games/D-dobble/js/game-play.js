/* MERGE-BLOCK: game-play.js — SlotGame facade */
const SlotGame = (() => {
  function init() {
    GameHub.bindGamePicker();
    GameHub.bindSharedControls();
    ShareBalance.init();
    CasinoFX.bindGamble();
    SlotEngine.bindControls();
    DiceEngine.bindControls();
    RouletteEngine.bindControls();
    BlackjackEngine.bindControls();
    CoinEngine.bindControls();
    BingoEngine.bindControls();
    GameHub.getEngine().onEnter?.();
    GameHub.resize();
    GameHub.updateHud();
    GameHub.updatePanelStats();
    GameHub.updateGamePickerTab();
    GameHub.updatePlayUi();
    window.addEventListener('resize', () => GameHub.resize());
    GameHub.startLoop();
  }

  function start(fromLoad = false) {
    if (!fromLoad) GameHub.resetGame();
    GameHub.running = true;
    GameHub.paused = false;
    if (!fromLoad) CasinoFX.onSessionStart();
    const name = GameHub.getSessionMeta().playerName || 'Speler';
    if (fromLoad) GameHub.showMessage(`Welkom ${name}`, 'info');
    GameHub.startLoop();
  }

  function pause() {
    GameHub.paused = true;
  }

  function resume() {
    if (!GameHub.running) start(true);
    GameHub.paused = false;
    GameHub.startLoop();
  }

  function onTabVisible() {
    if (Menu.isVisible()) return;
    GameHub.paused = false;
    GameHub.startLoop();
  }

  function onTabHidden() {
    if (GameHub.running) GameHub.paused = true;
    GameHub.stopLoop();
  }

  function stopGame() {
    GameHub.running = false;
    GameHub.paused = false;
    GameHub.stopLoop();
    GameHub.setSessionMeta({ sessionName: '', playerName: 'Speler', difficulty: 'normal' });
    GameHub.resetGame();
  }

  return {
    init,
    start,
    pause,
    resume,
    onTabVisible,
    onTabHidden,
    stopGame,
    exportState: () => GameHub.exportState(),
    importState: (s) => GameHub.importState(s),
    resetGame: () => GameHub.resetGame(),
    setSessionMeta: (m) => GameHub.setSessionMeta(m),
    getSessionMeta: () => GameHub.getSessionMeta(),
    getMachineColors: () => GameHub.getMachineColors(),
    setMachineColors: () => {},
    resetMachineColors: () => {},
    getActiveMachine: () => GameHub.getActiveMachine(),
    getActiveSymbols: () => GameHub.getActiveSymbols(),
    selectMachine: (id) => GameHub.selectGame(id),
    getState: () => ({ ...GameHub.state }),
    spin: () => GameHub.getEngine().spin?.() || GameHub.getEngine().roll?.() || GameHub.getEngine().primaryAction?.() || GameHub.getEngine().startRound?.()
  };
})();
/* END-MERGE-BLOCK */
