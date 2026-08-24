/* MERGE-BLOCK: game-blackjack.js — blackjack 21 */
const BlackjackEngine = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  let deck = [];
  let playerHand = [];
  let dealerHand = [];
  let phase = 'idle'; // idle | player | dealer | done
  let roundBet = 0;
  let winFlash = 0;

  function isBusy() { return phase === 'player' || phase === 'dealer'; }
  function hasBet() { return true; }

  function makeDeck() {
    const d = [];
    for (const s of SUITS) {
      for (const r of RANKS) d.push({ rank: r, suit: s });
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function cardValue(card, softTotal) {
    if (card.rank === 'A') return softTotal + 11 <= 21 ? 11 : 1;
    if (['K', 'Q', 'J'].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  function handTotal(hand) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
      else total += Number(c.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handTotal(hand) === 21;
  }

  function drawFromDeck(forPlayer) {
    if (!deck.length) return null;
    const luck = GameConfig.casino.luck || {};
    if (forPlayer && Math.random() < (luck.blackjackPlayerBoost ?? 0.6)) {
      const good = ['10', 'J', 'Q', 'K', 'A', '9', '8'];
      const idx = deck.findIndex((c) => good.includes(c.rank));
      if (idx >= 0) return deck.splice(idx, 1)[0];
    }
    if (!forPlayer && Math.random() < (luck.blackjackDealerWeak ?? 0.5)) {
      const low = ['2', '3', '4', '5', '6'];
      const idx = deck.findIndex((c) => low.includes(c.rank));
      if (idx >= 0) return deck.splice(idx, 1)[0];
    }
    return deck.pop();
  }

  function deal() {
    if (phase !== 'idle' && phase !== 'done') return;
    if (!GameHub.canAffordBet()) {
      if (GameHub.state.balance < GameHub.state.bet) GameHub.showMessage('Te weinig saldo', 'warn');
      return;
    }

    GameHub.deductBet();
    roundBet = GameHub.state.bet;
    deck = makeDeck();
    playerHand = [drawFromDeck(true), drawFromDeck(true)];
    dealerHand = [drawFromDeck(false), drawFromDeck(false)];
    phase = 'player';
    GameHub.playSound('spin');
    GameHub.updatePlayUi();

    if (isBlackjack(playerHand)) {
      if (isBlackjack(dealerHand)) finishRound('push', 'Beide blackjack — push');
      else finishRound('blackjack', 'BLACKJACK!');
    }
  }

  function hit() {
    if (phase !== 'player') return;
    playerHand.push(drawFromDeck(true));
    GameHub.playSound('tick');
    if (handTotal(playerHand) > 21) finishRound('lose', 'Bust!');
    else if (handTotal(playerHand) === 21) stand();
    GameHub.updatePlayUi();
  }

  function stand() {
    if (phase !== 'player') return;
    phase = 'dealer';
    while (handTotal(dealerHand) < 17) dealerHand.push(drawFromDeck(false));
    resolveRound();
  }

  function resolveRound() {
    const p = handTotal(playerHand);
    const d = handTotal(dealerHand);
    if (d > 21) finishRound('win', 'Dealer bust!');
    else if (p > d) finishRound('win', 'Je wint!');
    else if (p < d) finishRound('lose', 'Dealer wint');
    else finishRound('push', 'Gelijk — push');
  }

  function finishRound(result, label) {
    phase = 'done';
    let win = 0;
    if (result === 'blackjack') win = Math.round(roundBet * 2.5);
    else if (result === 'win') win = roundBet * 2;
    else if (result === 'push') win = roundBet;

    if (result === 'push') {
      GameHub.state.balance += roundBet;
      GameHub.showMessage(label, 'info');
      GameHub.recordRound(roundBet, 0, `BJ push`);
      GameHub.updateHud();
    } else if (win > roundBet) {
      winFlash = 1;
      GameHub.applyWin(win, label);
      GameHub.recordRound(roundBet, win, `BJ ${label}`);
    } else {
      GameHub.recordRound(roundBet, 0, `BJ ${label}`);
      GameHub.recordLoss();
    }
    GameHub.updatePlayUi();
  }

  function drawCard(x, y, w, h, card, hidden = false) {
    const { ctx } = GameHub;
    ctx.fillStyle = hidden ? '#312e81' : '#fffef8';
    ctx.strokeStyle = hidden ? '#6366f1' : '#cbd5e1';
    ctx.lineWidth = 2;
    GameHub.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    if (hidden) {
      ctx.fillStyle = '#818cf8';
      ctx.font = `700 ${h * 0.35}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, y + h / 2);
      return;
    }

    const red = card.suit === '♥' || card.suit === '♦';
    ctx.fillStyle = red ? '#dc2626' : '#1e293b';
    ctx.font = `800 ${h * 0.28}px Plus Jakarta Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.rank, x + w / 2, y + h * 0.38);
    ctx.font = `${h * 0.32}px serif`;
    ctx.fillText(card.suit, x + w / 2, y + h * 0.62);
  }

  function renderHand(hand, cx, cy, cardW, cardH, hideFirst = false) {
    const gap = cardW * 0.28;
    const totalW = hand.length * cardW + (hand.length - 1) * gap;
    let x = cx - totalW / 2;
    hand.forEach((card, i) => {
      drawCard(x, cy, cardW, cardH, card, hideFirst && i === 0);
      x += cardW + gap;
    });
  }

  function render() {
    const { ctx, w, h } = GameHub;
    if (!ctx) return;
    GameHub.drawBackground({ bgTop: '#0f172a', bgMid: '#0a1020', bgBot: '#030712' });

    const cardW = Math.min(w * 0.14, 56);
    const cardH = cardW * 1.38;

    if (dealerHand.length) renderHand(dealerHand, w / 2, h * 0.26, cardW, cardH, phase === 'player');
    if (playerHand.length) renderHand(playerHand, w / 2, h * 0.58, cardW, cardH);

    if (winFlash > 0) {
      ctx.globalAlpha = winFlash * 0.2;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function update(now, dt) {
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt * 1.5);
  }

  function bindControls() {
    document.getElementById('btn-bj-deal')?.addEventListener('click', deal);
    document.getElementById('btn-bj-hit')?.addEventListener('click', hit);
    document.getElementById('btn-bj-stand')?.addEventListener('click', stand);
  }

  function onEnter() { GameHub.updatePlayUi(); }
  function onLeave() {}
  function reset() {
    phase = 'idle';
    playerHand = [];
    dealerHand = [];
    winFlash = 0;
  }

  return {
    isBusy, hasBet, deal, hit, stand, update, render, bindControls, onEnter, onLeave, reset,
    exportState: () => ({ phase }),
    importState: () => reset()
  };
})();
/* END-MERGE-BLOCK */
