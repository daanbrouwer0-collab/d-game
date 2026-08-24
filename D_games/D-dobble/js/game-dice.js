/* MERGE-BLOCK: game-dice.js — dobbelspel */
const DiceEngine = (() => {
  const DICE_DOTS = {
    1: [[0, 0]],
    2: [[-0.35, -0.35], [0.35, 0.35]],
    3: [[-0.35, -0.35], [0, 0], [0.35, 0.35]],
    4: [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]],
    5: [[-0.35, -0.35], [0.35, -0.35], [0, 0], [-0.35, 0.35], [0.35, 0.35]],
    6: [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0], [0.35, 0], [-0.35, 0.35], [0.35, 0.35]]
  };

  let selectedBet = 'high';
  let dice = [1, 1];
  let displayDice = [1, 1];
  let busy = false;
  let rollStart = 0;
  let rollDuration = 1.1;
  let winFlash = 0;
  let lastSum = 0;

  function isBusy() { return busy; }

  function getBets() {
    return GameConfig.dice.bets;
  }

  function setBet(id) {
    if (busy) return;
    selectedBet = id;
    document.querySelectorAll('[data-dice-bet]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diceBet === id);
      btn.setAttribute('aria-pressed', btn.dataset.diceBet === id ? 'true' : 'false');
    });
    GameHub.updatePlayUi();
  }

  function evaluateBet(d1, d2) {
    const sum = d1 + d2;
    const isDouble = d1 === d2;
    const bet = getBets().find((b) => b.id === selectedBet);
    if (!bet) return { win: 0, label: '' };

    let won = false;
    if (selectedBet === 'low') won = sum >= 2 && sum <= 6;
    else if (selectedBet === 'seven') won = sum === 7;
    else if (selectedBet === 'high') won = sum >= 8 && sum <= 12;
    else if (selectedBet === 'double') won = isDouble;

    return {
      win: won ? Math.round(GameHub.state.bet * bet.payout) : 0,
      label: won ? bet.winLabel : '',
      sum
    };
  }

  function roll() {
    if (busy || !GameHub.canAffordBet()) {
      if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    busy = true;
    rollStart = performance.now();
    dice = GameLuck.rollDice(selectedBet);
    GameHub.playSound('spin');
    GameHub.updatePlayUi();
  }

  function finishRoll() {
    busy = false;
    displayDice = [...dice];
    lastSum = dice[0] + dice[1];
    const result = evaluateBet(dice[0], dice[1]);
    const betDef = getBets().find((b) => b.id === selectedBet);

    if (result.win > 0) {
      winFlash = 1;
      GameHub.applyWin(result.win, result.label);
    } else {
      GameHub.state.winStreak = 0;
      GameHub.state.loseStreak += 1;
      GameHub.showMessage(`${dice[0]}+${dice[1]}=${lastSum}`, 'lose');
      GameLuck.tryLoseRefund();
      GameHub.updateHud();
      GameHub.updatePanelStats();
    }

    GameHub.recordRound(GameHub.state.bet, result.win, `${dice[0]}🎲${dice[1]} ${betDef?.label || ''}`);
    GameHub.playSound(result.win > 0 ? 'win' : 'lose');
    GameHub.updatePlayUi();
  }

  function update(now, dt) {
    if (busy) {
      const t = (now - rollStart) / 1000;
      if (t < rollDuration) {
        if (Math.floor(t * 20) % 3 === 0) {
          displayDice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        }
      } else {
        finishRoll();
      }
    }
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.5);
  }

  function drawDie(cx, cy, size, value, rolling) {
    const { ctx } = GameHub;
    const rot = rolling ? (performance.now() / 100) % (Math.PI * 2) : 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * 0.15);

    ctx.fillStyle = '#fefce8';
    ctx.strokeStyle = rolling ? '#fbbf24' : '#cbd5e1';
    ctx.lineWidth = 3;
    GameHub.roundRect(-size / 2, -size / 2, size, size, size * 0.18);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e1b4b';
    const dots = DICE_DOTS[value] || DICE_DOTS[1];
    for (const [dx, dy] of dots) {
      ctx.beginPath();
      ctx.arc(dx * size * 0.28, dy * size * 0.28, size * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    const colors = GameHub.getGameDef().colors;
    GameHub.drawBackground({ bgTop: '#1a0a2e', bgMid: '#12061f', bgBot: '#050010' });

    const cx = w / 2;
    const cy = h * 0.44;
    const size = Math.min(w * 0.28, h * 0.22, 120);
    const gap = size * 0.55;

    drawDie(cx - gap, cy, size, displayDice[0], busy);
    drawDie(cx + gap, cy, size, displayDice[1], busy);

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.22;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function bindControls() {
    document.querySelectorAll('[data-dice-bet]').forEach((btn) => {
      btn.addEventListener('click', () => setBet(btn.dataset.diceBet));
    });
    document.getElementById('btn-dice-roll')?.addEventListener('click', roll);
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible() || GameHub.getGameDef().type !== 'dice') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        roll();
      }
    });
  }

  function onEnter() {
    setBet(selectedBet || 'high');
    GameHub.updatePlayUi();
  }

  function onLeave() {}

  function reset() {
    busy = false;
    winFlash = 0;
    lastSum = 0;
    dice = [1, 1];
    displayDice = [1, 1];
    selectedBet = 'high';
  }

  function exportState() {
    return { selectedBet, lastSum };
  }

  function importState(data) {
    if (data?.selectedBet) selectedBet = data.selectedBet;
  }

  return {
    isBusy,
    hasBet: () => !!selectedBet,
    roll,
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
