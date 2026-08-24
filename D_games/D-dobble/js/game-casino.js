/* MERGE-BLOCK: game-casino.js — jackpot, VIP, feest & double-or-nothing */
const CasinoFX = (() => {
  let jackpotPool = GameConfig.casino.jackpot.start;
  let totalWagered = 0;
  let particles = [];
  let bigWinFlash = 0;
  let gambleActive = false;
  let pendingGambleWin = 0;
  let gambleTimerId = null;
  let gambleAnimId = 0;
  let lastDailyKey = '';

  function getVipTier(wagered = totalWagered) {
    const tiers = GameConfig.casino.vipTiers;
    let current = tiers[0];
    for (const t of tiers) {
      if (wagered >= t.minWager) current = t;
    }
    return current;
  }

  function getVipMultiplier() {
    return getVipTier().winBoost || 1;
  }

  function onBetPlaced(amount) {
    totalWagered += amount;
    const jp = GameConfig.casino.jackpot;
    jackpotPool += Math.max(1, Math.round(amount * jp.contribution));
    updateCasinoHud();
  }

  function tryJackpotWin() {
    const jp = GameConfig.casino.jackpot;
    if (Math.random() > jp.winChance) return 0;
    const win = Math.round(jackpotPool);
    jackpotPool = jp.start;
    spawnParticles(GameHub.w / 2, GameHub.h * 0.35, 50, '#fbbf24');
    GameHub.playSound('jackpot');
    GameHub.vibrate(100);
    showJackpotModal(win);
    return win;
  }

  function applyWinWithVip(baseWin, label) {
    if (baseWin <= 0) return 0;
    baseWin = GameLuck.applyMegaWin(baseWin);
    const mult = getVipMultiplier();
    const finalWin = Math.round(baseWin * mult);
    GameHub.state.balance += finalWin;
    GameHub.state.totalWon += finalWin;
    GameHub.state.winStreak += 1;
    GameHub.state.loseStreak = 0;
    if (finalWin > GameHub.state.biggestWin) GameHub.state.biggestWin = finalWin;

    if (finalWin >= GameHub.state.bet * 5) {
      bigWinFlash = 1.2;
      spawnParticles(GameHub.w / 2, GameHub.h * 0.4, 35, '#fde68a');
      GameHub.playSound('bigwin');
    } else {
      GameHub.playSound('win');
    }
    GameHub.vibrate(finalWin >= GameHub.state.bet * 3 ? 50 : 25);

    let msg = `+€${finalWin}`;
    if (mult > 1) msg += ` ×${mult}`;
    GameHub.showMessage(msg, 'win');

    const jpWin = tryJackpotWin();
    if (jpWin > 0) {
      GameHub.state.balance += jpWin;
      GameHub.state.totalWon += jpWin;
      if (jpWin > GameHub.state.biggestWin) GameHub.state.biggestWin = jpWin;
    }

    offerGamble(finalWin);
    GameHub.updateHud();
    GameHub.updatePanelStats();
    updateCasinoHud();
    return finalWin + jpWin;
  }

  function recordLoss() {
    GameHub.state.winStreak = 0;
    GameHub.state.loseStreak += 1;
    GameLuck.tryLoseRefund();
    GameHub.showMessage('Geen winst', 'lose');
    GameHub.updateHud();
    GameHub.updatePanelStats();
  }

  function offerGamble(winAmount) {
    const cfg = GameConfig.casino.gamble;
    if (!cfg?.enabled || winAmount < GameHub.state.bet * cfg.minWinRatio) return;
    if (Math.random() >= (cfg.offerChance ?? 0.1)) return;

    pendingGambleWin = winAmount;
    gambleActive = true;

    const overlay = document.getElementById('gamble-overlay');
    const amountEl = document.getElementById('gamble-amount');
    const timerFill = document.getElementById('gamble-timer-fill');
    if (amountEl) amountEl.textContent = `+€${winAmount}`;
    overlay?.classList.remove('hidden');
    overlay?.setAttribute('aria-hidden', 'false');

    const timeout = cfg.timeoutMs ?? 6000;
    const start = performance.now();
    cancelAnimationFrame(gambleAnimId);

    const tick = (now) => {
      if (!gambleActive) return;
      const left = Math.max(0, 1 - (now - start) / timeout);
      if (timerFill) timerFill.style.transform = `scaleX(${left})`;
      if (left <= 0) { resolveGamble(false); return; }
      gambleAnimId = requestAnimationFrame(tick);
    };
    gambleAnimId = requestAnimationFrame(tick);
    clearTimeout(gambleTimerId);
    gambleTimerId = setTimeout(() => resolveGamble(false), timeout);
  }

  function resolveGamble(doGamble) {
    if (!gambleActive) return;
    gambleActive = false;
    clearTimeout(gambleTimerId);
    cancelAnimationFrame(gambleAnimId);

    document.getElementById('gamble-overlay')?.classList.add('hidden');
    document.getElementById('gamble-overlay')?.setAttribute('aria-hidden', 'true');

    if (doGamble && pendingGambleWin > 0) {
      const won = Math.random() < (GameConfig.casino.gamble.winChance ?? 0.48);
      if (won) {
        GameHub.state.balance += pendingGambleWin;
        GameHub.state.totalWon += pendingGambleWin;
        spawnParticles(GameHub.w / 2, GameHub.h / 2, 30, '#86efac');
        GameHub.showMessage(`+€${pendingGambleWin}`, 'win');
        GameHub.playSound('bigwin');
      } else {
        GameHub.state.balance -= pendingGambleWin;
        GameHub.state.totalWon -= pendingGambleWin;
        GameHub.showMessage(`−€${pendingGambleWin}`, 'lose');
        GameHub.playSound('lose');
      }
      GameHub.updateHud();
      GameHub.updatePanelStats();
    }
    pendingGambleWin = 0;
    GameHub.updatePlayUi();
  }

  function showJackpotModal(amount) {
    const el = document.getElementById('jackpot-modal');
    const amt = document.getElementById('jackpot-modal-amount');
    if (amt) amt.textContent = `€${amount}`;
    el?.classList.remove('hidden');
    el?.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      el?.classList.add('hidden');
      el?.setAttribute('aria-hidden', 'true');
    }, 3200);
  }

  function claimDailyBonus() {
    const key = new Date().toISOString().slice(0, 10);
    const settings = Storage.readSettings();
    if (settings.lastDailyBonus === key) return 0;
    Storage.writeSettings({ ...settings, lastDailyBonus: key });
    lastDailyKey = key;
    const bonus = GameConfig.casino.dailyBonus.amount;
    GameHub.state.balance += bonus;
    GameHub.showMessage(`🎁 +€${bonus}`, 'win');
    GameHub.playSound('bigwin');
    GameHub.updateHud();
    return bonus;
  }

  function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 320,
        vy: -60 - Math.random() * 220,
        life: 0.7 + Math.random() * 0.8,
        color,
        size: 3 + Math.random() * 6
      });
    }
  }

  function update(dt) {
    if (bigWinFlash > 0) bigWinFlash = Math.max(0, bigWinFlash - dt * 1.2);
    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      return p.life > 0;
    });
  }

  function renderOverlay() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;

    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (bigWinFlash > 0) {
      ctx.globalAlpha = bigWinFlash * 0.18;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    drawCasinoAmbience();
  }

  function drawCasinoAmbience() {
    const { ctx, w, h } = GameHub;
    if (!ctx || !GameHub.running) return;
    const t = performance.now() * 0.001;
    ctx.globalAlpha = 0.04;
    for (let i = 0; i < 12; i++) {
      const x = (Math.sin(t * 0.3 + i * 1.7) * 0.5 + 0.5) * w;
      const y = (Math.cos(t * 0.25 + i * 2.1) * 0.5 + 0.5) * h * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 80);
      g.addColorStop(0, i % 2 ? '#fbbf24' : '#a855f7');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function updateCasinoHud() {
    const jpEl = document.getElementById('hud-jackpot');
    const vipEl = document.getElementById('hud-vip');
    const tier = getVipTier();
    if (jpEl) jpEl.textContent = `€${Math.round(jackpotPool)}`;
    if (vipEl) {
      vipEl.textContent = tier.name;
      vipEl.style.color = tier.color;
    }
    const vipStat = document.getElementById('stat-vip');
    if (vipStat) vipStat.textContent = tier.name;
    const wagerStat = document.getElementById('stat-wagered');
    if (wagerStat) wagerStat.textContent = `€${totalWagered}`;
  }

  function bindGamble() {
    document.getElementById('btn-gamble-yes')?.addEventListener('click', () => resolveGamble(true));
    document.getElementById('btn-gamble-no')?.addEventListener('click', () => resolveGamble(false));
  }

  function isGambleActive() { return gambleActive; }

  function reset() {
    jackpotPool = GameConfig.casino.jackpot.start;
    totalWagered = 0;
    particles = [];
    bigWinFlash = 0;
    gambleActive = false;
    pendingGambleWin = 0;
    lastDailyKey = '';
    updateCasinoHud();
  }

  function exportState() {
    return { jackpotPool, totalWagered, lastDailyKey };
  }

  function importState(data) {
    jackpotPool = Number(data?.jackpotPool) || GameConfig.casino.jackpot.start;
    totalWagered = Number(data?.totalWagered) || 0;
    lastDailyKey = data?.lastDailyKey || '';
    updateCasinoHud();
  }

  function onSessionStart() {
    claimDailyBonus();
    updateCasinoHud();
  }

  return {
    onBetPlaced,
    applyWinWithVip,
    recordLoss,
    update,
    renderOverlay,
    bindGamble,
    isGambleActive,
    reset,
    exportState,
    importState,
    onSessionStart,
    getVipTier,
    updateCasinoHud,
    spawnParticles
  };
})();
/* END-MERGE-BLOCK */
