const CONFIG = {
  APP_ID: 'robotrun',
  STORAGE_KEY: 'dgame-robotrun-sessions',
  CHAR_KEY: 'dgame-robotrun-character',
  PLAYERS_KEY: 'dgame-robotrun-players',

  MAX_PLAYERS: 5,
  MIN_HOTSEAT_PLAYERS: 2,

  MIN_CHECKPOINTS: 2,
  MAX_CHECKPOINTS: 6,
  DEFAULT_CHECKPOINTS: 3,

  DEFAULT_CHARACTER: {
    name: 'Bliksem Bot',
    colors: {
      head: '#00ffff',
      body: '#00ffff',
      legs: '#00ffff'
    },
    style: 'scout'
  },

  DEFAULT_PLAYERS: [
    {
      name: 'Bliksem Bot',
      colors: { head: '#00ffff', body: '#00ffff', legs: '#00ffff' },
      style: 'scout'
    },
    {
      name: 'RoboRacer',
      colors: { head: '#ff3355', body: '#ff3355', legs: '#ff3355' },
      style: 'tank'
    },
    {
      name: 'Pixel Pike',
      colors: { head: '#22c55e', body: '#22c55e', legs: '#22c55e' },
      style: 'spider'
    },
    {
      name: 'Nova Nut',
      colors: { head: '#a855f7', body: '#a855f7', legs: '#a855f7' },
      style: 'bee'
    },
    {
      name: 'Bolt Buddy',
      colors: { head: '#f59e0b', body: '#f59e0b', legs: '#f59e0b' },
      style: 'roller'
    }
  ],

  ROBOT_STYLES: [
    {
      id: 'scout',
      label: 'Scout',
      desc: 'Snel en slank met grote vizor'
    },
    {
      id: 'tank',
      label: 'Tank',
      desc: 'Stevig blokje met schouders'
    },
    {
      id: 'spider',
      label: 'Spider',
      desc: 'Rond lijf met pootjes'
    },
    {
      id: 'bee',
      label: 'Bee',
      desc: 'Ovaal robotje met streepjes'
    },
    {
      id: 'roller',
      label: 'Roller',
      desc: 'Rupsband-robot met bolle kop'
    }
  ],

  GAME_MODES: {
    VS_AI: 'vs_ai',
    HOTSEAT: 'hotseat',
    P2P: 'p2p'
  },

  PLAY_TRANSPORTS: {
    LOCAL: 'local',
    P2P: 'p2p'
  },

  P2P: {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 5,
    ACTIVE_ROOM_KEY: 'dgame-robotrun-p2p-active'
  },

  DEFAULT_HAND_SIZE: 9,
  /** Seconds everyone waits after all Ready before first round. */
  MATCH_COUNTDOWN_SECONDS: 10,
  /** Seconds to fill registers before empty slots are auto-filled. */
  PROGRAMMING_SECONDS: 60,
  /** Mag onder 5 zakken: dan gaan de laatste registers op slot. */
  MIN_HAND_SIZE: 0,
  STARTING_ENERGY: 1,
  MIN_STARTING_LIVES: 3,
  MAX_STARTING_LIVES: 6,
  DEFAULT_STARTING_LIVES: 3,
  /** @deprecated gebruik DEFAULT_STARTING_LIVES / sessie.startingLives */
  STARTING_LIVES: 3,
  RESPAWN_DAMAGE: 2,
  MAX_UPGRADES: 4,
  UPGRADE_OFFER_COUNT: 4,

  TILE_TYPES: {
    FLOOR: 0,
    CONVEYOR_1: 1,
    CONVEYOR_2: 2,
    GEAR_CW: 3,
    GEAR_CCW: 4,
    LASER: 5,
    PIT: 6,
    CHECKPOINT: 7,
    START: 8,
    REPAIR: 9,
    UPGRADE: 10
  },

  DIRECTIONS: {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3
  },

  CARD_TYPES: [
    { type: 'move1', label: 'MOVE 1', icon: '⬆', priorityBase: 490 },
    { type: 'move2', label: 'MOVE 2', icon: '⏫', priorityBase: 670 },
    { type: 'move3', label: 'MOVE 3', icon: '🚀', priorityBase: 790 },
    { type: 'backup', label: 'BACK UP', icon: '⬇', priorityBase: 430 },
    { type: 'turnR', label: 'TURN RIGHT', icon: '↻', priorityBase: 80 },
    { type: 'turnL', label: 'TURN LEFT', icon: '↺', priorityBase: 70 },
    { type: 'uturn', label: 'U-TURN', icon: '🔄', priorityBase: 10 },
    { type: 'wait', label: 'STIL', icon: '⏸', priorityBase: 50 }
  ],

  /** Extra kaarten die alleen in de hand komen met een upgrade. */
  UPGRADE_CARD_TYPES: {
    fourthGear: [
      { type: 'move4', label: 'MOVE 4', icon: '⚡', priorityBase: 860 }
    ],
    crabWalk: [
      { type: 'strafeL', label: 'KRAB L', icon: '⬅', priorityBase: 410 },
      { type: 'strafeR', label: 'KRAB R', icon: '➡', priorityBase: 420 }
    ],
    jumpJets: [
      { type: 'jump', label: 'JUMP', icon: '⤴', priorityBase: 640 }
    ],
    reverseThruster: [
      { type: 'backup2', label: 'BACK 2', icon: '⏬', priorityBase: 460 }
    ]
  },

  /**
   * Merge/combo recipes. Match = multiset of types (order ignored).
   * Optional requiresUpgrade gates the recipe.
   */
  MERGE_RECIPES: [
    { inputs: ['move1', 'move1', 'move1'], output: 'move2' },
    { inputs: ['move2', 'move2', 'move2'], output: 'move3' },
    { inputs: ['backup', 'backup', 'backup'], output: 'backup2' },
    { inputs: ['turnL', 'turnL', 'turnL'], output: 'uturn' },
    { inputs: ['turnR', 'turnR', 'turnR'], output: 'uturn' },
    { inputs: ['uturn', 'uturn', 'uturn'], output: 'wait' },
    { inputs: ['move1', 'turnL'], output: 'strafeL', requiresUpgrade: 'crabWalk' },
    { inputs: ['move1', 'turnR'], output: 'strafeR', requiresUpgrade: 'crabWalk' },
    { inputs: ['move3', 'move1'], output: 'move4', requiresUpgrade: 'fourthGear' },
    { inputs: ['move2', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
    { inputs: ['move1', 'move1', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
    { inputs: ['move3', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
    { inputs: ['move2', 'uturn'], output: 'jump', requiresUpgrade: 'jumpJets' },
    { inputs: ['move1', 'move1', 'uturn'], output: 'jump', requiresUpgrade: 'jumpJets' },
    { inputs: ['move2', 'turnL', 'turnR'], output: 'jump', requiresUpgrade: 'jumpJets' }
  ],

  getCardTypeDef(type) {
    const fromBase = (this.CARD_TYPES || []).find((c) => c.type === type);
    if (fromBase) return fromBase;
    const upgrades = this.UPGRADE_CARD_TYPES || {};
    for (const list of Object.values(upgrades)) {
      const hit = (list || []).find((c) => c.type === type);
      if (hit) return hit;
    }
    return null;
  },

  UPGRADES: [
    {
      id: 'rearLaser',
      label: 'Rear Laser',
      short: 'Achterlaser',
      desc: 'Schiet ook naar achteren na elk register.',
      cost: 1
    },
    {
      id: 'doubleLaser',
      label: 'Double Barrel',
      short: 'Dubbele Laser',
      desc: 'Je robotlaser doet 2 schade in plaats van 1.',
      cost: 1
    },
    {
      id: 'deflectorShield',
      label: 'Deflector Shield',
      short: 'Schild',
      desc: 'Blokkeert 1 robotlaser per ronde per exemplaar. Mag meerdere keren gekozen worden.',
      cost: 1,
      stackable: true
    },
    {
      id: 'ablativeArmor',
      label: 'Ablative Armor',
      short: 'Laserpantser',
      desc: 'Blokkeert de eerste boardlaser die je per ronde raakt.',
      cost: 1
    },
    {
      id: 'memoryBank',
      label: 'Memory Bank',
      short: 'Geheugen',
      desc: 'Je trekt elke ronde 1 extra kaart per exemplaar. Mag meerdere keren gekozen worden.',
      cost: 1,
      stackable: true
    },
    {
      id: 'repairKit',
      label: 'Repair Kit',
      short: 'Repair Kit',
      desc: 'Herstelt 1 schade per exemplaar aan het begin van iedere ronde. Mag meerdere keren gekozen worden.',
      cost: 1,
      stackable: true
    },
    {
      id: 'conveyorClaws',
      label: 'Conveyor Claws',
      short: 'Grijpers',
      desc: 'Bandbeweging −1: snelheid 1 doet niets, snelheid 2 doet 1 stap.',
      cost: 1
    },
    {
      id: 'gyroStabilizer',
      label: 'Gyro Stabilizer',
      short: 'Gyro',
      desc: 'Draaischijven draaien je niet meer.',
      cost: 1
    },
    {
      id: 'reinforcedHull',
      label: 'Reinforced Hull',
      short: 'Versterkt Romp',
      desc: 'Je maximale HP stijgt met 2 per exemplaar. Mag meerdere keren gekozen worden.',
      cost: 1,
      stackable: true
    },
    {
      id: 'softLanding',
      label: 'Soft Landing',
      short: 'Zachte Landing',
      desc: 'Bij respawn krijg je 0 schade.',
      cost: 1
    },
    {
      id: 'fourthGear',
      label: 'Fourth Gear',
      short: '4e Versnelling',
      desc: 'Kans op een MOVE 4-kaart in je hand.',
      cost: 1
    },
    {
      id: 'crabWalk',
      label: 'Crab Walk',
      short: 'Krab Move',
      desc: 'Kans op zijwaarts links/rechts bewegen zonder te draaien. Unlockt merge-recepten voor KRAB.',
      cost: 1
    },
    {
      id: 'jumpJets',
      label: 'Jump Jets',
      short: 'Jump',
      desc: 'Kans op JUMP: 2 stappen vooruit, tussenvak overslaan (muur/pit). Landing op een robot: duw + 1 schade. Unlockt JUMP-merge-recepten.',
      cost: 1
    },
    {
      id: 'reverseThruster',
      label: 'Reverse Thruster',
      short: 'Achteruit',
      desc: 'Kans op een BACK 2-kaart (2 stappen achteruit).',
      cost: 1
    },
    {
      id: 'ghost',
      label: 'Ghost',
      short: 'Ghost',
      desc: 'Je kunt door muren heen lopen (van het bord vallen kan niet; pits wel).',
      cost: 1
    }
  ]
};
