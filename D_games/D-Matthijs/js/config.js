/* MERGE-BLOCK: config.js */
const GameConfig = {
  slug: 'NightHunt',
  title: 'Nachtjacht',
  subtitle: 'Overleef de nacht — zombies, vleermuizen & wapens',
  version: '1.0.0',

  storageKeys: {
    username: 'game:SideViewTemplate:username',
    settings: 'game:SideViewTemplate:settings',
    saves: 'game:SideViewTemplate:saves',
    sessions: 'game:SideViewTemplate:sessions'
  },

  world: {
    gravity: 1800,
    tileSize: 48,
    levelWidth: 2400,
    /** Heuvel-profiel: amplitude in px per golf */
    hills: {
      wave1: 26,
      wave2: 12,
      wave3: 34,
      wave4: 8
    }
  },

  /** Parallax: 0 = vast, 1 = mee met camera (voorgrond) */
  parallax: {
    clouds: 0.12,
    background: 0.45,
    ground: 1
  },

  player: {
    width: 32,
    height: 44,
    speed: 260,
    jumpForce: 780,
    color: '#00e5ff',
    shootSpeed: 520,
    shootCooldown: 0.28,
    bodyColors: {
      head: '#5ef0ff',
      body: '#00e5ff',
      legs: '#0097b2'
    }
  },

  /** Balk platform — één stuk, hitbox = zichtbare vorm */
  beam: {
    height: 16
  },

  difficulty: {
    easy: { label: 'Easy', speed: 280, jumpForce: 820, hpMax: 120 },
    normal: { label: 'Normal', speed: 260, jumpForce: 780, hpMax: 100 },
    hard: { label: 'Hard', speed: 240, jumpForce: 720, hpMax: 80 }
  },

  session: {
    maxCount: 24,
    maxNameLength: 24,
    maxCharacterLength: 18
  }
};
/* END-MERGE-BLOCK */
