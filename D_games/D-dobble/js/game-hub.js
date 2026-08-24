/* MERGE-BLOCK: game-hub.js — gedeelde casino-state & helpers */
const GameHub = (() => {
  let canvasEl;
  let ctx;
  let dpr = 1;
  let w = 0;
  let h = 0;
  let running = false;
  let paused = false;
  let rafId = 0;
  let lastTime = 0;
  let audioCtx = null;

  const state = {
    balance: 200,
    bet: GameConfig.bet.defaultBet,
    totalSpins: 0,
    totalWon: 0,
    totalLost: 0,
    biggestWin: 0,
    winStreak: 0,
    loseStreak: 0
  };

  let history = [];
  let sessionMeta = { sessionName: '', playerName: 'Speler', difficulty: 'normal' };
  let activeGameId = GameConfig.defaultGame || 'dice';

  function canvas() {
    return canvasEl || document.getElementById('game-canvas');
  }

  function getGameDef(id = activeGameId) {
    return GameConfig.games.find((g) => g.id === id) || GameConfig.games[0];
  }

  function getDifficultyCfg() {
    return GameConfig.difficulty[sessionMeta.difficulty] || GameConfig.difficulty.normal;
  }

  function getEngine() {
    const type = getGameDef().type;
    const map = {
      slot: SlotEngine,
      dice: DiceEngine,
      roulette: RouletteEngine,
      blackjack: BlackjackEngine,
      coin: CoinEngine,
      bingo: BingoEngine
    };
    return map[type] || DiceEngine;
  }

  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audioCtx = null;
      }
    }
    return audioCtx;
  }

  function playSound(type) {
    const settings = Storage.readSettings();
    if (!settings.sound) return;
    const actx = ensureAudio();
    if (!actx) return;
    if (actx.state === 'suspended') void actx.resume();

    const t = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.connect(gain);
    gain.connect(actx.destination);

    const presets = {
      spin: { f: 180, f2: 120, dur: 0.06, type: 'square', vol: 0.04 },
      stop: { f: 320, f2: 260, dur: 0.08, type: 'triangle', vol: 0.06 },
      win: { f: 440, f2: 660, dur: 0.18, type: 'sine', vol: 0.07 },
      bigwin: { f: 523, f2: 880, dur: 0.28, type: 'sine', vol: 0.09 },
      jackpot: { f: 660, f2: 990, dur: 0.4, type: 'sine', vol: 0.1 },
      lose: { f: 160, f2: 90, dur: 0.15, type: 'sawtooth', vol: 0.05 },
      tick: { f: 520, f2: 480, dur: 0.04, type: 'sine', vol: 0.03 }
    };
    const p = presets[type] || presets.spin;
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.f2), t + p.dur);
    gain.gain.setValueAtTime(p.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
  }

  function vibrate(ms) {
    const settings = Storage.readSettings();
    if (settings.vibration !== false && navigator.vibrate) navigator.vibrate(ms);
  }

  const MSG_ICONS = { win: '🎉', lose: '🍀', info: '✨', warn: '⚠️', near: '😮' };
  let msgTimer = null;

  function showMessage(text, type = 'info') {
    const overlay = document.getElementById('msg-overlay');
    const msgText = document.getElementById('msg-text');
    const msgIcon = document.getElementById('msg-icon');
    if (!overlay || !msgText) return;

    overlay.className = '';
    overlay.classList.add(`msg-${type}`);
    msgText.textContent = text;
    if (msgIcon) msgIcon.textContent = MSG_ICONS[type] || MSG_ICONS.info;

    requestAnimationFrame(() => overlay.classList.add('visible'));
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => overlay.classList.remove('visible'), type === 'win' ? 2200 : 1800);
  }

  function recordRound(bet, win, label) {
    history.unshift({ bet, win, label, gameId: activeGameId, time: Date.now() });
    if (history.length > 24) history.pop();
    updateHistoryTab();
  }

  function applyWin(win, label) {
    if (win > 0) CasinoFX.applyWinWithVip(win, label);
    else CasinoFX.recordLoss();
  }

  function recordLoss() {
    CasinoFX.recordLoss();
  }

  function deductBet() {
    state.balance -= state.bet;
    state.totalLost += state.bet;
    state.totalSpins += 1;
    CasinoFX.onBetPlaced(state.bet);
  }

  function canAffordBet() {
    if (CasinoFX.isGambleActive?.()) return false;
    return running && state.balance >= state.bet;
  }

  function changeBet(delta) {
    const steps = GameConfig.bet.steps;
    const idx = steps.indexOf(state.bet);
    const next = Math.max(0, Math.min(steps.length - 1, idx + delta));
    state.bet = steps[next];
    updateHud();
  }

  function updateHud() {
    const balanceEl = document.getElementById('hud-balance');
    const betEl = document.getElementById('hud-bet');
    if (balanceEl) balanceEl.textContent = `€${state.balance}`;
    if (betEl) betEl.textContent = `€${state.bet}`;
    CasinoFX.updateCasinoHud?.();
  }

  function updatePanelStats() {
    const net = state.totalWon - state.totalLost;
    const map = {
      'stat-balance': `€${state.balance}`,
      'stat-spins': state.totalSpins,
      'stat-won': `€${state.totalWon}`,
      'stat-net': `${net >= 0 ? '+' : ''}€${net}`,
      'stat-biggest': `€${state.biggestWin}`,
      'stat-vip': CasinoFX.getVipTier?.().name || 'Bronze',
      'stat-wagered': `€${CasinoFX.exportState?.().totalWagered ?? 0}`
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    updateGamePickerTab();
  }

  function updateHistoryTab() {
    const list = document.getElementById('history-list');
    if (!list) return;
    if (!history.length) {
      list.innerHTML = '<p class="empty-history">Nog geen rondes gespeeld.</p>';
      return;
    }
    list.innerHTML = history
      .map((h) => {
        const game = GameConfig.games.find((g) => g.id === h.gameId);
        const winClass = h.win > 0 ? 'history-win' : 'history-loss';
        const winText = h.win > 0 ? `+€${h.win}` : `-€${h.bet}`;
        return `<div class="history-row ${winClass}">
          <span class="history-symbols">${game?.icon || '🎮'} ${h.label || game?.name || ''}</span>
          <span class="history-bet">€${h.bet}</span>
          <span class="history-result">${winText}</span>
        </div>`;
      })
      .join('');
  }

  function updateGamePickerTab() {
    const list = document.getElementById('machine-list');
    if (!list) return;

    list.innerHTML = GameConfig.games
      .map((g) => {
        const active = g.id === activeGameId;
        return `
          <button type="button" class="floor-tile${active ? ' active' : ''}" data-game-id="${g.id}"
            style="--tile-frame:${g.colors.frame};--tile-light:${g.colors.frameLight};--tile-accent:${g.colors.accent}"
            aria-label="${g.name} spelen${active ? ' — actief' : ''}">
            <span class="floor-tile-shine" aria-hidden="true"></span>
            <span class="floor-tile-icon" aria-hidden="true">${g.icon}</span>
            <span class="floor-tile-name">${g.name}</span>
            <span class="floor-tile-tag">${g.tag}</span>
            ${active ? '<span class="floor-tile-live">Actief</span>' : ''}
          </button>
        `;
      })
      .join('');
  }

  function updatePlayUi() {
    const type = getGameDef().type;
    const eng = getEngine();
    const gamble = CasinoFX.isGambleActive?.();

    document.getElementById('game-wrap')?.setAttribute('data-game-type', type);
    ['slot', 'dice', 'roulette', 'blackjack', 'coin', 'bingo'].forEach((t) => {
      document.getElementById(`${t}-controls`)?.classList.toggle('hidden', type !== t);
    });

    const busy = eng.isBusy?.() || gamble;
    const canPlay = canAffordBet() && !busy;

    const setBtn = (id, disabled) => {
      const b = document.getElementById(id);
      if (b) b.disabled = disabled;
    };

    setBtn('btn-spin', !canPlay);
    setBtn('btn-dice-roll', !canPlay);
    setBtn('btn-coin-flip', !canPlay || !CoinEngine.hasBet?.());

    const bjDeal = document.getElementById('btn-bj-deal');
    const bjHit = document.getElementById('btn-bj-hit');
    const bjStand = document.getElementById('btn-bj-stand');
    if (bjDeal) bjDeal.disabled = busy || !canAffordBet() || (BlackjackEngine.isBusy?.() && type === 'blackjack');
    if (bjHit) bjHit.disabled = type !== 'blackjack' || eng !== BlackjackEngine || !BlackjackEngine.isBusy?.();
    if (bjStand) bjStand.disabled = type !== 'blackjack' || eng !== BlackjackEngine || !BlackjackEngine.isBusy?.();

    setBtn('btn-roulette-spin', !canAffordBet() || busy || !RouletteEngine.hasBet?.());
    const bingoBtn = document.getElementById('btn-bingo-start');
    if (bingoBtn && type === 'bingo') {
      bingoBtn.textContent = BingoEngine.getActionLabel?.() || 'START';
      if (BingoEngine.isInRound?.()) {
        setBtn('btn-bingo-start', !BingoEngine.canPull?.());
      } else {
        setBtn('btn-bingo-start', !canPlay || !BingoEngine.hasBet?.());
      }
    } else {
      setBtn('btn-bingo-start', !canPlay || !BingoEngine.hasBet?.());
    }
  }

  function selectGame(id) {
    if (id === activeGameId) {
      Nav.switchTab('play');
      return;
    }
    if (getEngine().isBusy?.()) {
      Toast.show('Wacht tot de ronde klaar is');
      return;
    }
    getEngine().onLeave?.();
    activeGameId = id;
    getEngine().onEnter?.();
    updatePlayUi();
    updateGamePickerTab();
    Character.refresh?.();
    Toast.show(`${getGameDef().name} geselecteerd`);
    Nav.switchTab('play');
  }

  function resize() {
    canvasEl = canvas();
    if (!canvasEl) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const host = canvasEl.closest('.game-stage') || canvasEl.parentElement;
    const rect = host.getBoundingClientRect();
    w = Math.max(320, Math.floor(rect.width));
    h = Math.max(240, Math.floor(rect.height));
    canvasEl.width = Math.floor(w * dpr);
    canvasEl.height = Math.floor(h * dpr);
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;
    ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    getEngine().resize?.();
    updatePlayUi();
  }

  function loop(now) {
    if (Nav.getActiveTab() !== 'play') {
      rafId = 0;
      return;
    }
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    if (running && !paused && !Menu.isVisible()) {
      getEngine().update?.(now, dt);
      CasinoFX.update?.(dt);
    }
    getEngine().render?.(now);
    CasinoFX.renderOverlay?.();
    updatePlayUi();
    rafId = requestAnimationFrame(loop);
  }

  function exportState() {
    return {
      balance: state.balance,
      bet: state.bet,
      totalSpins: state.totalSpins,
      totalWon: state.totalWon,
      totalLost: state.totalLost,
      biggestWin: state.biggestWin,
      winStreak: state.winStreak,
      loseStreak: state.loseStreak,
      activeGameId,
      history: history.slice(0, 12),
      engine: getEngine().exportState?.() || {},
      casino: CasinoFX.exportState?.() || {},
      t: Date.now()
    };
  }

  function importState(save) {
    if (!save || typeof save !== 'object') return false;
    state.balance = save.balance != null ? Number(save.balance) : getDifficultyCfg().startBalance;
    state.bet = GameConfig.bet.steps.includes(Number(save.bet)) ? Number(save.bet) : GameConfig.bet.defaultBet;
    state.totalSpins = Number(save.totalSpins) || 0;
    state.totalWon = Number(save.totalWon) || 0;
    state.totalLost = Number(save.totalLost) || 0;
    state.biggestWin = Number(save.biggestWin) || 0;
    state.winStreak = Number(save.winStreak) || 0;
    state.loseStreak = Number(save.loseStreak) || 0;
    history = Array.isArray(save.history) ? save.history.slice(0, 24) : [];
    activeGameId = save.activeGameId || GameConfig.defaultGame;
    CasinoFX.importState?.(save.casino || {});
    SlotEngine.reset?.();
    DiceEngine.reset?.();
    RouletteEngine.reset?.();
    BlackjackEngine.reset?.();
    CoinEngine.reset?.();
    BingoEngine.reset?.();
    getEngine().importState?.(save.engine || {});
    getEngine().onEnter?.();
    updateHud();
    updatePanelStats();
    updatePlayUi();
    return true;
  }

  function resetGame() {
    state.balance = getDifficultyCfg().startBalance;
    state.bet = GameConfig.bet.defaultBet;
    state.totalSpins = 0;
    state.totalWon = 0;
    state.totalLost = 0;
    state.biggestWin = 0;
    state.winStreak = 0;
    state.loseStreak = 0;
    history = [];
    activeGameId = GameConfig.defaultGame;
    CasinoFX.reset?.();
    SlotEngine.reset?.();
    DiceEngine.reset?.();
    RouletteEngine.reset?.();
    BlackjackEngine.reset?.();
    CoinEngine.reset?.();
    BingoEngine.reset?.();
    getEngine().onEnter?.();
    updateHud();
    updatePanelStats();
    updatePlayUi();
  }

  function bindGamePicker() {
    const list = document.getElementById('machine-list');
    if (!list || list.dataset.bound) return;
    list.dataset.bound = '1';
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-game-id]');
      if (btn) selectGame(btn.dataset.gameId);
    });
    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'items') updateGamePickerTab();
    });
  }

  function bindSharedControls() {
    document.getElementById('btn-bet-down')?.addEventListener('click', () => changeBet(-1));
    document.getElementById('btn-bet-up')?.addEventListener('click', () => changeBet(1));
    document.querySelectorAll('[id^="btn-bet-down-"], [id^="btn-bet-up-"]').forEach((btn) => {
      btn.addEventListener('click', () => changeBet(btn.id.includes('down') ? -1 : 1));
    });
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible()) return;
      if (e.code === 'ArrowDown') changeBet(-1);
      if (e.code === 'ArrowUp') changeBet(1);
    });
  }

  function roundRect(x, y, width, height, radius) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawBackground(colors) {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colors?.bgTop || '#1a0533');
    g.addColorStop(0.45, colors?.bgMid || '#0d0220');
    g.addColorStop(1, colors?.bgBot || '#050010');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  return {
    get state() { return state; },
    get w() { return w; },
    get h() { return h; },
    get ctx() { return ctx; },
    get running() { return running; },
    set running(v) { running = v; },
    get paused() { return paused; },
    set paused(v) { paused = v; },
    get activeGameId() { return activeGameId; },
    canvas,
    getGameDef,
    getEngine,
    getDifficultyCfg,
    playSound,
    vibrate,
    showMessage,
    recordRound,
    applyWin,
    recordLoss,
    deductBet,
    canAffordBet,
    changeBet,
    updateHud,
    updatePanelStats,
    updateHistoryTab,
    updateGamePickerTab,
    updatePlayUi,
    selectGame,
    resize,
    loop,
    exportState,
    importState,
    resetGame,
    bindGamePicker,
    bindSharedControls,
    roundRect,
    drawBackground,
    getSessionMeta: () => ({ ...sessionMeta }),
    setSessionMeta(meta = {}) {
      if (meta.sessionName !== undefined) sessionMeta.sessionName = String(meta.sessionName || '');
      if (meta.characterName !== undefined) sessionMeta.playerName = String(meta.characterName || 'Speler');
      if (meta.playerName !== undefined) sessionMeta.playerName = String(meta.playerName || 'Speler');
      if (meta.difficulty !== undefined) sessionMeta.difficulty = meta.difficulty || 'normal';
    },
    startLoop() {
      lastTime = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    },
    stopLoop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
    },
    getMachineColors: () => ({ ...getGameDef().colors }),
    setMachineColors: () => {},
    resetMachineColors: () => {},
    getActiveMachine: () => getGameDef(),
    getActiveSymbols: () => getGameDef().symbols || []
  };
})();
/* END-MERGE-BLOCK */
