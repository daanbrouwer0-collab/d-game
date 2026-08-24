/* MERGE-BLOCK: game-sideview.js — 2D side-view tower builder */
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

  const input = { left: false, right: false, jump: false, jumpPressed: false, shootPressed: false };

  const state = {
    score: 0,
    coins: 0,
    wood: 0,
    plank: 0,
    rope: 0,
    camera: 0,
    level: 1,
    hp: 100
  };

  const ITEM_TYPES = {
    coin: { label: 'Munt', score: 50, r: 12 },
    wood: { label: 'Hout', score: 20, r: 14 },
    rope: { label: 'Touw', score: 20, r: 13 },
    camera: { label: 'Fototoestel', score: 80, r: 15 }
  };

  const MAX_LEVEL = 3;

  const LEVEL_DEFS = {
    1: { width: 2400, theme: 'meadow', label: 'Weide' },
    2: { width: 2000, theme: 'cave', label: 'Grot' },
    3: { width: 2600, theme: 'peak', label: 'Top' }
  };

  const WORLD_LEVELS = {
    1: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Weide — bouw een toren met balken en touw' },
    2: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Grot — minder platformen, meer bouwen' },
    3: { desc: 'Nog niet vrijgespeeld', unlockedDesc: 'Top — bereik de einddeur met je toren' }
  };

  const camera = { x: 0, y: 0 };

  let player = createPlayer(120, 0);
  let platforms = [];
  let pickups = [];
  let trees = [];
  let clouds = [];
  let doors = [];
  let groundY = 0;
  let levelWidth = GameConfig.world.levelWidth;
  let levelTheme = 'meadow';
  let doorCooldown = 0;
  let bullets = [];
  let shootCooldown = 0;
  let sharePromptOpen = false;
  let pendingShareFile = null;

  /* ============================================================
   *  TOWER BUILDER — robuust node/beam model
   *  - nodes: de ENIGE dingen met een positie (Verlet punten)
   *  - beams: afstands-constraints tussen twee nodes
   *  Dit voorkomt de oude bug waarbij balken eigen coördinaten
   *  hadden die uit sync raakten en onzichtbaar werden.
   * ============================================================ */
  let nodes = [];   // { id, x, y, ox, oy, fixed }
  let beams = [];   // { id, a, b, rest, kind }  kind: 'beam' | 'walkway' | 'rope'
  /** Bouwwerk per level — blijft staan als je via de deur heen en weer gaat. */
  let levelBuilders = {};
  let idCounter = 1;
  let buildTool = 'beam';
  let buildDrag = null;
  let gameTime = 0;
  /** Bouw mode: aan = physics uit, constructie bevroren, speler kan niet lopen. */
  let buildModeActive = false;
  let lastBreakMsg = -10;
  /** Frames na bouw mode uit: geen breken / geen opruimen (Matter stabiliseert). */
  let physicsWarmup = 0;
  let jumpBufferTimer = 0;
  let coyoteTimer = 0;
  /** Loopplank waar de speler op staat. */
  let standingBeamId = null;
  let bodyColors = { ...GameConfig.player.bodyColors };
  let sessionMeta = {
    sessionName: '',
    characterName: 'Held',
    difficulty: 'normal'
  };

  const parallax = () => GameConfig.parallax;
  const defaultPlayerWeightKg = () => GameConfig.player.weight ?? 72;

  let physicsSettings = {
    stiffnessMul: 1,
    strengthMul: 1,
    qualityMul: 1,
    stressTint: true,
    playerWeightKg: defaultPlayerWeightKg(),
    beamMassMul: 1,
    walkwayMassMul: 1
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function mixColor(a, b, t) {
    const p = clamp(t, 0, 1);
    return {
      r: Math.round(a.r + (b.r - a.r) * p),
      g: Math.round(a.g + (b.g - a.g) * p),
      b: Math.round(a.b + (b.b - a.b) * p)
    };
  }

  function sanitizePhysicsSettings(src = {}) {
    return {
      stiffnessMul: clamp(Number(src.stiffnessMul) || 1, 0.7, 1.4),
      strengthMul: clamp(Number(src.strengthMul) || 1, 0.7, 1.5),
      qualityMul: clamp(Number(src.qualityMul) || 1, 0.7, 1.4),
      stressTint: src.stressTint !== false,
      playerWeightKg: clamp(
        Number(src.playerWeightKg) || defaultPlayerWeightKg(),
        25,
        160
      ),
      beamMassMul: clamp(Number(src.beamMassMul) || 1, 0.2, 2),
      walkwayMassMul: clamp(Number(src.walkwayMassMul) || 1, 0.2, 2)
    };
  }

  function getPlayerWeightKg() {
    return sanitizePhysicsSettings(physicsSettings).playerWeightKg;
  }

  function loadPhysicsSettings() {
    const settings = Storage.readSettings();
    const safe = sanitizePhysicsSettings(settings.physics || {});
    physicsSettings = { ...physicsSettings, ...safe };
  }

  function savePhysicsSettings() {
    Storage.writeSettings({
      ...Storage.readSettings(),
      physics: { ...physicsSettings }
    });
  }

  function getPhysicsSettings() {
    return { ...physicsSettings };
  }

  function setPhysicsSettings(patch = {}) {
    const massChanged = patch.playerWeightKg != null
      || patch.beamMassMul != null
      || patch.walkwayMassMul != null;
    physicsSettings = sanitizePhysicsSettings({ ...physicsSettings, ...patch });
    savePhysicsSettings();
    updatePanelStats();
    window.dispatchEvent(new CustomEvent('physicssettingschange'));
    if (useMatterPhysics() && nodes.length) {
      if (patch.stiffnessMul != null || patch.qualityMul != null) {
        BuilderMatter.syncConstraints(beams, buildCfg());
      }
      if (massChanged) BuilderMatter.updateNodeMasses(nodes, beams, beamMassKg, getStandingNodeExtraMass());
    }
  }

  const buildCfg = () => {
    const base = GameConfig.build;
    const user = sanitizePhysicsSettings(physicsSettings);
    const stiffMul = clamp(user.stiffnessMul || 1, 0.6, 1.7);
    const strengthMul = clamp(user.strengthMul || 1, 0.55, 1.9);
    const qualityMul = clamp(user.qualityMul || 1, 0.65, 1.8);
    const beamMul = user.beamMassMul || 1;
    const walkMul = user.walkwayMassMul || 1;
    // strengthMul < 1 => sneller breken, strengthMul > 1 => sterker.
    const scaleBreak = (v) => v * strengthMul;
    return {
      ...base,
      beamMassPerPx: (base.beamMassPerPx ?? 0.034) * beamMul,
      walkwayMassPerPx: (base.walkwayMassPerPx ?? 0.05) * walkMul,
      beamStiff: clamp(base.beamStiff * stiffMul, 0.45, 0.995),
      walkwayStiff: clamp(base.walkwayStiff * stiffMul, 0.5, 0.998),
      ropeStiff: clamp(base.ropeStiff * (0.9 + (stiffMul - 1) * 0.35), 0.25, 0.9),
      breakStrain: {
        beam: scaleBreak(base.breakStrain.beam),
        walkway: scaleBreak(base.breakStrain.walkway),
        rope: scaleBreak(base.breakStrain.rope)
      },
      breakTime: clamp(base.breakTime * (0.75 + (strengthMul - 1) * 0.55), 0.12, 0.9),
      substeps: Math.max(1, Math.round(base.substeps * qualityMul)),
      matterQualityMul: qualityMul,
      stressTintEnabled: user.stressTint !== false
    };
  };

  function getDifficultyCfg() {
    const preset = GameConfig.difficulty[sessionMeta.difficulty] || GameConfig.difficulty.normal;
    return {
      ...GameConfig.player,
      speed: preset.speed,
      jumpForce: preset.jumpForce,
      hpMax: preset.hpMax
    };
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
      legs: hex(colors?.legs, defaults.legs)
    };
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
    bodyColors = { ...GameConfig.player.bodyColors };
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

  function createBeamPlatform(anchorX, spanWidth, surfaceY) {
    const beamH = GameConfig.beam.height;
    return {
      type: 'platform',
      x: anchorX,
      y: surfaceY - beamH,
      w: spanWidth,
      h: beamH
    };
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function screenToWorld(sx, sy) {
    return { x: sx + camera.x, y: sy + camera.y };
  }

  /* ---------- Node / Beam basisoperaties ---------- */

  function nextId() {
    return idCounter++;
  }

  function nodeById(id) {
    if (id == null) return null;
    for (const n of nodes) if (n.id === id) return n;
    return null;
  }

  function useMatterPhysics() {
    return GameConfig.build.useMatterPhysics !== false
      && typeof BuilderMatter !== 'undefined'
      && BuilderMatter.available();
  }

  function addNode(x, y, fixed = false) {
    const n = { id: nextId(), x, y, ox: x, oy: y, fixed: !!fixed };
    nodes.push(n);
    if (useMatterPhysics()) BuilderMatter.addNode(n, buildCfg(), buildModeActive);
    return n;
  }

  function findNodeNear(x, y, radius) {
    const r = radius ?? buildCfg().snapRadius;
    let best = null;
    let bestD = r;
    for (const n of nodes) {
      const d = dist(x, y, n.x, n.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function nodeDegree(id) {
    let c = 0;
    for (const b of beams) if (b.a === id || b.b === id) c++;
    return c;
  }

  function beamBetween(aId, bId) {
    return beams.find(
      (b) => (b.a === aId && b.b === bId) || (b.a === bId && b.b === aId)
    ) || null;
  }

  function addBeam(aId, bId, kind) {
    if (aId === bId) return null;
    if (beamBetween(aId, bId)) return null;
    const a = nodeById(aId);
    const b = nodeById(bId);
    if (!a || !b) return null;
    const restLen = dist(a.x, a.y, b.x, b.y);
    const inv = restLen > 0.0001 ? 1 / restLen : 0;
    const beam = {
      id: nextId(),
      a: aId,
      b: bId,
      rest: restLen,
      restNx: (b.x - a.x) * inv,
      restNy: (b.y - a.y) * inv,
      kind,
      placedAt: gameTime
    };
    beams.push(beam);
    if (useMatterPhysics()) BuilderMatter.addBeam(beam, buildCfg());
    return beam;
  }

  function projectOntoSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return { t: 0, x: x1, y: y1, dist: dist(px, py, x1, y1) };
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const x = x1 + t * dx;
    const y = y1 + t * dy;
    return { t, x, y, dist: dist(px, py, x, y) };
  }

  function beamThickness(b) {
    const cfg = buildCfg();
    if (b.kind === 'walkway') return cfg.walkwayThickness;
    if (b.kind === 'rope') return cfg.ropeWidth;
    return cfg.beamThickness;
  }

  function beamMaxLength(kind) {
    const cfg = buildCfg();
    if (kind === 'walkway') return cfg.walkwayMaxLength;
    if (kind === 'rope') return cfg.ropeMaxLength;
    return cfg.beamMaxLength;
  }

  /* ---------- Bouw mode / bevriezen ---------- */

  function toggleBuildMode() {
    buildModeActive = !buildModeActive;
    if (buildModeActive) {
      player.vx = 0;
      jumpBufferTimer = 0;
      showMessage('Bouw mode aan — physics uit');
    } else {
      buildDrag = null;
      physicsWarmup = 55;
      showMessage('Bouw mode uit — physics actief');
    }
    if (useMatterPhysics()) {
      BuilderMatter.rebuild(nodes, beams, buildCfg(), buildModeActive);
    }
    syncBuildModeUi();
  }

  function syncBuildModeUi() {
    const btn = document.getElementById('btn-build-mode');
    const on = buildModeActive;
    if (btn) {
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Bouw mode AAN' : 'Bouw mode UIT';
    }
    document.querySelectorAll('.build-btn[data-build]').forEach((el) => {
      el.disabled = !on;
      el.setAttribute('aria-disabled', on ? 'false' : 'true');
    });
  }

  /** Vastgezet of bouw mode: knoop beweegt niet mee in Matter. */
  function isNodeHeld(n) {
    return n.fixed || buildModeActive;
  }

  function beamMassKg(b) {
    const cfg = buildCfg();
    const len = Math.max(1, b.rest);
    if (b.kind === 'walkway') return len * (cfg.walkwayMassPerPx ?? 0.05);
    if (b.kind === 'rope') return len * (cfg.ropeMassPerPx ?? 0.012);
    return len * (cfg.beamMassPerPx ?? 0.034);
  }

  /** Extra kg op knopen waar het poppetje op een loopplank staat. */
  function getStandingNodeExtraMass() {
    const L = new Map();
    applyPlayerWeightToStandingBeam(L);
    return L;
  }

  /** Spelergewicht op de loopplank-knopen waar je op staat (kg, optelt bij balkmassa). */
  function applyPlayerWeightToStandingBeam(S) {
    if (!standingBeamId) return;
    const stand = beams.find((x) => x.id === standingBeamId);
    const a = stand ? nodeById(stand.a) : null;
    const c = stand ? nodeById(stand.b) : null;
    if (!a || !c) return;
    const pw = getPlayerWeightKg();
    const cx = player.x + player.w * 0.5;
    const span = c.x - a.x;
    const t = Math.abs(span) < 1 ? 0.5 : clamp((cx - a.x) / span, 0, 1);
    S.set(a.id, pw * (1 - t));
    S.set(c.id, pw * t);
  }

  /* ---------- Verankering aan plateau / grond ---------- */

  /** Vind het beste verankerpunt (plateau-rand/-top of grond) bij (wx,wy). */
  function findAnchorPoint(wx, wy) {
    const cfg = buildCfg();
    const r = cfg.anchorSnap;
    let best = null;
    let bestD = r;

    const consider = (x, y) => {
      const d = dist(wx, wy, x, y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    };

    for (const p of platforms) {
      // Bovenkant: snap naar de geprojecteerde x op de plateau-top
      if (wx >= p.x - r && wx <= p.x + p.w + r && Math.abs(wy - p.y) <= r) {
        consider(Math.max(p.x, Math.min(p.x + p.w, wx)), p.y);
      }
      // Hoeken (boven + onder) voor schuine schoren
      consider(p.x, p.y);
      consider(p.x + p.w, p.y);
    }

    // Grond
    const gy = groundSurfaceY(wx);
    if (Math.abs(wy - gy) <= r + 6) consider(wx, gy);

    return best;
  }

  /**
   * Bepaal waar een bouw-eindpunt landt.
   * Geeft een ref met: { x, y, nodeId|null, anchor:boolean }
   */
  function resolveBuildPoint(wx, wy) {
    const near = findNodeNear(wx, wy, buildCfg().snapRadius);
    if (near) return { x: near.x, y: near.y, nodeId: near.id, anchor: near.fixed };

    const anchor = findAnchorPoint(wx, wy);
    if (anchor) return { x: anchor.x, y: anchor.y, nodeId: null, anchor: true };

    return { x: wx, y: wy, nodeId: null, anchor: false };
  }

  /** Maak (of hergebruik) een node op basis van een resolved build-point. */
  function materializeNode(ref) {
    if (ref.nodeId != null) {
      const n = nodeById(ref.nodeId);
      if (n) return n;
    }
    const existing = findNodeNear(ref.x, ref.y, buildCfg().snapRadius * 0.6);
    if (existing) return existing;
    return addNode(ref.x, ref.y, !!ref.anchor);
  }

  /* ---------- Bouwkosten ---------- */

  function canAfford(kind) {
    if (kind === 'rope') return state.rope >= 1;
    if (kind === 'plank') return state.plank >= 1;
    return state.wood >= 1;
  }

  function spend(kind) {
    if (kind === 'rope') state.rope -= 1;
    else if (kind === 'plank') state.plank -= 1;
    else state.wood -= 1;
    updateHud();
    updatePanelStats();
  }

  /* ---------- Plaatsen van balk / loopplank / touw ---------- */

  function finishBuildDrag() {
    if (!buildDrag) return;
    if (!buildModeActive) {
      buildDrag = null;
      return;
    }
    const drag = buildDrag;
    buildDrag = null;

    const tool = drag.tool;
    const label = tool === 'walkway' ? 'Loopplank' : tool === 'rope' ? 'Touw' : 'Balk';
    const matKind = tool === 'rope' ? 'rope' : tool === 'walkway' ? 'plank' : 'wood';

    if (!canAfford(matKind)) {
      const msg = matKind === 'rope' ? 'Geen touw meer'
        : matKind === 'plank' ? 'Geen loopplanken meer'
          : `Geen hout voor ${label.toLowerCase()}`;
      showMessage(msg);
      return;
    }

    const startRef = drag.startRef;
    let endRef = resolveBuildPoint(drag.x2, drag.y2);

    // Lengte tussen de twee eindpunten
    let len = dist(startRef.x, startRef.y, endRef.x, endRef.y);
    if (len < buildCfg().beamMinLength) {
      showMessage(`${label} te kort — sleep verder`);
      return;
    }

    const maxLen = beamMaxLength(tool);
    // Vrij eindpunt mag niet langer dan max — clamp richting start
    if (len > maxLen && endRef.nodeId == null && !endRef.anchor) {
      const t = maxLen / len;
      endRef = resolveBuildPoint(
        startRef.x + (endRef.x - startRef.x) * t,
        startRef.y + (endRef.y - startRef.y) * t
      );
      len = dist(startRef.x, startRef.y, endRef.x, endRef.y);
    }
    if (len > maxLen) {
      showMessage(`${label} te lang (max ${Math.round(maxLen)})`);
      return;
    }

    const nA = materializeNode(startRef);
    const nB = materializeNode(endRef);
    if (!nA || !nB || nA.id === nB.id) {
      showMessage('Kies twee verschillende punten');
      cleanupOrphans();
      return;
    }
    if (beamBetween(nA.id, nB.id)) {
      showMessage('Hier zit al een verbinding');
      cleanupOrphans();
      return;
    }

    const beam = addBeam(nA.id, nB.id, tool);
    if (!beam) {
      cleanupOrphans();
      return;
    }
    spend(matKind);

    const anchored = nA.fixed || nB.fixed;
    const joined = nodeDegree(nA.id) > 1 || nodeDegree(nB.id) > 1;
    if (tool === 'rope') showMessage('Touw gespannen!');
    else if (anchored) showMessage(`${label} verankerd op vast punt`);
    else if (joined) showMessage(`${label} verbonden aan knoop`);
    else showMessage(`${label} geplaatst — bouw door binnen de tijd`);
  }

  /** Verwijder losse nodes (geen balken én niet verankerd-bedoeld). */
  function cleanupOrphans() {
    const keep = new Set(
      nodes.filter((n) => n.fixed || nodeDegree(n.id) > 0 || n._keep).map((n) => n.id)
    );
    if (useMatterPhysics()) {
      for (const n of nodes) {
        if (!keep.has(n.id)) BuilderMatter.removeNode(n.id);
      }
    }
    nodes = nodes.filter((n) => keep.has(n.id));
  }

  /* ---------- Knoop-gereedschap (tik) ---------- */

  function findBeamBodyHit(wx, wy) {
    const cfg = buildCfg();
    let best = null;
    for (const b of beams) {
      const a = nodeById(b.a);
      const c = nodeById(b.b);
      if (!a || !c) continue;
      const hitR = cfg.snapRadius * 0.7 + beamThickness(b) * 0.5;
      const proj = projectOntoSegment(wx, wy, a.x, a.y, c.x, c.y);
      if (proj.dist > hitR || proj.t < 0.12 || proj.t > 0.88) continue;
      if (!best || proj.dist < best.proj.dist) best = { beam: b, proj };
    }
    return best;
  }

  function splitBeamAt(beam, x, y) {
    const minLen = buildCfg().beamMinLength;
    const a = nodeById(beam.a);
    const c = nodeById(beam.b);
    if (!a || !c) return null;
    if (dist(a.x, a.y, x, y) < minLen || dist(c.x, c.y, x, y) < minLen) {
      showMessage('Te dicht bij balk-einde');
      return null;
    }
    const mid = addNode(x, y, false);
    const h1 = addBeam(beam.a, mid.id, beam.kind);
    const h2 = addBeam(mid.id, beam.b, beam.kind);
    // Splitsen behoudt placedAt van het originele stuk.
    if (h1) h1.placedAt = beam.placedAt ?? gameTime;
    if (h2) h2.placedAt = beam.placedAt ?? gameTime;
    if (useMatterPhysics()) BuilderMatter.removeBeam(beam.id);
    beams = beams.filter((b) => b.id !== beam.id);
    return mid;
  }

  function placeKnot(wx, wy) {
    if (!buildModeActive) return;
    const cfg = buildCfg();

    // 1) Bestaande knoop → veranker (vastzetten)
    const near = findNodeNear(wx, wy, cfg.snapRadius);
    if (near) {
      if (near.fixed) {
        showMessage('Deze knoop is al vast');
      } else {
        near.fixed = true;
        near.ox = near.x;
        near.oy = near.y;
        if (useMatterPhysics()) BuilderMatter.setNodeFixed(near.id, true, nodes);
        showMessage('Knoop vastgezet');
      }
      return;
    }

    // 2) Op een balk → splitsen in een gedeelde knoop
    const hit = findBeamBodyHit(wx, wy);
    if (hit) {
      const mid = splitBeamAt(hit.beam, hit.proj.x, hit.proj.y);
      if (mid) {
        showMessage('Knoop op balk — twee stukken verbonden');
      }
      return;
    }

    // 3) Op plateau/grond → vaste verankerknoop
    const anchor = findAnchorPoint(wx, wy);
    if (anchor) {
      const n = addNode(anchor.x, anchor.y, true);
      n._keep = true;
      showMessage('Verankerknoop op plateau — bouw hier vanaf');
      return;
    }

    showMessage('Tik op een balk, knoop of plateau');
  }

  /* ---------- Matter physics + wereld-botsingen ---------- */

  /** Rek in balk na Matter-stap: stress = |ΔL|/L. */
  function recordBeamStrain(b) {
    const a = nodeById(b.a);
    const c = nodeById(b.b);
    if (!a || !c) return;
    const d = dist(a.x, a.y, c.x, c.y);
    if (d < 0.0001) return;
    const rest = Math.max(1, b.rest);
    let strain = (d - rest) / rest;
    if (b.kind === 'rope') strain = d > rest ? strain : 0;
    else strain = Math.abs(strain);
    b._strain = Math.max(b._strain || 0, strain);
  }

  function collideNodesWithWorld() {
    const cfg = buildCfg();
    const baseGf = cfg.groundFriction ?? 0.55;
    let touched = false;
    for (const n of nodes) {
      if (isNodeHeld(n)) continue;
      const vy = n.y - (n.oy ?? n.y);
      const gf = Math.abs(vy) > 10 ? Math.min(baseGf, 0.22) : baseGf;

      // Grond
      const gy = groundSurfaceY(n.x);
      if (n.y > gy) {
        n.y = gy;
        n.ox = n.x - (n.x - n.ox) * (1 - gf);
        n.oy = n.y;
        touched = true;
      }

      // Plateaus — duw uit langs de dichtstbijzijnde kant (minimale verplaatsing).
      // Hierdoor "springt" een knoop die tegen de zijkant leunt niet meer
      // naar de bovenkant (dat veroorzaakte het trillen).
      for (const p of platforms) {
        if (n.x <= p.x || n.x >= p.x + p.w || n.y <= p.y || n.y >= p.y + p.h) continue;
        const dTop = n.y - p.y;
        const dBottom = (p.y + p.h) - n.y;
        const dLeft = n.x - p.x;
        const dRight = (p.x + p.w) - n.x;
        const m = Math.min(dTop, dBottom, dLeft, dRight);
        if (m === dTop) {
          n.y = p.y;
          n.ox = n.x - (n.x - n.ox) * (1 - gf);
          n.oy = n.y;
          touched = true;
        } else if (m === dBottom) {
          n.y = p.y + p.h;
          n.oy = n.y;
          touched = true;
        } else if (m === dLeft) {
          n.x = p.x;
          n.ox = n.x;
          touched = true;
        } else {
          n.x = p.x + p.w;
          n.ox = n.x;
          touched = true;
        }
      }
    }
    return touched;
  }

  function cleanupFallen() {
    if (physicsWarmup > 0) return;
    let changed = false;
    const depth = buildCfg().collapseFallDepth;
    const dead = new Set();
    for (const n of nodes) {
      if (isNodeHeld(n)) continue;
      if (n.y > groundSurfaceY(n.x) + depth) {
        dead.add(n.id);
        changed = true;
      }
    }
    if (!changed) return;
    if (useMatterPhysics()) {
      for (const id of dead) BuilderMatter.removeNode(id);
    }
    nodes = nodes.filter((n) => !dead.has(n.id));
    beams = beams.filter((b) => !dead.has(b.a) && !dead.has(b.b));
  }

  function updateBuilderPhysics(dt) {
    if (!nodes.length || !useMatterPhysics()) return;
    if (physicsWarmup > 0) physicsWarmup--;
    const cfg = buildCfg();
    for (const b of beams) b._strain = 0;

    BuilderMatter.syncConstraints(beams, cfg);
    BuilderMatter.updateNodeMasses(nodes, beams, beamMassKg, getStandingNodeExtraMass());
    BuilderMatter.step(dt, nodes, cfg);
    const collided = collideNodesWithWorld();
    if (collided) BuilderMatter.syncBodiesFromNodes(nodes);
    for (const b of beams) recordBeamStrain(b);
    updateStress(dt);
    cleanupFallen();
  }

  /** Stress = rek in balk (|ΔL|/L) t.o.v. breeklimiet — zoals D7-Bridge. */
  function updateStress(dt) {
    const cfg = buildCfg();
    const allowBreak = !buildModeActive && physicsWarmup <= 0;
    let brokeAny = false;

    for (const b of beams) {
      const lim = (cfg.breakStrain || {})[b.kind] ?? 0.16;
      const strain = b._strain || 0;
      const stress = lim > 0 ? strain / lim : 0;
      b.stress = stress;

      if (allowBreak && b.stress > 1) {
        b._over = (b._over || 0) + dt;
        if (b._over >= (cfg.breakTime || 0.4)) {
          b._broken = true;
          brokeAny = true;
        }
      } else {
        b._over = 0;
      }
    }

    if (brokeAny) {
      if (useMatterPhysics()) {
        for (const b of beams) {
          if (b._broken) BuilderMatter.removeBeam(b.id);
        }
      }
      beams = beams.filter((b) => !b._broken);
      cleanupOrphans();
      if (gameTime - lastBreakMsg > 0.8) {
        lastBreakMsg = gameTime;
        showMessage('Krak! Iets bezweek onder het gewicht');
      }
    }
  }

  /* ---------- Speler op loopplanken ---------- */

  /** Middellijn-y van een (bijna horizontale) loopplank op kolom x, of null. */
  function walkwayCenterYAt(b, x) {
    const a = nodeById(b.a);
    const c = nodeById(b.b);
    if (!a || !c) return null;
    const minX = Math.min(a.x, c.x);
    const maxX = Math.max(a.x, c.x);
    if (x < minX - 4 || x > maxX + 4) return null;
    const span = c.x - a.x;
    if (Math.abs(span) < 6) return null; // bijna verticaal: niet beloopbaar
    let t = (x - a.x) / span;
    t = Math.max(0, Math.min(1, t));
    return a.y + (c.y - a.y) * t;
  }

  function collidePlayerWithBeams() {
    const cx = player.x + player.w * 0.5;
    const sampleXs = [player.x + 3, cx, player.x + player.w - 3];
    const feetY = player.y + player.h;
    const headY = player.y;
    standingBeamId = null;

    for (const b of beams) {
      // Alleen loopplanken hebben een hitbox (balken nooit).
      if (b.kind !== 'walkway') continue;
      const half = beamThickness(b) * 0.5;

      let topY = Infinity;
      let bottomY = -Infinity;
      let hit = false;
      for (const sx of sampleXs) {
        const cy = walkwayCenterYAt(b, sx);
        if (cy == null) continue;
        hit = true;
        topY = Math.min(topY, cy - half);
        bottomY = Math.max(bottomY, cy + half);
      }
      if (!hit) continue;

      // Bovenop landen
      const landBand = player.vy >= 0 ? 18 : 6;
      if (player.vy >= 0 && feetY >= topY - 8 && feetY <= topY + landBand) {
        player.y = topY - player.h;
        player.vy = 0;
        player.grounded = true;
        standingBeamId = b.id;
        continue;
      }

      // Van onderaf: hoofd stoten (zoals tegen een plateau)
      if (player.vy < 0 && headY <= bottomY && headY >= topY - 2) {
        player.y = bottomY;
        player.vy = 0;
      }
    }
  }

  /* ---------- Bouw-interactie (pointer) ---------- */

  function pointerOnBuildUi(target) {
    return !!target?.closest?.('#build-toolbar, #game-hud .build-toolbar, .build-btn, #btn-build-mode');
  }

  function setBuildTool(tool) {
    buildTool = tool;
    buildDrag = null;
    document.querySelectorAll('.build-btn').forEach((btn) => {
      const active = btn.dataset.build === tool;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* ---------- Level opbouw helpers ---------- */

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
        [200, 1.2, ts * 3.5],
        [720, 3.5, ts * 3],
        [1280, 6.0, ts * 2.5]
      ];
      addPlatformStairs(platData, 380, 1.5, 4, { stepHeight: 2.4, shiftX: ts * 3 });
      return platData;
    }

    if (lvl === 3) {
      const platData = [
        [240, 1.8, ts * 3],
        [900, 5.0, ts * 3],
        [1680, 9.0, ts * 2.5]
      ];
      addPlatformStairs(platData, 520, 1.6, 5, { stepHeight: 2.3, shiftX: ts * 2.8 });
      return platData;
    }

    const platData = [
      [160, 1.0, ts * 4],
      [520, 3.0, ts * 3],
      [980, 5.5, ts * 2.5],
      [1480, 8.0, ts * 3]
    ];
    addPlatformStairs(platData, 300, 1.4, 4, { stepHeight: 2.3, shiftX: ts * 3 });
    return platData;
  }

  function getLevelPickupSpawns(lvl) {
    if (lvl === 2) {
      return [
        ['coin', 350, 2.5],
        ['wood', 520, 1.4],
        ['rope', 680, 3.0],
        ['coin', 860, 4.2],
        ['wood', 1100, 2.2],
        ['coin', 1320, 5.0],
        ['rope', 1480, 3.5],
        ['coin', 400, 12.0],
        ['coin', 480, 22.0],
        ['wood', 1150, 14.0]
      ];
    }

    if (lvl === 3) {
      return [
        ['coin', 400, 3.0],
        ['wood', 620, 5.5],
        ['rope', 900, 8.0],
        ['coin', 1200, 11.0],
        ['wood', 1500, 14.0],
        ['coin', 1800, 17.0],
        ['rope', 2100, 20.0],
        ['coin', 280, 18.0],
        ['coin', 360, 28.0],
        ['coin', 820, 24.0],
        ['coin', 1420, 32.0]
      ];
    }

    return [
      ['coin', 380, 3.4],
      ['wood', 470, 1.3],
      ['rope', 540, 2.1],
      ['coin', 620, 5.2],
      ['wood', 760, 2.8],
      ['coin', 980, 3.8],
      ['rope', 1050, 1.5],
      ['wood', 1180, 4.5],
      ['coin', 1200, 5.6],
      ['rope', 1320, 3.2],
      ['coin', 1450, 4.2],
      ['wood', 1580, 1.7],
      ['rope', 1680, 3.9],
      ['coin', 1750, 4.8],
      ['wood', 1880, 2.3],
      ['coin', 2100, 3.5],
      ['rope', 2180, 1.4],
      ['coin', 900, 1.6],
      ['wood', 1010, 2.0],
      ['rope', 1550, 1.8],
      ['camera', 650, 0.45],
      ['coin', 300, 12.5],
      ['coin', 380, 24.0],
      ['coin', 460, 35.5],
      ['wood', 720, 15.0],
      ['coin', 800, 26.5],
      ['rope', 1240, 18.0],
      ['coin', 1320, 30.0],
      ['coin', 1400, 42.0],
      ['wood', 1780, 20.0],
      ['coin', 1860, 32.0]
    ];
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
  }

  function goToLevel(targetLevel, enterFrom) {
    if (targetLevel < 1 || targetLevel > MAX_LEVEL) return;
    const prev = state.level;
    saveBuilderForLevel(prev);
    state.level = targetLevel;
    if (targetLevel > prev) state.score += 100;
    bullets = [];
    shootCooldown = 0;
    jumpBufferTimer = 0;
    coyoteTimer = 0;
    buildLevel(enterFrom);
    showMessage(
      targetLevel > prev
        ? `Level ${targetLevel} — ${getLevelDef(targetLevel).label}`
        : `Terug naar level ${targetLevel}`
    );
    updateHud();
    updatePanelStats();
  }

  function clearBuilder() {
    nodes = [];
    beams = [];
    buildDrag = null;
    standingBeamId = null;
    physicsWarmup = 0;
    if (useMatterPhysics()) BuilderMatter.clear();
  }

  function captureBuilderSnapshot() {
    return {
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, fixed: n.fixed, keep: !!n._keep })),
      beams: beams.map((b) => ({
        id: b.id,
        a: b.a,
        b: b.b,
        rest: b.rest,
        restNx: b.restNx,
        restNy: b.restNy,
        kind: b.kind
      }))
    };
  }

  function applyBuilderSnapshot(snap) {
    clearBuilder();
    if (!snap || !Array.isArray(snap.nodes) || !Array.isArray(snap.beams)) return;

    nodes = snap.nodes
      .filter((n) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
      .map((n) => ({
        id: Number(n.id),
        x: Number(n.x),
        y: Number(n.y),
        ox: Number(n.x),
        oy: Number(n.y),
        fixed: !!n.fixed,
        _keep: !!n.keep
      }));

    const validIds = new Set(nodes.map((n) => n.id));
    beams = snap.beams
      .filter((b) => b && validIds.has(Number(b.a)) && validIds.has(Number(b.b)))
      .map((b) => ({
        a: Number(b.a),
        b: Number(b.b),
        id: Number(b.id),
        kind: b.kind === 'walkway' || b.kind === 'rope' ? b.kind : 'beam',
        rest: Number(b.rest) > 0 ? Number(b.rest) : 1,
        restNx: Number.isFinite(Number(b.restNx)) ? Number(b.restNx) : 0,
        restNy: Number.isFinite(Number(b.restNy)) ? Number(b.restNy) : -1,
        placedAt: -1e9
      }))
      .map((b) => {
        if (Math.hypot(b.restNx, b.restNy) < 0.0001) {
          const a = nodes.find((n) => n.id === b.a);
          const c = nodes.find((n) => n.id === b.b);
          if (a && c) {
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            b.restNx = dx / d;
            b.restNy = dy / d;
          }
        }
        return b;
      });

    for (const n of nodes) if (n.id >= idCounter) idCounter = n.id + 1;
    for (const b of beams) if (b.id >= idCounter) idCounter = b.id + 1;
    if (useMatterPhysics()) BuilderMatter.rebuild(nodes, beams, buildCfg(), buildModeActive);
  }

  function saveBuilderForLevel(level) {
    if (!Number.isFinite(level) || level < 1) return;
    levelBuilders[level] = captureBuilderSnapshot();
  }

  function restoreBuilderForLevel(level) {
    applyBuilderSnapshot(levelBuilders[level]);
  }

  function buildLevel(enterFrom = 'start') {
    const ts = GameConfig.world.tileSize;
    const lvl = state.level;
    const def = getLevelDef(lvl);

    platforms = [];
    restoreBuilderForLevel(lvl);
    gameTime = 0;
    pickups = [];
    trees = [];
    clouds = [];
    doors = [];

    levelWidth = def.width;
    levelTheme = def.theme;
    groundY = Math.floor(h * 0.78);

    const platData = getLevelPlatData(lvl, ts);
    for (const [x, heightAbove, width] of platData) {
      const centerX = x + width * 0.5;
      const surfaceY = groundSurfaceY(centerX) - heightAbove * ts;
      platforms.push(createBeamPlatform(x, width, surfaceY));
    }

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

  /* ---------- Save / Load ---------- */

  function exportState() {
    saveBuilderForLevel(state.level);
    return {
      v: 3,
      score: state.score,
      coins: state.coins,
      wood: state.wood,
      plank: state.plank,
      rope: state.rope,
      camera: state.camera,
      level: state.level,
      hp: state.hp,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, facing: player.facing },
      pickupStates: pickups.map((p) => ({ type: p.type, taken: p.taken })),
      levelBuilders,
      idCounter,
      gameTime,
      buildModeActive,
      t: Date.now()
    };
  }

  function importState(save) {
    if (!save || typeof save !== 'object') return false;
    state.score = Number(save.score) || 0;
    state.coins = Number(save.coins) || 0;
    state.wood = Number(save.wood) || 0;
    state.plank = Number(save.plank) || 0;
    state.rope = Number(save.rope) || 0;
    state.camera = Number(save.camera) || 0;
    state.level = Number(save.level) || 1;
    state.hp = Number(save.hp) || 100;

    levelBuilders = {};
    if (save.levelBuilders && typeof save.levelBuilders === 'object') {
      for (const [key, snap] of Object.entries(save.levelBuilders)) {
        const lvl = Number(key);
        if (lvl >= 1 && snap) levelBuilders[lvl] = snap;
      }
    } else if (Array.isArray(save.nodes) && Array.isArray(save.beams)) {
      levelBuilders[state.level] = { nodes: save.nodes, beams: save.beams };
    }

    idCounter = Number(save.idCounter) || 1;
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
    } else if (Array.isArray(save.coinStates)) {
      save.coinStates.forEach((taken, i) => {
        if (pickups[i]) pickups[i].taken = !!taken;
      });
    }

    gameTime = Number(save.gameTime) || 0;
    buildModeActive = save.buildModeActive === true;
    syncBuildModeUi();

    updateHud();
    updatePanelStats();
    return true;
  }

  function resetGame() {
    const bcfg = buildCfg();
    state.score = 0;
    state.coins = 0;
    state.wood = bcfg.startWood;
    state.plank = bcfg.startPlank ?? 0;
    state.rope = bcfg.startRope;
    state.camera = 0;
    state.level = 1;
    state.hp = getDifficultyCfg().hpMax;
    bullets = [];
    shootCooldown = 0;
    idCounter = 1;
    levelBuilders = {};
    buildModeActive = false;
    clearBuilder();
    buildLevel();
    syncBuildModeUi();
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
    showMessage(fromLoad ? `${name} — verder spelen` : `Veel succes, ${name}!`);
  }

  function clearInput() {
    input.left = false;
    input.right = false;
    input.jump = false;
    input.jumpPressed = false;
    input.shootPressed = false;
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
    gameTime += dt;

    const cfg = getDifficultyCfg();
    const pcfg = buildCfg();
    const canMove = !buildModeActive;
    const move = canMove ? (input.left ? -1 : 0) + (input.right ? 1 : 0) : 0;
    if (!canMove) player.vx = 0;
    if (canMove) {
      player.vx = move * cfg.speed;
      if (move !== 0) player.facing = move;
    }

    if (canMove && input.jumpPressed) {
      jumpBufferTimer = pcfg.jumpBufferSeconds || 0.14;
      input.jumpPressed = false;
    } else if (!canMove) {
      input.jumpPressed = false;
    }
    jumpBufferTimer = canMove ? Math.max(0, jumpBufferTimer - dt) : 0;
    coyoteTimer = player.grounded && canMove ? (pcfg.coyoteSeconds || 0.11) : Math.max(0, coyoteTimer - dt);

    if (canMove && jumpBufferTimer > 0 && coyoteTimer > 0) {
      player.vy = -cfg.jumpForce;
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
    collidePlayerWithBeams();
    resolveGroundCollision(player);
    if (canMove && player.grounded && jumpBufferTimer > 0) {
      player.vy = -cfg.jumpForce;
      player.grounded = false;
      jumpBufferTimer = 0;
      coyoteTimer = 0;
    }

    if (nodes.length && !buildModeActive) {
      updateBuilderPhysics(dt);
    }

    player.x = Math.max(0, Math.min(levelWidth - player.w, player.x));
    if (player.y > camera.y + h + 200) {
      player.y = groundSurfaceYAt(player.x, player.w) - player.h - 4;
      player.x = Math.max(80, player.x - 80);
      player.vy = 0;
      state.hp = Math.max(0, state.hp - 10);
      showMessage('Val schade!');
    }

    collectPickups(dt);
    updateShooting(dt);
    updateDoors(dt);

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
    const isCamera = pickup.type === 'camera';

    if (isCamera) {
      render();
      void openCameraSharePrompt(canvas());
    }

    pickup.taken = true;
    if (pickup.type === 'coin') state.coins += 1;
    if (pickup.type === 'wood') state.wood += 1;
    if (pickup.type === 'rope') state.rope += 1;
    if (pickup.type === 'camera') state.camera += 1;
    state.score += meta?.score || 10;
    showMessage(isCamera ? 'Fototoestel opgepakt!' : `+1 ${meta?.label || pickup.type}`);
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

  function fireBullet() {
    const base = GameConfig.player;
    const bw = 14;
    const bh = 6;
    bullets.push({
      x: player.facing > 0 ? player.x + player.w + 2 : player.x - bw - 2,
      y: player.y + player.h * 0.42,
      w: bw,
      h: bh,
      vx: player.facing * base.shootSpeed,
      life: 1.4
    });
  }

  function updateShooting(dt) {
    const cfg = GameConfig.player;
    shootCooldown = Math.max(0, shootCooldown - dt);

    if (input.shootPressed && shootCooldown <= 0) {
      fireBullet();
      shootCooldown = cfg.shootCooldown;
      input.shootPressed = false;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.life -= dt;

      if (
        bullet.life <= 0
        || bullet.x < -40
        || bullet.x > levelWidth + 40
      ) {
        bullets.splice(i, 1);
        continue;
      }

      for (const pickup of pickups) {
        if (pickup.taken) continue;
        const cy = pickup.y + Math.sin(pickup.bob) * 4;
        const dx = bullet.x + bullet.w / 2 - pickup.x;
        const dy = bullet.y + bullet.h / 2 - cy;
        if (dx * dx + dy * dy >= (pickup.r + 8) ** 2) continue;

        collectPickupItem(pickup);
        bullets.splice(i, 1);
        break;
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

    const snapRange = entity.vy > 0 ? 22 : 10;
    if (feetY >= surfaceY - 8 && feetY <= surfaceY + snapRange) {
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
    if (landingOnTop && Math.abs(entity.y + entity.h - plat.y) < 2) {
      entity.grounded = true;
    }
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    drawSky();
    drawParallaxLayer(parallax().clouds, drawCloudLayer);
    drawParallaxLayer(parallax().background, drawBackgroundLayer);
    drawParallaxLayer(parallax().ground, drawGroundLayer);

    drawForegroundVignette();
    drawBuildModeHud();
  }

  /** Badge wanneer bouw mode aan staat (physics uit). */
  function drawBuildModeHud() {
    if (!buildModeActive || !nodes.length) return;

    ctx.save();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('Bouw mode — physics uit', w / 2, 58);
    ctx.restore();
  }

  function roundRect(x, y, rw, rh, r) {
    const rad = Math.min(r, rw * 0.5, rh * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
    ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
    ctx.arcTo(x, y + rh, x, y, rad);
    ctx.arcTo(x, y, x + rw, y, rad);
    ctx.closePath();
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
      sky.addColorStop(0, '#1a3a5c');
      sky.addColorStop(0.42, '#122238');
      sky.addColorStop(0.72, '#0a1420');
      sky.addColorStop(1, '#060a12');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }

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

  function drawGroundLayer() {
    drawHillyGround();
    for (const p of platforms) drawBeamPlatform(p);
    drawBuilder();
    for (const door of doors) drawDoor(door);
    for (const pickup of pickups) if (!pickup.taken) drawPickup(pickup);
    for (const bullet of bullets) drawBullet(bullet);
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
    const { x, y, w: doorW, h: doorH } = door;
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
    ctx.fillRect(x - 6, y - 10, doorW + 12, doorH + 16);

    ctx.fillStyle = frameColor;
    ctx.fillRect(x - 4, y - 6, doorW + 8, doorH + 8);
    ctx.fillRect(x, y, doorW, doorH);

    const openingGrad = ctx.createLinearGradient(x, y, x + doorW, y + doorH);
    openingGrad.addColorStop(0, 'rgba(8, 12, 20, 0.95)');
    openingGrad.addColorStop(1, 'rgba(20, 30, 48, 0.85)');
    ctx.fillStyle = openingGrad;
    ctx.fillRect(x + 6, y + 8, doorW - 12, doorH - 14);

    ctx.fillStyle = `${glowColor}${0.55 + glow * 0.4})`;
    ctx.fillRect(x + doorW * 0.5 - 3, y + doorH * 0.45, 6, 6);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x + doorW * 0.5, y - 10);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, doorW - 1, doorH - 1);
  }

  /* ---------- Builder rendering ---------- */

  function drawBuilder() {
    // Volgorde = laagdiepte: touw → balken (achterste laag) → loopplanken (voor).
    for (const b of beams) if (b.kind === 'rope') drawRope(b);
    for (const b of beams) if (b.kind === 'beam') drawSolidBeam(b, 'beam');
    for (const b of beams) if (b.kind === 'walkway') drawSolidBeam(b, 'walkway');
    for (const n of nodes) drawNode(n);
    if (buildDrag) drawBuildPreview(buildDrag);
  }

  function drawSolidBeam(b, kind) {
    const a = nodeById(b.a);
    const c = nodeById(b.b);
    if (!a || !c) return;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    const angle = Math.atan2(dy, dx);
    const thick = beamThickness(b);

    ctx.save();
    // Balken zitten visueel "een laag erachter" → iets transparanter.
    if (kind === 'beam') ctx.globalAlpha = 0.7;
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);

    // schaduw
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, -thick * 0.5 + 2, len, thick);

    const grad = ctx.createLinearGradient(0, -thick * 0.5, 0, thick * 0.5);
    if (kind === 'walkway') {
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.35, '#fde047');
      grad.addColorStop(0.7, '#b45309');
      grad.addColorStop(1, '#78350f');
    } else {
      grad.addColorStop(0, '#6b6560');
      grad.addColorStop(0.45, '#4a4540');
      grad.addColorStop(1, '#363330');
    }
    const stress = b.stress || 0;
    const tintOn = buildCfg().stressTintEnabled !== false;
    const gamma = buildCfg().stressVisGamma ?? 0.48;
    const tintT = tintOn ? clamp(Math.pow(Math.min(1.15, stress), gamma), 0, 1) : 0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, -thick * 0.5, len, thick);
    if (tintT > 0) {
      // Duidelijke zones: laag = groen, midden = geel, hoog = rood.
      const green = { r: 42, g: 200, b: 92 };
      const yellow = { r: 248, g: 208, b: 72 };
      const red = { r: 225, g: 54, b: 40 };
      let tint;
      if (tintT < 0.5) {
        tint = mixColor(green, yellow, tintT / 0.5);
      } else {
        tint = mixColor(yellow, red, (tintT - 0.5) / 0.5);
      }
      ctx.globalAlpha = 0.22 + 0.58 * tintT;
      ctx.fillStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
      ctx.fillRect(0, -thick * 0.5, len, thick);
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, -thick * 0.5 + 0.5, len - 1, thick - 1);

    if (kind === 'walkway') {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let lx = 8; lx < len - 4; lx += 12) {
        ctx.beginPath();
        ctx.moveTo(lx, -thick * 0.5 + 1);
        ctx.lineTo(lx, thick * 0.5 - 1);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(2, -thick * 0.5 + 1.5);
      ctx.lineTo(len - 2, -thick * 0.5 + 1.5);
      ctx.stroke();
    }

    // Stress-indicatie: rood gloeien naarmate de balk dichter bij breken zit.
    if (stress > 0.9) {
      const t = Math.min(1, (stress - 0.9) / 0.35);
      ctx.globalAlpha = 0.25 + 0.6 * t;
      ctx.fillStyle = `rgba(255, ${Math.round(80 - 70 * t)}, 24, 1)`;
      ctx.fillRect(0, -thick * 0.5, len, thick);
    }

    ctx.restore();
  }

  function drawRope(b) {
    const a = nodeById(b.a);
    const c = nodeById(b.b);
    if (!a || !c) return;
    const slack = Math.max(0, b.rest - dist(a.x, a.y, c.x, c.y));
    const sag = Math.min(26, 6 + slack * 0.5);
    const midX = (a.x + c.x) * 0.5;
    const midY = (a.y + c.y) * 0.5 + sag;

    ctx.strokeStyle = '#d6b48a';
    ctx.lineWidth = buildCfg().ropeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX, midY, c.x, c.y);
    ctx.stroke();
  }

  function drawNode(n) {
    const deg = nodeDegree(n.id);
    const r = n.fixed ? 7 : deg >= 3 ? 7 : deg >= 2 ? 6 : 5;
    ctx.fillStyle = n.fixed ? '#fbbf24' : deg >= 2 ? '#a855f7' : '#c084fc';
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f5f3ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(n.x, n.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBuildPreview(drag) {
    const startRef = drag.startRef;
    const endRef = resolveBuildPoint(drag.x2, drag.y2);
    const tool = drag.tool;

    let ex = endRef.x;
    let ey = endRef.y;
    let len = dist(startRef.x, startRef.y, ex, ey);
    const maxLen = beamMaxLength(tool);
    let tooLong = false;
    if (len > maxLen) {
      if (endRef.nodeId == null && !endRef.anchor) {
        const t = maxLen / len;
        ex = startRef.x + (ex - startRef.x) * t;
        ey = startRef.y + (ey - startRef.y) * t;
        len = maxLen;
      } else {
        tooLong = true;
      }
    }
    const tooShort = len < buildCfg().beamMinLength;
    const invalid = tooLong || tooShort;

    ctx.save();
    ctx.globalAlpha = 0.7;

    if (tool === 'rope') {
      ctx.strokeStyle = invalid ? 'rgba(239,68,68,0.8)' : '#d6b48a';
      ctx.lineWidth = buildCfg().ropeWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startRef.x, startRef.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else {
      const thick = tool === 'walkway' ? buildCfg().walkwayThickness : buildCfg().beamThickness;
      const angle = Math.atan2(ey - startRef.y, ex - startRef.x);
      ctx.save();
      ctx.translate(startRef.x, startRef.y);
      ctx.rotate(angle);
      ctx.fillStyle = invalid ? 'rgba(239,68,68,0.7)' : (tool === 'walkway' ? '#fde047' : '#5a5550');
      ctx.fillRect(0, -thick * 0.5, len, thick);
      ctx.restore();
    }

    // eindpunt-markers (snap aan knoop/plateau)
    const marker = (ref, x, y) => {
      if (ref.nodeId != null) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.95)';
      } else if (ref.anchor) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
      } else {
        ctx.fillStyle = 'rgba(192, 132, 252, 0.7)';
      }
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    };
    marker(startRef, startRef.x, startRef.y);
    marker(endRef, ex, ey);

    ctx.restore();
  }

  function drawBeamPlatform(p) {
    const { x, y, w: pw, h: ph } = p;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + 3, y + ph, pw, 4);

    const bodyGrad = ctx.createLinearGradient(x, y, x, y + ph);
    bodyGrad.addColorStop(0, '#fde047');
    bodyGrad.addColorStop(0.35, '#facc15');
    bodyGrad.addColorStop(0.65, '#a8a29e');
    bodyGrad.addColorStop(1, '#57534e');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, y, pw, ph);

    ctx.fillStyle = 'rgba(254, 249, 195, 0.45)';
    ctx.fillRect(x + 1, y + 1, pw - 2, 3);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1;
    for (let lx = x + 18; lx < x + pw - 10; lx += 22) {
      ctx.beginPath();
      ctx.moveTo(lx, y + 4);
      ctx.lineTo(lx, y + ph - 2);
      ctx.stroke();
    }

    for (let ly = y + 6; ly < y + ph - 2; ly += 5) {
      ctx.strokeStyle = 'rgba(87, 83, 78, 0.25)';
      ctx.beginPath();
      ctx.moveTo(x + 4, ly);
      ctx.lineTo(x + pw - 4, ly);
      ctx.stroke();
    }

    const bracketW = 6;
    ctx.fillStyle = '#52525b';
    ctx.fillRect(x, y, bracketW, ph);
    ctx.fillRect(x + pw - bracketW, y, bracketW, ph);

    ctx.fillStyle = 'rgba(161, 161, 170, 0.65)';
    ctx.fillRect(x + 2, y + ph * 0.35, 2, 2);
    ctx.fillRect(x + 2, y + ph * 0.65, 2, 2);
    ctx.fillRect(x + pw - 4, y + ph * 0.35, 2, 2);
    ctx.fillRect(x + pw - 4, y + ph * 0.65, 2, 2);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
  }

  function drawPickup(pickup) {
    if (pickup.type === 'wood') drawWoodPickup(pickup);
    else if (pickup.type === 'rope') drawRopePickup(pickup);
    else if (pickup.type === 'camera') drawCameraPickup(pickup);
    else drawCoinPickup(pickup);
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
    const pw = 22;
    const ph = 12;
    ctx.fillStyle = '#92400e';
    ctx.fillRect(pickup.x - pw / 2, y - ph / 2, pw, ph);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pickup.x - pw / 2 + 0.5, y - ph / 2 + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = 'rgba(252, 211, 77, 0.5)';
    ctx.beginPath();
    ctx.moveTo(pickup.x - pw / 2 + 3, y - 1);
    ctx.lineTo(pickup.x + pw / 2 - 3, y - 1);
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
    const parts = getPlayerBodyParts(p);
    const { head, body, legs } = parts;

    ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
    ctx.fillRect(p.x - 2, p.y + p.h - 5, p.w + 4, 7);

    const legGap = 3;
    const legW = (legs.w - legGap) / 2;
    ctx.fillStyle = bodyColors.legs;
    ctx.fillRect(legs.x, legs.y, legW, legs.h);
    ctx.fillRect(legs.x + legW + legGap, legs.y, legW, legs.h);

    ctx.fillStyle = bodyColors.body;
    ctx.fillRect(body.x, body.y, body.w, body.h);

    ctx.fillStyle = bodyColors.head;
    ctx.fillRect(head.x, head.y, head.w, head.h);

    ctx.fillStyle = '#001018';
    const eyeX = p.facing > 0 ? head.x + head.w - 7 : head.x + 2;
    ctx.fillRect(eyeX, head.y + 5, 5, 5);
  }

  function drawBullet(bullet) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(
      bullet.vx > 0 ? bullet.x + bullet.w - 4 : bullet.x,
      bullet.y + 1,
      4,
      bullet.h - 2
    );
  }

  function drawForegroundVignette() {
    const g = ctx.createLinearGradient(0, h - 80, 0, h);
    g.addColorStop(0, 'rgba(6,10,18,0)');
    g.addColorStop(1, 'rgba(6,10,18,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- HUD ---------- */

  function updateHud() {
    const woodEl = document.getElementById('hud-wood');
    const plankEl = document.getElementById('hud-plank');
    const ropeEl = document.getElementById('hud-rope');
    const levelEl = document.getElementById('hud-level');
    const hpEl = document.getElementById('hud-hp');
    if (woodEl) woodEl.textContent = `Hout: ${state.wood}`;
    if (plankEl) plankEl.textContent = `Plank: ${state.plank}`;
    if (ropeEl) ropeEl.textContent = `Touw: ${state.rope}`;
    if (levelEl) levelEl.textContent = `Lvl: ${state.level}`;
    if (hpEl) hpEl.textContent = `HP: ${state.hp}`;
  }

  function updatePanelStats() {
    const map = {
      'stat-score': state.score,
      'stat-coins': state.coins,
      'stat-level': state.level,
      'stat-hp': `${state.hp}%`,
      'stat-weight': `${getPlayerWeightKg()} kg`
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    updateWorldTab();
    updateItemsTab();
  }

  function updateItemsTab() {
    const map = {
      'inv-coin': state.coins,
      'inv-wood': state.wood,
      'inv-plank': state.plank,
      'inv-rope': state.rope,
      'inv-camera': state.camera
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

  /* ---------- Camera-foto delen ---------- */

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

  /* ---------- Input binding ---------- */

  function bindBuildToolbar() {
    document.querySelectorAll('.build-btn[data-build]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        setBuildTool(btn.dataset.build || 'beam');
      });
    });
    document.getElementById('btn-build-mode')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleBuildMode();
    });
    syncBuildModeUi();
  }

  function bindBuildCanvas() {
    const c = canvas();
    if (!c) return;

    const onPointerDown = (e) => {
      if (!running || paused || sharePromptOpen || Menu.isVisible()) return;
      if (pointerOnBuildUi(e.target)) return;
      if (Nav.getActiveTab() !== 'play') return;
      if (!buildModeActive) {
        showMessage('Zet bouw mode AAN om te bouwen');
        return;
      }

      const rect = c.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

      if (buildTool === 'knot') {
        placeKnot(world.x, world.y);
        return;
      }

      // beam / walkway / rope: sleep van punt A naar punt B
      const startRef = resolveBuildPoint(world.x, world.y);
      buildDrag = {
        tool: buildTool,
        startRef,
        x2: startRef.x,
        y2: startRef.y
      };
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const onPointerMove = (e) => {
      if (!buildDrag) return;
      const rect = c.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      buildDrag.x2 = world.x;
      buildDrag.y2 = world.y;
    };

    const onPointerUp = (e) => {
      if (!buildDrag) return;
      try { c.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      finishBuildDrag();
    };

    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
  }

  function bindControls() {
    const leftBtn = document.getElementById('btn-left');
    const rightBtn = document.getElementById('btn-right');
    const jumpBtn = document.getElementById('btn-jump');
    const shootBtn = document.getElementById('btn-shoot');

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
      jumpBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { jumpBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        input.jump = true;
        input.jumpPressed = true;
        jumpBtn.classList.add('pressed');
      });
      const off = () => {
        input.jump = false;
        jumpBtn.classList.remove('pressed');
      };
      const release = (e) => {
        try { jumpBtn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        off();
      };
      jumpBtn.addEventListener('pointerup', release);
      jumpBtn.addEventListener('pointercancel', release);
      jumpBtn.addEventListener('lostpointercapture', off);
    }

    if (shootBtn) {
      shootBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { shootBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        input.shootPressed = true;
        shootBtn.classList.add('pressed');
      });
      const off = () => shootBtn.classList.remove('pressed');
      const release = (e) => {
        try { shootBtn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        off();
      };
      shootBtn.addEventListener('pointerup', release);
      shootBtn.addEventListener('pointercancel', release);
      shootBtn.addEventListener('lostpointercapture', off);
    }

    window.addEventListener('blur', clearInput);

    window.addEventListener('keydown', (e) => {
      if (Nav.getActiveTab() !== 'play' || Menu.isVisible()) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (!input.jump) input.jumpPressed = true;
        input.jump = true;
      }
      if ((e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ') && !e.repeat) {
        e.preventDefault();
        input.shootPressed = true;
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
    loadPhysicsSettings();
    if (!BuilderMatter.init()) {
      console.warn('Matter.js niet geladen — constructie-physics uit');
    }
    resize();
    bindBuildToolbar();
    bindBuildCanvas();
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
    getPlayerBodyParts,
    setSessionMeta,
    getSessionMeta,
    getPhysicsSettings,
    setPhysicsSettings,
    getPlayerWeightKg,
    updatePanelStats
  };
})();
/* END-MERGE-BLOCK */
