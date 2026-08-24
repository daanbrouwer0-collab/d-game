/* MERGE-BLOCK: game-luck.js — spelersvriendelijke winstkansen */
const GameLuck = (() => {
  function cfg() {
    return GameConfig.casino.luck || {};
  }

  function getWinChance(fairChance) {
    const c = cfg();
    let chance = fairChance + (c.baseWinBoost ?? 0.2);
    if (GameHub.state.loseStreak >= (c.pityAfter ?? 2)) {
      chance += c.pityBoost ?? 0.22;
    }
    if (GameHub.state.winStreak >= 3) {
      chance -= c.hotStreakTrim ?? 0.05;
    }
    return Math.min(c.maxWinChance ?? 0.85, Math.max(fairChance, chance));
  }

  function rollWin(fairChance) {
    return Math.random() < getWinChance(fairChance);
  }

  function diceFairChance(betId) {
    const map = { low: 15 / 36, high: 15 / 36, seven: 6 / 36, double: 6 / 36 };
    return map[betId] ?? 0.4;
  }

  function rollWinningDice(betId) {
    const attempts = 40;
    for (let i = 0; i < attempts; i++) {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      const sum = d1 + d2;
      if (betId === 'low' && sum >= 2 && sum <= 6) return [d1, d2];
      if (betId === 'high' && sum >= 8 && sum <= 12) return [d1, d2];
      if (betId === 'seven' && sum === 7) return [d1, d2];
      if (betId === 'double' && d1 === d2) return [d1, d2];
    }
    if (betId === 'seven') return [3, 4];
    if (betId === 'double') return [3, 3];
    if (betId === 'low') return [2, 3];
    return [5, 6];
  }

  function rollDice(betId) {
    const fair = diceFairChance(betId);
    if (rollWin(fair)) return rollWinningDice(betId);
    for (let i = 0; i < 30; i++) {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      const sum = d1 + d2;
      const isDouble = d1 === d2;
      let won = false;
      if (betId === 'low') won = sum >= 2 && sum <= 6;
      else if (betId === 'seven') won = sum === 7;
      else if (betId === 'high') won = sum >= 8 && sum <= 12;
      else if (betId === 'double') won = isDouble;
      if (!won) return [d1, d2];
    }
    return [1, 3];
  }

  function rollCoin(playerSide) {
    const win = rollWin(0.5);
    return win ? playerSide : (playerSide === 'heads' ? 'tails' : 'heads');
  }

  function pickRouletteNumber(selectedBet) {
    const WHEEL = GameConfig.roulette.wheelOrder;
    const RED = new Set(GameConfig.roulette.redNumbers);

    function colorOf(n) {
      if (n === 0) return 'green';
      return RED.has(n) ? 'red' : 'black';
    }

    function isWin(n) {
      if (!selectedBet) return false;
      const { type, value } = selectedBet;
      if (type === 'color') return colorOf(n) === value;
      if (type === 'parity') {
        if (n === 0) return false;
        return value === 'even' ? n % 2 === 0 : n % 2 === 1;
      }
      if (type === 'number') return n === value;
      return false;
    }

    let fair = 0.48;
    if (selectedBet?.type === 'number') fair = 1 / 37;
    else if (selectedBet?.type === 'color' || selectedBet?.type === 'parity') fair = 18 / 37;

    if (rollWin(fair)) {
      const winners = WHEEL.filter(isWin);
      if (winners.length) return winners[Math.floor(Math.random() * winners.length)];
    }

    const losers = WHEEL.filter((n) => !isWin(n));
    if (losers.length) return losers[Math.floor(Math.random() * losers.length)];
    return WHEEL[Math.floor(Math.random() * WHEEL.length)];
  }

  function applyMegaWin(baseWin) {
    const c = cfg();
    if (baseWin <= 0 || Math.random() > (c.megaWinChance ?? 0.035)) return baseWin;
    const mult = c.megaMult ?? 2.5;
    GameHub.showMessage(`💥 ×${mult}!`, 'win');
    CasinoFX.spawnParticles?.(GameHub.w / 2, GameHub.h * 0.38, 45, '#f472b6');
    return Math.round(baseWin * mult);
  }

  function pickBingoBall(remainingPool, cardNumbers, markedSet) {
    const needed = cardNumbers.filter((n) => !markedSet.has(n) && remainingPool.includes(n));
    const fair = needed.length / Math.max(1, remainingPool.length);
    if (rollWin(Math.min(0.55, fair + 0.15)) && needed.length) {
      return needed[Math.floor(Math.random() * needed.length)];
    }
    const idx = Math.floor(Math.random() * remainingPool.length);
    return remainingPool[idx];
  }

  function tryLoseRefund() {
    const c = cfg();
    if (Math.random() > (c.loseRefundChance ?? 0.18)) return 0;
    const refund = Math.max(1, Math.round(GameHub.state.bet * (c.loseRefundRatio ?? 0.5)));
    GameHub.state.balance += refund;
    GameHub.showMessage(`Troost +€${refund}`, 'info');
    GameHub.updateHud();
    return refund;
  }

  return {
    rollWin,
    rollDice,
    rollCoin,
    pickRouletteNumber,
    pickBingoBall,
    applyMegaWin,
    tryLoseRefund,
    getWinChance
  };
})();
/* END-MERGE-BLOCK */
