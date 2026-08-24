/* MERGE-BLOCK: game-bingo.js — 75-ball bingo (handmatig trekken) */
const BingoEngine = (() => {
  const LETTERS = ['B', 'I', 'N', 'G', 'O'];
  const RANGES = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  let selectedPattern = 'line';
  let grid = null;
  let marked = new Set();
  let drawn = [];
  let remaining = [];
  let lastBall = null;
  let roundActive = false;
  let pullCooldown = 0;
  let winFlash = 0;
  let winCells = [];
  let roundBet = 0;
  let ballPulse = 0;

  function cfg() {
    return GameConfig.bingo || {};
  }

  function patterns() {
    return cfg().patterns || [];
  }

  function isBusy() {
    return roundActive || pullCooldown > 0;
  }

  function isInRound() {
    return roundActive;
  }

  function hasBet() {
    return !!selectedPattern;
  }

  function getActionLabel() {
    return roundActive ? 'TREK BAL' : 'START';
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function range(min, max) {
    const out = [];
    for (let n = min; n <= max; n++) out.push(n);
    return out;
  }

  function cardNumbers() {
    if (!grid) return [];
    const nums = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (grid[r][c] != null) nums.push(grid[r][c]);
      }
    }
    return nums;
  }

  function generateCard() {
    const next = Array.from({ length: 5 }, () => Array(5).fill(null));
    for (let c = 0; c < 5; c++) {
      const pool = shuffle(range(RANGES[c][0], RANGES[c][1]));
      let idx = 0;
      for (let r = 0; r < 5; r++) {
        if (c === 2 && r === 2) continue;
        next[r][c] = pool[idx++];
      }
    }
    return next;
  }

  function isCellMarked(r, c) {
    if (r === 2 && c === 2) return true;
    const n = grid?.[r]?.[c];
    return n != null && marked.has(n);
  }

  function rowComplete(r) {
    for (let c = 0; c < 5; c++) if (!isCellMarked(r, c)) return false;
    return true;
  }

  function colComplete(c) {
    for (let r = 0; r < 5; r++) if (!isCellMarked(r, c)) return false;
    return true;
  }

  function diagComplete(d) {
    if (d === 0) {
      for (let i = 0; i < 5; i++) if (!isCellMarked(i, i)) return false;
      return true;
    }
    for (let i = 0; i < 5; i++) if (!isCellMarked(i, 4 - i)) return false;
    return true;
  }

  function lineCells() {
    for (let r = 0; r < 5; r++) {
      if (rowComplete(r)) return Array.from({ length: 5 }, (_, c) => [r, c]);
    }
    for (let c = 0; c < 5; c++) {
      if (colComplete(c)) return Array.from({ length: 5 }, (_, r) => [r, c]);
    }
    if (diagComplete(0)) return Array.from({ length: 5 }, (_, i) => [i, i]);
    if (diagComplete(1)) return Array.from({ length: 5 }, (_, i) => [i, 4 - i]);
    return null;
  }

  function cornersComplete() {
    return isCellMarked(0, 0) && isCellMarked(0, 4) && isCellMarked(4, 0) && isCellMarked(4, 4);
  }

  function fullComplete() {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isCellMarked(r, c)) return false;
      }
    }
    return true;
  }

  function checkPattern(patternId) {
    if (patternId === 'line' && lineCells()) return lineCells();
    if (patternId === 'corners' && cornersComplete()) {
      return [[0, 0], [0, 4], [4, 0], [4, 4]];
    }
    if (patternId === 'full' && fullComplete()) {
      const cells = [];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) cells.push([r, c]);
      }
      return cells;
    }
    return null;
  }

  function ballLetter(n) {
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
  }

  function setPattern(id) {
    if (roundActive || pullCooldown > 0) return;
    selectedPattern = id;
    document.querySelectorAll('[data-bingo-pattern]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bingoPattern === id);
      btn.setAttribute('aria-pressed', btn.dataset.bingoPattern === id ? 'true' : 'false');
    });
    GameHub.updatePlayUi();
  }

  function drawBall() {
    if (!remaining.length) return null;
    const nums = cardNumbers();
    const ball = GameLuck.pickBingoBall(remaining, nums, marked);
    const idx = remaining.indexOf(ball);
    if (idx >= 0) remaining.splice(idx, 1);
    else remaining.pop();
    drawn.push(ball);
    lastBall = ball;
    if (nums.includes(ball)) marked.add(ball);
    return ball;
  }

  function finishWin(cells, pat) {
    roundActive = false;
    winCells = cells;
    winFlash = 1.2;
    const win = Math.round(roundBet * pat.payout);
    GameHub.applyWin(win, pat.winLabel);
    GameHub.recordRound(roundBet, win, `🎱 ${pat.label} (${drawn.length} ballen)`);
    GameHub.playSound('win');
    GameHub.updatePlayUi();
  }

  function finishLose() {
    roundActive = false;
    winCells = [];
    const pat = patterns().find((p) => p.id === selectedPattern);
    GameHub.state.winStreak = 0;
    GameHub.state.loseStreak += 1;
    GameHub.showMessage(`Geen ${pat?.label || 'bingo'}`, 'lose');
    GameLuck.tryLoseRefund();
    GameHub.updateHud();
    GameHub.updatePanelStats();
    GameHub.recordRound(roundBet, 0, `🎱 ${pat?.label || 'Bingo'} mis`);
    GameHub.playSound('lose');
    GameHub.updatePlayUi();
  }

  function afterBallDrawn() {
    const pat = patterns().find((p) => p.id === selectedPattern);
    const cells = checkPattern(selectedPattern);
    if (cells && pat) {
      finishWin(cells, pat);
      return;
    }
    const maxDraws = cfg().maxDraws ?? 32;
    if (drawn.length >= maxDraws) finishLose();
  }

  function pullBall() {
    if (!roundActive || pullCooldown > 0 || !grid) return;
    if (!remaining.length) {
      finishLose();
      return;
    }

    const ball = drawBall();
    if (!ball) {
      finishLose();
      return;
    }

    ballPulse = 1;
    pullCooldown = cfg().pullCooldown ?? 0.65;
    const onCard = cardNumbers().includes(ball);
    GameHub.playSound(onCard ? 'tick' : 'stop');
    GameHub.vibrate(onCard ? 30 : 12);
    afterBallDrawn();
    GameHub.updatePlayUi();
  }

  function startRound() {
    if (roundActive || pullCooldown > 0 || !GameHub.canAffordBet() || !hasBet()) {
      if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    roundBet = GameHub.state.bet;
    grid = generateCard();
    marked = new Set();
    drawn = [];
    remaining = shuffle(range(1, 75));
    lastBall = null;
    winCells = [];
    roundActive = true;
    pullCooldown = 0;
    ballPulse = 0;
    GameHub.playSound('spin');
    GameHub.updatePlayUi();
  }

  function canPull() {
    return roundActive && pullCooldown <= 0 && remaining.length > 0;
  }

  function primaryAction() {
    if (roundActive) pullBall();
    else startRound();
  }

  function update(now, dt) {
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.4);
    if (pullCooldown > 0) pullCooldown = Math.max(0, pullCooldown - dt);
    if (ballPulse > 0) ballPulse = Math.max(0, ballPulse - dt * 1.8);
  }

  function drawCell(ctx, x, y, size, r, c, highlight) {
    const val = grid?.[r]?.[c];
    const isFree = r === 2 && c === 2;
    const hit = isCellMarked(r, c);
    const win = highlight && winCells.some(([wr, wc]) => wr === r && wc === c);

    ctx.fillStyle = win ? '#fbbf24' : hit ? '#4ade80' : '#1e1b4b';
    ctx.strokeStyle = win ? '#fde68a' : hit ? '#86efac' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = win ? 2.5 : 1.5;
    GameHub.roundRect(x, y, size, size, size * 0.12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(size * (isFree ? 0.22 : 0.34))}px Plus Jakarta Sans, sans-serif`;
    ctx.fillStyle = hit || win ? '#0f172a' : '#e2e8f0';
    ctx.fillText(isFree ? '★' : String(val), x + size / 2, y + size / 2);
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    const colors = GameHub.getGameDef().colors;
    GameHub.drawBackground({ bgTop: '#0a1628', bgMid: '#061018', bgBot: '#020608' });

    const cx = w / 2;
    ctx.textAlign = 'center';

    if (lastBall != null) {
      const ballR = Math.min(w * 0.08, h * 0.07, 38) * (1 + ballPulse * 0.12);
      const ballY = h * 0.1;
      ctx.beginPath();
      ctx.arc(cx, ballY, ballR, 0, Math.PI * 2);
      ctx.fillStyle = ballPulse > 0 ? '#fde68a' : '#fef3c7';
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#1e1b4b';
      ctx.font = `800 ${Math.round(ballR * 0.55)}px Plus Jakarta Sans, sans-serif`;
      ctx.fillText(String(lastBall), cx, ballY + ballR * 0.05);
      ctx.font = `700 ${Math.round(ballR * 0.38)}px Plus Jakarta Sans, sans-serif`;
      ctx.fillStyle = '#7c3aed';
      ctx.fillText(ballLetter(lastBall), cx, ballY - ballR * 0.55);
    }

    if (grid) {
      const pad = Math.min(w, h) * 0.04;
      const boardW = w - pad * 2;
      const cell = Math.min(boardW / 5.6, h * 0.12, 56);
      const boardH = cell * 6.2;
      const bx = cx - (cell * 5.3) / 2;
      const by = h * 0.14;

      ctx.font = `800 ${Math.round(cell * 0.38)}px Plus Jakarta Sans, sans-serif`;
      for (let c = 0; c < 5; c++) {
        ctx.fillStyle = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'][c];
        ctx.fillText(LETTERS[c], bx + c * cell * 1.05 + cell * 0.52, by);
      }

      const highlight = winFlash > 0;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          drawCell(ctx, bx + c * cell * 1.05, by + (r + 1) * cell * 1.02, cell, r, c, highlight);
        }
      }

      if (roundActive) {
        ctx.font = `600 ${Math.round(Math.min(w * 0.028, 11))}px Plus Jakarta Sans, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(`${drawn.length}/${cfg().maxDraws ?? 32}`, cx, by + boardH + 10);
      }
    }

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.18;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function bindControls() {
    document.querySelectorAll('[data-bingo-pattern]').forEach((btn) => {
      btn.addEventListener('click', () => setPattern(btn.dataset.bingoPattern));
    });
    document.getElementById('btn-bingo-start')?.addEventListener('click', primaryAction);
    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible() || GameHub.getGameDef().type !== 'bingo') return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        primaryAction();
      }
    });
  }

  function onEnter() {
    setPattern(selectedPattern || 'line');
    GameHub.updatePlayUi();
  }

  function onLeave() {}

  function reset() {
    roundActive = false;
    pullCooldown = 0;
    grid = null;
    marked = new Set();
    drawn = [];
    remaining = [];
    lastBall = null;
    winFlash = 0;
    winCells = [];
    ballPulse = 0;
    selectedPattern = 'line';
    roundBet = 0;
  }

  function exportState() {
    return { selectedPattern, hasCard: !!grid, drawn: drawn.length };
  }

  function importState(data) {
    if (data?.selectedPattern) selectedPattern = data.selectedPattern;
  }

  return {
    isBusy,
    isInRound,
    canPull,
    hasBet,
    getActionLabel,
    startRound,
    pullBall,
    primaryAction,
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
