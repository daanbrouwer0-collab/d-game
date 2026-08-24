/* MERGE-BLOCK: game-slot-engine.js — fruitautomaat (1 slot) */
const SlotEngine = (() => {
  let reels = [];
  let reelOffsets = [];
  let reelSpinning = [];
  let spinActive = false;
  let spinStartTime = 0;
  let winFlash = 0;
  let symbols = [];
  let symbolMap = {};
  let weightTotal = 0;

  function isBusy() { return spinActive; }

  function syncSymbols() {
    const def = GameHub.getGameDef();
    symbols = def.symbols || [];
    symbolMap = Object.fromEntries(symbols.map((s) => [s.id, s]));
    weightTotal = symbols.reduce((sum, s) => sum + s.weight, 0);
  }

  function randomSymbol() {
    let roll = Math.random() * weightTotal;
    for (const sym of symbols) {
      roll -= sym.weight;
      if (roll <= 0) return sym.id;
    }
    return symbols[0]?.id;
  }

  function buildStrip() {
    return Array.from({ length: 20 }, () => randomSymbol());
  }

  function initReels() {
    reels = [buildStrip(), buildStrip(), buildStrip()];
    reelOffsets = [0, 0, 0];
    reelSpinning = [false, false, false];
  }

  function getCellH() {
    return Math.min(GameHub.w, GameHub.h) * 0.14;
  }

  function getLayout() {
    const reelW = Math.min(GameHub.w * 0.22, 100);
    const reelH = getCellH() * 3;
    const gap = 8;
    const totalW = reelW * 3 + gap * 2;
    return {
      x: (GameHub.w - totalW) / 2,
      y: GameHub.h * 0.22,
      reelW,
      reelH,
      gap,
      totalW
    };
  }

  function getVisible(reelIdx, row) {
    const strip = reels[reelIdx];
    const cellH = getCellH();
    const idx = Math.floor(reelOffsets[reelIdx] / cellH + row) % strip.length;
    return strip[(idx + strip.length) % strip.length];
  }

  function evaluateWin(line, bet) {
    const [a, b, c] = line;
    if (a === b && b === c) {
      const sym = symbolMap[a];
      return { win: Math.round(bet * sym.payout), label: `Drie ${sym.label}!` };
    }
    if (a === b || b === c || a === c) {
      const match = a === b ? a : b === c ? b : a;
      const sym = symbolMap[match];
      return { win: Math.round(bet * (GameConfig.slot?.anyPairPayout || 1)), label: `Twee ${sym.label}!` };
    }
    return { win: 0, label: '' };
  }

  function generateSpinLine() {
    const luck = GameConfig.casino.luck || {};
    if (Math.random() < (luck.slotTripleRate ?? 0.1)) {
      const sym = randomSymbol();
      return [sym, sym, sym];
    }
    if (Math.random() < (luck.slotPairRate ?? 0.58)) {
      const sym = randomSymbol();
      const odd = randomSymbol();
      const line = [sym, sym, odd];
      if (Math.random() < 0.5) [line[1], line[2]] = [line[2], line[1]];
      return line;
    }
    return [randomSymbol(), randomSymbol(), randomSymbol()];
  }

  function spin() {
    if (spinActive || !GameHub.canAffordBet()) {
      if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    spinActive = true;
    spinStartTime = performance.now();
    reelSpinning = [true, true, true];
    reelOffsets = [0, 0, 0];

    const results = generateSpinLine();
    reels.forEach((strip, i) => {
      strip[strip.length - 2] = results[i];
    });

    GameHub.playSound('spin');
    GameHub.updatePlayUi();
  }

  function finishSpin() {
    spinActive = false;
    reelSpinning = [false, false, false];
    const cellH = getCellH();
    reelOffsets = reels.map((s) => cellH * (s.length - 3));

    const line = [getVisible(0, 1), getVisible(1, 1), getVisible(2, 1)];
    const result = evaluateWin(line, GameHub.state.bet);

    if (result.win > 0) {
      winFlash = 1;
      GameHub.applyWin(result.win, result.label);
    } else {
      GameHub.recordLoss();
    }

    GameHub.recordRound(
      GameHub.state.bet,
      result.win,
      line.map((id) => symbolMap[id]?.emoji || '?').join('')
    );
    GameHub.updatePlayUi();
  }

  function update(now, dt) {
    if (spinActive) {
      const elapsed = (now - spinStartTime) / 1000;
      const cfg = GameConfig.slot;
      const cellH = getCellH();

      for (let i = 0; i < 3; i++) {
        if (!reelSpinning[i]) continue;
        const delay = i * (cfg.reelStagger || 0.35);
        const t = elapsed - delay;
        if (t < 0) continue;
        if (t < (cfg.spinDuration || 1.6)) {
          reelOffsets[i] += (850 + i * 60) * dt;
        } else {
          reelSpinning[i] = false;
          reelOffsets[i] = cellH * (reels[i].length - 3);
          GameHub.playSound('stop');
        }
      }

      if (elapsed > (cfg.spinDuration || 1.6) + 2 * (cfg.reelStagger || 0.35) + 0.1) {
        finishSpin();
      }
    }
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.5);
  }

  function drawReel(x, y, rw, rh, idx) {
    const { ctx } = GameHub;
    const cellH = rh / 3;
    ctx.save();
    GameHub.roundRect(x, y, rw, rh, 10);
    ctx.clip();
    ctx.fillStyle = '#0f0518';
    ctx.fillRect(x, y, rw, rh);

    const strip = reels[idx];
    const offset = reelOffsets[idx] % (cellH * strip.length);
    for (let j = -1; j < strip.length + 2; j++) {
      const sym = symbolMap[strip[(j + strip.length) % strip.length]];
      const cy = y + j * cellH - offset + cellH / 2;
      ctx.font = `${cellH * 0.55}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym?.emoji || '?', x + rw / 2, cy);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    GameHub.roundRect(x, y, rw, rh, 10);
    ctx.stroke();
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    const colors = GameHub.getGameDef().colors;
    GameHub.drawBackground({ bgTop: '#1a0533', bgMid: '#0d0220', bgBot: '#050010' });

    const m = getLayout();
    const pad = 12;
    ctx.fillStyle = colors.frame;
    ctx.strokeStyle = colors.frameLight;
    ctx.lineWidth = 3;
    GameHub.roundRect(m.x - pad, m.y - pad - 6, m.totalW + pad * 2, m.reelH + pad * 2 + 10, 18);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      drawReel(m.x + i * (m.reelW + m.gap), m.y, m.reelW, m.reelH, i);
    }

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.25;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function bindControls() {
    document.getElementById('btn-spin')?.addEventListener('click', spin);
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible() || GameHub.getGameDef().type !== 'slot') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spin();
      }
    });
  }

  function onEnter() {
    syncSymbols();
    initReels();
    GameHub.updatePlayUi();
  }

  function onLeave() {}

  function reset() {
    spinActive = false;
    winFlash = 0;
    syncSymbols();
    initReels();
  }

  function resize() {
    if (!reels.length) initReels();
  }

  function exportState() {
    return {};
  }

  function importState() {}

  return {
    isBusy,
    spin,
    update,
    render,
    bindControls,
    onEnter,
    onLeave,
    reset,
    resize,
    exportState,
    importState
  };
})();
/* END-MERGE-BLOCK */
