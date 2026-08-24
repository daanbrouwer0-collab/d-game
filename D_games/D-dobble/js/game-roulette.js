/* MERGE-BLOCK: game-roulette.js — europees roulette */
const RouletteEngine = (() => {
  const WHEEL = GameConfig.roulette.wheelOrder;
  const RED = new Set(GameConfig.roulette.redNumbers);

  let selectedBet = null;
  let busy = false;
  let spinStart = 0;
  let spinDuration = 2.4;
  let resultNumber = null;
  let hasResult = false;
  let wheelAngle = 0;
  let startAngle = 0;
  let targetAngle = 0;
  let winFlash = 0;

  function isBusy() { return busy; }
  function hasBet() { return !!selectedBet; }

  function getNumberColor(n) {
    if (n === 0) return 'green';
    return RED.has(n) ? 'red' : 'black';
  }

  function setBet(bet) {
    if (busy) return;
    selectedBet = bet;
    document.querySelectorAll('[data-roulette-bet]').forEach((btn) => {
      const active = btn.dataset.rouletteBet === bet.type && String(btn.dataset.rouletteValue) === String(bet.value ?? '');
      btn.classList.toggle('active', active);
    });
    GameHub.updatePlayUi();
  }

  function evaluateBet(num) {
    if (!selectedBet) return { win: 0, label: '' };
    const { type, value, payout, label } = selectedBet;
    let won = false;

    if (type === 'color') won = getNumberColor(num) === value;
    else if (type === 'parity') {
      if (num === 0) won = false;
      else if (value === 'even') won = num % 2 === 0;
      else won = num % 2 === 1;
    } else if (type === 'number') won = num === value;

    return {
      win: won ? Math.round(GameHub.state.bet * payout) : 0,
      label: won ? label : ''
    };
  }

  function spin() {
    if (busy || !selectedBet || !GameHub.canAffordBet()) {
      if (!selectedBet) GameHub.showMessage('Kies eerst een inzet', 'warn');
      else if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    busy = true;
    spinStart = performance.now();
    startAngle = wheelAngle;
    resultNumber = GameLuck.pickRouletteNumber(selectedBet);
    hasResult = false;
    const idx = WHEEL.indexOf(resultNumber);
    const slice = (Math.PI * 2) / WHEEL.length;
    targetAngle = wheelAngle + Math.PI * 2 * (5 + Math.random() * 2) - idx * slice;
    GameHub.playSound('spin');
    GameHub.updatePlayUi();
  }

  function finishSpin() {
    if (!busy) return;
    busy = false;
    wheelAngle = targetAngle;
    hasResult = true;
    const result = evaluateBet(resultNumber);
    const color = getNumberColor(resultNumber);

    if (result.win > 0) {
      winFlash = 1;
      GameHub.applyWin(result.win, result.label);
    } else {
      GameHub.state.winStreak = 0;
      GameHub.state.loseStreak += 1;
      GameHub.showMessage(`${resultNumber}`, 'lose');
      GameLuck.tryLoseRefund();
      GameHub.updateHud();
      GameHub.updatePanelStats();
    }

    GameHub.recordRound(
      GameHub.state.bet,
      result.win,
      `${resultNumber} ${selectedBet?.label || ''}`
    );
    GameHub.playSound(result.win > 0 ? 'win' : 'lose');
    GameHub.updatePlayUi();
  }

  function update(now, dt) {
    if (busy) {
      const t = (now - spinStart) / 1000;
      const p = Math.min(1, t / spinDuration);
      const ease = 1 - Math.pow(1 - p, 4);
      wheelAngle = startAngle + (targetAngle - startAngle) * ease;
      if (p >= 1) finishSpin();
    }
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.5);
  }

  function renderWheel(cx, cy, radius) {
    const { ctx } = GameHub;
    const slice = (Math.PI * 2) / WHEEL.length;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wheelAngle);

    for (let i = 0; i < WHEEL.length; i++) {
      const num = WHEEL[i];
      const a0 = i * slice - Math.PI / 2;
      const a1 = a0 + slice;
      const col = getNumberColor(num);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = col === 'green' ? '#059669' : col === 'red' ? '#dc2626' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.rotate(a0 + slice / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.max(9, radius * 0.09)}px Plus Jakarta Sans, sans-serif`;
      ctx.fillText(String(num), radius * 0.72, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 14);
    ctx.lineTo(cx - 10, cy - radius + 4);
    ctx.lineTo(cx + 10, cy - radius + 4);
    ctx.closePath();
    ctx.fillStyle = '#fde68a';
    ctx.fill();
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    GameHub.drawBackground({ bgTop: '#0a1a12', bgMid: '#061410', bgBot: '#020806' });

    const cx = w / 2;
    const cy = h * 0.42;
    const radius = Math.min(w, h) * 0.34;

    renderWheel(cx, cy, radius);

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.22;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function bindControls() {
    const grid = document.getElementById('roulette-number-grid');
    if (grid && !grid.dataset.built) {
      grid.dataset.built = '1';
      for (let n = 1; n <= 36; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `roulette-num ${RED.has(n) ? 'red' : 'black'}`;
        btn.textContent = String(n);
        btn.dataset.rouletteBet = 'number';
        btn.dataset.rouletteValue = String(n);
        btn.dataset.roulettePayout = '35';
        btn.dataset.rouletteLabel = `Getal ${n}`;
        grid.appendChild(btn);
      }
    }

    document.querySelectorAll('[data-roulette-bet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setBet({
          type: btn.dataset.rouletteBet,
          value: btn.dataset.rouletteBet === 'number' ? Number(btn.dataset.rouletteValue) : btn.dataset.rouletteValue,
          payout: Number(btn.dataset.roulettePayout),
          label: btn.dataset.rouletteLabel
        });
      });
    });
    document.getElementById('btn-roulette-spin')?.addEventListener('click', spin);
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible() || GameHub.getGameDef().type !== 'roulette') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spin();
      }
    });
  }

  function onEnter() {
    GameHub.updatePlayUi();
  }

  function onLeave() {}

  function reset() {
    busy = false;
    winFlash = 0;
    selectedBet = null;
    resultNumber = null;
    hasResult = false;
    document.querySelectorAll('[data-roulette-bet]').forEach((b) => b.classList.remove('active'));
  }

  function exportState() {
    return { selectedBet, resultNumber };
  }

  function importState(data) {
    if (data?.selectedBet) selectedBet = data.selectedBet;
    if (data?.resultNumber != null) resultNumber = data.resultNumber;
  }

  return {
    isBusy,
    hasBet,
    spin,
    update,
    render,
    bindControls,
    onEnter,
    onLeave,
    reset,
    exportState,
    importState
  };
})();
/* END-MERGE-BLOCK */
