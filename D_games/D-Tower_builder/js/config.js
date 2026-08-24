/* MERGE-BLOCK: config.js */
const GameConfig = {
  slug: 'SideViewTemplate',
  title: 'Tower Build',
  subtitle: 'Bouw je toren met balken, loopplanken en touw',
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
    /** Gewicht (kg) — getoond op de karakterpagina en drukt op de constructie */
    weight: 72,
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

  /**
   * Tower builder — robuust node/beam model (geïnspireerd op D7-Bridge).
   * KERNIDEE: knopen (nodes) zijn de enige dingen met een positie.
   * Balken/loopplanken/touw zijn afstands-constraints tussen twee knopen.
   */
  build: {
    /** Lengtes (px) */
    beamMinLength: 26,
    beamMaxLength: 240,
    walkwayMaxLength: 230,
    ropeMaxLength: 320,

    /** Zichtbare dikte */
    beamThickness: 9,
    walkwayThickness: 13,
    ropeWidth: 3,
    nodeRadius: 6,

    /** Snapping: aan bestaande knoop of aan plateau/grond verankeren */
    snapRadius: 30,
    anchorSnap: 20,

    /** Startvoorraad */
    startWood: 100,
    startPlank: 100,
    startRope: 8,

    /**
     * Bouw mode is handmatig (knop in HUD), geen automatische timer.
     * graceSeconds: legacy — niet meer gebruikt voor timer.
     */
    graceSeconds: 10,

    /** Constructie-physics: Matter.js */
    useMatterPhysics: true,
    matterGravity: 2,
    matterGravityScale: 0.00135,

    substeps: 2,
    coyoteSeconds: 0.11,
    jumpBufferSeconds: 0.14,

    /** Stijfheid (lager = meer doorzakken / zichtbare flex) */
    beamStiff: 0.7,
    walkwayStiff: 0.76,
    ropeStiff: 0.5,

    /** Massa per pixel lengte (kg/px) — zwaarder = meer doorzakken & stress */
    beamMassPerPx: 0.034,
    walkwayMassPerPx: 0.05,
    ropeMassPerPx: 0.012,
    /**
     * Breken & stress-kleur: rek |lengte − rust| / rust t.o.v. breakStrain.
     * Stress 1.0 = op de grens; > 1 bezwijkt na breakTime seconden.
     */
    breakStrain: { beam: 0.14, walkway: 0.16, rope: 0.34 },
    breakTime: 0.4,
    /** Lagere rek al zichtbaar in kleur (0.5 = sqrt-curve). */
    stressVisGamma: 0.48,
    stressTintEnabled: true,

    /** Opruimen: stukken die dit ver onder de grond vallen verdwijnen */
    collapseFallDepth: 200
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
