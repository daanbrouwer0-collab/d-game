/* MERGE-BLOCK: config.js */
const GameConfig = {
  slug: 'DDobble',
  title: 'D-Dobble Casino',
  subtitle: 'Het ultieme gokcasino — 6 spellen, jackpot & VIP',
  version: '3.1.0',
  defaultGame: 'dice',

  storageKeys: {
    username: 'game:DDobble:username',
    settings: 'game:DDobble:settings',
    saves: 'game:DDobble:saves',
    sessions: 'game:DDobble:sessions'
  },

  bet: {
    steps: [1, 5, 10, 25, 50, 100],
    defaultBet: 5
  },

  casino: {
    dailyBonus: { amount: 50 },
    jackpot: { start: 100, contribution: 0.02, winChance: 0.008 },
    gamble: { enabled: true, minWinRatio: 2, offerChance: 0.1, timeoutMs: 6000, winChance: 0.55 },
    luck: {
      baseWinBoost: 0.22,
      pityAfter: 2,
      pityBoost: 0.2,
      hotStreakTrim: 0.04,
      maxWinChance: 0.82,
      loseRefundChance: 0.2,
      loseRefundRatio: 0.5,
      megaWinChance: 0.04,
      megaMult: 2.5,
      slotPairRate: 0.58,
      slotTripleRate: 0.1,
      blackjackPlayerBoost: 0.6,
      blackjackDealerWeak: 0.5
    },
    vipTiers: [
      { id: 'bronze', name: 'Bronze', minWager: 0, winBoost: 1, color: '#cd7f32' },
      { id: 'silver', name: 'Silver', minWager: 500, winBoost: 1.05, color: '#c0c0c0' },
      { id: 'gold', name: 'Gold', minWager: 2000, winBoost: 1.1, color: '#fbbf24' },
      { id: 'platinum', name: 'Platinum', minWager: 5000, winBoost: 1.15, color: '#a5b4fc' },
      { id: 'diamond', name: 'Diamond', minWager: 10000, winBoost: 1.25, color: '#67e8f9' }
    ]
  },

  slot: { spinDuration: 1.6, reelStagger: 0.35, anyPairPayout: 1.4 },

  dice: {
    bets: [
      { id: 'low', label: 'Laag (2-6)', payout: 2, winLabel: 'Laag wint!' },
      { id: 'seven', label: 'Gelijk (7)', payout: 5, winLabel: 'Zeven!' },
      { id: 'high', label: 'Hoog (8-12)', payout: 2, winLabel: 'Hoog wint!' },
      { id: 'double', label: 'Dubbel', payout: 6, winLabel: 'Dubbel!' }
    ]
  },

  coin: { payout: 2 },

  roulette: {
    redNumbers: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    wheelOrder: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
  },

  bingo: {
    pullCooldown: 0.65,
    maxDraws: 32,
    patterns: [
      { id: 'line', label: 'Lijn', payout: 3, winLabel: 'Bingo lijn!' },
      { id: 'corners', label: 'Hoeken', payout: 6, winLabel: 'Vier hoeken!' },
      { id: 'full', label: 'Full card', payout: 22, winLabel: 'FULL CARD!' }
    ]
  },

  games: [
    {
      id: 'dice',
      type: 'dice',
      name: 'Dobbelen',
      icon: '🎲',
      tag: 'Tafel',
      description: 'Twee dobbelstenen — laag, hoog, zeven of dubbel.',
      gameplayHint: 'Kies inzet → GOOI',
      colors: { frame: '#1a0a2e', frameLight: '#7c3aed', accent: '#fbbf24' }
    },
    {
      id: 'roulette',
      type: 'roulette',
      name: 'Roulette',
      icon: '🎡',
      tag: 'Tafel',
      description: 'Europees roulette — rood, zwart, even, oneven of getal.',
      gameplayHint: 'Kies veld → DRAAI',
      colors: { frame: '#0a1a12', frameLight: '#059669', accent: '#86efac' }
    },
    {
      id: 'blackjack',
      type: 'blackjack',
      name: 'Blackjack',
      icon: '🃏',
      tag: 'Kaarten',
      description: 'Klassiek 21 — versla de dealer. Blackjack betaalt ×2.5.',
      gameplayHint: 'DEEL → KAART / PASSEN',
      colors: { frame: '#0f172a', frameLight: '#334155', accent: '#fde68a' }
    },
    {
      id: 'coin',
      type: 'coin',
      name: 'Kop of Munt',
      icon: '🪙',
      tag: 'Snel',
      description: '50/50 gok — kies kop of munt en verdubbel je inzet.',
      gameplayHint: 'Kies kant → GOOI',
      colors: { frame: '#1a1508', frameLight: '#ca8a04', accent: '#fcd34d' }
    },
    {
      id: 'bingo',
      type: 'bingo',
      name: 'Bingo',
      icon: '🎱',
      tag: 'Salon',
      description: '75-ball bingo — lijn, hoeken of full card.',
      gameplayHint: 'START → TREK BAL',
      colors: { frame: '#0a1628', frameLight: '#2563eb', accent: '#93c5fd' }
    },
    {
      id: 'fruit',
      type: 'slot',
      name: 'Fruitautomaat',
      icon: '🎰',
      tag: 'Slots',
      description: '3-rollen slot — drie dezelfde symbolen is jackpot.',
      gameplayHint: 'DRAAI',
      reels: 3,
      symbols: [
        { id: 'cherry', label: 'Kers', emoji: '🍒', weight: 32, payout: 2.5 },
        { id: 'lemon', label: 'Citroen', emoji: '🍋', weight: 26, payout: 3 },
        { id: 'orange', label: 'Sinaasappel', emoji: '🍊', weight: 20, payout: 4 },
        { id: 'grape', label: 'Druif', emoji: '🍇', weight: 14, payout: 7 },
        { id: 'star', label: 'Ster', emoji: '⭐', weight: 6, payout: 18 },
        { id: 'seven', label: 'Zeven', emoji: '7️⃣', weight: 2, payout: 45 },
        { id: 'diamond', label: 'Diamant', emoji: '💎', weight: 1, payout: 120 }
      ],
      colors: { frame: '#1a0a2e', frameLight: '#dc2626', reelBg: '#0f0518', accent: '#fbbf24' }
    }
  ],

  difficulty: {
    easy: { label: 'Easy', startBalance: 500 },
    normal: { label: 'Normal', startBalance: 200 },
    hard: { label: 'Hard', startBalance: 100 }
  },

  session: { maxCount: 24, maxNameLength: 24, maxCharacterLength: 18 }
};
/* END-MERGE-BLOCK */
