/**
 * MD-robot v2 — RoboRally-lite: 5 registers, priority, hand/deck,
 * walls/conveyors/lasers/pits, multi-checkpoint, damage.
 * Host-authoritative; Matrix clients use commit + executeNextRegister.
 */
(function () {
  const REGISTER_COUNT = 5;
  const HAND_BASE = 9;
  const MAX_DAMAGE = 9;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;
  const DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];
  const DIR_ARROW = ['↑', '→', '↓', '←'];
  const COLORS = ['#39f3ff', '#ff7ad9', '#86efac', '#fde68a'];

  const CARD_DEFS = [
    { type: 'move1', label: 'Move 1', priorityBase: 490, count: 18 },
    { type: 'move2', label: 'Move 2', priorityBase: 670, count: 12 },
    { type: 'move3', label: 'Move 3', priorityBase: 790, count: 6 },
    { type: 'backup', label: 'Backup', priorityBase: 430, count: 6 },
    { type: 'turnL', label: 'Turn L', priorityBase: 70, count: 18 },
    { type: 'turnR', label: 'Turn R', priorityBase: 80, count: 18 },
    { type: 'uturn', label: 'U-Turn', priorityBase: 10, count: 6 }
  ];

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function touch(state) {
    state.updatedAt = Date.now();
    return state;
  }

  function shortName(userId) {
    const m = String(userId || '').match(/^@([^:]+):/);
    return m ? m[1] : 'robot';
  }

  function clampPlayerCount(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return MIN_PLAYERS;
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(num)));
  }

  function defaultSettings(playerCount = MIN_PLAYERS) {
    return {
      maxPlayers: clampPlayerCount(playerCount),
      boardId: 'easy',
      pushEnabled: true,
      autoStart: false,
      programLen: REGISTER_COUNT // hub compat
    };
  }

  function normalizeSettings(raw, fallbackPlayers = MIN_PLAYERS) {
    const base = defaultSettings(fallbackPlayers);
    if (!raw || typeof raw !== 'object') return base;
    const boardId = ['easy', 'normal', 'hard'].includes(raw.boardId) ? raw.boardId : base.boardId;
    return {
      maxPlayers: clampPlayerCount(raw.maxPlayers ?? base.maxPlayers),
      boardId,
      pushEnabled: raw.pushEnabled !== false,
      autoStart: !!raw.autoStart,
      programLen: REGISTER_COUNT
    };
  }

  function getSettings(state) {
    return normalizeSettings(state?.settings, state?.maxPlayers);
  }

  function lobbyCap(state) {
    return getSettings(state).maxPlayers;
  }

  function programLen() {
    return REGISTER_COUNT;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDeck(seed) {
    const cards = [];
    let id = 0;
    for (const def of CARD_DEFS) {
      for (let i = 0; i < def.count; i++) {
        cards.push({
          id: `c${id++}`,
          type: def.type,
          label: def.label,
          priority: def.priorityBase + (i % 50)
        });
      }
    }
    const rnd = mulberry32((seed >>> 0) || 1);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = cards[i];
      cards[i] = cards[j];
      cards[j] = tmp;
    }
    return cards;
  }

  function handSize(damage) {
    return Math.max(0, HAND_BASE - (Number(damage) || 0));
  }

  function unlockedRegisterCount(robot) {
    const d = Math.min(MAX_DAMAGE, Math.max(0, Number(robot?.damage) || 0));
    return Math.max(0, REGISTER_COUNT - Math.max(0, d - 4));
    // damage 0-4: all 5 unlocked; 5→4 unlocked … 9→0 unlocked
  }

  function getUnlockedRegisterCount(robot) {
    const d = Math.min(MAX_DAMAGE, Math.max(0, Number(robot?.damage) || 0));
    if (d <= 4) return REGISTER_COUNT;
    return Math.max(0, REGISTER_COUNT - (d - 4));
  }

  function makeRobot(userId, name, index, start) {
    const s = start || { x: 0, y: 0, facing: 0 };
    return {
      userId,
      name: name || shortName(userId),
      x: s.x,
      y: s.y,
      facing: s.facing,
      color: COLORS[index % COLORS.length],
      index,
      damage: 0,
      checkpoint: 0,
      archive: { x: s.x, y: s.y, facing: s.facing },
      hand: [],
      registers: [null, null, null, null, null],
      lockedRegisters: [null, null, null, null, null]
    };
  }

  function attachBoard(state, boardId) {
    if (typeof MdRobotBoards?.getBoard !== 'function') {
      throw new Error('MD-robot boards.js is niet geladen.');
    }
    const board = MdRobotBoards.getBoard(boardId || 'easy');
    state.board = board;
    state.size = board.size;
    state.boardId = board.id;
    state.checkpointsCount = board.checkpointsCount;
    delete state.flag;
    return state;
  }

  /** Ensure board grid exists (clients may only have boardId). */
  function ensureBoard(state) {
    if (!state) return state;
    if (state.board?.grid) return state;
    const id = state.boardId || state.settings?.boardId || 'easy';
    return attachBoard(state, id);
  }

  function createLobbyState(hostId, hostName, playerCount = MIN_PLAYERS) {
    const settings = defaultSettings(playerCount);
    const state = {
      v: 2,
      kind: 'com.d5games.mdrobot.game',
      status: 'lobby',
      hostId,
      maxPlayers: settings.maxPlayers,
      settings,
      round: 0,
      registerIndex: 0,
      winner: null,
      seed: 0,
      deck: [],
      programs: {},
      robots: []
    };
    attachBoard(state, settings.boardId);
    state.robots = [makeRobot(hostId, hostName, 0, state.board.starts[0])];
    return touch(state);
  }

  function addPlayer(state, userId, name) {
    if (!state || state.status !== 'lobby') return state;
    if ((state.robots || []).some((r) => r.userId === userId)) return state;
    const cap = lobbyCap(state);
    if ((state.robots || []).length >= cap) {
      throw new Error(`Lobby is vol (${cap} spelers).`);
    }
    const next = clone(state);
    if (!next.board) attachBoard(next, getSettings(next).boardId);
    const i = next.robots.length;
    const start = next.board.starts[i % next.board.starts.length];
    next.robots.push(makeRobot(userId, name, i, start));
    return touch(next);
  }

  function updateSettings(state, patch) {
    if (!state || state.status !== 'lobby') {
      throw new Error('Instellingen alleen in de lobby.');
    }
    const next = clone(state);
    const merged = normalizeSettings({ ...getSettings(state), ...patch }, state.maxPlayers);
    if ((next.robots || []).length > merged.maxPlayers) {
      throw new Error(`Er zitten al ${(next.robots || []).length} spelers — kies minstens dat aantal.`);
    }
    next.settings = merged;
    next.maxPlayers = merged.maxPlayers;
    if (merged.boardId !== state.boardId) {
      attachBoard(next, merged.boardId);
      next.robots.forEach((r, i) => {
        const start = next.board.starts[i % next.board.starts.length];
        r.x = start.x;
        r.y = start.y;
        r.facing = start.facing;
        r.archive = { x: start.x, y: start.y, facing: start.facing };
      });
    }
    return touch(next);
  }

  function dealHands(state) {
    let deck = (state.deck || []).slice();
    if (deck.length < 40) {
      deck = buildDeck((state.seed || 1) + (state.round || 1) * 9973);
    }
    for (const robot of state.robots) {
      const need = handSize(robot.damage);
      robot.hand = [];
      while (robot.hand.length < need && deck.length) {
        robot.hand.push(deck.shift());
      }
      // Prefill locked registers from previous lock memory
      const unlocked = getUnlockedRegisterCount(robot);
      robot.registers = [null, null, null, null, null];
      for (let i = unlocked; i < REGISTER_COUNT; i++) {
        robot.registers[i] = robot.lockedRegisters?.[i] || null;
      }
    }
    state.deck = deck;
  }

  function startRound(state) {
    const next = clone(state);
    next.status = 'programming';
    next.registerIndex = 0;
    next.programs = {};
    next.seed = (next.seed || Date.now()) >>> 0;
    dealHands(next);
    return touch(next);
  }

  function startGame(state) {
    const settings = getSettings(state);
    const count = (state?.robots || []).length;
    if (!state || count < MIN_PLAYERS) {
      throw new Error(`Minimaal ${MIN_PLAYERS} spelers nodig (nu ${count || 0}).`);
    }
    if (count > settings.maxPlayers) {
      throw new Error(`Te veel spelers (${count}/${settings.maxPlayers}).`);
    }
    const next = clone(state);
    next.settings = settings;
    next.maxPlayers = settings.maxPlayers;
    attachBoard(next, settings.boardId);
    next.winner = null;
    next.round = 1;
    next.seed = (Date.now() ^ (count * 7919)) >>> 0;
    next.deck = buildDeck(next.seed);
    next.robots.forEach((r, i) => {
      const start = next.board.starts[i % next.board.starts.length];
      r.x = start.x;
      r.y = start.y;
      r.facing = start.facing;
      r.damage = 0;
      r.checkpoint = 0;
      r.archive = { x: start.x, y: start.y, facing: start.facing };
      r.lockedRegisters = [null, null, null, null, null];
      r.index = i;
    });
    return startRound(next);
  }

  function returnToLobby(state) {
    const next = clone(state);
    next.status = 'lobby';
    next.round = 0;
    next.registerIndex = 0;
    next.winner = null;
    next.programs = {};
    next.deck = [];
    next.settings = getSettings(state);
    next.maxPlayers = next.settings.maxPlayers;
    attachBoard(next, next.settings.boardId);
    next.robots.forEach((r, i) => {
      const start = next.board.starts[i % next.board.starts.length];
      r.x = start.x;
      r.y = start.y;
      r.facing = start.facing;
      r.hand = [];
      r.registers = [null, null, null, null, null];
      r.lockedRegisters = [null, null, null, null, null];
      r.damage = 0;
      r.checkpoint = 0;
    });
    return touch(next);
  }

  function findCardInHand(robot, cardId) {
    return (robot.hand || []).find((c) => c.id === cardId) || null;
  }

  function normalizeCard(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return null;
    if (!raw.type) return null;
    return {
      id: raw.id || `tmp_${raw.type}_${raw.priority || 0}`,
      type: raw.type,
      label: raw.label || raw.type,
      priority: Number(raw.priority) || 0
    };
  }

  /**
   * Commit registers. `slots` may be card ids (strings) or full card objects.
   * Full objects let the host apply a guest commit even if hand was redacted.
   */
  function commitRegisters(state, userId, slots) {
    if (!state || state.status !== 'programming') {
      throw new Error('Nu kun je niet programmeren.');
    }
    const next = ensureBoard(clone(state));
    const robot = next.robots.find((r) => r.userId === userId);
    if (!robot) throw new Error('Je zit niet in deze race.');
    if (next.programs?.[userId]?.sent) throw new Error('Al gecommit.');

    const unlocked = getUnlockedRegisterCount(robot);
    const regs = [null, null, null, null, null];
    const used = new Set();

    for (let i = 0; i < REGISTER_COUNT; i++) {
      if (i >= unlocked) {
        regs[i] = robot.lockedRegisters?.[i] || null;
        continue;
      }
      const slot = slots?.[i];
      if (!slot) throw new Error(`Register ${i + 1} is leeg.`);

      let card = normalizeCard(slot);
      if (!card) {
        const id = String(slot);
        if (used.has(id)) throw new Error('Kaart dubbel gebruikt.');
        card = findCardInHand(robot, id);
        if (!card) throw new Error('Kaart niet in hand.');
        used.add(id);
        regs[i] = { ...card };
      } else {
        if (used.has(card.id)) throw new Error('Kaart dubbel gebruikt.');
        used.add(card.id);
        // Prefer authoritative hand copy if present
        const fromHand = findCardInHand(robot, card.id);
        regs[i] = fromHand ? { ...fromHand } : card;
      }
    }

    robot.registers = regs;
    robot.hand = (robot.hand || []).filter((c) => !used.has(c.id));
    next.programs = { ...(next.programs || {}) };
    next.programs[userId] = { sent: true, registers: regs.map((c) => (c ? { ...c } : null)) };
    return touch(next);
  }

  /** Compat: setProgram(userId, cardTypes[]) — builds temporary cards (legacy). Prefer commitRegisters. */
  function setProgram(state, userId, cards) {
    if (!state || state.status !== 'programming') {
      throw new Error('Nu kun je niet programmeren.');
    }
    const robot = (state.robots || []).find((r) => r.userId === userId);
    if (!robot) throw new Error('Je zit niet in deze race.');
    const unlocked = getUnlockedRegisterCount(robot);
    const ids = [];
    for (let i = 0; i < REGISTER_COUNT; i++) {
      if (i >= unlocked) {
        ids.push(null);
        continue;
      }
      const type = cards[i];
      const card = (robot.hand || []).find((c) => c.type === type && !ids.includes(c.id));
      if (!card) throw new Error(`Geen ${type} in hand.`);
      ids.push(card.id);
    }
    return commitRegisters(state, userId, ids);
  }

  function allSent(state) {
    return allCommitted(state);
  }

  function allCommitted(state) {
    const robots = state?.robots || [];
    if (!robots.length) return false;
    return robots.every((r) => state.programs?.[r.userId]?.sent);
  }

  function cellAt(board, x, y) {
    if (!board?.grid?.[y] || x < 0 || y < 0 || x >= board.size || y >= board.size) return null;
    return board.grid[y][x];
  }

  function inBounds(board, x, y) {
    return x >= 0 && y >= 0 && x < board.size && y < board.size;
  }

  function hasWall(board, x, y, dir) {
    const c = cellAt(board, x, y);
    return !!(c && c.walls && c.walls[dir]);
  }

  function robotAt(robots, x, y, exceptId = null) {
    return robots.find((r) => r.x === x && r.y === y && r.userId !== exceptId) || null;
  }

  function collectPushChain(board, robots, x, y, dir, exceptId) {
    const chain = [];
    let cx = x;
    let cy = y;
    while (true) {
      const r = robotAt(robots, cx, cy, exceptId);
      if (!r) return chain;
      if (hasWall(board, cx, cy, dir)) return null;
      const nx = cx + DIRS[dir].x;
      const ny = cy + DIRS[dir].y;
      if (!inBounds(board, nx, ny)) return null;
      chain.push(r);
      cx = nx;
      cy = ny;
      exceptId = r.userId;
    }
  }

  function displace(board, robots, robot, dir, pushEnabled) {
    if (hasWall(board, robot.x, robot.y, dir)) return false;
    const nx = robot.x + DIRS[dir].x;
    const ny = robot.y + DIRS[dir].y;
    if (!inBounds(board, nx, ny)) return false;

    const other = robotAt(robots, nx, ny, robot.userId);
    if (!other) {
      robot.x = nx;
      robot.y = ny;
      return true;
    }
    if (!pushEnabled) return false;
    const chain = collectPushChain(board, robots, nx, ny, dir, robot.userId);
    if (chain === null) return false;
    for (let i = chain.length - 1; i >= 0; i--) {
      const r = chain[i];
      r.x += DIRS[dir].x;
      r.y += DIRS[dir].y;
    }
    robot.x = nx;
    robot.y = ny;
    return true;
  }

  function moveSteps(board, robots, robot, dir, steps, pushEnabled) {
    for (let i = 0; i < steps; i++) {
      if (!displace(board, robots, robot, dir, pushEnabled)) break;
      const cell = cellAt(board, robot.x, robot.y);
      if (cell?.tile === 'pit') {
        damageRobot(robot, 1);
        respawnAtArchive(robot);
        break;
      }
    }
  }

  function damageRobot(robot, amount) {
    robot.damage = Math.min(MAX_DAMAGE, (robot.damage || 0) + amount);
  }

  function respawnAtArchive(robot) {
    const a = robot.archive || { x: robot.x, y: robot.y, facing: robot.facing };
    robot.x = a.x;
    robot.y = a.y;
    robot.facing = a.facing;
  }

  function applyCard(board, robots, robot, card, pushEnabled) {
    if (!card) return;
    switch (card.type) {
      case 'move1':
        moveSteps(board, robots, robot, robot.facing, 1, pushEnabled);
        break;
      case 'move2':
        moveSteps(board, robots, robot, robot.facing, 2, pushEnabled);
        break;
      case 'move3':
        moveSteps(board, robots, robot, robot.facing, 3, pushEnabled);
        break;
      case 'backup':
        moveSteps(board, robots, robot, (robot.facing + 2) % 4, 1, pushEnabled);
        break;
      case 'turnL':
        robot.facing = (robot.facing + 3) % 4;
        break;
      case 'turnR':
        robot.facing = (robot.facing + 1) % 4;
        break;
      case 'uturn':
        robot.facing = (robot.facing + 2) % 4;
        break;
      default:
        break;
    }
  }

  function activateConveyors(board, robots, expressOnly) {
    const moves = [];
    for (const robot of robots) {
      const cell = cellAt(board, robot.x, robot.y);
      if (!cell) continue;
      const isExpress = cell.tile === 'express';
      const isConv = cell.tile === 'conveyor' || isExpress;
      if (!isConv) continue;
      if (expressOnly && !isExpress) continue;
      if (!expressOnly && isExpress) continue; // express already moved
      const dir = Number(cell.dir) || 0;
      moves.push({ robot, dir });
    }
    // Apply in parallel snapshot
    const planned = moves.map(({ robot, dir }) => ({
      robot,
      nx: robot.x + DIRS[dir].x,
      ny: robot.y + DIRS[dir].y,
      dir
    }));
    for (const m of planned) {
      if (!inBounds(board, m.nx, m.ny)) continue;
      if (hasWall(board, m.robot.x, m.robot.y, m.dir)) continue;
      if (robotAt(robots, m.nx, m.ny, m.robot.userId)) continue;
      m.robot.x = m.nx;
      m.robot.y = m.ny;
      const cell = cellAt(board, m.robot.x, m.robot.y);
      if (cell?.tile === 'pit') {
        damageRobot(m.robot, 1);
        respawnAtArchive(m.robot);
      }
    }
  }

  function activateGears(board, robots) {
    for (const robot of robots) {
      const cell = cellAt(board, robot.x, robot.y);
      if (cell?.tile === 'gear_cw') robot.facing = (robot.facing + 1) % 4;
      if (cell?.tile === 'gear_ccw') robot.facing = (robot.facing + 3) % 4;
    }
  }

  function fireBoardLasers(board, robots) {
    for (let y = 0; y < board.size; y++) {
      for (let x = 0; x < board.size; x++) {
        const cell = cellAt(board, x, y);
        if (cell?.tile !== 'laser') continue;
        const dir = Number(cell.dir) || 0;
        let cx = x;
        let cy = y;
        // Laser fires along its facing; hit first robot
        for (let step = 0; step < board.size; step++) {
          if (hasWall(board, cx, cy, dir)) break;
          cx += DIRS[dir].x;
          cy += DIRS[dir].y;
          if (!inBounds(board, cx, cy)) break;
          const hit = robotAt(robots, cx, cy);
          if (hit) {
            damageRobot(hit, 1);
            break;
          }
          if (hasWall(board, cx, cy, dir)) break;
        }
      }
    }
  }

  function activateBoardElements(board, robots) {
    activateConveyors(board, robots, true); // express first
    activateConveyors(board, robots, true); // express second step
    activateConveyors(board, robots, false); // normal conveyors
    activateGears(board, robots);
    fireBoardLasers(board, robots);
  }

  function checkCheckpoints(state) {
    const board = state.board;
    const need = board.checkpointsCount || 2;
    for (const robot of state.robots) {
      const cell = cellAt(board, robot.x, robot.y);
      if (cell?.tile === 'checkpoint' && cell.num === (robot.checkpoint || 0) + 1) {
        robot.checkpoint = cell.num;
        robot.archive = { x: robot.x, y: robot.y, facing: robot.facing };
        if (robot.checkpoint >= need) {
          state.winner = robot.userId;
          state.status = 'finished';
          return true;
        }
      }
      if (cell?.tile === 'repair') {
        robot.damage = Math.max(0, (robot.damage || 0) - 1);
      }
    }
    return false;
  }

  function lockRegistersForNextRound(robot) {
    const unlocked = getUnlockedRegisterCount(robot);
    const locked = [null, null, null, null, null];
    for (let i = unlocked; i < REGISTER_COUNT; i++) {
      locked[i] = robot.registers?.[i] ? { ...robot.registers[i] } : null;
    }
    robot.lockedRegisters = locked;
  }

  /**
   * Execute one register step. Call when status is programming+allCommitted (first call)
   * or status is executing. Returns updated state.
   */
  function executeNextRegister(state) {
    const next = clone(state);
    const settings = getSettings(next);
    if (!next.board) attachBoard(next, settings.boardId);

    if (next.status === 'programming') {
      if (!allCommitted(next)) throw new Error('Nog niet iedereen heeft gecommit.');
      // Copy committed registers onto robots
      for (const robot of next.robots) {
        const prog = next.programs?.[robot.userId];
        if (prog?.registers) robot.registers = prog.registers.map((c) => (c ? { ...c } : null));
      }
      next.status = 'executing';
      next.registerIndex = 0;
    }

    if (next.status !== 'executing') {
      throw new Error('Niet in uitvoeringsfase.');
    }

    const regIdx = next.registerIndex || 0;
    if (regIdx >= REGISTER_COUNT) {
      return finishRound(next);
    }

    const actions = next.robots
      .filter((r) => r.registers?.[regIdx])
      .map((r) => ({ robot: r, card: r.registers[regIdx] }))
      .sort((a, b) => {
        const pd = (b.card.priority || 0) - (a.card.priority || 0);
        if (pd !== 0) return pd;
        return a.robot.index - b.robot.index;
      });

    for (const { robot, card } of actions) {
      applyCard(next.board, next.robots, robot, card, settings.pushEnabled);
    }

    activateBoardElements(next.board, next.robots);
    next.registerIndex = regIdx + 1;

    if (next.registerIndex >= REGISTER_COUNT) {
      return finishRound(next);
    }
    return touch(next);
  }

  function finishRound(state) {
    checkCheckpoints(state);
    if (state.status === 'finished') {
      state.programs = {};
      return touch(state);
    }
    for (const robot of state.robots) {
      lockRegistersForNextRound(robot);
      robot.hand = [];
      robot.registers = [null, null, null, null, null];
    }
    state.programs = {};
    state.round = (state.round || 1) + 1;
    state.registerIndex = 0;
    return startRound(state);
  }

  /** Run all remaining registers in one go (host convenience / tests). */
  function executeRound(state) {
    let next = clone(state);
    if (next.status === 'programming') {
      if (!allCommitted(next)) throw new Error('Nog niet iedereen heeft gecommit.');
    }
    let guard = 0;
    while (guard++ < 10) {
      if (next.status === 'finished') return next;
      if (next.status === 'programming' && allCommitted(next)) {
        next = executeNextRegister(next);
        continue;
      }
      if (next.status === 'executing') {
        next = executeNextRegister(next);
        continue;
      }
      break;
    }
    return next;
  }

  function sanitizeStateForViewer(state, viewerId) {
    if (!state) return state;
    const next = clone(state);
    const reveal = next.status === 'executing' || next.status === 'finished';
    for (const robot of next.robots || []) {
      if (robot.userId === viewerId) continue;
      if (!reveal) {
        robot.hand = [];
        robot.registers = [null, null, null, null, null];
        if (next.programs?.[robot.userId]) {
          next.programs[robot.userId] = { sent: !!next.programs[robot.userId].sent };
        }
      }
    }
    return next;
  }

  function cardLabel(card) {
    if (!card) return '·';
    if (typeof card === 'string') {
      const def = CARD_DEFS.find((d) => d.type === card);
      return def ? def.label : card;
    }
    return card.label || card.type || '·';
  }

  function settingsSummary(state) {
    const s = getSettings(state);
    const boardName = MdRobotBoards?.listBoards?.()?.find((b) => b.id === s.boardId)?.name || s.boardId;
    const auto = s.autoStart ? ' · auto-start aan' : '';
    return `max. ${s.maxPlayers} · bord ${boardName} · 5 registers · duwen ${s.pushEnabled ? 'aan' : 'uit'}${auto}`;
  }

  function checkWinner(state) {
    return state?.winner || null;
  }

  // silence unused helper warning in some linters
  void unlockedRegisterCount;

  window.MdRobotEngine = {
    SIZE: 12,
    REGISTER_COUNT,
    PROGRAM_LEN: REGISTER_COUNT,
    MIN_PLAYERS,
    MAX_PLAYERS,
    MIN_PROGRAM: REGISTER_COUNT,
    MAX_PROGRAM: REGISTER_COUNT,
    DIR_ARROW,
    CARD_DEFS,
    clampPlayerCount,
    clampProgramLen: () => REGISTER_COUNT,
    lobbyCap,
    programLen,
    getSettings,
    getUnlockedRegisterCount,
    handSize,
    touch,
    createLobbyState,
    makeRobot,
    addPlayer,
    updateSettings,
    startGame,
    startRound,
    returnToLobby,
    commitRegisters,
    setProgram,
    allSent,
    allCommitted,
    executeNextRegister,
    executeRound,
    finishRound,
    sanitizeStateForViewer,
    checkWinner,
    cardLabel,
    settingsSummary,
    shortName,
    buildDeck,
    ensureBoard
  };
})();
