/* MERGE-BLOCK: game-coin.js — kop of munt */
const CoinEngine = (() => {
  let selectedSide = 'heads';
  let busy = false;
  let flipStart = 0;
  let flipDuration = 1.2;
  let displayAngle = 0;
  let resultSide = 'heads';
  let winFlash = 0;

  function isBusy() { return busy; }
  function hasBet() { return !!selectedSide; }

  function setSide(side) {
    if (busy) return;
    selectedSide = side;
    document.querySelectorAll('[data-coin-side]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.coinSide === side);
    });
    GameHub.updatePlayUi();
  }

  function flip() {
    if (busy || !GameHub.canAffordBet()) {
      if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    busy = true;
    flipStart = performance.now();
    resultSide = GameLuck.rollCoin(selectedSide);
    GameHub.playSound('spin');
    GameHub.updatePlayUi();
  }

  function finishFlip() {
    busy = false;
    const won = resultSide === selectedSide;
    const payout = GameConfig.coin.payout;
    const win = won ? Math.round(GameHub.state.bet * payout) : 0;
    const label = won
      ? (resultSide === 'heads' ? 'Kop!' : 'Munt!')
      : (resultSide === 'heads' ? 'Kop…' : 'Munt…');

    if (won) {
      winFlash = 1;
      GameHub.applyWin(win, label);
    } else {
      GameHub.recordLoss();
    }
    GameHub.recordRound(GameHub.state.bet, win, label);
    GameHub.updatePlayUi();
  }

  function update(now, dt) {
    if (busy) {
      const t = (now - flipStart) / 1000;
      const p = Math.min(1, t / flipDuration);
      displayAngle += dt * (18 - p * 14);
      if (p >= 1) finishFlip();
    }
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.5);
  }

  function drawCoinEdge(ctx, r) {
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, '#78716c');
    grad.addColorStop(0.35, '#d6d3d1');
    grad.addColorStop(0.65, '#fafaf9');
    grad.addColorStop(1, '#57534e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.12, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoinBase(ctx, r, heads) {
    const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r);
    if (heads) {
      grad.addColorStop(0, '#fef3c7');
      grad.addColorStop(0.45, '#fbbf24');
      grad.addColorStop(1, '#b45309');
    } else {
      grad.addColorStop(0, '#f1f5f9');
      grad.addColorStop(0.45, '#94a3b8');
      grad.addColorStop(1, '#475569');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = heads ? '#fef9c3' : '#e2e8f0';
    ctx.lineWidth = r * 0.045;
    ctx.stroke();

    ctx.strokeStyle = heads ? 'rgba(120, 53, 15, 0.35)' : 'rgba(30, 41, 59, 0.35)';
    ctx.lineWidth = r * 0.025;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const x1 = Math.cos(a) * r * 0.9;
      const y1 = Math.sin(a) * r * 0.9;
      const x2 = Math.cos(a) * r * 0.96;
      const y2 = Math.sin(a) * r * 0.96;
      ctx.strokeStyle = heads ? 'rgba(146, 64, 14, 0.45)' : 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = r * 0.018;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function drawHeadsFace(ctx, r) {
    const ink = '#78350f';
    const inkLight = '#92400e';

    ctx.fillStyle = ink;
    ctx.font = `800 ${r * 0.11}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KOP', 0, -r * 0.62);

    ctx.fillStyle = inkLight;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, -r * 0.38);
    ctx.lineTo(-r * 0.22, -r * 0.48);
    ctx.lineTo(-r * 0.05, -r * 0.52);
    ctx.lineTo(r * 0.02, -r * 0.46);
    ctx.lineTo(r * 0.18, -r * 0.5);
    ctx.lineTo(r * 0.12, -r * 0.38);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(r * 0.06, r * 0.02, r * 0.28, r * 0.34, 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = inkLight;
    ctx.beginPath();
    ctx.ellipse(r * 0.2, -r * 0.02, r * 0.09, r * 0.14, 0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.035;
    ctx.beginPath();
    ctx.arc(r * 0.02, r * 0.08, r * 0.12, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = `700 ${r * 0.09}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText('♔', -r * 0.02, r * 0.58);
  }

  function drawTailsFace(ctx, r) {
    const ink = '#1e293b';
    const inkMid = '#334155';

    ctx.fillStyle = ink;
    ctx.font = `800 ${r * 0.11}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MUNT', 0, -r * 0.62);

    ctx.fillStyle = inkMid;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.42);
    ctx.lineTo(r * 0.34, -r * 0.22);
    ctx.lineTo(r * 0.28, r * 0.18);
    ctx.lineTo(0, r * 0.42);
    ctx.lineTo(-r * 0.28, r * 0.18);
    ctx.lineTo(-r * 0.34, -r * 0.22);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = r * 0.03;
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `900 ${r * 0.32}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText('€', 0, r * 0.06);

    ctx.fillStyle = ink;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = Math.cos(a) * r * 0.52;
      const y = Math.sin(a) * r * 0.52;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `700 ${r * 0.08}px Plus Jakarta Sans, sans-serif`;
    ctx.fillText('★', 0, r * 0.58);
  }

  function drawCoinSide(ctx, r, heads) {
    drawCoinBase(ctx, r, heads);
    if (heads) drawHeadsFace(ctx, r);
    else drawTailsFace(ctx, r);
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    GameHub.drawBackground({ bgTop: '#1a1508', bgMid: '#0f0c04', bgBot: '#050403' });

    const cx = w / 2;
    const cy = h * 0.44;
    const r = Math.min(w, h) * 0.2;

    const showHeads = busy
      ? Math.floor(displayAngle / Math.PI) % 2 === 0
      : resultSide === 'heads';

    ctx.save();
    ctx.translate(cx, cy);
    const squash = busy ? Math.abs(Math.cos(displayAngle)) : 1;
    if (busy && squash < 0.14) {
      drawCoinEdge(ctx, r);
    } else {
      ctx.scale(Math.max(0.08, squash), 1);
      drawCoinSide(ctx, r, showHeads);
    }
    ctx.restore();

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.22;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function bindControls() {
    document.querySelectorAll('[data-coin-side]').forEach((btn) => {
      btn.addEventListener('click', () => setSide(btn.dataset.coinSide));
    });
    document.getElementById('btn-coin-flip')?.addEventListener('click', flip);
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible() || GameHub.getGameDef().type !== 'coin') return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); flip(); }
    });
  }

  function onEnter() { setSide(selectedSide || 'heads'); }
  function onLeave() {}
  function reset() {
    busy = false;
    winFlash = 0;
    selectedSide = 'heads';
    displayAngle = 0;
  }

  return {
    isBusy, hasBet, flip, update, render, bindControls, onEnter, onLeave, reset,
    exportState: () => ({ selectedSide }),
    importState: (d) => { if (d?.selectedSide) selectedSide = d.selectedSide; }
  };
})();
/* END-MERGE-BLOCK */
