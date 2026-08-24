/**
 * Vaste 12×12 MD-robot boards (easy / normal / hard).
 * Facing: 0=N 1=E 2=S 3=W
 */
(function () {
  const SIZE = 12;
  const TILE = {
    FLOOR: 'floor',
    CONVEYOR: 'conveyor',
    EXPRESS: 'express',
    GEAR_CW: 'gear_cw',
    GEAR_CCW: 'gear_ccw',
    LASER: 'laser',
    PIT: 'pit',
    CHECKPOINT: 'checkpoint',
    START: 'start',
    REPAIR: 'repair'
  };

  function emptyCell() {
    return { tile: TILE.FLOOR, walls: { 0: false, 1: false, 2: false, 3: false } };
  }

  function makeGrid() {
    const grid = [];
    for (let y = 0; y < SIZE; y++) {
      const row = [];
      for (let x = 0; x < SIZE; x++) row.push(emptyCell());
      grid.push(row);
    }
    return grid;
  }

  function set(grid, x, y, patch) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    Object.assign(grid[y][x], patch);
  }

  function wall(grid, x, y, dir) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    grid[y][x].walls[dir] = true;
    const ox = x + [0, 1, 0, -1][dir];
    const oy = y + [-1, 0, 1, 0][dir];
    if (ox >= 0 && oy >= 0 && ox < SIZE && oy < SIZE) {
      grid[oy][ox].walls[(dir + 2) % 4] = true;
    }
  }

  function corridor(grid, x0, y0, x1, y1, tile, dir) {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    for (;;) {
      set(grid, x, y, { tile, dir });
      if (x === x1 && y === y1) break;
      x += dx;
      y += dy;
    }
  }

  function buildEasy() {
    const grid = makeGrid();
    const starts = [
      { x: 1, y: 10, facing: 0 },
      { x: 3, y: 10, facing: 0 },
      { x: 8, y: 10, facing: 0 },
      { x: 10, y: 10, facing: 0 }
    ];
    starts.forEach((s) => set(grid, s.x, s.y, { tile: TILE.START }));

    corridor(grid, 1, 8, 1, 4, TILE.CONVEYOR, 0);
    corridor(grid, 1, 4, 5, 4, TILE.CONVEYOR, 1);
    corridor(grid, 10, 8, 10, 4, TILE.CONVEYOR, 0);
    corridor(grid, 10, 4, 6, 4, TILE.CONVEYOR, 3);

    set(grid, 3, 6, { tile: TILE.GEAR_CW });
    set(grid, 8, 6, { tile: TILE.GEAR_CCW });
    set(grid, 5, 7, { tile: TILE.LASER, dir: 0 });
    set(grid, 6, 7, { tile: TILE.LASER, dir: 0 });
    set(grid, 2, 2, { tile: TILE.PIT });
    set(grid, 9, 2, { tile: TILE.PIT });
    set(grid, 5, 2, { tile: TILE.CHECKPOINT, num: 1 });
    set(grid, 6, 1, { tile: TILE.CHECKPOINT, num: 2 });
    set(grid, 4, 9, { tile: TILE.REPAIR });
    set(grid, 7, 9, { tile: TILE.REPAIR });

    wall(grid, 4, 5, 1);
    wall(grid, 7, 5, 3);
    wall(grid, 5, 3, 0);
    wall(grid, 6, 3, 0);
    wall(grid, 2, 8, 2);
    wall(grid, 9, 8, 2);

    return {
      id: 'easy',
      name: 'Easy',
      size: SIZE,
      checkpointsCount: 2,
      starts,
      grid
    };
  }

  function buildNormal() {
    const grid = makeGrid();
    const starts = [
      { x: 0, y: 11, facing: 0 },
      { x: 2, y: 11, facing: 0 },
      { x: 9, y: 11, facing: 0 },
      { x: 11, y: 11, facing: 0 }
    ];
    starts.forEach((s) => set(grid, s.x, s.y, { tile: TILE.START }));

    corridor(grid, 0, 9, 0, 3, TILE.EXPRESS, 0);
    corridor(grid, 0, 3, 4, 3, TILE.EXPRESS, 1);
    corridor(grid, 11, 9, 11, 3, TILE.EXPRESS, 0);
    corridor(grid, 11, 3, 7, 3, TILE.EXPRESS, 3);
    corridor(grid, 2, 7, 2, 5, TILE.CONVEYOR, 0);
    corridor(grid, 2, 5, 5, 5, TILE.CONVEYOR, 1);
    corridor(grid, 9, 7, 9, 5, TILE.CONVEYOR, 0);
    corridor(grid, 9, 5, 6, 5, TILE.CONVEYOR, 3);

    set(grid, 4, 6, { tile: TILE.GEAR_CW });
    set(grid, 7, 6, { tile: TILE.GEAR_CCW });
    set(grid, 5, 8, { tile: TILE.GEAR_CW });
    set(grid, 6, 8, { tile: TILE.GEAR_CCW });

    set(grid, 3, 4, { tile: TILE.LASER, dir: 1 });
    set(grid, 4, 4, { tile: TILE.LASER, dir: 1 });
    set(grid, 7, 4, { tile: TILE.LASER, dir: 3 });
    set(grid, 8, 4, { tile: TILE.LASER, dir: 3 });
    set(grid, 5, 1, { tile: TILE.LASER, dir: 2 });

    set(grid, 1, 1, { tile: TILE.PIT });
    set(grid, 10, 1, { tile: TILE.PIT });
    set(grid, 5, 6, { tile: TILE.PIT });
    set(grid, 6, 6, { tile: TILE.PIT });

    set(grid, 3, 2, { tile: TILE.CHECKPOINT, num: 1 });
    set(grid, 8, 2, { tile: TILE.CHECKPOINT, num: 2 });
    set(grid, 5, 0, { tile: TILE.CHECKPOINT, num: 3 });

    set(grid, 1, 8, { tile: TILE.REPAIR });
    set(grid, 10, 8, { tile: TILE.REPAIR });

    wall(grid, 5, 3, 2);
    wall(grid, 6, 3, 2);
    wall(grid, 4, 7, 0);
    wall(grid, 7, 7, 0);
    wall(grid, 2, 4, 1);
    wall(grid, 9, 4, 3);
    wall(grid, 5, 9, 1);
    wall(grid, 6, 9, 3);

    return {
      id: 'normal',
      name: 'Normal',
      size: SIZE,
      checkpointsCount: 3,
      starts,
      grid
    };
  }

  function buildHard() {
    const base = buildNormal();
    const grid = base.grid;
    corridor(grid, 1, 6, 4, 6, TILE.EXPRESS, 1);
    corridor(grid, 10, 6, 7, 6, TILE.EXPRESS, 3);
    set(grid, 2, 3, { tile: TILE.PIT });
    set(grid, 9, 3, { tile: TILE.PIT });
    set(grid, 4, 1, { tile: TILE.LASER, dir: 2 });
    set(grid, 7, 1, { tile: TILE.LASER, dir: 2 });
    wall(grid, 3, 5, 1);
    wall(grid, 8, 5, 3);
    wall(grid, 5, 4, 0);
    wall(grid, 6, 4, 0);
    return {
      id: 'hard',
      name: 'Hard',
      size: SIZE,
      checkpointsCount: 3,
      starts: base.starts,
      grid
    };
  }

  const TEMPLATES = {
    easy: buildEasy,
    normal: buildNormal,
    hard: buildHard
  };

  function getBoard(boardId = 'easy') {
    const id = TEMPLATES[boardId] ? boardId : 'easy';
    const board = TEMPLATES[id]();
    // Deep clone so callers can mutate safely
    return JSON.parse(JSON.stringify(board));
  }

  function listBoards() {
    return [
      { id: 'easy', name: 'Easy', checkpoints: 2 },
      { id: 'normal', name: 'Normal', checkpoints: 3 },
      { id: 'hard', name: 'Hard', checkpoints: 3 }
    ];
  }

  window.MdRobotBoards = { SIZE, TILE, getBoard, listBoards };
})();
