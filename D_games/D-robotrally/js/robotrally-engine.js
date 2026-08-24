class RobotRallyEngine {
  constructor() {
    this.currentCourseId = 'course-1';
    this.gameMode = CONFIG.GAME_MODES.HOTSEAT;
    this.playerCount = 2;
    this.startingLives = CONFIG.DEFAULT_STARTING_LIVES || CONFIG.STARTING_LIVES || 3;
    this.board = null;
    this.robots = [];
    this.registerIndex = 0;
    this.programmingPlayerIndex = 0;
    this.phase = 'programming';
    this.roundNumber = 1;
    this.winner = null;
    this.activeRegisterCards = [];
    this.actionLog = [];
    this.lastLaserBursts = [];
    this.pendingUpgradeQueue = [];
    this.currentUpgradeChoice = null;
    this.committedRobotIds = [];
    this.rngSeed = null;
    this._rngState = null;
    this.onStateChange = null;
    this.onLogMessage = null;
    this.courses = this.initCourses();
  }

  isMatrixMode() {
    return this.gameMode === CONFIG.GAME_MODES.MATRIX;
  }

  isSimultaneousProgramming() {
    return this.isMatrixMode();
  }

  setRngSeed(seed) {
    const n = Number(seed);
    this.rngSeed = Number.isFinite(n) ? (n >>> 0) : (Date.now() >>> 0);
    this._rngState = this.rngSeed || 1;
  }

  rng() {
    if (this._rngState == null) this.setRngSeed(Date.now());
    // xorshift32
    let x = this._rngState || 1;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._rngState = x >>> 0;
    return (this._rngState || 1) / 4294967296;
  }

  initCourses() {
    const course1 = this.createBoard(12, 12, {
      id: 'course-1',
      name: 'Docking Drift',
      desc: 'Instapbaan met transportbanden, muren en een veilige leerroute langs 3 checkpoints.',
      checkpointsCount: 3
    });

    this.setTiles(course1, [
      { x: 1, y: 9, type: CONFIG.TILE_TYPES.START, startId: 1 },
      { x: 1, y: 10, type: CONFIG.TILE_TYPES.START, startId: 2 },
      { x: 0, y: 9, type: CONFIG.TILE_TYPES.START, startId: 3 },
      { x: 0, y: 10, type: CONFIG.TILE_TYPES.START, startId: 4 },
      { x: 2, y: 10, type: CONFIG.TILE_TYPES.START, startId: 5 },
      { x: 4, y: 9, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 1 },
      { x: 8, y: 5, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 2 },
      { x: 10, y: 2, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 3 },
      { x: 2, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 3, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 5, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 5, y: 8, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 5, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 6, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.EAST },
      { x: 7, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH, turn: CONFIG.DIRECTIONS.EAST },
      { x: 7, y: 6, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 7, y: 5, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 2, y: 6, type: CONFIG.TILE_TYPES.REPAIR },
      { x: 9, y: 9, type: CONFIG.TILE_TYPES.UPGRADE },
      { x: 4, y: 4, type: CONFIG.TILE_TYPES.GEAR_CCW },
      { x: 9, y: 6, type: CONFIG.TILE_TYPES.GEAR_CW },
      { x: 1, y: 4, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.EAST, laserPower: 1 },
      { x: 10, y: 8, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.NORTH, laserPower: 1 },
      { x: 6, y: 4, type: CONFIG.TILE_TYPES.PIT },
      { x: 6, y: 5, type: CONFIG.TILE_TYPES.PIT },
      { x: 5, y: 5, type: CONFIG.TILE_TYPES.PIT }
    ]);
    this.addBorderWalls(course1);
    this.addWalls(course1, [
      [3, 10, CONFIG.DIRECTIONS.NORTH],
      [4, 10, CONFIG.DIRECTIONS.NORTH],
      [5, 10, CONFIG.DIRECTIONS.NORTH],
      [3, 8, CONFIG.DIRECTIONS.EAST],
      [3, 7, CONFIG.DIRECTIONS.EAST],
      [8, 7, CONFIG.DIRECTIONS.NORTH],
      [8, 6, CONFIG.DIRECTIONS.NORTH],
      [9, 4, CONFIG.DIRECTIONS.WEST],
      [9, 3, CONFIG.DIRECTIONS.WEST]
    ]);
    this.addRectangleWalls(course1, 5, 4, 6, 5);

    const course2 = this.createBoard(12, 12, {
      id: 'course-2',
      name: 'Checkmate Circuit',
      desc: 'Meer zoals RoboRally Master: strakke lanes, kruisvuur, muren en 3 scherpe checkpoints.',
      checkpointsCount: 3
    });

    this.setTiles(course2, [
      { x: 1, y: 9, type: CONFIG.TILE_TYPES.START, startId: 1 },
      { x: 1, y: 10, type: CONFIG.TILE_TYPES.START, startId: 2 },
      { x: 0, y: 9, type: CONFIG.TILE_TYPES.START, startId: 3 },
      { x: 0, y: 10, type: CONFIG.TILE_TYPES.START, startId: 4 },
      { x: 2, y: 10, type: CONFIG.TILE_TYPES.START, startId: 5 },
      { x: 2, y: 8, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 1 },
      { x: 6, y: 6, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 2 },
      { x: 9, y: 2, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 3 },
      { x: 3, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 3, y: 8, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 3, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 4, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 5, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH, turn: CONFIG.DIRECTIONS.EAST },
      { x: 5, y: 6, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 1, y: 7, type: CONFIG.TILE_TYPES.REPAIR },
      { x: 10, y: 9, type: CONFIG.TILE_TYPES.UPGRADE },
      { x: 6, y: 7, type: CONFIG.TILE_TYPES.GEAR_CW },
      { x: 7, y: 4, type: CONFIG.TILE_TYPES.GEAR_CCW },
      { x: 0, y: 5, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.EAST, laserPower: 1 },
      { x: 11, y: 6, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.WEST, laserPower: 1 },
      { x: 6, y: 0, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.SOUTH, laserPower: 1 },
      { x: 8, y: 8, type: CONFIG.TILE_TYPES.PIT },
      { x: 9, y: 8, type: CONFIG.TILE_TYPES.PIT },
      { x: 8, y: 9, type: CONFIG.TILE_TYPES.PIT },
      { x: 4, y: 3, type: CONFIG.TILE_TYPES.PIT }
    ]);
    this.addBorderWalls(course2);
    this.addRectangleWalls(course2, 4, 4, 7, 7);
    this.removeWall(course2, 5, 4, CONFIG.DIRECTIONS.SOUTH);
    this.removeWall(course2, 6, 7, CONFIG.DIRECTIONS.NORTH);
    this.removeWall(course2, 4, 5, CONFIG.DIRECTIONS.EAST);
    this.removeWall(course2, 7, 6, CONFIG.DIRECTIONS.WEST);
    this.addWalls(course2, [
      [2, 9, CONFIG.DIRECTIONS.NORTH],
      [2, 8, CONFIG.DIRECTIONS.NORTH],
      [9, 3, CONFIG.DIRECTIONS.SOUTH],
      [9, 4, CONFIG.DIRECTIONS.SOUTH],
      [8, 2, CONFIG.DIRECTIONS.WEST],
      [7, 2, CONFIG.DIRECTIONS.WEST],
      [2, 5, CONFIG.DIRECTIONS.EAST],
      [2, 6, CONFIG.DIRECTIONS.EAST]
    ]);

    const course3 = this.createBoard(14, 12, {
      id: 'course-3',
      name: 'Vault Assault',
      desc: 'Grote arena met centrale valkuil, lange conveyors, lasers en 4 checkpoints voor een echte race.',
      checkpointsCount: 4
    });

    this.setTiles(course3, [
      { x: 1, y: 9, type: CONFIG.TILE_TYPES.START, startId: 1 },
      { x: 1, y: 10, type: CONFIG.TILE_TYPES.START, startId: 2 },
      { x: 0, y: 9, type: CONFIG.TILE_TYPES.START, startId: 3 },
      { x: 0, y: 10, type: CONFIG.TILE_TYPES.START, startId: 4 },
      { x: 2, y: 10, type: CONFIG.TILE_TYPES.START, startId: 5 },
      { x: 3, y: 9, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 1 },
      { x: 10, y: 8, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 2 },
      { x: 11, y: 3, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 3 },
      { x: 4, y: 2, type: CONFIG.TILE_TYPES.CHECKPOINT, num: 4 },
      { x: 2, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 4, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 5, y: 9, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH, turn: CONFIG.DIRECTIONS.EAST },
      { x: 5, y: 8, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 5, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 6, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 7, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 8, y: 7, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH, turn: CONFIG.DIRECTIONS.EAST },
      { x: 8, y: 6, type: CONFIG.TILE_TYPES.CONVEYOR_2, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 8, y: 5, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST, turn: CONFIG.DIRECTIONS.NORTH },
      { x: 9, y: 5, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.EAST },
      { x: 10, y: 5, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH, turn: CONFIG.DIRECTIONS.EAST },
      { x: 10, y: 4, type: CONFIG.TILE_TYPES.CONVEYOR_1, dir: CONFIG.DIRECTIONS.NORTH },
      { x: 3, y: 5, type: CONFIG.TILE_TYPES.REPAIR },
      { x: 11, y: 8, type: CONFIG.TILE_TYPES.UPGRADE },
      { x: 4, y: 8, type: CONFIG.TILE_TYPES.GEAR_CCW },
      { x: 9, y: 4, type: CONFIG.TILE_TYPES.GEAR_CW },
      { x: 13, y: 6, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.WEST, laserPower: 1 },
      { x: 0, y: 4, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.EAST, laserPower: 1 },
      { x: 7, y: 0, type: CONFIG.TILE_TYPES.LASER, dir: CONFIG.DIRECTIONS.SOUTH, laserPower: 1 },
      { x: 6, y: 4, type: CONFIG.TILE_TYPES.PIT },
      { x: 7, y: 4, type: CONFIG.TILE_TYPES.PIT },
      { x: 6, y: 5, type: CONFIG.TILE_TYPES.PIT },
      { x: 7, y: 5, type: CONFIG.TILE_TYPES.PIT },
      { x: 6, y: 6, type: CONFIG.TILE_TYPES.PIT },
      { x: 7, y: 6, type: CONFIG.TILE_TYPES.PIT }
    ]);
    this.addBorderWalls(course3);
    this.addRectangleWalls(course3, 6, 4, 7, 6);
    this.addWalls(course3, [
      [3, 10, CONFIG.DIRECTIONS.NORTH],
      [4, 10, CONFIG.DIRECTIONS.NORTH],
      [5, 10, CONFIG.DIRECTIONS.NORTH],
      [10, 7, CONFIG.DIRECTIONS.EAST],
      [10, 6, CONFIG.DIRECTIONS.EAST],
      [11, 4, CONFIG.DIRECTIONS.SOUTH],
      [11, 5, CONFIG.DIRECTIONS.SOUTH],
      [4, 2, CONFIG.DIRECTIONS.WEST],
      [4, 3, CONFIG.DIRECTIONS.WEST]
    ]);

    return {
      'course-1': course1,
      'course-2': course2,
      'course-3': course3
    };
  }

  createCell(overrides = {}) {
    const cell = {
      type: CONFIG.TILE_TYPES.FLOOR,
      dir: CONFIG.DIRECTIONS.NORTH,
      num: 0,
      turn: null,
      curve: null,
      curveFrom: null,
      startId: 0,
      laserPower: 1,
      walls: [false, false, false, false],
      ...overrides
    };
    return this.normalizeConveyorCell(cell);
  }

  isConveyorTile(tile) {
    return !!(tile && (
      tile.type === CONFIG.TILE_TYPES.CONVEYOR_1 ||
      tile.type === CONFIG.TILE_TYPES.CONVEYOR_2
    ));
  }

  /**
   * RoboRally: curve tiles rotate when a conveyor moves you onto them.
   * Legacy `turn` = inbound travel direction; `dir` = exit direction.
   */
  normalizeConveyorCell(cell) {
    if (!cell || !this.isConveyorTile(cell)) return cell;

    if (cell.curve === 'cw' || cell.curve === 'ccw') {
      if (cell.curveFrom == null && cell.turn != null) cell.curveFrom = cell.turn;
      return cell;
    }

    if (cell.turn != null && cell.turn !== undefined) {
      const from = cell.turn;
      const exit = cell.dir;
      if ((from + 1) % 4 === exit) {
        cell.curve = 'cw';
        cell.curveFrom = from;
      } else if ((from + 3) % 4 === exit) {
        cell.curve = 'ccw';
        cell.curveFrom = from;
      } else {
        cell.curve = null;
        cell.curveFrom = null;
      }
    }
    return cell;
  }

  conveyorCurveBetween(fromDir, exitDir) {
    if ((fromDir + 1) % 4 === exitDir) return 'cw';
    if ((fromDir + 3) % 4 === exitDir) return 'ccw';
    return null;
  }

  createBoard(width, height, meta = {}) {
    return {
      width,
      height,
      checkpointsCount: meta.checkpointsCount || 1,
      id: meta.id || '',
      name: meta.name || 'Course',
      desc: meta.desc || '',
      grid: Array.from({ length: height }, () => (
        Array.from({ length: width }, () => this.createCell())
      ))
    };
  }

  setTiles(board, tiles = []) {
    tiles.forEach(tile => {
      const row = board.grid[tile.y];
      const current = row && row[tile.x];
      if (!current) return;
      row[tile.x] = this.createCell({
        ...current,
        ...tile,
        walls: [...current.walls]
      });
    });
  }

  addBorderWalls(board) {
    for (let x = 0; x < board.width; x++) {
      this.addWall(board, x, 0, CONFIG.DIRECTIONS.NORTH);
      this.addWall(board, x, board.height - 1, CONFIG.DIRECTIONS.SOUTH);
    }
    for (let y = 0; y < board.height; y++) {
      this.addWall(board, 0, y, CONFIG.DIRECTIONS.WEST);
      this.addWall(board, board.width - 1, y, CONFIG.DIRECTIONS.EAST);
    }
  }

  addRectangleWalls(board, left, top, right, bottom) {
    for (let x = left; x <= right; x++) {
      this.addWall(board, x, top, CONFIG.DIRECTIONS.NORTH);
      this.addWall(board, x, bottom, CONFIG.DIRECTIONS.SOUTH);
    }
    for (let y = top; y <= bottom; y++) {
      this.addWall(board, left, y, CONFIG.DIRECTIONS.WEST);
      this.addWall(board, right, y, CONFIG.DIRECTIONS.EAST);
    }
  }

  addWalls(board, walls = []) {
    walls.forEach(([x, y, dir]) => this.addWall(board, x, y, dir));
  }

  addWall(board, x, y, dir) {
    const tile = board.grid[y] && board.grid[y][x];
    if (!tile) return;
    tile.walls[dir] = true;
    const nx = x + [0, 1, 0, -1][dir];
    const ny = y + [-1, 0, 1, 0][dir];
    const other = board.grid[ny] && board.grid[ny][nx];
    if (other) {
      other.walls[(dir + 2) % 4] = true;
    }
  }

  removeWall(board, x, y, dir) {
    const tile = board.grid[y] && board.grid[y][x];
    if (!tile) return;
    tile.walls[dir] = false;
    const nx = x + [0, 1, 0, -1][dir];
    const ny = y + [-1, 0, 1, 0][dir];
    const other = board.grid[ny] && board.grid[ny][nx];
    if (other) {
      other.walls[(dir + 2) % 4] = false;
    }
  }

  emitStateChange() {
    if (this.onStateChange) this.onStateChange();
  }

  pushLog(message) {
    this.actionLog.unshift(message);
    this.actionLog = this.actionLog.slice(0, 14);
    if (this.onLogMessage) this.onLogMessage(message);
  }

  getStartTiles(course) {
    const starts = [];
    for (let y = 0; y < course.height; y++) {
      for (let x = 0; x < course.width; x++) {
        const tile = course.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.START) {
          starts.push({ x, y, startId: tile.startId || 0 });
        }
      }
    }
    return starts.sort((a, b) => a.startId - b.startId);
  }

  createRobot(base) {
    const colors = typeof StorageManager !== 'undefined' && StorageManager.makeColors
      ? StorageManager.makeColors(StorageManager.getPlayerColor(base))
      : (base.colors || { head: '#00ffff', body: '#00ffff', legs: '#00ffff' });
    return {
      id: base.id,
      name: base.name,
      color: colors.head,
      colors,
      style: base.style || 'scout',
      x: base.x,
      y: base.y,
      dir: base.dir != null ? base.dir : CONFIG.DIRECTIONS.EAST,
      archiveX: base.x,
      archiveY: base.y,
      hp: 9,
      maxHp: 9,
      damage: 0,
      lives: base.lives != null ? base.lives : this.startingLives,
      checkpoint: 1,
      energy: CONFIG.STARTING_ENERGY,
      hand: [],
      registers: [null, null, null, null, null],
      upgrades: [],
      pendingPowerDown: false,
      shutdownActive: false,
      roundShieldCharges: 0,
      roundBoardShieldUsed: false,
      needsRespawn: false,
      eliminated: false,
      isBot: !!base.isBot
    };
  }

  isRobotInGame(robot) {
    return !!(robot && !robot.eliminated);
  }

  isRobotOnBoard(robot) {
    return !!(robot && !robot.eliminated && robot.x >= 0 && robot.y >= 0);
  }

  resolveStartPosition(starts, index) {
    if (starts[index]) return starts[index];
    const base = starts[0] || { x: 1, y: 1 };
    return {
      x: Math.min(this.board.width - 1, base.x + (index % 3)),
      y: Math.min(this.board.height - 1, base.y + Math.floor(index / 3))
    };
  }

  serializeBoard(board = this.board) {
    if (!board) return null;
    return {
      id: board.id,
      name: board.name,
      desc: board.desc,
      width: board.width,
      height: board.height,
      checkpointsCount: board.checkpointsCount,
      difficulty: board.difficulty || 'normal',
      startEdge: board.startEdge || 'south',
      startFaceDir: board.startFaceDir != null ? board.startFaceDir : CONFIG.DIRECTIONS.NORTH,
      grid: board.grid.map(row => row.map(cell => ({
        type: cell.type,
        dir: cell.dir,
        num: cell.num,
        turn: cell.turn,
        curve: cell.curve,
        curveFrom: cell.curveFrom,
        startId: cell.startId,
        laserPower: cell.laserPower,
        walls: [...(cell.walls || [false, false, false, false])]
      })))
    };
  }

  deserializeBoard(data) {
    if (!data || !data.grid) return null;
    const board = this.createBoard(data.width, data.height, {
      id: data.id || `random_${Date.now()}`,
      name: data.name || 'Random Rally',
      desc: data.desc || 'Gegenereerd parcours',
      checkpointsCount: data.checkpointsCount || 3
    });
    board.difficulty = data.difficulty || 'normal';
    board.startEdge = data.startEdge || 'south';
    board.startFaceDir = data.startFaceDir != null ? data.startFaceDir : CONFIG.DIRECTIONS.NORTH;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const src = data.grid[y] && data.grid[y][x];
        if (!src) continue;
        board.grid[y][x] = this.createCell({
          type: src.type,
          dir: src.dir,
          num: src.num,
          turn: src.turn,
          curve: src.curve,
          curveFrom: src.curveFrom,
          startId: src.startId,
          laserPower: src.laserPower,
          walls: [...(src.walls || [false, false, false, false])]
        });
      }
    }
    return board;
  }

  createRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Place exactly `count` start tiles in a consecutive line on one board edge. */
  placeEdgeStarts(board, count, edge, rng = Math.random) {
    const w = board.width;
    const h = board.height;
    const n = Math.max(1, Math.min(CONFIG.MAX_PLAYERS, count));
    const positions = [];
    let faceDir = CONFIG.DIRECTIONS.NORTH;

    if (edge === 'north' || edge === 'south') {
      const y = edge === 'south' ? h - 1 : 0;
      const startX = Math.max(0, Math.min(w - n, Math.floor((w - n) / 2)));
      faceDir = edge === 'south' ? CONFIG.DIRECTIONS.NORTH : CONFIG.DIRECTIONS.SOUTH;
      for (let i = 0; i < n; i++) {
        positions.push({ x: startX + i, y, startId: i + 1 });
      }
    } else {
      const x = edge === 'west' ? 0 : w - 1;
      const startY = Math.max(0, Math.min(h - n, Math.floor((h - n) / 2)));
      faceDir = edge === 'west' ? CONFIG.DIRECTIONS.EAST : CONFIG.DIRECTIONS.WEST;
      for (let i = 0; i < n; i++) {
        positions.push({ x, y: startY + i, startId: i + 1 });
      }
    }

    // Clear previous starts
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tile = board.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.START) {
          tile.type = CONFIG.TILE_TYPES.FLOOR;
          tile.startId = 0;
        }
      }
    }

    positions.forEach(pos => {
      board.grid[pos.y][pos.x] = this.createCell({
        type: CONFIG.TILE_TYPES.START,
        startId: pos.startId,
        walls: [...board.grid[pos.y][pos.x].walls]
      });
    });

    board.startEdge = edge;
    board.startFaceDir = faceDir;
    return { positions, faceDir, edge };
  }

  isNearStart(board, x, y, radius = 1) {
    const starts = this.getStartTiles(board);
    return starts.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) <= radius);
  }

  isNearCheckpoint(board, x, y, radius = 1) {
    for (let cy = 0; cy < board.height; cy++) {
      for (let cx = 0; cx < board.width; cx++) {
        const tile = board.grid[cy][cx];
        if (tile.type !== CONFIG.TILE_TYPES.CHECKPOINT) continue;
        if (Math.abs(cx - x) + Math.abs(cy - y) <= radius) return true;
      }
    }
    return false;
  }

  /**
   * Plaats vlaggen als heen-en-weer route: progressie weg van de start,
   * maar om-en-om links/rechts (of boven/onder) zodat 1-2-3-4 niet op één lijn ligt.
   */
  placeZigzagCheckpoints(board, count, edge, rng, pickFree) {
    const width = board.width;
    const height = board.height;
    const placed = [];
    const minSep = Math.max(3, Math.floor(Math.min(width, height) / 4));
    // Start zigzag aan een willekeurige kant
    let side = rng() < 0.5 ? 0 : 1;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const tooClose = (x, y) => placed.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < minSep);

    const candidateAt = (i, jitter = 0) => {
      // Progressie langs de race-as (dicht bij start → ver weg)
      const t = (i + 0.35 + rng() * 0.25) / (count + 0.5);
      const progress = clamp(t + jitter * 0.08, 0.12, 0.92);
      // Laterale zigzag: afwisselend diep links / diep rechts
      const lateralBase = side === 0
        ? 0.12 + rng() * 0.22
        : 0.66 + rng() * 0.22;
      const lateral = clamp(lateralBase + jitter * 0.1, 0.08, 0.92);

      let x;
      let y;
      if (edge === 'south') {
        // Start zuid → race naar noord (y daalt), zigzag op x
        y = clamp(Math.floor((height - 2) * (1 - progress)), 1, height - 3);
        x = clamp(Math.floor(1 + lateral * (width - 3)), 1, width - 2);
      } else if (edge === 'north') {
        y = clamp(Math.floor(1 + progress * (height - 3)), 2, height - 2);
        x = clamp(Math.floor(1 + lateral * (width - 3)), 1, width - 2);
      } else if (edge === 'west') {
        x = clamp(Math.floor(1 + progress * (width - 3)), 2, width - 2);
        y = clamp(Math.floor(1 + lateral * (height - 3)), 1, height - 2);
      } else {
        x = clamp(Math.floor((width - 2) * (1 - progress)), 1, width - 3);
        y = clamp(Math.floor(1 + lateral * (height - 3)), 1, height - 2);
      }
      return { x, y };
    };

    for (let i = 0; i < count; i++) {
      let pos = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const c = candidateAt(i, (rng() - 0.5) * attempt);
        if (board.grid[c.y][c.x].type !== CONFIG.TILE_TYPES.FLOOR) continue;
        if (this.isNearStart(board, c.x, c.y, 2)) continue;
        if (tooClose(c.x, c.y)) continue;
        pos = c;
        break;
      }
      if (!pos) {
        // Fallback: vrije cel ver van andere vlaggen
        for (let attempt = 0; attempt < 60 && !pos; attempt++) {
          const c = pickFree(i === count - 1, 2);
          if (!c) break;
          if (tooClose(c.x, c.y)) continue;
          pos = c;
        }
      }
      if (!pos) continue;

      board.grid[pos.y][pos.x] = this.createCell({
        type: CONFIG.TILE_TYPES.CHECKPOINT,
        num: i + 1,
        walls: [...board.grid[pos.y][pos.x].walls]
      });
      placed.push(pos);
      side = 1 - side;
    }

    // Zorg dat board.checkpointsCount klopt met echt geplaatste vlaggen
    board.checkpointsCount = placed.length || count;
  }

  /** True als een boardlaser vanaf (x,y) in dir een checkpoint raakt (muren stoppen de straal). */
  laserBeamHitsCheckpoint(board, x, y, dir) {
    const dx = [0, 1, 0, -1][dir];
    const dy = [-1, 0, 1, 0][dir];
    let cx = x;
    let cy = y;
    while (true) {
      const tile = board.grid[cy] && board.grid[cy][cx];
      if (tile && tile.walls && tile.walls[dir]) return false;
      cx += dx;
      cy += dy;
      if (cx < 0 || cy < 0 || cx >= board.width || cy >= board.height) return false;
      if (board.grid[cy][cx].type === CONFIG.TILE_TYPES.CHECKPOINT) return true;
    }
  }

  getDifficultyProfile(difficulty = 'normal') {
    const profiles = {
      easy: {
        label: 'Easy',
        name: 'Easy Rally',
        desc: 'Rustiger random bord: minder banden, muren, lasers en draaischijven.',
        width: 12,
        height: 12,
        checkpointsBase: 3,
        checkpointsExtraChance: 0.2,
        conveyor: [12, 22],
        conveyorPaths: [1, 2],
        gear: [0, 1],
        pit: [1, 2],
        repair: [2, 3],
        upgrade: [1, 2],
        laser: [0, 1],
        wall: [2, 5]
      },
      normal: {
        label: 'Normal',
        name: 'Random Rally',
        desc: 'Standaard random parcours voor deze sessie.',
        width: 12,
        height: 12,
        checkpointsBase: 3,
        checkpointsExtraChance: 0.45,
        conveyor: [28, 42],
        conveyorPaths: [2, 4],
        gear: [2, 3],
        pit: [3, 5],
        repair: [1, 2],
        upgrade: [2, 4],
        laser: [1, 2],
        wall: [7, 14]
      },
      hard: {
        label: 'Hard',
        name: 'Hard Rally',
        desc: 'Gevaarlijker random bord: meer banden, muren, lasers en draaischijven.',
        width: 12,
        height: 12,
        checkpointsBase: 3,
        checkpointsExtraChance: 0.75,
        conveyor: [48, 70],
        conveyorPaths: [4, 6],
        gear: [4, 6],
        pit: [5, 8],
        repair: [1, 2],
        upgrade: [4, 6],
        laser: [3, 5],
        wall: [16, 28]
      }
    };
    return profiles[difficulty] || profiles.normal;
  }

  rollRange(rng, range) {
    const min = range[0];
    const max = range[1];
    return min + Math.floor(rng() * (max - min + 1));
  }

  generateRandomBoard(slotCount, seed = Date.now(), difficulty = 'normal', checkpointsCount = null) {
    const profile = this.getDifficultyProfile(difficulty);
    const rng = this.createRng(seed);
    const width = profile.width;
    const height = profile.height;
    const flags = Math.max(
      CONFIG.MIN_CHECKPOINTS,
      Math.min(
        CONFIG.MAX_CHECKPOINTS,
        Number(checkpointsCount != null
          ? checkpointsCount
          : (profile.checkpointsBase + (rng() < profile.checkpointsExtraChance ? 1 : 0)))
      )
    );
    const board = this.createBoard(width, height, {
      id: `random_${seed}`,
      name: profile.name,
      desc: profile.desc,
      checkpointsCount: flags
    });
    board.difficulty = difficulty;
    this.addBorderWalls(board);

    const edges = ['south', 'north', 'west', 'east'];
    const edge = edges[Math.floor(rng() * edges.length)];
    const { positions: starts, faceDir } = this.placeEdgeStarts(board, slotCount, edge, rng);

    const opposite = {
      south: 'north',
      north: 'south',
      west: 'east',
      east: 'west'
    }[edge];

    const pickFree = (preferOpposite = false, avoidStartRadius = 2) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        let x;
        let y;
        if (preferOpposite) {
          if (opposite === 'north') {
            x = 1 + Math.floor(rng() * (width - 2));
            y = 1 + Math.floor(rng() * 3);
          } else if (opposite === 'south') {
            x = 1 + Math.floor(rng() * (width - 2));
            y = height - 4 + Math.floor(rng() * 3);
          } else if (opposite === 'west') {
            x = 1 + Math.floor(rng() * 3);
            y = 1 + Math.floor(rng() * (height - 2));
          } else {
            x = width - 4 + Math.floor(rng() * 3);
            y = 1 + Math.floor(rng() * (height - 2));
          }
        } else {
          x = 1 + Math.floor(rng() * (width - 2));
          y = 1 + Math.floor(rng() * (height - 2));
        }
        const tile = board.grid[y][x];
        if (tile.type !== CONFIG.TILE_TYPES.FLOOR) continue;
        if (this.isNearStart(board, x, y, avoidStartRadius)) continue;
        return { x, y };
      }
      return null;
    };

    this.placeZigzagCheckpoints(board, flags, edge, rng, pickFree);

    // Lopende banden als aaneengesloten paden met bochten (RoboRally-stijl).
    this.placeConveyorPaths(board, rng, profile, difficulty, pickFree);

    const placeType = (type, count, extra = {}) => {
      for (let i = 0; i < count; i++) {
        let pos = null;
        for (let attempt = 0; attempt < 60; attempt++) {
          const candidate = pickFree(false, type === CONFIG.TILE_TYPES.PIT ? 2 : 1);
          if (!candidate) break;
          // Geen gat naast een vlag/checkpoint
          if (type === CONFIG.TILE_TYPES.PIT && this.isNearCheckpoint(board, candidate.x, candidate.y, 1)) {
            continue;
          }
          pos = candidate;
          break;
        }
        if (!pos) break;
        board.grid[pos.y][pos.x] = this.createCell({
          type,
          dir: extra.dir != null ? extra.dir : Math.floor(rng() * 4),
          laserPower: 1,
          walls: [...board.grid[pos.y][pos.x].walls]
        });
      }
    };

    const gearTotal = this.rollRange(rng, profile.gear);
    const gearCw = Math.ceil(gearTotal / 2);
    placeType(CONFIG.TILE_TYPES.GEAR_CW, gearCw);
    placeType(CONFIG.TILE_TYPES.GEAR_CCW, Math.max(0, gearTotal - gearCw));
    placeType(CONFIG.TILE_TYPES.PIT, this.rollRange(rng, profile.pit));
    placeType(CONFIG.TILE_TYPES.REPAIR, this.rollRange(rng, profile.repair));
    placeType(CONFIG.TILE_TYPES.UPGRADE, this.rollRange(rng, profile.upgrade));

    // Muren eerst, zodat lasers erachter een vlag kunnen missen.
    // Nooit op/tegen een lopende band (addWall zet ook de overkant).
    const wallCount = this.rollRange(rng, profile.wall);
    const wallDx = [0, 1, 0, -1];
    const wallDy = [-1, 0, 1, 0];
    for (let i = 0; i < wallCount; i++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = 1 + Math.floor(rng() * (width - 2));
        const y = 1 + Math.floor(rng() * (height - 2));
        const dir = Math.floor(rng() * 4);
        if (this.isNearStart(board, x, y, 1)) continue;
        const tile = board.grid[y][x];
        if (this.isConveyorTile(tile)) continue;
        const nx = x + wallDx[dir];
        const ny = y + wallDy[dir];
        const other = board.grid[ny] && board.grid[ny][nx];
        if (other && this.isConveyorTile(other)) continue;
        this.addWall(board, x, y, dir);
        break;
      }
    }

    // Lasers: alleen plaatsen als de straal geen vlag raakt
    const laserCount = this.rollRange(rng, profile.laser);
    for (let i = 0; i < laserCount; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 80 && !placed; attempt++) {
        const pos = pickFree(false, 1);
        if (!pos) break;
        const dirs = [0, 1, 2, 3];
        for (let d = dirs.length - 1; d > 0; d--) {
          const j = Math.floor(rng() * (d + 1));
          const tmp = dirs[d];
          dirs[d] = dirs[j];
          dirs[j] = tmp;
        }
        const safeDir = dirs.find(dir => !this.laserBeamHitsCheckpoint(board, pos.x, pos.y, dir));
        if (safeDir == null) continue;
        board.grid[pos.y][pos.x] = this.createCell({
          type: CONFIG.TILE_TYPES.LASER,
          dir: safeDir,
          laserPower: difficulty === 'hard' && rng() > 0.7 ? 2 : 1,
          walls: [...board.grid[pos.y][pos.x].walls]
        });
        placed = true;
      }
    }

    board.seed = seed;
    board.startFaceDir = faceDir;
    board.startEdge = edge;
    void starts;
    return board;
  }

  /**
   * Lopende banden = aparte wegen.
   * Pipeline per pad:
   *   1) slinger-vorm (alleen vakjes)
   *   2) één rijrichting voor het hele pad
   *   3) één snelheid voor het hele pad
   * Paden delen geen vakken en raken elkaar niet (geen 1-op-2, geen haakse kruisingen).
   */
  placeConveyorPaths(board, rng, profile, difficulty, pickFree) {
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    const cellKey = (x, y) => `${x},${y}`;
    const targetTiles = this.rollRange(rng, profile.conveyor);
    const pathCount = this.rollRange(rng, profile.conveyorPaths);
    const expressChance = difficulty === 'hard' ? 0.55 : difficulty === 'easy' ? 0.12 : 0.32;
    const minPathLen = 4;
    const maxPathLen = 12;

    /** Vakken van geplande paden; andere paden mogen hier niet komen of tegenaan. */
    const roadCells = new Set();
    /** Extra buffer zodat wegen niet haaks tegen elkaar plakken. */
    const blocked = new Set();

    const hasWall = (x, y, dir) => {
      const tile = board.grid[y] && board.grid[y][x];
      return !!(tile && tile.walls && tile.walls[dir]);
    };

    const inBoundsInner = (x, y) => (
      x >= 1 && y >= 1 && x < board.width - 1 && y < board.height - 1
    );

    const isOpenFloor = (x, y) => {
      if (!inBoundsInner(x, y)) return false;
      if (roadCells.has(cellKey(x, y)) || blocked.has(cellKey(x, y))) return false;
      const tile = board.grid[y][x];
      if (tile.type !== CONFIG.TILE_TYPES.FLOOR) return false;
      if (this.isNearStart(board, x, y, 1)) return false;
      return true;
    };

    const canStep = (x, y, dir) => {
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      if (!isOpenFloor(nx, ny)) return false;
      if (hasWall(x, y, dir) || hasWall(nx, ny, (dir + 2) % 4)) return false;
      return true;
    };

    const dirBetween = (a, b) => {
      for (let d = 0; d < 4; d++) {
        if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d;
      }
      return null;
    };

    const touchesOwnPath = (x, y, path, allow) => {
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (allow && nx === allow.x && ny === allow.y) continue;
        if (path.some(c => c.x === nx && c.y === ny)) return true;
      }
      return false;
    };

    const runwayLength = (x, y, dir, limit = 14) => {
      let len = 0;
      let cx = x;
      let cy = y;
      while (len < limit && canStep(cx, cy, dir)) {
        cx += DX[dir];
        cy += DY[dir];
        if (touchesOwnPath(cx, cy, [], null)) break;
        len += 1;
      }
      return len;
    };

    /** Fase 1: bedenk een slingerpad (alleen coördinaten). */
    const planWindingShape = (wantLen) => {
      let start = null;
      let facing = null;

      for (let tryStart = 0; tryStart < 28; tryStart++) {
        const candidate = pickFree(false, 2);
        if (!candidate || !isOpenFloor(candidate.x, candidate.y)) continue;

        let bestDir = null;
        let bestRun = 0;
        for (let dir = 0; dir < 4; dir++) {
          if (!canStep(candidate.x, candidate.y, dir)) continue;
          const run = runwayLength(candidate.x, candidate.y, dir);
          if (run > bestRun) {
            bestRun = run;
            bestDir = dir;
          }
        }
        if (bestDir != null && bestRun >= minPathLen - 1) {
          start = candidate;
          facing = bestDir;
          break;
        }
      }
      if (!start || facing == null) return null;

      const path = [{ x: start.x, y: start.y }];
      let x = start.x;
      let y = start.y;
      let dir = facing;
      // Slinger: eerst een stuk rechtdoor, dan bocht, herhaal.
      let straightLeft = 2 + Math.floor(rng() * 3); // 2–4

      while (path.length < wantLen) {
        const preferTurn = straightLeft <= 0;
        const candidates = [];

        const pushUnique = (d) => {
          if (d == null || candidates.includes(d)) return;
          if (!canStep(x, y, d)) return;
          const nx = x + DX[d];
          const ny = y + DY[d];
          // Geen zelf-aanraking (behalve voorganger) → echte weg i.p.v. klonter
          if (touchesOwnPath(nx, ny, path, { x, y })) return;
          candidates.push(d);
        };

        if (!preferTurn) pushUnique(dir);

        const turnOrder = rng() < 0.5 ? [1, 3] : [3, 1];
        turnOrder.forEach(t => pushUnique((dir + t) % 4));
        pushUnique(dir);

        if (!candidates.length) break;

        let nextDir = candidates[0];
        // Bij voorkeur bocht: kies een echte bocht als die bestaat
        if (preferTurn) {
          const turnPick = candidates.find(d => d !== dir);
          if (turnPick != null) nextDir = turnPick;
        }

        const nx = x + DX[nextDir];
        const ny = y + DY[nextDir];
        path.push({ x: nx, y: ny });

        if (nextDir !== dir) {
          straightLeft = 2 + Math.floor(rng() * 3);
        } else {
          straightLeft -= 1;
        }
        dir = nextDir;
        x = nx;
        y = ny;
      }

      if (path.length < minPathLen) return null;

      // Pad moet een echte keten zijn (orthogonaal aaneengesloten)
      for (let i = 0; i < path.length - 1; i++) {
        if (dirBetween(path[i], path[i + 1]) == null) return null;
      }
      return path;
    };

    /** Fase 2: één rijrichting voor het hele pad → exitDir per vak. */
    const assignPathDirection = (shape) => {
      const ordered = rng() < 0.5 ? shape.slice() : shape.slice().reverse();
      const directed = [];
      for (let i = 0; i < ordered.length; i++) {
        let exitDir;
        if (i < ordered.length - 1) {
          exitDir = dirBetween(ordered[i], ordered[i + 1]);
        } else {
          exitDir = directed[i - 1].exitDir;
        }
        if (exitDir == null) return null;
        directed.push({ x: ordered[i].x, y: ordered[i].y, exitDir });
      }

      for (let i = 0; i < directed.length - 1; i++) {
        const a = directed[i];
        const b = directed[i + 1];
        if (a.x + DX[a.exitDir] !== b.x || a.y + DY[a.exitDir] !== b.y) {
          return null;
        }
      }
      return directed;
    };

    /** Fase 3: één snelheid voor het hele pad. */
    const assignPathSpeed = (directed) => {
      if (directed.length >= 5 && rng() < expressChance) {
        return CONFIG.TILE_TYPES.CONVEYOR_2;
      }
      return CONFIG.TILE_TYPES.CONVEYOR_1;
    };

    const reserveRoad = (shape) => {
      shape.forEach(cell => {
        roadCells.add(cellKey(cell.x, cell.y));
        // 1 vak buffer rond de weg zodat andere paden er niet tegenaan plakken
        for (let d = 0; d < 4; d++) {
          blocked.add(cellKey(cell.x + DX[d], cell.y + DY[d]));
        }
      });
    };

    const placeDirectedPath = (directed, type) => {
      directed.forEach((cell, index) => {
        const prev = index > 0 ? directed[index - 1] : null;
        const entryDir = prev ? prev.exitDir : null;
        const curve = entryDir != null
          ? this.conveyorCurveBetween(entryDir, cell.exitDir)
          : null;
        const current = board.grid[cell.y][cell.x];
        board.grid[cell.y][cell.x] = this.createCell({
          type,
          dir: cell.exitDir,
          curve,
          curveFrom: curve ? entryDir : null,
          turn: curve ? entryDir : null,
          walls: [...current.walls]
        });
      });
    };

    // Verdeel het tegelbudget over het aantal wegen
    const budgets = [];
    let remainingBudget = targetTiles;
    for (let i = 0; i < pathCount; i++) {
      const pathsLeft = pathCount - i;
      if (pathsLeft === 1) {
        budgets.push(Math.max(minPathLen, Math.min(maxPathLen, remainingBudget)));
        break;
      }
      const fair = Math.floor(remainingBudget / pathsLeft);
      const jitter = Math.floor(rng() * 5) - 2;
      let len = Math.max(minPathLen, Math.min(maxPathLen, fair + jitter));
      const minForRest = minPathLen * (pathsLeft - 1);
      if (remainingBudget - len < minForRest) {
        len = Math.max(minPathLen, remainingBudget - minForRest);
      }
      budgets.push(len);
      remainingBudget -= len;
    }

    let placedTiles = 0;
    budgets.forEach(wantLen => {
      if (placedTiles + minPathLen > targetTiles) return;
      const goal = Math.min(wantLen, targetTiles - placedTiles);

      let shape = null;
      for (let attempt = 0; attempt < 20 && !shape; attempt++) {
        shape = planWindingShape(goal);
        // Kortere fallback als lange weg niet past
        if (!shape && goal > minPathLen) {
          shape = planWindingShape(Math.max(minPathLen, goal - 2 - attempt));
        }
      }
      if (!shape) return;

      const directed = assignPathDirection(shape);
      if (!directed) return;

      const type = assignPathSpeed(directed);
      placeDirectedPath(directed, type);
      reserveRoad(shape);
      placedTiles += directed.length;
    });

    this.sanitizeConveyorCurves(board);
    this.pruneTinyConveyors(board);
  }

  /**
   * Een bocht telt alleen als een naburig bandvak van hetzelfde type
   * met zijn uitgang op dit vak wijst (geen kruising 1↔2).
   */
  hasIncomingConveyor(board, x, y, sameType = null) {
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    for (let fromDir = 0; fromDir < 4; fromDir++) {
      const sx = x - dx[fromDir];
      const sy = y - dy[fromDir];
      if (sx < 0 || sy < 0 || sx >= board.width || sy >= board.height) continue;
      const src = board.grid[sy][sx];
      if (!this.isConveyorTile(src)) continue;
      if (sameType != null && src.type !== sameType) continue;
      if (src.dir === fromDir) return fromDir;
    }
    return null;
  }

  sanitizeConveyorCurves(board) {
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const tile = board.grid[y][x];
        if (!this.isConveyorTile(tile)) continue;

        const incoming = this.hasIncomingConveyor(board, x, y, tile.type);
        if (incoming == null) {
          // Start van een band: geen bocht
          tile.curve = null;
          tile.curveFrom = null;
          tile.turn = null;
          continue;
        }

        // Bocht alleen als uitgang ≠ inkomende richting
        const curve = this.conveyorCurveBetween(incoming, tile.dir);
        tile.curve = curve;
        tile.curveFrom = curve ? incoming : null;
        tile.turn = curve ? incoming : null;
      }
    }
  }

  /** Verwijder express-vakjes die niet in een band van ≥4 zitten, en normale < 2. */
  pruneTinyConveyors(board) {
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const key = (x, y) => `${x},${y}`;
    const visited = new Set();

    const componentOf = (sx, sy) => {
      const startType = board.grid[sy][sx].type;
      const stack = [[sx, sy]];
      const cells = [];
      const seen = new Set([key(sx, sy)]);
      while (stack.length) {
        const [x, y] = stack.pop();
        cells.push({ x, y });
        const tile = board.grid[y][x];
        // Volg uitgang
        const nx = x + dx[tile.dir];
        const ny = y + dy[tile.dir];
        if (
          nx >= 0 && ny >= 0 && nx < board.width && ny < board.height &&
          this.isConveyorTile(board.grid[ny][nx]) &&
          board.grid[ny][nx].type === startType &&
          !seen.has(key(nx, ny))
        ) {
          // Alleen volgen als dit vak ook echt door de uitgang bereikt wordt
          seen.add(key(nx, ny));
          stack.push([nx, ny]);
        }
        // Volg ingang (omgekeerd)
        for (let dir = 0; dir < 4; dir++) {
          const px = x - dx[dir];
          const py = y - dy[dir];
          if (px < 0 || py < 0 || px >= board.width || py >= board.height) continue;
          const src = board.grid[py][px];
          if (!this.isConveyorTile(src) || src.type !== startType) continue;
          if (src.dir !== dir) continue;
          if (seen.has(key(px, py))) continue;
          seen.add(key(px, py));
          stack.push([px, py]);
        }
      }
      return cells;
    };

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (!this.isConveyorTile(board.grid[y][x])) continue;
        if (visited.has(key(x, y))) continue;
        const cells = componentOf(x, y);
        cells.forEach(c => visited.add(key(c.x, c.y)));
        const type = board.grid[y][x].type;
        const minSize = type === CONFIG.TILE_TYPES.CONVEYOR_2 ? 4 : 3;
        if (cells.length < minSize) {
          cells.forEach(c => {
            const walls = [...board.grid[c.y][c.x].walls];
            board.grid[c.y][c.x] = this.createCell({ walls });
          });
        }
      }
    }
  }

  getSlotCount(gameMode, playerCount) {
    const isVsAi = gameMode === CONFIG.GAME_MODES.VS_AI;
    if (isVsAi) return 2;
    return Math.max(CONFIG.MIN_HOTSEAT_PLAYERS, Math.min(CONFIG.MAX_PLAYERS, Number(playerCount) || 2));
  }

  exportGameState() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      registerIndex: this.registerIndex,
      programmingPlayerIndex: this.programmingPlayerIndex,
      winnerId: this.winner ? this.winner.id : null,
      actionLog: [...(this.actionLog || [])],
      currentCourseId: this.currentCourseId,
      gameMode: this.gameMode,
      playerCount: this.playerCount,
      committedRobotIds: [...(this.committedRobotIds || [])],
      rngSeed: this.rngSeed,
      pendingUpgradeQueue: (this.pendingUpgradeQueue || []).map(entry => ({ ...entry })),
      currentUpgradeChoice: this.currentUpgradeChoice
        ? {
            robotId: this.currentUpgradeChoice.robotId,
            options: (this.currentUpgradeChoice.options || []).map(up => up.id)
          }
        : null,
      robots: this.robots.map(robot => ({
        id: robot.id,
        name: robot.name,
        colors: { ...robot.colors },
        style: robot.style,
        matrixUserId: robot.matrixUserId || null,
        x: robot.x,
        y: robot.y,
        dir: robot.dir,
        archiveX: robot.archiveX,
        archiveY: robot.archiveY,
        hp: robot.hp,
        maxHp: robot.maxHp,
        damage: robot.damage,
        lives: robot.lives,
        checkpoint: robot.checkpoint,
        energy: robot.energy,
        hand: (robot.hand || []).map(card => ({ ...card })),
        registers: (robot.registers || []).map(card => (card ? { ...card } : null)),
        upgrades: (robot.upgrades || []).map(upgrade => upgrade.id),
        pendingPowerDown: !!robot.pendingPowerDown,
        shutdownActive: !!robot.shutdownActive,
        roundShieldCharges: Math.max(0, robot.roundShieldCharges || 0),
        roundBoardShieldUsed: !!robot.roundBoardShieldUsed,
        needsRespawn: !!robot.needsRespawn,
        eliminated: !!robot.eliminated,
        isBot: !!robot.isBot,
        committed: !!(this.committedRobotIds || []).includes(robot.id)
      }))
    };
  }

  importGameState(state) {
    if (!state || !Array.isArray(state.robots)) return false;
    this.phase = state.phase || 'programming';
    this.roundNumber = state.roundNumber || 1;
    this.registerIndex = state.registerIndex || 0;
    this.programmingPlayerIndex = state.programmingPlayerIndex || 0;
    this.actionLog = Array.isArray(state.actionLog) ? state.actionLog : [];
    this.activeRegisterCards = [];
    this.lastLaserBursts = [];
    this.committedRobotIds = Array.isArray(state.committedRobotIds) ? [...state.committedRobotIds] : [];
    if (state.rngSeed != null) this.setRngSeed(state.rngSeed);
    this.pendingUpgradeQueue = Array.isArray(state.pendingUpgradeQueue)
      ? state.pendingUpgradeQueue.map(entry => ({ ...entry }))
      : [];
    this.currentUpgradeChoice = null;

    this.robots = state.robots.map(raw => {
      const robot = this.createRobot({
        id: raw.id,
        name: raw.name,
        colors: raw.colors,
        style: raw.style,
        x: raw.x,
        y: raw.y,
        dir: raw.dir,
        isBot: raw.isBot
      });
      robot.matrixUserId = raw.matrixUserId || null;
      robot.archiveX = raw.archiveX;
      robot.archiveY = raw.archiveY;
      robot.hp = raw.hp;
      robot.maxHp = raw.maxHp;
      robot.damage = raw.damage;
      robot.lives = raw.lives;
      robot.checkpoint = raw.checkpoint;
      robot.energy = raw.energy;
      robot.hand = Array.isArray(raw.hand) ? raw.hand.map(card => ({ ...card })) : [];
      robot.registers = Array.isArray(raw.registers)
        ? raw.registers.map(card => (card ? { ...card } : null))
        : [null, null, null, null, null];
      robot.upgrades = (raw.upgrades || [])
        .map(id => CONFIG.UPGRADES.find(upgrade => upgrade.id === id))
        .filter(Boolean);
      robot.pendingPowerDown = !!raw.pendingPowerDown;
      robot.shutdownActive = !!raw.shutdownActive;
      robot.roundShieldCharges = raw.roundShieldCharges != null
        ? Math.max(0, Number(raw.roundShieldCharges) || 0)
        : (raw.roundShieldUsed ? 1 : 0);
      robot.roundBoardShieldUsed = !!raw.roundBoardShieldUsed;
      robot.needsRespawn = !!raw.needsRespawn;
      robot.eliminated = !!raw.eliminated;
      this.refreshRobotStats(robot);
      return robot;
    });

    if (state.currentUpgradeChoice?.robotId) {
      const options = (state.currentUpgradeChoice.options || [])
        .map(id => CONFIG.UPGRADES.find(upgrade => upgrade.id === id))
        .filter(Boolean);
      this.currentUpgradeChoice = {
        robotId: state.currentUpgradeChoice.robotId,
        options
      };
    }

    this.winner = state.winnerId
      ? this.robots.find(robot => robot.id === state.winnerId) || null
      : null;
    return true;
  }

  loadCourse(courseId, players, gameMode = CONFIG.GAME_MODES.HOTSEAT, playerCount = 2, boardData = null, options = {}) {
    const startRound = options.startRound !== false;
    this.startingLives = typeof StorageManager !== 'undefined' && StorageManager.clampStartingLives
      ? StorageManager.clampStartingLives(options.startingLives)
      : Math.max(3, Math.min(6, Number(options.startingLives) || CONFIG.DEFAULT_STARTING_LIVES || 3));
    this.currentCourseId = courseId || (boardData && boardData.id) || 'random';
    this.gameMode = gameMode === 'hotseat_2p' ? CONFIG.GAME_MODES.HOTSEAT : gameMode;
    this.phase = 'programming';
    this.roundNumber = 1;
    this.registerIndex = 0;
    this.programmingPlayerIndex = 0;
    this.winner = null;
    this.activeRegisterCards = [];
    this.actionLog = [];
    this.lastLaserBursts = [];
    this.pendingUpgradeQueue = [];
    this.currentUpgradeChoice = null;
    this.committedRobotIds = [];
    if (options.rngSeed != null) this.setRngSeed(options.rngSeed);
    else if (this.isMatrixMode()) this.setRngSeed(Date.now());

    const roster = Array.isArray(players) && players.length
      ? players
      : StorageManager.loadPlayers();
    const isVsAi = this.gameMode === CONFIG.GAME_MODES.VS_AI;
    const isMatrix = this.gameMode === CONFIG.GAME_MODES.MATRIX;
    const humanCount = isVsAi
      ? 1
      : Math.max(
        isMatrix ? (CONFIG.MATRIX?.MIN_PLAYERS || 2) : CONFIG.MIN_HOTSEAT_PLAYERS,
        Math.min(CONFIG.MAX_PLAYERS, Number(playerCount) || roster.length || 2)
      );
    this.playerCount = humanCount;
    const slotCount = this.getSlotCount(this.gameMode, humanCount);

    if (boardData) {
      this.board = this.deserializeBoard(boardData);
    } else if (this.courses[courseId]) {
      // Clone preset and rebuild starts for this player count
      this.board = this.deserializeBoard(this.serializeBoard(this.courses[courseId]));
      const edge = this.board.startEdge || 'south';
      this.placeEdgeStarts(this.board, slotCount, edge);
    } else {
      this.board = this.generateRandomBoard(slotCount);
      this.currentCourseId = this.board.id;
    }

    // Ensure only the right number of start labels exist
    this.placeEdgeStarts(this.board, slotCount, this.board.startEdge || 'south');
    const starts = this.getStartTiles(this.board);
    const faceDir = this.board.startFaceDir != null ? this.board.startFaceDir : CONFIG.DIRECTIONS.NORTH;

    this.robots = [];
    for (let i = 0; i < humanCount; i++) {
      const profile = roster[i] || CONFIG.DEFAULT_PLAYERS[i] || CONFIG.DEFAULT_PLAYERS[0];
      const start = this.resolveStartPosition(starts, i);
      const robot = this.createRobot({
        id: profile.robotId || `player_${i + 1}`,
        name: profile.name || `Speler ${i + 1}`,
        colors: StorageManager.makeColors(StorageManager.getPlayerColor(profile)),
        style: profile.style || 'scout',
        x: start.x,
        y: start.y,
        dir: faceDir,
        isBot: false
      });
      robot.matrixUserId = profile.matrixUserId || profile.userId || null;
      this.robots.push(robot);
    }

    if (isVsAi) {
      const botStart = this.resolveStartPosition(starts, 1);
      this.robots.push(this.createRobot({
        id: 'cpu_bot',
        name: 'CPU Bot',
        colors: StorageManager.makeColors('#ff5555'),
        style: 'tank',
        x: botStart.x,
        y: botStart.y,
        dir: faceDir,
        isBot: true
      }));
    }

    this.pushLog(`${this.board.name} geladen · ${this.robots.filter(r => !r.isBot).length} spelers · starts aan de ${this.board.startEdge || 'rand'}.`);
    if (startRound) {
      this.startNewRound();
    }
  }

  refreshRobotStats(robot) {
    robot.damage = Math.max(0, Math.min(robot.damage || 0, robot.maxHp));
    robot.hp = Math.max(0, robot.maxHp - robot.damage);
  }

  hasUpgrade(robot, upgradeId) {
    return this.countUpgrade(robot, upgradeId) > 0;
  }

  countUpgrade(robot, upgradeId) {
    return (robot.upgrades || []).filter(upgrade => upgrade.id === upgradeId).length;
  }

  isUpgradeStackable(upgradeId) {
    const def = CONFIG.UPGRADES.find(entry => entry.id === upgradeId);
    return !!(def && def.stackable);
  }

  canGainUpgrade(robot, upgradeId) {
    if (!robot || !upgradeId) return false;
    if ((robot.upgrades || []).length >= CONFIG.MAX_UPGRADES) return false;
    if (this.isUpgradeStackable(upgradeId)) return true;
    return !this.hasUpgrade(robot, upgradeId);
  }

  getAvailableUpgrades(robot) {
    return CONFIG.UPGRADES.filter(upgrade => this.canGainUpgrade(robot, upgrade.id));
  }

  getHandSize(robot) {
    const memoryBonus = this.countUpgrade(robot, 'memoryBank');
    return Math.max(
      CONFIG.MIN_HAND_SIZE || 0,
      CONFIG.DEFAULT_HAND_SIZE - (robot.damage || 0) + memoryBonus
    );
  }

  /** Aantal registers dat je deze ronde mag (her)programmeren. */
  getUnlockedRegisterCount(robot) {
    return Math.min(5, this.getHandSize(robot));
  }

  isRegisterLocked(robot, index) {
    return index >= this.getUnlockedRegisterCount(robot);
  }

  getCardPoolForRobot(robot) {
    const pool = [...CONFIG.CARD_TYPES];
    const bonus = CONFIG.UPGRADE_CARD_TYPES || {};
    Object.keys(bonus).forEach(upgradeId => {
      if (!this.hasUpgrade(robot, upgradeId)) return;
      (bonus[upgradeId] || []).forEach(cardType => pool.push(cardType));
    });
    return pool;
  }

  generateProgramCard(robot = null) {
    const pool = robot ? this.getCardPoolForRobot(robot) : CONFIG.CARD_TYPES;
    const roll = this.isMatrixMode() ? this.rng() : Math.random();
    const cardType = pool[Math.floor(roll * pool.length)];
    const idRoll = this.isMatrixMode() ? this.rng() : Math.random();
    const prioRoll = this.isMatrixMode() ? this.rng() : Math.random();
    return {
      id: `card_${idRoll.toString(36).slice(2, 10)}`,
      type: cardType.type,
      label: cardType.label,
      icon: cardType.icon,
      priority: cardType.priorityBase + Math.floor(prioRoll * 50)
    };
  }

  generateHand(robot) {
    const hand = [];
    const handSize = this.getHandSize(robot);
    for (let i = 0; i < handSize; i++) {
      hand.push(this.generateProgramCard(robot));
    }
    return hand.sort((a, b) => b.priority - a.priority);
  }

  startNewRound() {
    this.phase = 'programming';
    this.registerIndex = 0;
    this.activeRegisterCards = [];
    this.lastLaserBursts = [];
    this.pendingUpgradeQueue = [];
    this.currentUpgradeChoice = null;
    this.committedRobotIds = [];

    // Respawn na dood pas aan het begin van de volgende ronde (met 2 schade).
    this.respawnPendingRobots();

    this.robots.forEach(robot => {
      if (!this.isRobotInGame(robot)) return;
      const previousRegisters = (robot.registers || []).map(card => (card ? { ...card } : null));
      robot.hand = [];
      robot.roundShieldCharges = this.countUpgrade(robot, 'deflectorShield');
      robot.roundBoardShieldUsed = false;
      robot.shutdownActive = !!robot.pendingPowerDown;
      robot.pendingPowerDown = false;

      if (robot.shutdownActive) {
        robot.damage = 0;
        robot.registers = [null, null, null, null, null];
        this.refreshRobotStats(robot);
        this.pushLog(`${robot.name} gaat in power down en herstelt volledig.`);
        return;
      }

      const repairAmount = Math.min(robot.damage, this.countUpgrade(robot, 'repairKit'));
      if (repairAmount > 0) {
        robot.damage -= repairAmount;
        this.refreshRobotStats(robot);
        this.pushLog(`${robot.name} repareert ${repairAmount} schade via Repair Kit.`);
      }

      // RoboRally: te veel schade → laatste registers blijven vast met vorige kaart
      const unlocked = this.getUnlockedRegisterCount(robot);
      robot.registers = [0, 1, 2, 3, 4].map(i => (
        i >= unlocked ? previousRegisters[i] : null
      ));
      if (unlocked < 5) {
        const lockedNums = [0, 1, 2, 3, 4]
          .filter(i => i >= unlocked)
          .map(i => i + 1)
          .join(', ');
        this.pushLog(`${robot.name}: register ${lockedNums} vast door schade (${robot.damage}).`);
      }

      robot.hand = this.generateHand(robot);
      if (robot.isBot) {
        RobotRallyAI.programBotRegisters(robot, this);
        if (this.isSimultaneousProgramming()) {
          this.committedRobotIds.push(robot.id);
        }
      }
    });

    const firstHuman = this.getNextProgrammableHuman(-1);
    if (firstHuman === -1) {
      this.phase = 'executing';
      this.programmingPlayerIndex = 0;
      this.pushLog(`Ronde ${this.roundNumber}: geen actieve programmeur, registers starten direct.`);
    } else {
      this.programmingPlayerIndex = firstHuman;
      this.pushLog(
        this.isSimultaneousProgramming()
          ? `Ronde ${this.roundNumber}: iedereen mag tegelijk programmeren.`
          : `Ronde ${this.roundNumber}: nieuwe kaarten gedeeld.`
      );
      if (this.isSimultaneousProgramming()) {
        this.refreshReadyPhaseFromCommits();
      }
    }

    this.emitStateChange();
  }

  getProgrammableHumans() {
    return this.robots.filter(robot => (
      robot && !robot.isBot && this.isRobotInGame(robot) && !robot.shutdownActive
    ));
  }

  isRobotCommitted(robotId) {
    return (this.committedRobotIds || []).includes(robotId);
  }

  refreshReadyPhaseFromCommits() {
    if (!this.isSimultaneousProgramming() || this.phase === 'executing' || this.phase === 'finished') {
      return;
    }
    const humans = this.getProgrammableHumans();
    if (!humans.length) {
      this.phase = 'ready';
      return;
    }
    const allReady = humans.every(robot => this.isRobotCommitted(robot.id));
    if (allReady) {
      this.phase = 'ready';
      this.registerIndex = 0;
      this.pushLog('Alle programma\'s staan klaar. Host kan Play drukken.');
    } else if (this.phase === 'ready') {
      this.phase = 'programming';
    }
  }

  commitRegistersForRobot(robotId, registers, { silent = false } = {}) {
    if (this.phase !== 'programming' && this.phase !== 'ready') return false;
    if (this.phase === 'ready' && !this.isSimultaneousProgramming()) return false;

    const robot = this.robots.find(entry => entry.id === robotId);
    if (!robot || robot.isBot || !this.isRobotInGame(robot) || robot.shutdownActive) return false;

    // Allow re-commit before Play in matrix mode by unlocking ready→programming.
    if (this.phase === 'ready' && this.isSimultaneousProgramming()) {
      this.phase = 'programming';
    }
    if (this.phase !== 'programming') return false;

    const unlocked = this.getUnlockedRegisterCount(robot);
    robot.registers = [0, 1, 2, 3, 4].map(i => {
      if (i >= unlocked) {
        return robot.registers[i] ? { ...robot.registers[i] } : null;
      }
      const card = registers && registers[i];
      return card ? { ...card } : null;
    });

    if (!this.committedRobotIds.includes(robot.id)) {
      this.committedRobotIds.push(robot.id);
    }
    if (!silent) this.pushLog(`${robot.name} heeft een programma vastgezet.`);

    if (this.isSimultaneousProgramming()) {
      this.refreshReadyPhaseFromCommits();
      this.emitStateChange();
      return true;
    }

    const index = this.robots.findIndex(entry => entry.id === robot.id);
    if (index >= 0) this.programmingPlayerIndex = index;
    const nextHuman = this.getNextProgrammableHuman(this.programmingPlayerIndex, false);
    if (this.gameMode !== CONFIG.GAME_MODES.VS_AI && nextHuman !== -1) {
      this.programmingPlayerIndex = nextHuman;
      this.emitStateChange();
      return true;
    }

    this.phase = 'ready';
    this.registerIndex = 0;
    if (!silent) this.pushLog('Alle programma\'s staan klaar. Druk op Play om de ronde te starten.');
    this.emitStateChange();
    return true;
  }

  uncommitRobot(robotId) {
    if (!this.isSimultaneousProgramming()) return false;
    if (this.phase !== 'programming' && this.phase !== 'ready') return false;
    this.committedRobotIds = (this.committedRobotIds || []).filter(id => id !== robotId);
    this.refreshReadyPhaseFromCommits();
    this.emitStateChange();
    return true;
  }

  getNextProgrammableHuman(afterIndex, wrap = true) {
    const maxSteps = wrap ? this.robots.length : Math.max(0, this.robots.length - afterIndex - 1);
    for (let step = 1; step <= maxSteps; step++) {
      const rawIndex = afterIndex + step;
      const index = wrap
        ? (rawIndex + this.robots.length) % this.robots.length
        : rawIndex;
      const robot = this.robots[index];
      if (robot && !robot.isBot && this.isRobotInGame(robot) && !robot.shutdownActive) {
        return index;
      }
    }
    return -1;
  }

  togglePowerDown(robotId) {
    if (this.phase !== 'programming') return;
    const robot = this.robots.find(entry => entry.id === robotId);
    if (!robot || !this.isRobotInGame(robot) || robot.shutdownActive) return;
    robot.pendingPowerDown = !robot.pendingPowerDown;
    this.pushLog(robot.pendingPowerDown
      ? `${robot.name} plant een power down voor de volgende ronde.`
      : `${robot.name} annuleert power down.`);
    this.emitStateChange();
  }

  buyUpgrade(robotId, upgradeId) {
    // Legacy helper — upgrades komen via upgrade-vakjes, niet via energy-shop.
    return this.applyUpgradeChoice(robotId, upgradeId);
  }

  commitCurrentPlayerRegisters(registers) {
    const currentRobot = this.robots[this.programmingPlayerIndex];
    if (!currentRobot) return;
    this.commitRegistersForRobot(currentRobot.id, registers);
  }

  startExecution() {
    if (this.phase !== 'ready') return;
    this.phase = 'executing';
    this.registerIndex = 0;
    this.lastLaserBursts = [];
    this.currentUpgradeChoice = null;
    this.pushLog('Play ingedrukt. Registers worden nu uitgevoerd.');
    this.emitStateChange();
  }

  getUpgradeOffer(robot) {
    const available = this.getAvailableUpgrades(robot);
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const roll = this.isMatrixMode() ? this.rng() : Math.random();
      const j = Math.floor(roll * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    return shuffled.slice(0, CONFIG.UPGRADE_OFFER_COUNT);
  }

  pickUpgradeForBot(robot, options) {
    const score = (upgrade) => {
      const owned = this.countUpgrade(robot, upgrade.id);
      const stackPenalty = upgrade.stackable ? owned * 2 : 0;
      switch (upgrade.id) {
        case 'repairKit': return (robot.damage >= 2 ? 12 : 6) - stackPenalty;
        case 'reinforcedHull': return (robot.maxHp < 11 ? 10 : 4) - stackPenalty;
        case 'memoryBank': return 9 - stackPenalty;
        case 'deflectorShield': return 8 - stackPenalty;
        case 'ablativeArmor': return 8;
        case 'conveyorClaws': return 7;
        case 'gyroStabilizer': return 6;
        case 'doubleLaser': return 7;
        case 'rearLaser': return 6;
        case 'softLanding': return robot.lives <= 2 ? 8 : 5;
        case 'fourthGear': return 8;
        case 'crabWalk': return 7;
        case 'reverseThruster': return 6;
        case 'ghost': return 9;
        default: return 3;
      }
    };
    return [...options].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
  }

  consolateUpgradeTile(robot, reason) {
    if (robot.damage > 0) {
      robot.damage -= 1;
      this.refreshRobotStats(robot);
      this.pushLog(`${robot.name} herstelt 1 schade op een upgrade-vak (${reason}).`);
    } else {
      this.pushLog(`${robot.name} staat op een upgrade-vak maar krijgt niets (${reason}).`);
    }
  }

  queueUpgradeChoice(robot) {
    if (!robot || !this.isRobotInGame(robot)) return;
    if (robot.upgrades.length >= CONFIG.MAX_UPGRADES) {
      this.consolateUpgradeTile(robot, 'al vol');
      return;
    }
    const options = this.getUpgradeOffer(robot);
    if (!options.length) {
      this.consolateUpgradeTile(robot, 'geen upgrades meer');
      return;
    }
    this.pendingUpgradeQueue.push({
      robotId: robot.id,
      options
    });
  }

  applyUpgradeChoice(robotId, upgradeId) {
    const robot = this.robots.find(entry => entry.id === robotId);
    const upgrade = CONFIG.UPGRADES.find(entry => entry.id === upgradeId);
    if (!robot || !upgrade || !this.canGainUpgrade(robot, upgrade.id)) return false;
    robot.upgrades.push(upgrade);

    if (upgrade.id === 'reinforcedHull') {
      robot.maxHp += 2;
      this.refreshRobotStats(robot);
    }

    const copies = this.countUpgrade(robot, upgrade.id);
    const stackNote = upgrade.stackable && copies > 1 ? ` (×${copies})` : '';
    this.pushLog(`${robot.name} krijgt upgrade: ${upgrade.short}${stackNote}.`);
    return true;
  }

  advanceUpgradeChoice() {
    while (this.pendingUpgradeQueue.length) {
      const nextChoice = this.pendingUpgradeQueue.shift();
      const robot = this.robots.find(entry => entry.id === nextChoice.robotId);
      if (!robot || !this.isRobotInGame(robot)) continue;
      if (robot.upgrades.length >= CONFIG.MAX_UPGRADES) {
        this.consolateUpgradeTile(robot, 'al vol');
        continue;
      }

      const validOptions = nextChoice.options.filter(option => this.canGainUpgrade(robot, option.id));
      if (!validOptions.length) {
        this.consolateUpgradeTile(robot, 'geen upgrades meer');
        continue;
      }

      if (robot.isBot) {
        const pick = this.pickUpgradeForBot(robot, validOptions);
        this.applyUpgradeChoice(robot.id, pick.id);
        continue;
      }

      this.currentUpgradeChoice = {
        robotId: robot.id,
        options: validOptions
      };
      this.phase = 'upgrade_choice';
      this.emitStateChange();
      return;
    }

    this.currentUpgradeChoice = null;
    this.phase = 'programming';
    this.roundNumber += 1;
    this.startNewRound();
  }

  chooseUpgrade(upgradeId) {
    if (this.phase !== 'upgrade_choice' || !this.currentUpgradeChoice) return false;
    const { robotId, options } = this.currentUpgradeChoice;
    if (!options.find(option => option.id === upgradeId)) return false;
    const applied = this.applyUpgradeChoice(robotId, upgradeId);
    if (!applied) return false;
    this.currentUpgradeChoice = null;
    this.advanceUpgradeChoice();
    return true;
  }

  executeNextRegister() {
    if (this.phase !== 'executing') return;

    if (this.registerIndex >= 5) {
      this.checkRoundEnd();
      return;
    }

    const regIdx = this.registerIndex;
    this.lastLaserBursts = [];

    // Highest priority number acts first — critical for who pushes whom.
    const actions = this.robots
      .filter(robot => this.isRobotOnBoard(robot) && !robot.shutdownActive && robot.registers[regIdx])
      .map(robot => ({ robot, card: robot.registers[regIdx] }))
      .sort((a, b) => {
        const priorityDiff = (b.card.priority || 0) - (a.card.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return String(a.robot.id).localeCompare(String(b.robot.id));
      });

    this.activeRegisterCards = actions.map(action => ({
      robotId: action.robot.id,
      robotName: action.robot.name,
      cardLabel: action.card.label,
      priority: action.card.priority
    }));

    const orderText = actions.length
      ? actions.map(action => `${action.robot.name} (${action.card.priority})`).join(' → ')
      : 'geen actieve kaarten';
    this.pushLog(`Register ${regIdx + 1}: hoogste nummer eerst — ${orderText}`);

    actions.forEach(action => {
      if (this.isRobotOnBoard(action.robot) && !action.robot.shutdownActive) {
        this.executeCardAction(action.robot, action.card);
      }
    });

    this.activateBoardElements();
    this.activateRobotLasers();
    // Checkpoints tellen pas aan het einde van de ronde (na 5 registers).

    this.registerIndex += 1;
    this.emitStateChange();
  }

  executeCardAction(robot, card) {
    this.pushLog(`${robot.name} speelt ${card.label} [${card.priority}].`);

    switch (card.type) {
      case 'move1':
        this.moveRobot(robot, robot.dir, 1, 'kaart');
        break;
      case 'move2':
        this.moveRobot(robot, robot.dir, 2, 'kaart');
        break;
      case 'move3':
        this.moveRobot(robot, robot.dir, 3, 'kaart');
        break;
      case 'move4':
        this.moveRobot(robot, robot.dir, 4, 'kaart');
        break;
      case 'backup':
        this.moveRobot(robot, (robot.dir + 2) % 4, 1, 'kaart');
        break;
      case 'backup2':
        this.moveRobot(robot, (robot.dir + 2) % 4, 2, 'kaart');
        break;
      case 'strafeL':
        this.moveRobot(robot, (robot.dir + 3) % 4, 1, 'kaart');
        break;
      case 'strafeR':
        this.moveRobot(robot, (robot.dir + 1) % 4, 1, 'kaart');
        break;
      case 'turnR':
        robot.dir = (robot.dir + 1) % 4;
        break;
      case 'turnL':
        robot.dir = (robot.dir + 3) % 4;
        break;
      case 'uturn':
        robot.dir = (robot.dir + 2) % 4;
        break;
      default:
        break;
    }
  }

  hasWallAt(x, y, dir) {
    const tile = this.board.grid[y] && this.board.grid[y][x];
    return !!(tile && tile.walls && tile.walls[dir]);
  }

  /** Muren blokkeren beweging, tenzij de robot Ghost heeft. */
  isMovementBlockedByWall(robot, x, y, dir) {
    if (robot && this.hasUpgrade(robot, 'ghost')) return false;
    return this.hasWallAt(x, y, dir);
  }

  isInsideBoard(x, y) {
    return x >= 0 && y >= 0 && x < this.board.width && y < this.board.height;
  }

  getRobotAt(x, y, excludeId = null) {
    return this.robots.find(robot => (
      robot.id !== excludeId &&
      this.isRobotOnBoard(robot) &&
      robot.x === x &&
      robot.y === y
    )) || null;
  }

  /**
   * Move a robot up to `distance` steps. Robots in the path are pushed as a chain.
   * Highest-priority mover acts first in executeNextRegister, so they get to push.
   */
  moveRobot(robot, moveDir, distance, reason = 'effect') {
    if (!this.isRobotOnBoard(robot)) return false;

    const dx = [0, 1, 0, -1][moveDir];
    const dy = [-1, 0, 1, 0][moveDir];
    let movedAny = false;

    for (let step = 0; step < distance; step++) {
      if (!this.isRobotOnBoard(robot)) return false;

      if (this.isMovementBlockedByWall(robot, robot.x, robot.y, moveDir)) {
        this.pushLog(`${robot.name} botst tegen een muur.`);
        return movedAny;
      }

      const nextX = robot.x + dx;
      const nextY = robot.y + dy;

      // Rand van het bord blokkeert (ook met Ghost); alleen pits vernietigen.
      if (!this.isInsideBoard(nextX, nextY)) {
        this.pushLog(`${robot.name} stopt aan de rand van het bord.`);
        return movedAny;
      }

      const chain = this.collectPushChain(nextX, nextY, moveDir, robot.id);
      if (chain === null) {
        this.pushLog(`${robot.name} kan niet duwen; het pad blijft geblokkeerd.`);
        return movedAny;
      }

      if (chain.length) {
        this.pushLog(`${robot.name} duwt ${chain.map(entry => entry.name).join(' + ')}.`);
        for (let i = chain.length - 1; i >= 0; i--) {
          this.displaceRobot(chain[i], moveDir, 'een duw');
        }
        if (this.getRobotAt(nextX, nextY, robot.id)) {
          this.pushLog(`${robot.name} kan niet duwen; het pad blijft geblokkeerd.`);
          return movedAny;
        }
      }

      if (!this.displaceRobot(robot, moveDir, reason)) {
        return false;
      }
      movedAny = true;
    }

    return movedAny;
  }

  /**
   * Returns robots that must be pushed (nearest → farthest), or null if blocked by a wall.
   */
  collectPushChain(startX, startY, moveDir, excludeId) {
    const dx = [0, 1, 0, -1][moveDir];
    const dy = [-1, 0, 1, 0][moveDir];
    const chain = [];
    let x = startX;
    let y = startY;

    while (this.isInsideBoard(x, y)) {
      const blocker = this.getRobotAt(x, y, excludeId);
      if (!blocker) return chain;

      chain.push(blocker);
      if (this.isMovementBlockedByWall(blocker, blocker.x, blocker.y, moveDir)) {
        return null;
      }

      x = blocker.x + dx;
      y = blocker.y + dy;
      // Van het bord duwen mag niet — behandel de rand als blokkade.
      if (!this.isInsideBoard(x, y)) return null;
    }

    return chain;
  }

  displaceRobot(robot, moveDir, reason) {
    if (!this.isRobotOnBoard(robot)) return false;

    const dx = [0, 1, 0, -1][moveDir];
    const dy = [-1, 0, 1, 0][moveDir];
    const nextX = robot.x + dx;
    const nextY = robot.y + dy;

    if (!this.isInsideBoard(nextX, nextY)) {
      return false;
    }

    robot.x = nextX;
    robot.y = nextY;

    const tile = this.board.grid[nextY][nextX];
    if (tile.type === CONFIG.TILE_TYPES.PIT) {
      this.destroyRobot(robot, reason === 'een duw' ? 'werd in een pit geduwd' : 'viel in een pit');
      return false;
    }

    return true;
  }

  applyConveyorToRobot(robot) {
    if (!this.isRobotOnBoard(robot)) return;
    const fromTile = this.board.grid[robot.y][robot.x];
    if (!this.isConveyorTile(fromTile)) return;

    const travelDir = fromTile.dir;
    const moved = this.moveRobot(robot, travelDir, 1, 'een transportband');
    if (!moved || !this.isRobotOnBoard(robot)) return;

    // RoboRally: alleen draaien als de band je óp een bochtvak zet.
    const dest = this.board.grid[robot.y][robot.x];
    if (!this.isConveyorTile(dest) || !dest.curve) return;
    if (dest.curveFrom != null && travelDir !== dest.curveFrom) return;

    if (dest.curve === 'cw') {
      robot.dir = (robot.dir + 1) % 4;
      this.pushLog(`${robot.name} draait mee met de bocht van de transportband (rechtsom).`);
    } else if (dest.curve === 'ccw') {
      robot.dir = (robot.dir + 3) % 4;
      this.pushLog(`${robot.name} draait mee met de bocht van de transportband (linksom).`);
    }
  }

  activateBoardElements() {
    const liveRobots = () => this.robots.filter(robot => this.isRobotOnBoard(robot));

    // Express eerst 1 stap, daarna alle banden 1 stap (RoboRally-timing).
    // Grijpers = −1 bandstap: sla express-stap over; snelheid-1 later ook overslaan.
    liveRobots().forEach(robot => {
      const tile = this.board.grid[robot.y][robot.x];
      if (tile.type !== CONFIG.TILE_TYPES.CONVEYOR_2) return;
      if (this.hasUpgrade(robot, 'conveyorClaws')) return;
      this.applyConveyorToRobot(robot);
    });

    liveRobots().forEach(robot => {
      const tile = this.board.grid[robot.y][robot.x];
      if (!this.isConveyorTile(tile)) return;
      if (this.hasUpgrade(robot, 'conveyorClaws') && tile.type === CONFIG.TILE_TYPES.CONVEYOR_1) return;
      this.applyConveyorToRobot(robot);
    });

    liveRobots().forEach(robot => {
      const tile = this.board.grid[robot.y][robot.x];
      if (tile.type !== CONFIG.TILE_TYPES.GEAR_CW && tile.type !== CONFIG.TILE_TYPES.GEAR_CCW) return;
      if (this.hasUpgrade(robot, 'gyroStabilizer')) {
        this.pushLog(`${robot.name} negeert de draaischijf met Gyro.`);
        return;
      }
      if (tile.type === CONFIG.TILE_TYPES.GEAR_CW) {
        robot.dir = (robot.dir + 1) % 4;
        this.pushLog(`${robot.name} draait met een tandwiel mee.`);
      } else {
        robot.dir = (robot.dir + 3) % 4;
        this.pushLog(`${robot.name} draait tegen de klok in.`);
      }
    });

    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        const tile = this.board.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.LASER) {
          this.fireLaserFrom(x, y, tile.dir, tile.laserPower || 1, 'boardlaser');
        }
      }
    }
  }

  resolveEndOfRoundTiles() {
    this.robots.forEach(robot => {
      if (!this.isRobotOnBoard(robot)) return;
      const tile = this.board.grid[robot.y] && this.board.grid[robot.y][robot.x];
      if (!tile) return;

      if (tile.type === CONFIG.TILE_TYPES.REPAIR && robot.damage > 0) {
        robot.damage -= 1;
        this.refreshRobotStats(robot);
        this.pushLog(`${robot.name} heelt 1 schade op een repair-vak.`);
      }

      if (tile.type === CONFIG.TILE_TYPES.UPGRADE) {
        this.queueUpgradeChoice(robot);
      }
    });

    // Vlaggen/checkpoints: alleen als je na alle 5 kaarten op de vlag staat.
    this.validateCheckpoints();
  }

  fireLaserFrom(startX, startY, dir, damage, reason) {
    const dx = [0, 1, 0, -1][dir];
    const dy = [-1, 0, 1, 0][dir];
    let cx = startX;
    let cy = startY;
    const burst = {
      startX,
      startY,
      endX: startX,
      endY: startY,
      dir,
      reason,
      hit: false,
      hitRobotId: null
    };

    while (true) {
      if (this.hasWallAt(cx, cy, dir)) {
        if (burst.endX !== startX || burst.endY !== startY) {
          this.lastLaserBursts.push({ ...burst });
        }
        return;
      }

      cx += dx;
      cy += dy;

      if (cx < 0 || cx >= this.board.width || cy < 0 || cy >= this.board.height) {
        if (burst.endX !== startX || burst.endY !== startY) {
          this.lastLaserBursts.push({ ...burst });
        }
        return;
      }

      burst.endX = cx;
      burst.endY = cy;

      const hitRobot = this.getRobotAt(cx, cy);
      if (hitRobot) {
        burst.hit = true;
        burst.hitRobotId = hitRobot.id;
        this.lastLaserBursts.push({ ...burst });
        this.damageRobot(hitRobot, damage, reason);
        return;
      }
    }
  }

  activateRobotLasers() {
    this.robots.forEach(robot => {
      if (!this.isRobotOnBoard(robot) || robot.shutdownActive) return;
      const laserDamage = this.hasUpgrade(robot, 'doubleLaser') ? 2 : 1;
      this.fireLaserFrom(robot.x, robot.y, robot.dir, laserDamage, 'robotlaser');
      if (this.hasUpgrade(robot, 'rearLaser')) {
        this.fireLaserFrom(robot.x, robot.y, (robot.dir + 2) % 4, laserDamage, 'robotlaser');
      }
    });
  }

  damageRobot(robot, amount, reason) {
    if (reason === 'robotlaser' && (robot.roundShieldCharges || 0) > 0) {
      robot.roundShieldCharges -= 1;
      this.pushLog(`${robot.name} blokkeert een robotlaser met Deflector Shield.`);
      return;
    }

    if (reason === 'boardlaser' && this.hasUpgrade(robot, 'ablativeArmor') && !robot.roundBoardShieldUsed) {
      robot.roundBoardShieldUsed = true;
      this.pushLog(`${robot.name} blokkeert een boardlaser met Ablative Armor.`);
      return;
    }

    robot.damage += amount;
    this.refreshRobotStats(robot);
    this.pushLog(`${robot.name} verliest ${amount} integrity door ${reason}.`);

    if (robot.hp <= 0) {
      this.destroyRobot(robot, `${reason} schade`);
    }
  }


  findRespawnPosition(baseX, baseY) {
    const candidates = [];
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        const tile = this.board.grid[y][x];
        if (tile.type === CONFIG.TILE_TYPES.PIT) continue;
        candidates.push({ x, y, dist: Math.abs(baseX - x) + Math.abs(baseY - y) });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist || a.y - b.y || a.x - b.x);
    return candidates.find(pos => !this.getRobotAt(pos.x, pos.y)) || { x: baseX, y: baseY };
  }

  destroyRobot(robot, reason) {
    if (!robot || robot.eliminated) return;
    // Al van het bord deze ronde: niet opnieuw verwerken.
    if (robot.x < 0 && robot.y < 0) return;

    // Van het bord: rest van deze ronde is voorbij voor deze speler.
    robot.x = -1;
    robot.y = -1;
    robot.shutdownActive = false;
    robot.pendingPowerDown = false;
    robot.registers = [null, null, null, null, null];

    if (robot.lives > 0) {
      robot.lives -= 1;
      robot.needsRespawn = true;
      robot.damage = CONFIG.RESPAWN_DAMAGE;
      this.refreshRobotStats(robot);
      this.pushLog(
        `${robot.name} is uitgeschakeld: ${reason}. Ronde voorbij. ` +
        `Volgende ronde terug met ${CONFIG.RESPAWN_DAMAGE} schade. ` +
        `Opnieuw beginnen over: ${robot.lives}.`
      );
      return;
    }

    robot.eliminated = true;
    robot.needsRespawn = false;
    this.refreshRobotStats(robot);
    this.pushLog(`${robot.name} is definitief uitgeschakeld: ${reason}. Geen levens meer.`);
  }

  respawnPendingRobots() {
    this.robots.forEach(robot => {
      if (!robot.needsRespawn || robot.eliminated) {
        robot.needsRespawn = false;
        return;
      }

      const respawn = this.findRespawnPosition(robot.archiveX, robot.archiveY);
      robot.x = respawn.x;
      robot.y = respawn.y;
      robot.dir = this.board?.startFaceDir != null ? this.board.startFaceDir : CONFIG.DIRECTIONS.EAST;
      const respawnDamage = this.hasUpgrade(robot, 'softLanding')
        ? 0
        : CONFIG.RESPAWN_DAMAGE;
      robot.damage = respawnDamage;
      robot.shutdownActive = false;
      robot.pendingPowerDown = false;
      robot.needsRespawn = false;
      this.refreshRobotStats(robot);
      this.pushLog(
        `${robot.name} respawnt op (${respawn.x + 1}, ${respawn.y + 1}) met ${respawnDamage} schade.`
      );
    });
  }

  validateCheckpoints() {
    this.robots.forEach(robot => {
      if (!this.isRobotOnBoard(robot)) return;
      const tile = this.board.grid[robot.y] && this.board.grid[robot.y][robot.x];
      if (!tile) return;
      if (tile.type === CONFIG.TILE_TYPES.CHECKPOINT && tile.num === robot.checkpoint) {
        robot.checkpoint += 1;
        robot.archiveX = robot.x;
        robot.archiveY = robot.y;
        this.pushLog(`${robot.name} bereikt checkpoint ${tile.num}.`);

        if (robot.checkpoint > this.board.checkpointsCount) {
          this.phase = 'finished';
          this.winner = robot;
          this.pushLog(`${robot.name} wint het parcours!`);
        }
      }
    });
  }

  checkRoundEnd() {
    const living = this.robots.filter(robot => this.isRobotInGame(robot));
    if (living.length <= 1) {
      this.phase = 'finished';
      this.winner = living[0] || null;
      this.emitStateChange();
      return;
    }

    if (this.phase !== 'finished') {
      this.resolveEndOfRoundTiles();
      if (this.pendingUpgradeQueue.length) {
        this.advanceUpgradeChoice();
        return;
      }
      this.roundNumber += 1;
      this.startNewRound();
    }
  }
}
