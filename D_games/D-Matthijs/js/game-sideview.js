/* MERGE-BLOCK: game-sideview.js — Nachtjacht survival combat */
const SideViewGame = (() => {
  const canvas = () => document.getElementById('game-canvas');
  let ctx;
  let dpr = 1;
  let w = 0;
  let h = 0;

  let running = false;
  let paused = false;
  let rafId = 0;
  let lastTime = 0;

  const JUMP_BUFFER_SEC = 0.22;
  const COYOTE_SEC = 0.14;

  const input = {
    left: false,
    right: false,
    jump: false,
    attackPressed: false,
    weaponCyclePressed: false
  };

  let jumpBufferTimer = 0;
  let coyoteTimer = 0;

  const state = {
    score: 0,
    kills: 0,
    plantsEaten: 0,
    level: 1,
    hp: 100,
    hunger: 100,
    weapon: 'sword',
    hasBow: false,
    hasAxe: false,
    bombs: 0,
    skillPoints: 2,
    skills: {}
  };

  const WEAPON_ORDER = ['sword', 'bow', 'axe', 'bomb'];

  const WEAPON_DEFS = {
    sword: { label: 'Zwaard', type: 'melee', damage: 28, range: 52, cooldown: 0.42 },
    bow: { label: 'Boog', type: 'projectile', damage: 32, cooldown: 0.5, speed: 500, w: 18, h: 4 },
    axe: { label: 'Bijl', type: 'melee', damage: 42, range: 46, cooldown: 0.65 },
    bomb: { label: 'Bom', type: 'bomb', damage: 55, radius: 72, cooldown: 0.9, speed: 320 }
  };

  const MONSTER_DEFS = {
    zombie: { label: 'Zombie', hp: 40, speed: 55, damage: 10, w: 30, h: 44, score: 120, chase: 170 },
    bat: { label: 'Vleermuis', hp: 20, speed: 90, damage: 7, w: 26, h: 20, score: 70, chase: 190, flying: true }
  };

  const HOME_SAFE_PADDING = 300;

  const ITEM_TYPES = {
    plant: { label: 'Geneesplant', score: 15, r: 13, heal: 28, hunger: 22 },
    bow: { label: 'Boog', score: 80, r: 15 },
    axe: { label: 'Bijl', score: 80, r: 15 },
    bomb: { label: 'Bom', score: 40, r: 12 },
    coin: { label: 'Relikwie', score: 50, r: 11 }
  };

  const MAX_LEVEL = 3;

  const LEVEL_DEFS = {
    1: { width: 2400, theme: 'meadow', label: 'Duistere Bos' },
    2: { width: 2000, theme: 'cave', label: 'Crypte' },
    3: { width: 2600, theme: 'peak', label: 'Kerkhof' }
  };

  const WORLD_LEVELS = {
    1: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Duistere Bos — vecht naar de uitgang' },
    2: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Crypte — dieper in de nacht' },
    3: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Kerkhof — laatste uitdaging' }
  };

  const camera = { x: 0, y: 0 };

  let player = createPlayer(120, 0);
  let platforms = [];
  let pickups = [];
  let monsters = [];
  let trees = [];
  let clouds = [];
  let doors = [];
  let groundY = 0;
  let levelWidth = GameConfig.world.levelWidth;
  let levelTheme = 'meadow';
  let doorCooldown = 0;
  let projectiles = [];
  let explosions = [];
  let attackCooldown = 0;
  let meleeSwing = null;
  let playerInvincible = 0;
  let spawnSafeZoneEnd = 400;

  function getPlayerCenterX() {
    return player.x + player.w / 2;
  }

  function isPlayerAtHome() {
    return getPlayerCenterX() < spawnSafeZoneEnd;
  }

  let sharePromptOpen = false;
  let pendingShareFile = null;

  let bodyColors = {
    ...GameConfig.player.bodyColors,
    rainbowHead: false,
    rainbowBody: false,
    rainbowLegs: false
  };
  let rainbowPhase = 0;
  let sessionMeta = {
    sessionName: '',
    characterName: 'Held',
    difficulty: 'normal'
  };

  const parallax = () => GameConfig.parallax;

  function getDifficultyCfg() {
    const preset = GameConfig.difficulty[sessionMeta.difficulty] || GameConfig.difficulty.normal;
    const bonus = SkillTree.computeBonuses(state.skills);
    return {
      ...GameConfig.player,
      speed: preset.speed * bonus.speedMul,
      jumpForce: preset.jumpForce * bonus.jumpMul,
      hpMax: preset.hpMax + bonus.hpBonus,
      skillBonus: bonus
    };
  }

  function getSkillState() {
    return {
      skills: { ...state.skills },
      skillPoints: state.skillPoints
    };
  }

  function awardSkillPoints(amount) {
    const n = Number(amount) || 0;
    if (n <= 0) return;
    state.skillPoints += n;
    updatePanelStats();
    SkillTree.refresh();
  }

  function upgradeSkill(skillId) {
    const skill = SkillTree.getSkill(skillId);
    if (!skill) return { ok: false, reason: 'Onbekende skill' };

    const rank = state.skills[skillId] || 0;
    if (rank >= skill.max) return { ok: false, reason: 'Max niveau bereikt' };
    if (state.skillPoints < skill.cost) return { ok: false, reason: 'Te weinig skill punten' };
    if (!SkillTree.meetsRequirements(state.skills, skill)) {
      return { ok: false, reason: 'Eerst vereiste skill leren' };
    }

    state.skills[skillId] = rank + 1;
    state.skillPoints -= skill.cost;

    const hpMax = getDifficultyCfg().hpMax;
    if (skillId === 'vitality') state.hp = Math.min(hpMax, state.hp + 12);
    if (state.hp > hpMax) state.hp = hpMax;

    updateHud();
    updatePanelStats();
    return { ok: true };
  }

  function setSessionMeta(meta = {}) {
    sessionMeta = {
      sessionName: String(meta.sessionName || '').trim(),
      characterName: String(meta.characterName || 'Held').trim().slice(0, GameConfig.session?.maxCharacterLength || 18),
      difficulty: GameConfig.difficulty[meta.difficulty] ? meta.difficulty : 'normal'
    };
  }

  function getSessionMeta() {
    return { ...sessionMeta };
  }

  function normalizeBodyColors(colors) {
    const defaults = GameConfig.player.bodyColors;
    const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
    return {
      head: hex(colors?.head, defaults.head),
      body: hex(colors?.body, defaults.body),
      legs: hex(colors?.legs, defaults.legs),
      rainbowHead: !!colors?.rainbowHead,
      rainbowBody: !!colors?.rainbowBody,
      rainbowLegs: !!colors?.rainbowLegs
    };
  }

  const RAINBOW_FLAGS = { head: 'rainbowHead', body: 'rainbowBody', legs: 'rainbowLegs' };

  function fillRainbowRect(targetCtx, x, y, rw, rh, phase) {
    const grad = targetCtx.createLinearGradient(x, y, x + rw, y + rh);
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const hue = ((i / steps) * 300 + phase * 120) % 360;
      grad.addColorStop(i / steps, `hsl(${hue}, 92%, 58%)`);
    }
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(x, y, rw, rh);
  }

  function drawCharacterPart(targetCtx, part, x, y, rw, rh, phaseOffset = 0) {
    const flag = RAINBOW_FLAGS[part];
    if (flag && bodyColors[flag]) {
      fillRainbowRect(targetCtx, x, y, rw, rh, rainbowPhase + phaseOffset);
    } else {
      targetCtx.fillStyle = bodyColors[part];
      targetCtx.fillRect(x, y, rw, rh);
    }
  }

  function drawCharacterHead(targetCtx, x, y, rw, rh) {
    drawCharacterPart(targetCtx, 'head', x, y, rw, rh);
  }

  function loadBodyColors() {
    const settings = Storage.readSettings();
    bodyColors = normalizeBodyColors(settings.characterColors || GameConfig.player.bodyColors);
  }

  function getBodyColors() {
    return { ...bodyColors };
  }

  function setBodyColors(colors) {
    bodyColors = normalizeBodyColors({ ...bodyColors, ...colors });
    Storage.writeSettings({
      ...Storage.readSettings(),
      characterColors: { ...bodyColors }
    });
  }

  function resetBodyColors() {
    bodyColors = {
      ...GameConfig.player.bodyColors,
      rainbowHead: false,
      rainbowBody: false,
      rainbowLegs: false
    };
    Storage.writeSettings({
      ...Storage.readSettings(),
      characterColors: { ...bodyColors }
    });
  }

  function groundSurfaceY(x) {
    const hills = GameConfig.world.hills;
    return (
      groundY
      + Math.sin(x * 0.007) * hills.wave1
      + Math.sin(x * 0.016 + 1.4) * hills.wave2
      + Math.sin(x * 0.003 + 0.6) * hills.wave3
      + Math.cos(x * 0.024 + 2.1) * hills.wave4
    );
  }

  function groundSurfaceYAt(entityX, entityW) {
    const samples = [entityX + 2, entityX + entityW * 0.5, entityX + entityW - 2];
    let surfaceY = -Infinity;
    for (const sx of samples) {
      surfaceY = Math.max(surfaceY, groundSurfaceY(sx));
    }
    return surfaceY;
  }

  /** Heuvel-top van de middelste parallax-laag (waar bomen op staan) */
  function backgroundHillSurfaceY(x, band = 1) {
    const cfg = band === 0
      ? { offset: -14, ripple: 0.22 }
      : { offset: 2, ripple: 0.18 };
    return groundSurfaceY(x) + cfg.offset - cfg.ripple * 18 * Math.sin(x * 0.011 + 0.4);
  }

  function createPlayer(x, y) {
    const p = GameConfig.player;
    return {
      x,
      y,
      w: p.width,
      h: p.height,
      vx: 0,
      vy: 0,
      grounded: false,
      facing: 1
    };
  }

  function createPlatform(anchorX, spanWidth, surfaceY, variant = 'grass', seed = 0) {
    const heights = {
      grass: 22,
      wood: 18,
      crate: 40,
      stone: 30,
      stump: 34,
      mushroom: 22,
      tomb: 32,
      beam: GameConfig.beam.height
    };
    const platH = heights[variant] || 22;
    return {
      type: 'platform',
      variant,
      seed,
      x: anchorX,
      y: surfaceY - platH,
      w: spanWidth,
      h: platH
    };
  }

  function pickPlatformVariant(lvl, width, heightAbove, index) {
    const theme = getLevelDef(lvl).theme;
    const narrow = width < GameConfig.world.tileSize * 2.6;
    const high = heightAbove > 7;

    if (narrow && high) return 'stump';
    if (narrow) return theme === 'cave' ? 'mushroom' : 'stump';
    if (width > GameConfig.world.tileSize * 3.8) {
      return theme === 'peak' ? 'tomb' : 'grass';
    }

    const pools = {
      meadow: ['grass', 'wood', 'crate', 'stone', 'grass', 'wood'],
      cave: ['stone', 'mushroom', 'crate', 'stone', 'wood'],
      peak: ['stone', 'tomb', 'stone', 'grass', 'wood']
    };
    const pool = pools[theme] || pools.meadow;
    return pool[index % pool.length];
  }

  /** @deprecated alias */
  function createBeamPlatform(anchorX, spanWidth, surfaceY) {
    return createPlatform(anchorX, spanWidth, surfaceY, 'beam');
  }

  /** Zigzag-trap van platformpjes om omhoog te klimmen */
  function addPlatformStairs(list, startX, firstHeight, steps, opts = {}) {
    const ts = GameConfig.world.tileSize;
    const stepHeight = opts.stepHeight ?? 2.3;
    const stepWidth = opts.stepWidth ?? ts * 2.5;
    const shiftX = opts.shiftX ?? ts * 3;
    const heightOffset = opts.heightOffset ?? 0;

    for (let i = 0; i < steps; i++) {
      const x = startX + (i % 2) * shiftX;
      const heightAbove = firstHeight + heightOffset + i * stepHeight;
      list.push([x, heightAbove, stepWidth]);
    }
  }

  function getLevelDef(lvl) {
    return LEVEL_DEFS[lvl] || LEVEL_DEFS[1];
  }

  function getLevelPlatData(lvl, ts) {
    if (lvl === 2) {
      const platData = [
        [220, 1.4, ts * 3],
        [480, 2.6, ts * 2.5],
        [740, 1.8, ts * 3.5],
        [1020, 3.2, ts * 2],
        [1280, 2.0, ts * 4],
        [1540, 3.8, ts * 2.5],
        [600, 7.5, ts * 2.5],
        [980, 10.0, ts * 3]
      ];
      addPlatformStairs(platData, 320, 2.0, 10, { stepHeight: 2.2, shiftX: ts * 2.8 });
      addPlatformStairs(platData, 1100, 1.8, 8, { stepHeight: 2.3, shiftX: ts * 3 });
      return platData;
    }

    if (lvl === 3) {
      const platData = [
        [260, 2.0, ts * 3],
        [640, 4.5, ts * 2.5],
        [980, 7.0, ts * 3],
        [1360, 9.5, ts * 2.5],
        [1740, 12.0, ts * 3],
        [2100, 14.5, ts * 2.5]
      ];
      addPlatformStairs(platData, 180, 1.6, 16, { stepHeight: 2.1, shiftX: ts * 2.6 });
      addPlatformStairs(platData, 760, 1.8, 14, { stepHeight: 2.2, shiftX: ts * 2.8 });
      addPlatformStairs(platData, 1380, 2.0, 12, { stepHeight: 2.2, shiftX: ts * 2.8 });
      return platData;
    }

    const platData = [
      [180, 1.6, ts * 2.5],
      [320, 2.2, ts * 3],
      [560, 3.8, ts * 2],
      [820, 2.5, ts * 4],
      [1120, 4.2, ts * 2],
      [1380, 3.1, ts * 3],
      [1680, 3.6, ts * 2],
      [1960, 2.4, ts * 5],
      [520, 8.5, ts * 3],
      [920, 11.0, ts * 2.5],
      [1180, 13.5, ts * 3],
      [1520, 16.0, ts * 2.5],
      [1880, 18.5, ts * 3]
    ];
    addPlatformStairs(platData, 240, 1.8, 14, { stepHeight: 2.2, shiftX: ts * 2.8 });
    addPlatformStairs(platData, 680, 2.0, 12, { stepHeight: 2.3, shiftX: ts * 3 });
    addPlatformStairs(platData, 1180, 1.6, 18, { stepHeight: 2.1, shiftX: ts * 2.6 });
    addPlatformStairs(platData, 1720, 2.2, 14, { stepHeight: 2.2, shiftX: ts * 2.8 });
    return platData;
  }

  function getLevelPickupSpawns(lvl) {
    if (lvl === 2) {
      return [
        ['plant', 220, 1.1],
        ['plant', 350, 2.5],
        ['bow', 520, 1.4],
        ['plant', 680, 3.0],
        ['bomb', 860, 4.2],
        ['plant', 1100, 2.2],
        ['axe', 1320, 5.0],
        ['plant', 1480, 3.5],
        ['bomb', 400, 12.0],
        ['plant', 1150, 14.0],
        ['coin', 480, 22.0]
      ];
    }

    if (lvl === 3) {
      return [
        ['plant', 220, 1.1],
        ['plant', 400, 3.0],
        ['bow', 620, 5.5],
        ['plant', 900, 8.0],
        ['axe', 1200, 11.0],
        ['bomb', 1500, 14.0],
        ['plant', 1800, 17.0],
        ['bomb', 2100, 20.0],
        ['plant', 280, 18.0],
        ['coin', 820, 24.0],
        ['plant', 1420, 32.0]
      ];
    }

    return [
      ['plant', 210, 1.1],
      ['plant', 380, 3.4],
      ['plant', 470, 1.3],
      ['bow', 540, 2.1],
      ['plant', 620, 5.2],
      ['bomb', 760, 2.8],
      ['plant', 980, 3.8],
      ['axe', 1050, 1.5],
      ['plant', 1180, 4.5],
      ['bomb', 1200, 5.6],
      ['plant', 1320, 3.2],
      ['coin', 1450, 4.2],
      ['plant', 1580, 1.7],
      ['plant', 1750, 4.8],
      ['bomb', 1880, 2.3],
      ['plant', 300, 12.5],
      ['plant', 720, 15.0],
      ['plant', 1240, 18.0],
      ['coin', 1400, 42.0]
    ];
  }

  function getLevelMonsterSpawns(lvl) {
    if (lvl === 2) {
      return [
        ['zombie', 420, 0],
        ['bat', 600, 4],
        ['zombie', 880, 0],
        ['bat', 1050, 6],
        ['zombie', 1280, 0],
        ['bat', 1500, 3],
        ['zombie', 700, 10],
        ['bat', 1100, 12]
      ];
    }
    if (lvl === 3) {
      return [
        ['zombie', 500, 0],
        ['bat', 720, 5],
        ['zombie', 980, 0],
        ['bat', 1250, 8],
        ['zombie', 1580, 0],
        ['bat', 1850, 4],
        ['zombie', 2100, 0],
        ['bat', 400, 15],
        ['zombie', 1350, 18],
        ['bat', 1700, 20]
      ];
    }
    return [
      ['zombie', 560, 0],
      ['bat', 740, 3],
      ['zombie', 980, 0],
      ['bat', 1150, 5],
      ['zombie', 1380, 0],
      ['bat', 1620, 4],
      ['zombie', 1880, 0],
      ['zombie', 720, 12],
      ['bat', 1050, 14],
      ['zombie', 1450, 16]
    ];
  }

  function createMonster(type, x, heightAbove) {
    const def = MONSTER_DEFS[type];
    if (!def) return null;
    const ts = GameConfig.world.tileSize;
    let y;
    if (def.flying) {
      y = groundSurfaceY(x) - heightAbove * ts - 60 - Math.random() * 40;
    } else {
      y = groundSurfaceYAt(x, def.w) - def.h;
    }
    return {
      type,
      x,
      y,
      baseY: y,
      w: def.w,
      h: def.h,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      facing: Math.random() > 0.5 ? 1 : -1,
      attackCd: 0,
      hurtTimer: 0,
      patrolDir: Math.random() > 0.5 ? 1 : -1,
      bob: Math.random() * Math.PI * 2,
      grounded: !def.flying
    };
  }

  function spawnMonsters(lvl) {
    monsters = [];
    for (const [type, x, heightAbove] of getLevelMonsterSpawns(lvl)) {
      const m = createMonster(type, x, heightAbove);
      if (m) monsters.push(m);
    }
  }

  function getAvailableWeapons() {
    const list = ['sword'];
    if (state.hasBow) list.push('bow');
    if (state.hasAxe) list.push('axe');
    if (state.bombs > 0) list.push('bomb');
    return list;
  }

  function cycleWeapon() {
    const avail = getAvailableWeapons();
    if (avail.length <= 1) return;
    const idx = avail.indexOf(state.weapon);
    state.weapon = avail[(idx + 1) % avail.length];
    if (state.weapon === 'bomb' && state.bombs <= 0) state.weapon = avail[0];
    showMessage(WEAPON_DEFS[state.weapon].label);
    updateHud();
  }

  function createDoor(x, targetLevel, spawnSide, kind = 'travel') {
    const doorW = 56;
    const doorH = 68;
    const centerX = x + doorW * 0.5;
    const ground = groundSurfaceY(centerX);
    return {
      x,
      y: ground - doorH,
      w: doorW,
      h: doorH,
      targetLevel,
      spawnSide,
      kind,
      pulse: Math.random() * Math.PI * 2
    };
  }

  function spawnLevelDoors(lvl) {
    doors = [];
    const endX = levelWidth - 88;

    if (lvl > 1) {
      doors.push(createDoor(52, lvl - 1, 'end', 'back'));
    }
    if (lvl < MAX_LEVEL) {
      doors.push(createDoor(endX, lvl + 1, 'start', 'forward'));
    } else {
      doors.push(createDoor(endX, null, 'start', 'finish'));
    }
  }

  function spawnPlayer(enterFrom) {
    const pH = GameConfig.player.height;
    let spawnX;

    if (enterFrom === 'end') {
      spawnX = levelWidth - 200;
    } else if (state.level > 1) {
      spawnX = 140;
    } else {
      spawnX = 100;
    }

    player = createPlayer(spawnX, groundSurfaceYAt(spawnX, GameConfig.player.width) - pH - 4);
    spawnSafeZoneEnd = spawnX + HOME_SAFE_PADDING;
  }

  function goToLevel(targetLevel, enterFrom) {
    if (targetLevel < 1 || targetLevel > MAX_LEVEL) return;
    const prev = state.level;
    state.level = targetLevel;
    if (targetLevel > prev) {
      state.score += 100;
      awardSkillPoints(2);
    }
    projectiles = [];
    explosions = [];
    attackCooldown = 0;
    meleeSwing = null;
    buildLevel(enterFrom);
    showMessage(
      targetLevel > prev
        ? `Level ${targetLevel} — ${getLevelDef(targetLevel).label}`
        : `Terug naar level ${targetLevel}`
    );
    updateHud();
    updatePanelStats();
  }

  function buildLevel(enterFrom = 'start') {
    const ts = GameConfig.world.tileSize;
    const lvl = state.level;
    const def = getLevelDef(lvl);

    platforms = [];
    pickups = [];
    trees = [];
    clouds = [];
    doors = [];

    levelWidth = def.width;
    levelTheme = def.theme;
    groundY = Math.floor(h * 0.78);

    const platData = getLevelPlatData(lvl, ts);
    platData.forEach(([x, heightAbove, width, forcedVariant], i) => {
      const centerX = x + width * 0.5;
      const surfaceY = groundSurfaceY(centerX) - heightAbove * ts;
      const variant = forcedVariant || pickPlatformVariant(lvl, width, heightAbove, i);
      platforms.push(createPlatform(x, width, surfaceY, variant, i));
    });

    for (const [type, x, heightAbove] of getLevelPickupSpawns(lvl)) {
      if (!ITEM_TYPES[type]) continue;
      pickups.push({
        type,
        x,
        y: groundSurfaceY(x) - heightAbove * ts,
        r: ITEM_TYPES[type].r,
        taken: false,
        bob: Math.random() * Math.PI * 2
      });
    }

    const treeCount = lvl === 2 ? 8 : lvl === 3 ? 12 : 22;
    const treeSpacing = levelWidth / treeCount;
    for (let i = 0; i < treeCount; i++) {
      const x = 60 + i * treeSpacing + (i % 3) * 14;
      trees.push({
        x,
        h: 44 + (i % 4) * 12,
        crown: 16 + (i % 3) * 5,
        shade: lvl === 2 ? 0.12 + (i % 4) * 0.04 : 0.22 + (i % 5) * 0.06,
        lean: (i % 2 === 0 ? 1 : -1) * (i % 3),
        band: i % 5 === 0 ? 0 : 1,
        scale: i % 5 === 0 ? 0.72 : 0.88 + (i % 3) * 0.04
      });
    }

    const cloudCount = lvl === 2 ? 8 : 14;
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        x: (i / cloudCount) * (levelWidth + 400) - 120,
        y: 36 + (i % 4) * 28 + (i % 3) * 8,
        w: 90 + (i % 3) * 36,
        h: 28 + (i % 2) * 10,
        alpha: lvl === 2 ? 0.25 + (i % 3) * 0.08 : 0.55 + (i % 3) * 0.12,
        drift: (i % 5) * 0.4
      });
    }

    spawnLevelDoors(lvl);
    spawnMonsters(lvl);
    spawnPlayer(enterFrom);
    doorCooldown = 0.5;
    camera.x = Math.max(0, Math.min(levelWidth - w, player.x + player.w / 2 - w * 0.42));
    camera.y = player.y + player.h * 0.5 - h * 0.55;
  }

  function resize() {
    const c = canvas();
    if (!c) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.parentElement.getBoundingClientRect();
    w = Math.max(320, Math.floor(rect.width));
    h = Math.max(240, Math.floor(rect.height));
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!platforms.length) buildLevel();
  }

  function exportState() {
    return {
      score: state.score,
      kills: state.kills,
      plantsEaten: state.plantsEaten,
      level: state.level,
      hp: state.hp,
      hunger: state.hunger,
      weapon: state.weapon,
      hasBow: state.hasBow,
      hasAxe: state.hasAxe,
      bombs: state.bombs,
      skillPoints: state.skillPoints,
      skills: { ...state.skills },
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, facing: player.facing },
      pickupStates: pickups.map((p) => ({ type: p.type, taken: p.taken })),
      t: Date.now()
    };
  }

  function importState(save) {
    if (!save || typeof save !== 'object') return false;
    state.score = Number(save.score) || 0;
    state.kills = Number(save.kills) || 0;
    state.plantsEaten = Number(save.plantsEaten) || 0;
    state.level = Number(save.level) || 1;
    state.hp = Number(save.hp) || getDifficultyCfg().hpMax;
    state.hunger = save.hunger != null ? Number(save.hunger) : 100;
    state.weapon = WEAPON_DEFS[save.weapon] ? save.weapon : 'sword';
    state.hasBow = !!save.hasBow;
    state.hasAxe = !!save.hasAxe;
    state.bombs = Number(save.bombs) || 0;
    state.skillPoints = save.skillPoints != null ? Number(save.skillPoints) : 2;
    state.skills = save.skills && typeof save.skills === 'object' ? { ...save.skills } : {};
    buildLevel('start');

    if (save.player) {
      player.x = Number(save.player.x) || player.x;
      player.y = Number(save.player.y) || player.y;
      player.vx = Number(save.player.vx) || 0;
      player.vy = Number(save.player.vy) || 0;
      player.facing = save.player.facing === -1 ? -1 : 1;
    }

    if (Array.isArray(save.pickupStates)) {
      save.pickupStates.forEach((ps, i) => {
        if (pickups[i]) pickups[i].taken = !!ps.taken;
      });
    }

    updateHud();
    updatePanelStats();
    return true;
  }

  function resetGame() {
    state.score = 0;
    state.kills = 0;
    state.plantsEaten = 0;
    state.level = 1;
    state.hp = getDifficultyCfg().hpMax;
    state.hunger = 100;
    state.weapon = 'sword';
    state.hasBow = false;
    state.hasAxe = false;
    state.bombs = 0;
    state.skillPoints = 2;
    state.skills = {};
    projectiles = [];
    explosions = [];
    attackCooldown = 0;
    meleeSwing = null;
    playerInvincible = 0;
    buildLevel();
    updateHud();
    updatePanelStats();
  }

  function stopGame() {
    if (sharePromptOpen) closeCameraSharePrompt();
    running = false;
    paused = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    setSessionMeta({ sessionName: '', characterName: 'Held', difficulty: 'normal' });
    loadBodyColors();
    resetGame();
  }

  function start(fromLoad = false) {
    if (!fromLoad) resetGame();
    running = true;
    paused = false;
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    const name = sessionMeta.characterName || 'Held';
    showMessage(fromLoad ? `${name} — verder vechten` : `Overleef de nacht, ${name}!`);
  }

  function requestJump() {
    jumpBufferTimer = JUMP_BUFFER_SEC;
  }

  function clearInput() {
    input.left = false;
    input.right = false;
    input.jump = false;
    input.attackPressed = false;
    input.weaponCyclePressed = false;
    jumpBufferTimer = 0;
    document.querySelectorAll('.control-btn.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  function pause() {
    paused = true;
    clearInput();
  }

  function resume() {
    if (!running) start(true);
    paused = false;
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function onTabVisible() {
    if (!running) return;
    if (Menu.isVisible()) return;
    paused = false;
    clearInput();
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function onTabHidden() {
    if (running) pause();
  }

  function loop(now) {
    if (!running || Nav.getActiveTab() !== 'play') return;
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    if (!paused && !sharePromptOpen && !Menu.isVisible()) {
      update(dt);
    }
    render();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    const cfg = getDifficultyCfg();
    const hungerFx = getHungerEffects();
    const move = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    player.vx = move * cfg.speed * hungerFx.speedMul;
    if (move !== 0) player.facing = move;

    jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);
    coyoteTimer = Math.max(0, coyoteTimer - dt);

    const canJump = player.grounded || coyoteTimer > 0;
    if (jumpBufferTimer > 0 && canJump) {
      player.vy = -cfg.jumpForce * hungerFx.jumpMul;
      player.grounded = false;
      jumpBufferTimer = 0;
      coyoteTimer = 0;
    }

    player.vy += GameConfig.world.gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.grounded = false;
    for (const p of platforms) {
      if (p.type === 'platform' && aabbOverlap(player, p)) {
        resolvePlatformCollision(player, p);
      }
    }
    resolveGroundCollision(player);

    if (player.grounded) {
      coyoteTimer = COYOTE_SEC;
    }

    player.x = Math.max(0, Math.min(levelWidth - player.w, player.x));
    if (player.y > camera.y + h + 200) {
      player.y = groundSurfaceYAt(player.x, player.w) - player.h - 4;
      player.x = Math.max(80, player.x - 80);
      player.vy = 0;
      state.hp = Math.max(0, state.hp - 10);
      showMessage('Val schade!');
    }

    rainbowPhase += dt * 1.8;

    collectPickups(dt);
    updateHunger(dt);
    updateMonsters(dt);
    updateCombat(dt);
    updateExplosions(dt);
    updateDoors(dt);

    if (input.weaponCyclePressed) {
      input.weaponCyclePressed = false;
      cycleWeapon();
    }

    playerInvincible = Math.max(0, playerInvincible - dt);
    if (meleeSwing) {
      meleeSwing.life -= dt;
      if (meleeSwing.life <= 0) meleeSwing = null;
    }

    camera.x += ((player.x + player.w / 2 - w * 0.42) - camera.x) * Math.min(1, dt * 6);
    camera.x = Math.max(0, Math.min(levelWidth - w, camera.x));

    const targetCamY = player.y + player.h * 0.5 - h * 0.55;
    const maxCamY = groundY - h * 0.55 + 40;
    camera.y += (targetCamY - camera.y) * Math.min(1, dt * 6);
    camera.y = Math.max(-h * 3, Math.min(maxCamY, camera.y));

    for (const cloud of clouds) {
      cloud.x += cloud.drift * dt * 6;
    }

    updateHud();
  }

  function collectPickups(dt) {
    for (const pickup of pickups) {
      if (pickup.taken) continue;
      pickup.bob += dt * 4;
      const cy = pickup.y + Math.sin(pickup.bob) * 4;
      const dx = player.x + player.w / 2 - pickup.x;
      const dy = player.y + player.h / 2 - cy;
      if (dx * dx + dy * dy >= (pickup.r + 18) ** 2) continue;
      collectPickupItem(pickup);
    }
  }

  function collectPickupItem(pickup) {
    const meta = ITEM_TYPES[pickup.type];
    pickup.taken = true;

    if (pickup.type === 'plant') {
      const hpMax = getDifficultyCfg().hpMax;
      const healMul = getDifficultyCfg().skillBonus?.plantHealMul ?? 1;
      state.hp = Math.min(hpMax, state.hp + (meta.heal || 25) * healMul);
      state.hunger = Math.min(100, state.hunger + (meta.hunger || 20) * healMul);
      state.plantsEaten += 1;
      showMessage('Plant gegeten — HP & honger hersteld');
    } else if (pickup.type === 'bow') {
      state.hasBow = true;
      showMessage('Boog opgepakt!');
    } else if (pickup.type === 'axe') {
      state.hasAxe = true;
      showMessage('Bijl opgepakt!');
    } else if (pickup.type === 'bomb') {
      state.bombs += 1;
      showMessage('Bom opgepakt!');
    } else if (pickup.type === 'coin') {
      showMessage('Relikvie gevonden!');
    }

    state.score += meta?.score || 10;
    updateHud();
    updatePanelStats();
  }

  function playerInDoor(door) {
    const px = player.x + player.w * 0.5;
    const feetY = player.y + player.h;
    return (
      px >= door.x + 6
      && px <= door.x + door.w - 6
      && feetY >= door.y + door.h * 0.35
      && feetY <= door.y + door.h + 10
    );
  }

  function updateDoors(dt) {
    doorCooldown = Math.max(0, doorCooldown - dt);

    for (const door of doors) {
      door.pulse += dt * 3.5;
    }

    if (doorCooldown > 0) return;

    for (const door of doors) {
      if (!playerInDoor(door)) continue;

      if (door.kind === 'finish') {
        state.score += 500;
        awardSkillPoints(5);
        doorCooldown = 2;
        showMessage('Wereld voltooid!');
        updateHud();
        updatePanelStats();
        break;
      }

      if (!door.targetLevel) break;
      goToLevel(door.targetLevel, door.spawnSide);
      break;
    }
  }

  function getHungerEffects() {
    const weak = Math.max(0, 1 - state.hunger / 100);
    return {
      speedMul: 1 - weak * 0.45,
      jumpMul: 1 - weak * 0.4,
      attackCooldownMul: 1 + weak * 0.65,
      isWeak: state.hunger < 30,
      isExhausted: state.hunger <= 0
    };
  }

  function updateHunger(dt) {
    const hungerMul = getDifficultyCfg().skillBonus?.hungerDrainMul ?? 1;
    state.hunger = Math.max(0, state.hunger - dt * 0.85 * hungerMul);
    const hpMax = getDifficultyCfg().hpMax;
    if (state.hp > hpMax) state.hp = hpMax;
  }

  function entityCenter(e) {
    return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  }

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function damagePlayer(amount) {
    if (playerInvincible > 0 || isPlayerAtHome()) return;
    const reduction = getDifficultyCfg().skillBonus?.damageReduction || 0;
    const dealt = Math.max(1, Math.round(amount * (1 - reduction)));
    state.hp = Math.max(0, state.hp - dealt);
    playerInvincible = 1.1;
    if (state.hp <= 0) handlePlayerDeath();
    else showMessage(`-${dealt} HP!`);
    updateHud();
    updatePanelStats();
  }

  function handlePlayerDeath() {
    const hpMax = getDifficultyCfg().hpMax;
    state.hp = hpMax;
    state.hunger = Math.max(55, state.hunger);
    state.score = Math.max(0, state.score - 40);
    playerInvincible = 2.5;
    spawnPlayer('start');
    showMessage('Terug thuis — even veilig!');
    updateHud();
    updatePanelStats();
  }

  function damageMonster(m, amount) {
    m.hp -= amount;
    m.hurtTimer = 0.2;
    if (m.hp <= 0) killMonster(m);
  }

  function killMonster(m) {
    const def = MONSTER_DEFS[m.type];
    state.score += def?.score || 50;
    state.kills += 1;
    const idx = monsters.indexOf(m);
    if (idx >= 0) monsters.splice(idx, 1);
    showMessage(`${def?.label || 'Monster'} verslagen!`);
    awardSkillPoints(1);
    updateHud();
    updatePanelStats();
  }

  function spawnExplosion(x, y, damage, radius) {
    explosions.push({ x, y, r: 8, maxR: radius, life: 0.35, damage, hit: false });
  }

  function getMeleeHitbox(weaponId) {
    const wpn = WEAPON_DEFS[weaponId];
    const pad = 6;
    const range = wpn.range;
    if (player.facing > 0) {
      return {
        x: player.x + player.w - pad,
        y: player.y + 4,
        w: range,
        h: player.h - 8
      };
    }
    return {
      x: player.x - range + pad,
      y: player.y + 4,
      w: range,
      h: player.h - 8
    };
  }

  function performMeleeAttack(weaponId) {
    const wpn = WEAPON_DEFS[weaponId];
    const hitbox = getMeleeHitbox(weaponId);
    const damageMul = getDifficultyCfg().skillBonus?.meleeDamageMul ?? 1;
    meleeSwing = { weapon: weaponId, life: 0.18, hitbox };
    for (const m of [...monsters]) {
      if (aabbOverlap(hitbox, m)) damageMonster(m, wpn.damage * damageMul);
    }
  }

  function performRangedAttack(weaponId) {
    const wpn = WEAPON_DEFS[weaponId];
    if (weaponId === 'bomb') {
      if (state.bombs <= 0) {
        showMessage('Geen bommen meer!');
        return;
      }
      state.bombs -= 1;
      if (state.weapon === 'bomb' && state.bombs <= 0) {
        const avail = getAvailableWeapons();
        state.weapon = avail[0] || 'sword';
      }
      updatePanelStats();
    }
    const bw = weaponId === 'bomb' ? 14 : wpn.w;
    const bh = weaponId === 'bomb' ? 14 : wpn.h;
    projectiles.push({
      kind: weaponId,
      x: player.facing > 0 ? player.x + player.w + 2 : player.x - bw - 2,
      y: player.y + player.h * 0.38,
      w: bw,
      h: bh,
      vx: player.facing * wpn.speed,
      vy: weaponId === 'bomb' ? -180 : 0,
      life: weaponId === 'bomb' ? 2 : 1.5,
      damage: wpn.damage,
      radius: wpn.radius || 0
    });
  }

  function playerAttack() {
    const weaponId = state.weapon;
    if (weaponId === 'bomb' && state.bombs <= 0) {
      showMessage('Geen bommen!');
      return;
    }
    if (weaponId === 'bow' && !state.hasBow) {
      state.weapon = 'sword';
      performMeleeAttack('sword');
      return;
    }
    if (weaponId === 'axe' && !state.hasAxe) {
      state.weapon = 'sword';
      performMeleeAttack('sword');
      return;
    }
    const wpn = WEAPON_DEFS[weaponId];
    if (wpn.type === 'melee') performMeleeAttack(weaponId);
    else performRangedAttack(weaponId);
  }

  function updateCombat(dt) {
    attackCooldown = Math.max(0, attackCooldown - dt);

    if (input.attackPressed && attackCooldown <= 0) {
      const wpn = WEAPON_DEFS[state.weapon] || WEAPON_DEFS.sword;
      playerAttack();
      attackCooldown = wpn.cooldown * getHungerEffects().attackCooldownMul;
      input.attackPressed = false;
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'bomb') p.vy += GameConfig.world.gravity * 0.55 * dt;
      p.life -= dt;

      let hit = false;
      for (const m of monsters) {
        if (!aabbOverlap(p, m)) continue;
        if (p.kind === 'bomb') {
          spawnExplosion(p.x + p.w / 2, p.y + p.h / 2, p.damage, p.radius);
          hit = true;
          break;
        }
        let dmg = p.damage;
        if (p.kind === 'bow') dmg *= getDifficultyCfg().skillBonus?.bowDamageMul ?? 1;
        damageMonster(m, dmg);
        hit = true;
        break;
      }

      if (!hit && p.kind === 'bomb') {
        for (const plat of platforms) {
          if (aabbOverlap(p, plat)) {
            spawnExplosion(p.x + p.w / 2, p.y + p.h / 2, p.damage, p.radius);
            hit = true;
            break;
          }
        }
        const surfaceY = groundSurfaceYAt(p.x, p.w);
        if (!hit && p.y + p.h >= surfaceY) {
          spawnExplosion(p.x + p.w / 2, p.y + p.h / 2, p.damage, p.radius);
          hit = true;
        }
      }

      if (hit || p.life <= 0 || p.x < -60 || p.x > levelWidth + 60 || p.y > camera.y + h + 200) {
        projectiles.splice(i, 1);
      }
    }
  }

  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const ex = explosions[i];
      ex.life -= dt;
      ex.r += dt * ex.maxR * 4;
      if (!ex.hit) {
        for (const m of [...monsters]) {
          const c = entityCenter(m);
          if (distSq(ex.x, ex.y, c.x, c.y) <= (ex.r + 20) ** 2) {
            damageMonster(m, ex.damage);
          }
        }
        const pc = entityCenter(player);
        if (distSq(ex.x, ex.y, pc.x, pc.y) <= (ex.r + 16) ** 2) {
          damagePlayer(Math.round(ex.damage * 0.35));
        }
        ex.hit = true;
      }
      if (ex.life <= 0) explosions.splice(i, 1);
    }
  }

  function updateMonsters(dt) {
    const pc = entityCenter(player);
    const playerHome = isPlayerAtHome();

    for (const m of monsters) {
      const def = MONSTER_DEFS[m.type];
      m.attackCd = Math.max(0, m.attackCd - dt);
      m.hurtTimer = Math.max(0, m.hurtTimer - dt);
      m.bob += dt * 5;

      const mc = entityCenter(m);
      const dist = Math.sqrt(distSq(pc.x, pc.y, mc.x, mc.y));
      const monsterPastHome = m.x + m.w > spawnSafeZoneEnd + 20;
      const shouldChase = !playerHome && monsterPastHome && dist < def.chase;

      if (def.flying) {
        m.baseY += Math.sin(m.bob) * 0.4;
        if (shouldChase) {
          m.x += Math.sign(pc.x - mc.x) * def.speed * dt;
          m.y += (pc.y - m.y) * dt * 2.2;
          m.facing = pc.x >= mc.x ? 1 : -1;
        } else {
          if (m.x < spawnSafeZoneEnd) m.patrolDir = 1;
          m.x += m.patrolDir * def.speed * 0.45 * dt;
          m.y = m.baseY + Math.sin(m.bob) * 12;
          if (m.x < spawnSafeZoneEnd + 40) m.x = spawnSafeZoneEnd + 40;
          if (m.x < 40 || m.x > levelWidth - 40) m.patrolDir *= -1;
        }
      } else {
        if (shouldChase) {
          m.vx = Math.sign(pc.x - mc.x) * def.speed;
          m.facing = m.vx >= 0 ? 1 : -1;
        } else {
          if (m.x < spawnSafeZoneEnd) m.patrolDir = 1;
          m.vx = m.patrolDir * def.speed * 0.5;
          if (m.x < spawnSafeZoneEnd + 20) {
            m.x = spawnSafeZoneEnd + 20;
            m.vx = Math.abs(m.vx);
          }
          if (m.x < 30 || m.x > levelWidth - 30) m.patrolDir *= -1;
        }
        m.x += m.vx * dt;
        m.vy += GameConfig.world.gravity * dt;
        m.y += m.vy * dt;
        m.grounded = false;
        for (const plat of platforms) {
          if (aabbOverlap(m, plat)) resolvePlatformCollision(m, plat);
        }
        resolveGroundCollision(m);
      }

      if (aabbOverlap(player, m) && m.attackCd <= 0 && !playerHome) {
        damagePlayer(def.damage);
        m.attackCd = 1.15;
      }
    }
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveGroundCollision(entity) {
    const surfaceY = groundSurfaceYAt(entity.x, entity.w);
    const feetY = entity.y + entity.h;

    if (entity.grounded && feetY < surfaceY - 24) return;
    if (entity.vy < 0 && feetY < surfaceY - 10) return;

    const snapRange = entity.vy > 0 ? 28 : 16;
    if (feetY >= surfaceY - 12 && feetY <= surfaceY + snapRange) {
      entity.y = surfaceY - entity.h;
      entity.vy = 0;
      entity.grounded = true;
    }
  }

  function resolvePlatformCollision(entity, plat) {
    const overlapX = Math.min(entity.x + entity.w - plat.x, plat.x + plat.w - entity.x);
    const overlapY = Math.min(entity.y + entity.h - plat.y, plat.y + plat.h - entity.y);

    if (overlapX < overlapY) {
      entity.x += entity.x < plat.x ? -overlapX : overlapX;
      entity.vx = 0;
      return;
    }

    const landingOnTop = entity.vy >= 0 && entity.y + entity.h > plat.y;
    entity.y += entity.y < plat.y ? -overlapY : overlapY;
    entity.vy = 0;
    if (landingOnTop && Math.abs(entity.y + entity.h - plat.y) < 8) {
      entity.grounded = true;
    }
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    drawSky();
    drawParallaxLayer(parallax().clouds, drawCloudLayer);
    drawParallaxLayer(parallax().background, drawBackgroundLayer);
    drawParallaxLayer(parallax().ground, drawGroundLayer);

    drawForegroundVignette();
  }

  function drawParallaxLayer(factor, drawFn) {
    ctx.save();
    ctx.translate(-camera.x * factor, -camera.y * factor);
    drawFn();
    ctx.restore();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    if (levelTheme === 'cave') {
      sky.addColorStop(0, '#0f1520');
      sky.addColorStop(0.45, '#0a0e16');
      sky.addColorStop(1, '#050810');
    } else if (levelTheme === 'peak') {
      sky.addColorStop(0, '#2a4a7a');
      sky.addColorStop(0.42, '#1a3050');
      sky.addColorStop(0.72, '#101828');
      sky.addColorStop(1, '#060a12');
    } else {
      sky.addColorStop(0, '#0a1628');
      sky.addColorStop(0.42, '#061018');
      sky.addColorStop(0.72, '#030810');
      sky.addColorStop(1, '#020508');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }

  /** Laag 1 — wolken (langzaamste parallax) */
  function drawCloudLayer() {
    for (const cloud of clouds) {
      drawCloud(cloud.x, cloud.y, cloud);
    }
  }

  function drawCloud(x, y, cloud) {
    ctx.save();
    ctx.globalAlpha = cloud.alpha;
    ctx.fillStyle = 'rgba(240, 248, 255, 0.92)';

    const puff = (px, py, rx, ry) => {
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    puff(x + cloud.w * 0.22, y + cloud.h * 0.55, cloud.w * 0.22, cloud.h * 0.45);
    puff(x + cloud.w * 0.48, y + cloud.h * 0.42, cloud.w * 0.28, cloud.h * 0.52);
    puff(x + cloud.w * 0.72, y + cloud.h * 0.58, cloud.w * 0.2, cloud.h * 0.4);
    puff(x + cloud.w * 0.5, y + cloud.h * 0.62, cloud.w * 0.36, cloud.h * 0.35);

    ctx.restore();
  }

  /** Laag 2 — achtergrond met heuvels en boompjes */
  function drawBackgroundLayer() {
    drawHills();

    for (const tree of trees) {
      drawTree(tree);
    }
  }

  function drawHills() {
    const step = 24;
    const worldW = levelWidth;

    const drawHillBand = (band, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-80, h);
      ctx.lineTo(-80, backgroundHillSurfaceY(0, band));
      for (let x = -80; x <= worldW + 80; x += step) {
        ctx.lineTo(x, backgroundHillSurfaceY(x, band));
      }
      ctx.lineTo(worldW + 80, h);
      ctx.closePath();
      ctx.fill();
    };

    if (levelTheme === 'cave') {
      drawHillBand(0, 'rgba(8, 18, 28, 0.65)');
      drawHillBand(1, 'rgba(14, 28, 38, 0.82)');
    } else if (levelTheme === 'peak') {
      drawHillBand(0, 'rgba(18, 38, 58, 0.5)');
      drawHillBand(1, 'rgba(22, 48, 62, 0.72)');
    } else {
      drawHillBand(0, 'rgba(12, 38, 32, 0.5)');
      drawHillBand(1, 'rgba(18, 52, 42, 0.72)');
    }
  }

  function drawTree(tree) {
    const scale = tree.scale || 1;
    const trunkW = 8 * scale;
    const baseX = tree.x;
    const band = tree.band ?? 1;
    const baseY = backgroundHillSurfaceY(baseX, band);
    const trunkH = tree.h * scale;
    const crownR = tree.crown * scale;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 * scale})`;
    ctx.beginPath();
    ctx.ellipse(baseX + tree.lean * 0.5, baseY + 3, crownR * 0.55, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(28, 62, 48, ${tree.shade + 0.35})`;
    ctx.fillRect(baseX - trunkW / 2 + tree.lean, baseY - trunkH, trunkW, trunkH);

    ctx.fillStyle = `rgba(12, 90, 62, ${tree.shade + 0.45})`;
    ctx.beginPath();
    ctx.arc(baseX + tree.lean, baseY - trunkH - crownR * 0.35, crownR + 6 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(18, 120, 82, ${tree.shade + 0.5})`;
    ctx.beginPath();
    ctx.arc(baseX - crownR * 0.32 + tree.lean, baseY - trunkH - crownR * 0.5, crownR * 0.72, 0, Math.PI * 2);
    ctx.arc(baseX + crownR * 0.3 + tree.lean, baseY - trunkH - crownR * 0.45, crownR * 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Laag 3 — heuvellige grond en balkjes (volle camerasnelheid) */
  function drawGroundLayer() {
    drawHillyGround();
    for (const p of platforms) drawPlatform(p);
    for (const door of doors) drawDoor(door);
    for (const pickup of pickups) if (!pickup.taken) drawPickup(pickup);
    for (const m of monsters) drawMonster(m);
    for (const p of projectiles) drawProjectile(p);
    for (const ex of explosions) drawExplosion(ex);
    if (meleeSwing) drawMeleeSwing(meleeSwing);
    drawPlayer(player);
  }

  function drawHillyGround() {
    const step = 10;
    const worldW = levelWidth;

    ctx.beginPath();
    ctx.moveTo(-20, h + 20);
    ctx.lineTo(-20, groundSurfaceY(0));
    for (let x = 0; x <= worldW + 20; x += step) {
      ctx.lineTo(x, groundSurfaceY(x));
    }
    ctx.lineTo(worldW + 20, h + 20);
    ctx.closePath();

    const earthGrad = ctx.createLinearGradient(0, groundY - 80, 0, h);
    if (levelTheme === 'cave') {
      earthGrad.addColorStop(0, '#3d4a52');
      earthGrad.addColorStop(0.25, '#2a343a');
      earthGrad.addColorStop(0.6, '#1a2228');
      earthGrad.addColorStop(1, '#0e1418');
    } else if (levelTheme === 'peak') {
      earthGrad.addColorStop(0, '#4a5568');
      earthGrad.addColorStop(0.25, '#374151');
      earthGrad.addColorStop(0.6, '#1f2937');
      earthGrad.addColorStop(1, '#111827');
    } else {
      earthGrad.addColorStop(0, '#2d5a42');
      earthGrad.addColorStop(0.25, '#1f4333');
      earthGrad.addColorStop(0.6, '#172e24');
      earthGrad.addColorStop(1, '#0f1f18');
    }
    ctx.fillStyle = earthGrad;
    ctx.fill();

    const grassStroke = levelTheme === 'cave'
      ? 'rgba(148, 163, 184, 0.35)'
      : levelTheme === 'peak'
        ? 'rgba(186, 230, 253, 0.4)'
        : 'rgba(74, 222, 128, 0.55)';
    ctx.strokeStyle = grassStroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, groundSurfaceY(0));
    for (let x = 0; x <= worldW + 20; x += step) {
      ctx.lineTo(x, groundSurfaceY(x));
    }
    ctx.stroke();

    ctx.strokeStyle = levelTheme === 'meadow' ? 'rgba(134, 239, 172, 0.35)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-20, groundSurfaceY(0) - 2);
    for (let x = 0; x <= worldW + 20; x += step) {
      ctx.lineTo(x, groundSurfaceY(x) - 2);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= worldW; x += 64) {
      const top = groundSurfaceY(x);
      ctx.beginPath();
      ctx.moveTo(x, top + 8);
      ctx.lineTo(x + 18, h);
      ctx.stroke();
    }
  }

  function drawDoor(door) {
    const { x, y, w, h: doorH } = door;
    const glow = 0.35 + Math.sin(door.pulse) * 0.18;

    let frameColor = '#14532d';
    let glowColor = 'rgba(74, 222, 128,';
    let label = '';

    if (door.kind === 'finish') {
      frameColor = '#92400e';
      glowColor = 'rgba(251, 191, 36,';
      label = 'EIND';
    } else if (door.kind === 'back') {
      frameColor = '#1e3a5f';
      glowColor = 'rgba(96, 165, 250,';
      label = `← Lvl ${door.targetLevel}`;
    } else {
      frameColor = '#14532d';
      glowColor = 'rgba(74, 222, 128,';
      label = `Lvl ${door.targetLevel} →`;
    }

    ctx.fillStyle = `${glowColor}${glow})`;
    ctx.fillRect(x - 6, y - 10, w + 12, doorH + 16);

    ctx.fillStyle = frameColor;
    ctx.fillRect(x - 4, y - 6, w + 8, doorH + 8);
    ctx.fillRect(x, y, w, doorH);

    const openingGrad = ctx.createLinearGradient(x, y, x + w, y + doorH);
    openingGrad.addColorStop(0, 'rgba(8, 12, 20, 0.95)');
    openingGrad.addColorStop(1, 'rgba(20, 30, 48, 0.85)');
    ctx.fillStyle = openingGrad;
    ctx.fillRect(x + 6, y + 8, w - 12, doorH - 14);

    ctx.fillStyle = `${glowColor}${0.55 + glow * 0.4})`;
    ctx.fillRect(x + w * 0.5 - 3, y + doorH * 0.45, 6, 6);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x + w * 0.5, y - 10);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, doorH - 1);
  }

  function drawPlatformShadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 3, w * 0.42, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlatform(p) {
    switch (p.variant) {
      case 'wood': drawWoodPlatform(p); break;
      case 'crate': drawCratePlatform(p); break;
      case 'stone': drawStonePlatform(p); break;
      case 'stump': drawStumpPlatform(p); break;
      case 'mushroom': drawMushroomPlatform(p); break;
      case 'tomb': drawTombPlatform(p); break;
      case 'beam': drawBeamPlatform(p); break;
      default: drawGrassPlatform(p); break;
    }
  }

  function drawGrassPlatform(p) {
    const { x, y, w, h } = p;
    drawPlatformShadow(x, y, w, h);

    const dirt = ctx.createLinearGradient(x, y + 4, x, y + h);
    dirt.addColorStop(0, '#5c4033');
    dirt.addColorStop(1, '#3d2b1f');
    ctx.fillStyle = dirt;
    ctx.fillRect(x, y + 6, w, h - 6);

    const grass = ctx.createLinearGradient(x, y, x, y + 10);
    grass.addColorStop(0, '#86efac');
    grass.addColorStop(0.5, '#4ade80');
    grass.addColorStop(1, '#22c55e');
    ctx.fillStyle = grass;
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = 'rgba(21, 128, 61, 0.5)';
    ctx.fillRect(x, y + 7, w, 3);

    ctx.strokeStyle = 'rgba(134, 239, 172, 0.7)';
    ctx.lineWidth = 1.5;
    for (let gx = x + 6; gx < x + w - 4; gx += 9) {
      const gh = 4 + (p.seed + gx) % 5;
      ctx.beginPath();
      ctx.moveTo(gx, y + 1);
      ctx.lineTo(gx + 2, y - gh);
      ctx.stroke();
    }
  }

  function drawWoodPlatform(p) {
    const { x, y, w, h } = p;
    drawPlatformShadow(x, y, w, h);

    const plankH = Math.max(5, Math.floor(h / 3));
    for (let i = 0; i < 3; i++) {
      const py = y + i * plankH;
      const grad = ctx.createLinearGradient(x, py, x, py + plankH);
      grad.addColorStop(0, '#a16207');
      grad.addColorStop(0.5, '#92400e');
      grad.addColorStop(1, '#78350f');
      ctx.fillStyle = grad;
      ctx.fillRect(x, py, w, plankH - 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.strokeRect(x + 0.5, py + 0.5, w - 1, plankH - 2);
      ctx.strokeStyle = 'rgba(252, 211, 77, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x + 4, py + plankH * 0.4);
      ctx.lineTo(x + w - 4, py + plankH * 0.4);
      ctx.stroke();
    }
  }

  function drawCratePlatform(p) {
    const { x, y, w, h } = p;
    drawPlatformShadow(x, y, w, h);
    const count = Math.max(1, Math.floor(w / 44));
    const boxW = w / count;

    for (let i = 0; i < count; i++) {
      const bx = x + i * boxW + 2;
      const bh = h - (i % 2) * 6;
      const by = y + h - bh;
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, '#b45309');
      grad.addColorStop(1, '#78350f');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, boxW - 4, bh);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 5, bh - 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(bx, by + bh * 0.5);
      ctx.lineTo(bx + boxW - 4, by + bh * 0.5);
      ctx.moveTo(bx + (boxW - 4) * 0.5, by);
      ctx.lineTo(bx + (boxW - 4) * 0.5, by + bh);
      ctx.stroke();
    }
  }

  function drawStonePlatform(p) {
    const { x, y, w, h } = p;
    drawPlatformShadow(x, y, w, h);

    const blocks = Math.max(2, Math.floor(w / 36));
    const blockW = w / blocks;
    for (let i = 0; i < blocks; i++) {
      const bx = x + i * blockW;
      const offset = (p.seed + i) % 3;
      const grad = ctx.createLinearGradient(bx, y + offset, bx, y + h);
      grad.addColorStop(0, levelTheme === 'cave' ? '#64748b' : '#78716c');
      grad.addColorStop(1, levelTheme === 'cave' ? '#334155' : '#57534e');
      ctx.fillStyle = grad;
      ctx.fillRect(bx + 1, y + offset, blockW - 2, h - offset);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.strokeRect(bx + 1.5, y + offset + 0.5, blockW - 3, h - offset - 1);
    }

    ctx.fillStyle = 'rgba(74, 222, 128, 0.35)';
    for (let mx = x + 8; mx < x + w - 6; mx += 14 + (p.seed % 5)) {
      ctx.beginPath();
      ctx.ellipse(mx, y + 3, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStumpPlatform(p) {
    const { x, y, w, h } = p;
    const cx = x + w / 2;
    const topRy = 7;
    drawPlatformShadow(x, y, w, h);

    ctx.fillStyle = '#5c3d24';
    ctx.fillRect(cx - w * 0.2, y + topRy, w * 0.4, h - topRy);

    const topGrad = ctx.createRadialGradient(cx, y + topRy, 2, cx, y + topRy, w * 0.5);
    topGrad.addColorStop(0, '#d4a574');
    topGrad.addColorStop(0.6, '#a16207');
    topGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(cx, y + topRy, w * 0.48, topRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(62, 39, 20, 0.6)';
    ctx.lineWidth = 1;
    for (let r = 4; r < w * 0.4; r += 5) {
      ctx.beginPath();
      ctx.ellipse(cx, y + topRy, r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawMushroomPlatform(p) {
    const { x, y, w, h } = p;
    const cx = x + w / 2;
    const capRy = 11;
    drawPlatformShadow(x, y, w, h);

    ctx.fillStyle = '#d6d3d1';
    ctx.fillRect(cx - 4, y + capRy, 8, h - capRy);

    const capGrad = ctx.createRadialGradient(cx, y + capRy, 4, cx, y + capRy, w * 0.55);
    capGrad.addColorStop(0, '#c084fc');
    capGrad.addColorStop(0.55, '#7c3aed');
    capGrad.addColorStop(1, '#5b21b6');
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.ellipse(cx, y + capRy, w * 0.52, capRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx - w * 0.18, y + capRy - 4, 3.5, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.12, y + capRy - 6, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.28, y + capRy - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTombPlatform(p) {
    const { x, y, w, h } = p;
    drawPlatformShadow(x, y, w, h);

    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#9ca3af');
    grad.addColorStop(1, '#4b5563');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 4, y + 6, w - 8, h - 6);

    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 8, w * 0.38, Math.PI, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.lineWidth = 2;
    const tx = x + w / 2;
    ctx.beginPath();
    ctx.moveTo(tx, y + 12);
    ctx.lineTo(tx, y + h - 4);
    ctx.moveTo(tx - 8, y + 18);
    ctx.lineTo(tx + 8, y + 18);
    ctx.stroke();
  }

  function drawBeamPlatform(p) {
    const { x, y, w, h } = p;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + 3, y + h, w, 4);

    const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, '#6b7280');
    bodyGrad.addColorStop(0.35, '#4b5563');
    bodyGrad.addColorStop(1, '#374151');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(x + 1, y + 1, w - 2, 3);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    for (let lx = x + 18; lx < x + w - 10; lx += 22) {
      ctx.beginPath();
      ctx.moveTo(lx, y + 4);
      ctx.lineTo(lx, y + h - 2);
      ctx.stroke();
    }

    for (let ly = y + 6; ly < y + h - 2; ly += 5) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + 4, ly);
      ctx.lineTo(x + w - 4, ly);
      ctx.stroke();
    }

    const bracketW = 6;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x, y, bracketW, h);
    ctx.fillRect(x + w - bracketW, y, bracketW, h);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.fillRect(x + 2, y + h * 0.35, 2, 2);
    ctx.fillRect(x + 2, y + h * 0.65, 2, 2);
    ctx.fillRect(x + w - 4, y + h * 0.35, 2, 2);
    ctx.fillRect(x + w - 4, y + h * 0.65, 2, 2);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawPickup(pickup) {
    if (pickup.type === 'plant') drawPlantPickup(pickup);
    else if (pickup.type === 'bow') drawWeaponPickup(pickup, '#a78bfa', '🏹');
    else if (pickup.type === 'axe') drawWeaponPickup(pickup, '#f87171', '🪓');
    else if (pickup.type === 'bomb') drawWeaponPickup(pickup, '#fbbf24', '💣');
    else drawCoinPickup(pickup);
  }

  function drawPlantPickup(pickup) {
    const y = pickup.y + Math.sin(pickup.bob) * 4;
    const x = pickup.x;
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(x - 6, y, 7, 5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(x + 6, y - 2, 7, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWeaponPickup(pickup, color, emoji) {
    const y = pickup.y + Math.sin(pickup.bob) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(pickup.x, y + 10, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pickup.x, y, pickup.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, pickup.x, y);
  }

  function drawCoinPickup(pickup) {
    const y = pickup.y + Math.sin(pickup.bob) * 4;
    ctx.beginPath();
    ctx.fillStyle = '#f59e0b';
    ctx.arc(pickup.x, y, pickup.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawWoodPickup(pickup) {
    const y = pickup.y + Math.sin(pickup.bob) * 3;
    const w = 22;
    const h = 12;
    ctx.fillStyle = '#92400e';
    ctx.fillRect(pickup.x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pickup.x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(252, 211, 77, 0.5)';
    ctx.beginPath();
    ctx.moveTo(pickup.x - w / 2 + 3, y - 1);
    ctx.lineTo(pickup.x + w / 2 - 3, y - 1);
    ctx.stroke();
  }

  function drawRopePickup(pickup) {
    const y = pickup.y + Math.sin(pickup.bob) * 3;
    const x = pickup.x;
    ctx.strokeStyle = '#d6b48a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.bezierCurveTo(x - 6, y - 8, x + 6, y + 8, x + 12, y);
    ctx.stroke();
    ctx.fillStyle = '#e7cba9';
    ctx.beginPath();
    ctx.arc(x - 12, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 12, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCameraPickup(pickup) {
    const y = pickup.y + Math.sin(pickup.bob) * 3;
    const x = pickup.x;
    const bodyW = 26;
    const bodyH = 16;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(x - bodyW / 2 + 2, y - bodyH / 2 + 3, bodyW, bodyH);

    ctx.fillStyle = '#374151';
    ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x - bodyW / 2 + 2, y - bodyH / 2 + 2, bodyW - 4, bodyH - 4);

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(x - 4, y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - 4, y, 5.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(147, 197, 253, 0.35)';
    ctx.beginPath();
    ctx.arc(x - 5, y - 1, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4b5563';
    ctx.fillRect(x + 4, y - 9, 10, 7);
    ctx.strokeStyle = '#9ca3af';
    ctx.strokeRect(x + 4.5, y - 8.5, 9, 6);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(x + bodyW / 2 - 5, y - bodyH / 2 + 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function getPlayerBodyParts(p) {
    const headH = Math.round(p.h * 0.36);
    const bodyH = Math.round(p.h * 0.38);
    const legsH = p.h - headH - bodyH;
    const headW = Math.round(p.w * 0.78);
    const headX = p.x + (p.w - headW) / 2;

    return {
      head: { x: headX, y: p.y, w: headW, h: headH },
      body: { x: p.x, y: p.y + headH, w: p.w, h: bodyH },
      legs: { x: p.x, y: p.y + headH + bodyH, w: p.w, h: legsH }
    };
  }

  function drawPlayer(p) {
    if (playerInvincible > 0 && Math.floor(playerInvincible * 12) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    const parts = getPlayerBodyParts(p);
    const { head, body, legs } = parts;

    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.fillRect(p.x - 2, p.y + p.h - 5, p.w + 4, 7);

    const legGap = 3;
    const legW = (legs.w - legGap) / 2;
    drawCharacterPart(ctx, 'legs', legs.x, legs.y, legW, legs.h, 0.4);
    drawCharacterPart(ctx, 'legs', legs.x + legW + legGap, legs.y, legW, legs.h, 0.9);

    drawCharacterPart(ctx, 'body', body.x, body.y, body.w, body.h, 0.2);

    drawCharacterHead(ctx, head.x, head.y, head.w, head.h);

    ctx.fillStyle = '#001018';
    const eyeX = p.facing > 0 ? head.x + head.w - 7 : head.x + 2;
    ctx.fillRect(eyeX, head.y + 5, 5, 5);

    if (state.weapon === 'sword' || state.weapon === 'axe') {
      ctx.save();
      ctx.translate(p.x + (p.facing > 0 ? p.w + 2 : -2), p.y + p.h * 0.45);
      ctx.rotate(p.facing > 0 ? 0.5 : -0.5);
      ctx.fillStyle = state.weapon === 'axe' ? '#9ca3af' : '#e2e8f0';
      ctx.fillRect(0, -14, 4, 22);
      if (state.weapon === 'axe') {
        ctx.fillStyle = '#f87171';
        ctx.fillRect(-6, -16, 16, 8);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  function drawMonster(m) {
    const def = MONSTER_DEFS[m.type];
    const flash = m.hurtTimer > 0;
    ctx.save();
    if (flash) ctx.globalAlpha = 0.55;

    if (m.type === 'bat') {
      const y = m.y + Math.sin(m.bob) * 3;
      ctx.fillStyle = '#4c1d95';
      ctx.beginPath();
      ctx.ellipse(m.x + m.w / 2, y + m.h / 2, m.w / 2, m.h / 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7c3aed';
      const wing = Math.sin(m.bob * 3) * 8;
      ctx.beginPath();
      ctx.moveTo(m.x + m.w / 2, y + m.h / 2);
      ctx.lineTo(m.x - 4, y + wing);
      ctx.lineTo(m.x + m.w / 2, y + m.h / 2 + 4);
      ctx.lineTo(m.x + m.w + 4, y + wing);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(m.x + m.w / 2 - 2, y + m.h / 2 - 2, 4, 4);
    } else {
      ctx.fillStyle = '#14532d';
      ctx.fillRect(m.x, m.y + m.h - 8, m.w, 8);
      ctx.fillStyle = flash ? '#fca5a5' : '#3f6212';
      ctx.fillRect(m.x + 2, m.y + 8, m.w - 4, m.h - 14);
      ctx.fillStyle = '#a3e635';
      ctx.fillRect(m.x + 4, m.y, m.w - 8, 12);
      ctx.fillStyle = '#ef4444';
      const ex = m.facing > 0 ? m.x + m.w - 10 : m.x + 4;
      ctx.fillRect(ex, m.y + 4, 5, 5);
      ctx.fillRect(ex + 7, m.y + 4, 5, 5);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(m.x + m.w * 0.3, m.y + 14, m.w * 0.4, 4);
    }

    const barW = m.w;
    const hpPct = m.hp / m.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(m.x, m.y - 8, barW, 4);
    ctx.fillStyle = hpPct > 0.4 ? '#22c55e' : '#ef4444';
    ctx.fillRect(m.x, m.y - 8, barW * hpPct, 4);

    ctx.restore();
  }

  function drawProjectile(p) {
    if (p.kind === 'bomb') {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(p.x + p.w / 2 - 1, p.y - 4, 2, 5);
      return;
    }
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.moveTo(p.vx > 0 ? p.x + p.w : p.x, p.y + p.h / 2);
    ctx.lineTo(p.vx > 0 ? p.x + p.w + 8 : p.x - 8, p.y + p.h / 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a16207';
    ctx.stroke();
  }

  function drawExplosion(ex) {
    const alpha = Math.max(0, ex.life / 0.35);
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.r);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.4, '#f97316');
    grad.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMeleeSwing(swing) {
    const { hitbox, weapon } = swing;
    ctx.save();
    ctx.globalAlpha = 0.35 + swing.life * 2;
    ctx.fillStyle = weapon === 'axe' ? '#f87171' : '#93c5fd';
    ctx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
    ctx.restore();
  }

  function drawForegroundVignette() {
    const g = ctx.createLinearGradient(0, h - 80, 0, h);
    g.addColorStop(0, 'rgba(6,10,18,0)');
    g.addColorStop(1, 'rgba(6,10,18,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function updateHud() {
    const scoreEl = document.getElementById('hud-score');
    const levelEl = document.getElementById('hud-level');
    const hpEl = document.getElementById('hud-hp');
    const hungerEl = document.getElementById('hud-hunger');
    const weaponEl = document.getElementById('hud-weapon');
    if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
    if (levelEl) levelEl.textContent = `Lvl: ${state.level}`;
    if (hpEl) hpEl.textContent = `HP: ${Math.round(state.hp)}`;
    if (hungerEl) {
      if (state.hunger <= 0) hungerEl.textContent = 'Slap!';
      else if (state.hunger < 30) hungerEl.textContent = `Honger: ${Math.round(state.hunger)} (moe)`;
      else hungerEl.textContent = `Honger: ${Math.round(state.hunger)}`;
    }
    if (weaponEl) weaponEl.textContent = WEAPON_DEFS[state.weapon]?.label || 'Zwaard';
  }

  function updatePanelStats() {
    const hpMax = getDifficultyCfg().hpMax;
    const map = {
      'stat-score': state.score,
      'stat-level': state.level,
      'stat-hp': `${Math.round((state.hp / hpMax) * 100)}%`,
      'stat-hunger': `${Math.round(state.hunger)}%`,
      'stat-skill-points': state.skillPoints
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    if (typeof SkillTree !== 'undefined') SkillTree.refresh();
    updateWorldTab();
    updateItemsTab();
  }

  function updateItemsTab() {
    const map = {
      'inv-sword': '✓',
      'inv-bow': state.hasBow ? '✓' : '—',
      'inv-axe': state.hasAxe ? '✓' : '—',
      'inv-bomb': state.bombs,
      'inv-plants': state.plantsEaten
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  }

  function updateWorldTab() {
    const current = state.level;

    Object.entries(WORLD_LEVELS).forEach(([id, meta]) => {
      const lvl = Number(id);
      const descEl = document.getElementById(`world-lvl-${id}-desc`);
      const btnEl = document.getElementById(`world-lvl-${id}-btn`);
      if (!descEl || !btnEl) return;

      const unlocked = current >= lvl;

      if (current === lvl) {
        descEl.textContent = meta.unlockedDesc;
        btnEl.textContent = 'Actief';
        btnEl.className = 'btn success';
        btnEl.disabled = true;
      } else if (unlocked) {
        descEl.textContent = meta.unlockedDesc;
        btnEl.textContent = 'Vrijgespeeld';
        btnEl.className = 'btn alt';
        btnEl.disabled = true;
      } else {
        descEl.textContent = meta.desc;
        btnEl.textContent = 'Vergrendeld';
        btnEl.className = 'btn';
        btnEl.disabled = true;
      }
    });
  }

  function buildCameraShareImage(sourceCanvas) {
    const out = document.createElement('canvas');
    const maxW = 600;
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const imgW = maxW;
    const imgH = Math.round((srcH / srcW) * maxW);
    const headerH = 52;
    const footerH = 44;
    out.width = imgW;
    out.height = imgH + headerH + footerH;
    const c = out.getContext('2d');

    c.fillStyle = '#060a12';
    c.fillRect(0, 0, imgW, headerH);
    c.fillStyle = '#00e5ff';
    c.font = 'bold 22px Plus Jakarta Sans, Inter, sans-serif';
    c.textAlign = 'center';
    c.fillText('Side Quest — Avonturen foto', imgW / 2, 34);

    c.drawImage(sourceCanvas, 0, headerH, imgW, imgH);

    c.strokeStyle = '#00e5ff';
    c.lineWidth = 3;
    c.strokeRect(1.5, headerH + 1.5, imgW - 3, imgH - 3);

    c.fillStyle = '#0d1b2a';
    c.fillRect(0, headerH + imgH, imgW, footerH);
    c.fillStyle = '#a78bfa';
    c.font = '600 16px Plus Jakarta Sans, Inter, sans-serif';
    c.fillText('www.d-game.nl', imgW / 2, headerH + imgH + 28);

    return out;
  }

  function canvasToShareFile(shareCanvas) {
    return new Promise((resolve) => {
      shareCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], 'd-game-foto.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  async function openCameraSharePrompt(sourceCanvas) {
    if (!sourceCanvas || sharePromptOpen) return;

    sharePromptOpen = true;
    paused = true;
    clearInput();

    const shareCanvas = buildCameraShareImage(sourceCanvas);
    pendingShareFile = await canvasToShareFile(shareCanvas);

    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-preview');
    if (preview) preview.src = shareCanvas.toDataURL('image/png');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeCameraSharePrompt() {
    sharePromptOpen = false;
    pendingShareFile = null;
    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-preview');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (preview) preview.removeAttribute('src');
    paused = false;
    lastTime = performance.now();
  }

  async function shareCameraMoment() {
    const shareText = 'Kijk wat ik vond tijdens mijn avontuur! Speel zelf op www.d-game.nl';

    if (pendingShareFile && navigator.share && navigator.canShare && navigator.canShare({ files: [pendingShareFile] })) {
      try {
        await navigator.share({
          title: 'Mijn D-Game avontuur!',
          text: shareText,
          files: [pendingShareFile]
        });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          alert('Delen mislukt of geannuleerd.');
        }
      }
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mijn D-Game avontuur!',
          text: shareText,
          url: 'https://www.d-game.nl'
        });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          alert('Delen mislukt of geannuleerd.');
        }
      }
    } else {
      alert('Helaas, afbeelding delen wordt niet ondersteund in deze browser.');
    }

    closeCameraSharePrompt();
  }

  function bindShareModal() {
    const modal = document.getElementById('share-modal');
    const btnYes = document.getElementById('btn-share-yes');
    const btnNo = document.getElementById('btn-share-no');

    btnYes?.addEventListener('click', () => {
      void shareCameraMoment();
    });
    btnNo?.addEventListener('click', closeCameraSharePrompt);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeCameraSharePrompt();
    });
  }

  let msgTimer = null;
  function showMessage(text) {
    const overlay = document.getElementById('msg-overlay');
    const msgText = document.getElementById('msg-text');
    if (!overlay || !msgText) return;
    msgText.textContent = text;
    overlay.classList.add('visible');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => overlay.classList.remove('visible'), 1200);
  }

  function bindControls() {
    const leftBtn = document.getElementById('btn-left');
    const rightBtn = document.getElementById('btn-right');
    const jumpBtn = document.getElementById('btn-jump');
    const attackBtn = document.getElementById('btn-shoot');
    const weaponBtn = document.getElementById('btn-weapon');

    const bindHold = (el, key) => {
      if (!el) return;
      const on = () => {
        input[key] = true;
        el.classList.add('pressed');
      };
      const off = () => {
        input[key] = false;
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        on();
      });
      const release = (e) => {
        try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        off();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', off);
    };

    bindHold(leftBtn, 'left');
    bindHold(rightBtn, 'right');

    if (jumpBtn) {
      let jumpTouchHandled = false;
      const onJumpDown = (e) => {
        if (e.type === 'touchstart') {
          jumpTouchHandled = true;
          setTimeout(() => { jumpTouchHandled = false; }, 400);
        } else if (e.type === 'pointerdown' && jumpTouchHandled) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        requestJump();
        input.jump = true;
        jumpBtn.classList.add('pressed');
      };
      const onJumpUp = () => {
        input.jump = false;
        jumpBtn.classList.remove('pressed');
      };
      jumpBtn.addEventListener('pointerdown', onJumpDown, { passive: false });
      jumpBtn.addEventListener('touchstart', onJumpDown, { passive: false });
      jumpBtn.addEventListener('pointerup', onJumpUp);
      jumpBtn.addEventListener('pointercancel', onJumpUp);
      jumpBtn.addEventListener('touchend', onJumpUp);
      jumpBtn.addEventListener('touchcancel', onJumpUp);
    }

    if (attackBtn) {
      attackBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { attackBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        input.attackPressed = true;
        attackBtn.classList.add('pressed');
      });
      const off = () => attackBtn.classList.remove('pressed');
      const release = (e) => {
        try { attackBtn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        off();
      };
      attackBtn.addEventListener('pointerup', release);
      attackBtn.addEventListener('pointercancel', release);
      attackBtn.addEventListener('lostpointercapture', off);
    }

    if (weaponBtn) {
      weaponBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.weaponCyclePressed = true;
        weaponBtn.classList.add('pressed');
      });
      const off = () => weaponBtn.classList.remove('pressed');
      weaponBtn.addEventListener('pointerup', off);
      weaponBtn.addEventListener('pointercancel', off);
      weaponBtn.addEventListener('lostpointercapture', off);
    }

    window.addEventListener('blur', clearInput);

    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible()) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (!input.jump) requestJump();
        input.jump = true;
      }
      if ((e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ') && !e.repeat) {
        e.preventDefault();
        input.attackPressed = true;
      }
      if (e.code === 'KeyQ' && !e.repeat) {
        input.weaponCyclePressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') input.jump = false;
    });
  }

  function init() {
    loadBodyColors();
    resize();
    bindControls();
    bindShareModal();
    updateHud();
    updatePanelStats();
    window.addEventListener('resize', resize);
  }

  return {
    init,
    start,
    pause,
    resume,
    onTabVisible,
    onTabHidden,
    exportState,
    importState,
    resetGame,
    stopGame,
    getBodyColors,
    setBodyColors,
    resetBodyColors,
    drawCharacterHead,
    drawCharacterPart,
    getPlayerBodyParts,
    setSessionMeta,
    getSessionMeta,
    getSkillState,
    upgradeSkill,
    awardSkillPoints
  };
})();
/* END-MERGE-BLOCK */
