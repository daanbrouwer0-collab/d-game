/* MERGE-BLOCK: config.js */
/**
 * Neon Racer — één config voor app + alle banen.
 *
 * Per baan staan gameplay, bochten, hobbel en visuals bij elkaar.
 * Kleuren als #rrggbb. decorWeights: alle types, niet gebruikt = 0.
 * stripe1 / stripe2: middelste wegmarkering (buiten / binnen strepen).
 * gateInterval: afstand tussen poortjes in wereld-eenheden (default 800).
 *
 * splits: 0–3  (split/merge/dubbele rijstrook; 0=weinig, 3=veel)
 * bend: bochtigheid 0.3–4.5 (scherpte, draai-intensiteit)
 * swing: slingering 0.3–4.5 (S-vorm, zijwaarts; default = bend)
 * bumpMul: hobbel-sterkte | rollWave*: hobbel-vorm
 */
const GameConfig = (function () {
  const DECOR_TYPES = [
    'house', 'building', 'tower', 'pillar', 'tree', 'boom_2',
    'cactus', 'crystal', 'crystal_2', 'pyramid', 'planet'
  ];

  const TRACK_DEFAULTS = {
    stripe1: '#292a2b',
    stripe2: '#56575a',
    decor: 'city',
    bend: 1.2,
    swing: 1.2,
    bumpMul: 0.65,
    rollStrength: 2.2,
    rollWaveAmp: 3.5,
    rollWaveLength: 80,
    rollWaveLength2: 32,
    buildingChanceMul: 1,
    splits: 1,
    gateInterval: 800
  };

  function emptyDecorWeights() {
    const w = {};
    for (const t of DECOR_TYPES) w[t] = 0;
    return w;
  }

  function decorWeights(partial) {
    return { ...emptyDecorWeights(), ...(partial || {}) };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /**
   * Twee gebruikerswaarden → alle interne bocht-parameters.
   * bend = hoe scherp/bochtig | swing = hoe veel S-slalom (default = bend).
   */
  function resolveBendProfile(track) {
    const t = { ...TRACK_DEFAULTS, ...(track || {}) };
    let bend = Number(t.bend);
    let swing = Number(t.swing);

    if (!Number.isFinite(bend)) {
      const c = Number(t.curviness);
      const turn = Number(t.turnMul);
      if (Number.isFinite(c) || Number.isFinite(turn)) {
        const cPart = Number.isFinite(c) ? (c - 0.9) / 0.55 : 1;
        const tPart = Number.isFinite(turn) ? (turn - 0.82) / 0.42 : 1;
        bend = clamp(cPart * 0.55 + tPart * 0.45, 0.3, 4.5);
      } else {
        bend = TRACK_DEFAULTS.bend;
      }
    }
    if (!Number.isFinite(swing)) {
      const w = Number(t.wobbleMul);
      if (Number.isFinite(w)) swing = clamp((w - 0.62) / 0.4, 0.3, 4.5);
      else swing = bend;
    }

    bend = clamp(bend, 0.3, 4.5);
    swing = clamp(swing, 0.3, 4.5);

    return {
      bend,
      swing,
      curviness: 0.9 + bend * 0.55,
      bendMul: 0.86 + bend * 0.12,
      turnMul: 0.82 + bend * 0.42,
      wobbleMul: 0.62 + swing * 0.4,
      chordDevMul: clamp(0.045 + swing * 0.042, 0.04, 0.35),
      lateralMul: 0.88 + bend * 0.22,
      offsetMul: 0.88 + bend * 0.17,
      straightChance: clamp(0.155 - bend * 0.03, 0.02, 0.16)
    };
  }

  /** Visueel + curve/roll velden uit een baan-record (strings, runtime → hex in game.js). */
  function resolveTrackTheme(track) {
    if (!track) return null;
    const t = { ...TRACK_DEFAULTS, ...track };
    const bend = resolveBendProfile(t);
    return {
      label: t.label || t.name || 'Neon',
      accent: t.accent,
      accent2: t.accent2,
      accent3: t.accent3,
      sky: t.sky,
      fog: t.fog,
      fogDensity: t.fogDensity,
      hemi: t.hemi,
      road: t.road,
      stripe1: t.stripe1,
      stripe2: t.stripe2,
      underlayLeft: t.underlayLeft,
      underlayRight: t.underlayRight,
      gate: t.gate,
      gateInterval: Number(t.gateInterval) || TRACK_DEFAULTS.gateInterval,
      terrain: t.terrain,
      palettes: t.palettes,
      decor: t.decor,
      decorWeights: decorWeights(t.decorWeights),
      curve: {
        bend: bend.bend,
        swing: bend.swing,
        turnMul: bend.turnMul,
        wobbleMul: bend.wobbleMul,
        chordDevMul: bend.chordDevMul,
        lateralMul: bend.lateralMul,
        offsetMul: bend.offsetMul
      },
      bendProfile: bend,
      rollStrength: t.rollStrength,
      rollWaveAmp: t.rollWaveAmp,
      rollWaveLength: t.rollWaveLength,
      rollWaveLength2: t.rollWaveLength2
    };
  }

  function getTrackUi(track) {
    const t = resolveTrackTheme(track);
    if (track?.id === 10) {
      return {
        label: t.label,
        accent: '#ff2bd6',
        accent2: '#00ff88',
        accent3: '#ffea00',
        rainbow: true
      };
    }
    return {
      label: t.label,
      accent: t.accent || '#1c99ff',
      accent2: t.accent2 || t.accent || '#1c99ff',
      accent3: t.accent3 || t.accent2 || t.accent || '#1c99ff'
    };
  }

  const tracks = [
    {
      id: 1,
      name: 'Blue Village',
      label: 'Huisjes',
      seed: 10001,
      gates: 20,
      gateInterval: 800,
      topSpeedKMH: 300,
      splits: 0,
      buildingChanceMul: 0.95,
      bend: 0.8,
      swing: 0.7,
      bumpMul: 0.18,
      rollWaveAmp: 2.8,
      rollWaveLength: 92,
      rollWaveLength2: 34,
      rollStrength: 2.0,
      accent: '#1c4dff',
      accent2: '#ff2bd6',
      accent3: '#00ffff',
      sky: '#020612',
      fog: '#06102a',
      fogDensity: 0.00105,
      hemi: ['#f30b1e', '#4bee05'],
      road: '#1313ae',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#d954f3',
      underlayRight: '#f354b6',
      gate: ['#4eff2b', '#00bbff'],
      terrain: ['#03081a', '#00ff22'],
      palettes: ['#ffbf1c', '#ff2bd6', '#1cd5e2', '#7c3aed', '#260dc4', '#c522b5'],
      decor: 'city',
      decorWeights: decorWeights({ house: 4.88, building: 0.16, boom_2: 0.36, pillar: 0, tower: 0.0 })
    },
    {
      id: 2,
      name: 'Skyline Rush',
      label: 'Hoogbouw',
      seed: 10002,
      gates: 20,
      gateInterval: 800,
      topSpeedKMH: 310,
      splits: 1,
      buildingChanceMul: 1.05,
      bend: 1.0,
      swing: 1.0,
      bumpMul: 0.65,
      rollWaveAmp: 3.6,
      rollWaveLength: 78,
      rollWaveLength2: 26,
      rollStrength: 2.6,
      accent: '#7c3aed',
      accent2: '#00ffff',
      accent3: '#ffea00',
      sky: '#02000c',
      fog: '#120020',
      fogDensity: 0.00125,
      hemi: ['#aa00ff', '#00ffff'],
      road: '#8406a3',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#f2a704',
      underlayRight: '#f08c09',
      gate: ['#00ffff', '#00a2ff'],
      terrain: ['#040008', '#ffff00'],
      palettes: ['#7c3aed', '#00ffff', '#ffff00', '#ff2bd6', '#00a2ff', '#ff6600'],
      decor: 'city',
      decorWeights: decorWeights({ tower: 0.42, building: 0.34, pillar: 0, house: 0.06 })
    },
    {
      id: 3,
      name: 'Outland',
      label: 'Bomen',
      seed: 10003,
      gates: 25,
      gateInterval: 800,
      topSpeedKMH: 320,
      splits: 0,
      buildingChanceMul: 0.9,
      bend: 5.2,
      swing: 3.4,
      bumpMul: 1.18,
      rollWaveAmp: 2.2,
      rollWaveLength: 100,
      rollWaveLength2: 40,
      rollStrength: 2.2,
      accent: '#6a3f22',
      accent2: '#22c55e',
      accent3: '#00ff88',
      sky: '#020a04',
      fog: '#001b0a',
      fogDensity: 0.0011,
      hemi: ['#22c55e', '#00ff88'],
      road: '#6a3f22',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#8df74f',
      underlayRight: '#7ef13b',
      gate: ['#22c55e', '#00ff88'],
      terrain: ['#020a04', '#22c55e'],
      palettes: ['#22c55e', '#00ff88', '#5a8f11', '#1d5318', '#ffff00', '#ff6600'],
      decor: 'forest',
      decorWeights: decorWeights({ tree: 0.2, boom_2: 0.7, house: 0.1, pillar: 0})
    },
    {
      id: 4,
      name: 'Sun Pyramid',
      label: 'Piramides',
      seed: 10004,
      gates: 25,
      gateInterval: 800,
      topSpeedKMH: 330,
      splits: 1,
      buildingChanceMul: 1.0,
      bend: 0.85,
      swing: 0.9,
      bumpMul: 1.45,
      rollWaveAmp: 5.6,
      rollWaveLength: 66,
      rollWaveLength2: 36,
      rollStrength: 3.0,
      accent: '#ffcc00',
      accent2: '#ff8800',
      accent3: '#ffffff',
      sky: '#0a0800',
      fog: '#221800',
      fogDensity: 0.00135,
      hemi: ['#00ff2a', '#f0e331'],
      road: '#c09c0a',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#48f1e3',
      underlayRight: '#72e6f1',
      gate: ['#ff8800', '#ffd700'],
      terrain: ['#080600', '#ff8800'],
      palettes: ['#ffcc00', '#ff8800', '#ff6600', '#ed8585', '#c32bff', '#547821'],
      decor: 'desert',
      decorWeights: decorWeights({ pyramid: 0.22, cactus: 0.38, pillar:0,  house: 0.14, crystal: 0.02, tower: 0.0 })
    },
    {
      id: 5,
      name: 'Crystal Drift',
      label: 'Kristallen',
      seed: 10005,
      gates: 30,
      gateInterval: 1000,
      topSpeedKMH: 340,
      splits: 2,
      buildingChanceMul: 1.15,
      bend: 1.8,
      swing: 1.5,
      bumpMul: 2.82,
      rollWaveAmp: 4.8,
      rollWaveLength: 66,
      rollWaveLength2: 48,
      rollStrength: 3.2,
      accent: '#00c3ff',
      accent2: '#ffffff',
      accent3: '#00ffff',
      sky: '#00101a',
      fog: '#001b2a',
      fogDensity: 0.00135,
      hemi: ['#6dffc7', '#41f5b6'],
      road: '#00eaff',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#f2c7f6',
      underlayRight: '#f4a6f3',
      gate: ['#ffffff', '#00ffff'],
      terrain: ['#001018', '#00ffff'],
      palettes: ['#00c3ff', '#00ffff', '#ffffff', '#ff2bd6', '#7c3aed', '#ffea00'],
      decor: 'crystal',
      decorWeights: decorWeights({ crystal: 0.32, crystal_2: 0.58, house: 0.14,pillar: 0, tower: 0.08 })
    },
    {
      id: 6,
      name: 'Tower Run',
      label: 'Torens',
      seed: 10006,
      gates: 30,
      gateInterval: 800,
      topSpeedKMH: 350,
      splits: 3,
      buildingChanceMul: 4.2,
      bend: 2.8,
      swing: 1.8,
      bumpMul: 0.65,
      rollWaveAmp: 4.8,
      rollWaveLength: 64,
      rollWaveLength2: 22,
      rollStrength: 3.0,
      accent: '#ff6600',
      accent2: '#8b00ff',
      accent3: '#ff9900',
      sky: '#120400',
      fog: '#2a0c00',
      fogDensity: 0.0013,
      hemi: ['#00ff77', '#8b00ff'],
      road: '#ff6600',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#16adf9',
      underlayRight: '#009dff',
      gate: ['#00fffb', '#00ffaa'],
      terrain: ['#0a0400', '#8b00ff'],
      palettes: ['#ff6600', '#ff9900', '#8b00ff', '#ff2bd6', '#00ffff', '#ffffff'],
      decor: 'city',
      decorWeights: decorWeights({ tower: 0.55, pillar: 0.22, pyramid: 0.02, building: 0.38,})
    },
    {
      id: 7,
      name: 'Orbit',
      label: 'Satellieten',
      seed: 10007,
      gates: 35,
      gateInterval: 800,
      topSpeedKMH: 365,
      splits: 0,
      buildingChanceMul: 0.25,
      bend: 0,
      swing: 0,
      bumpMul: 0,
      rollWaveAmp: 0,
      rollWaveLength: 10,
      rollWaveLength2: 5,
      rollStrength: 0,
      accent: '#ffffff',
      accent2: '#00a2ff',
      accent3: '#00ffff',
      sky: '#050510',
      fog: '#070716',
      fogDensity: 0.0012,
      hemi: ['#ffffff', '#00a2ff'],
      road: '#eaeaea',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#0bb7f6',
      underlayRight: '#2baef5',
      gate: ['#00a2ff', '#00ffff'],
      terrain: ['#050510', '#00a2ff'],
      palettes: ['#ffffff', '#00a2ff', '#00ffff', '#ffae2b', '#ffea00', '#968af3'],
      decor: 'orbit',
      decorWeights: decorWeights({ planet: 0.97, pillar: 0.02, tower: 0, crystal: 0.02})
    },
    {
      id: 8,
      name: 'biohazard',
      label: 'Fabriek',
      seed: 10008,
      gates: 35,
      gateInterval: 800,
      topSpeedKMH: 380,
      splits: 2,
      buildingChanceMul: 3.85,
      bend: 1.5,
      swing: 1.4,
      bumpMul: 1.45,
      rollWaveAmp: 5.8,
      rollWaveLength: 44,
      rollWaveLength2: 14,
      rollStrength: 3.8,
      accent: '#7dff00',
      accent2: '#ff6600',
      accent3: '#ffea00',
      sky: '#071006',
      fog: '#0a1608',
      fogDensity: 0.00125,
      hemi: ['#a3ff12', '#ff6600'],
      road: '#7dff00',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#f1e04b',
      underlayRight: '#eff540',
      gate: ['#f433ed', '#f81a76'],
      terrain: ['#061004', '#ff6600'],
      palettes: ['#7dff00', '#2df48d', '#ffea00', '#00ffff', '#4fee8c', '#ffffff'],
      decor: 'factory',
      decorWeights: decorWeights({ building: 0.1, tower: 0.1, pillar: 0.6, planet: 0.17, crystal: 0.1 })
    },
    {
      id: 9,
      name: 'Inferno Peak',
      label: 'Vulkanen',
      seed: 10009,
      gates: 40,
      gateInterval: 800,
      topSpeedKMH: 400,
      splits: 3,
      buildingChanceMul: 6.4,
      bend: 2.0,
      swing: 1.7,
      bumpMul: 1.45,
      rollWaveAmp: 7.2,
      rollWaveLength: 34,
      rollWaveLength2: 11,
      rollStrength: 4.4,
      accent: '#ff0000',
      accent2: '#ffea00',
      accent3: '#ffffff',
      sky: '#0c0000',
      fog: '#220000',
      fogDensity: 0.00145,
      hemi: ['#ff2200', '#ffea00'],
      road: '#ff0000',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#ff9900',
      underlayRight: '#ff8000',
      gate: ['#ffea00', '#ff2200'],
      terrain: ['#080000', '#ffea00'],
      palettes: ['#ff0000', '#ff2200', '#ffea00', '#ffffff', '#890a50', '#6b1212'],
      decor: 'inferno',
      decorWeights: decorWeights({ tree: 0.34, house: 0.1, crystal: 0.46, pillar: 0., building: 0 })
    },
    {
      id: 10,
      name: 'Neon World Tour',
      label: 'Alle thema\'s',
      seed: 10010,
      gates: 90,
      gateInterval: 800,
      topSpeedKMH: 400,
      splits: 2,
      buildingChanceMul: 1.0,
      bend: 2.2,
      swing: 2.0,
      bumpMul: 1.45,
      rollWaveAmp: 7.8,
      rollWaveLength: 34,
      rollWaveLength2: 11,
      rollStrength: 4.2,
      accent: '#00ffff',
      accent2: '#ff2bd6',
      accent3: '#ffffff',
      sky: '#0a0800',
      fog: '#221800',
      fogDensity: 0.00155,
      hemi: ['#ffd700', '#ff6600'],
      road: '#ffaa00',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#ffd700',
      underlayRight: '#ff6600',
      gate: ['#ffd700', '#ff8800'],
      terrain: ['#080600', '#554400'],
      palettes: ['#ffd700', '#ff6600', '#ffffff', '#ff00aa', '#00ffcc', '#ff2200'],
      decor: 'city',
      decorWeights: decorWeights({
        house: 0.12, building: 0.14, tower: 0.14, pillar: 0.1,
        tree: 0.1, boom_2: 0.08, cactus: 0.06, crystal: 0.1,
        crystal_2: 0.08, pyramid: 0.08, planet: 0.1
      }),
      sections: [
        { trackId: 1, gates: 10 },
        { trackId: 2, gates: 10 },
        { trackId: 3, gates: 10 },
        { trackId: 4, gates: 10 },
        { trackId: 5, gates: 10 },
        { trackId: 6, gates: 10 },
        { trackId: 7, gates: 10 },
        { trackId: 8, gates: 10 },
        { trackId: 9, gates: 10 }
      ]
    },
    {
      id: 11,
      vip: true,
      name: 'Void Circuit',
      label: 'VIP · Kosmos',
      seed: 10011,
      gates: 28,
      gateInterval: 1800,
      topSpeedKMH: 420,
      splits: 1,
      buildingChanceMul: 0.85,
      bend: 2.4,
      swing: 2.3,
      bumpMul: 3.8,
      rollWaveAmp: 6.4,
      rollWaveLength: 120,
      rollWaveLength2: 60,
      rollStrength: 3.8,
      accent: '#b026ff',
      accent2: '#00e5ff',
      accent3: '#ffffff',
      sky: '#030008',
      fog: '#120028',
      fogDensity: 0.00135,
      hemi: ['#c44dff', '#00e5ff'],
      road: '#210a37',
      stripe1: '#0d0e0e',
      stripe2: '#151616',
      underlayLeft: '#292408',
      underlayRight: '#2a2909',
      gate: ['#00e5ff', '#b026ff'],
      terrain: ['#050010', '#4a0080'],
      palettes: ['#b026ff', '#00e5ff', '#ffffff', '#ff2bd6', '#7c3aed', '#00ffcc'],
      decor: 'crystal',
      decorWeights: decorWeights({ planet: 0.32, crystal_2: 0.28, crystal: 0.22, tower: 0.1, pillar: 0.08 })
    },
    {
      id: 12,
      vip: true,
      name: 'pilots view',
      label: 'VIP · Goud',
      seed: 10012,
      gates: 32,
      gateInterval: 800,
      topSpeedKMH: 440,
      splits: 2,
      buildingChanceMul: 1.6,
      bend: 2.6,
      swing: 2.5,
      bumpMul: 2.55,
      rollWaveAmp: 7.0,
      rollWaveLength: 23,
      rollWaveLength2: 10,
      rollStrength: 4.0,
      accent: '#ffd700',
      accent2: '#ff8c00',
      accent3: '#fff8e0',
      sky: '#3a7bec',
      fog: '#bcad08',
      fogDensity: 0.0014,
      hemi: ['#ffd700', '#ff6600'],
      road: '#0b7f0b',
      stripe1: '#292a2b',
      stripe2: '#56575a',
      underlayLeft: '#ffd700',
      underlayRight: '#ff8c00',
      gate: ['#ffd700', '#ffaa00'],
      terrain: ['#377d04', '#554400'],
      palettes: ['#ffd700', '#ff8c00', '#ffffff', '#ff2200', '#00ffff', '#ff2bd6'],
      decor: 'pyramid',
      decorWeights: decorWeights({ pyramid: 0.04, tower: 0.24, pillar: 0.2, crystal: 0.02, planet: 0.2 })
    }
  ];

  return {
    slug: 'NeonRacer',
    title: 'Neon Racer',
    subtitle: 'Synthwave race — rij naar de finish',
    version: '2.0.0',

    storageKeys: {
      username: 'game:NeonRacer:username',
      settings: 'game:NeonRacer:settings',
      saves: 'game:NeonRacer:saves',
      sessions: 'game:NeonRacer:sessions'
    },

    difficulty: {
      easy: { label: 'Easy', timeMul: 1.25, curvinessMul: 0.85 },
      normal: { label: 'Normal', timeMul: 1, curvinessMul: 1 },
      hard: { label: 'Hard', timeMul: 0.8, curvinessMul: 1.2 }
    },

    session: {
      maxCount: 24,
      maxNameLength: 24,
      maxCharacterLength: 18
    },

    level: {
      baseNodes: 5,
      nodesPerLevel: 2,
      maxNodes: 36,
      baseTimeLimit: 45,
      timePerLevel: 8
    },

    DECOR_TYPES,
    TRACK_DEFAULTS,
    decorWeights,
    resolveBendProfile,
    resolveTrackTheme,
    getTrackUi,

    trackCount: tracks.length,
    publicTrackCount: tracks.filter((t) => !t.vip).length,
    tracks,

    getTrack(level) {
      const id = Math.max(1, Math.min(tracks.length, Number(level) || 1));
      return tracks.find((t) => t.id === id) || tracks[0];
    },

    isVipTrack(level) {
      return !!this.getTrack(level)?.vip;
    },

    getLevelName(level) {
      return this.getTrack(level).name;
    }
  };
})();
/* END-MERGE-BLOCK */
