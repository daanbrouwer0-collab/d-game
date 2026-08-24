export const GAME_ID = "tic-tac-toe";

export const BOARD_SIZE = 16;
export const GRID = 4;
export const WIN_LEN = 3;
export const BLOCKED_COUNT = 3;
export const TURN_SECONDS = 20;

export const GameMsg = Object.freeze({
  MOVE: "move",
  STATE: "state",
  RESTART: "restart",
  LOG: "log",
  TIMEOUT: "timeout",
});

/** All 3-in-a-row lines on a 4×4 board (rows + columns only — no diagonals). */
export const LINES = (() => {
  /** @type {number[][]} */
  const lines = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c <= GRID - WIN_LEN; c++) {
      lines.push([0, 1, 2].map((k) => r * GRID + (c + k)));
    }
  }
  for (let c = 0; c < GRID; c++) {
    for (let r = 0; r <= GRID - WIN_LEN; r++) {
      lines.push([0, 1, 2].map((k) => (r + k) * GRID + c));
    }
  }
  return lines;
})();

/**
 * Pick `count` unique random cell indices.
 * @param {number} [count]
 * @param {() => number} [rng] Math.random-compatible
 * @returns {number[]}
 */
export function pickBlocked(count = BLOCKED_COUNT, rng = Math.random) {
  const pool = Array.from({ length: BOARD_SIZE }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/**
 * @param {unknown} raw
 * @returns {number[]}
 */
export function normalizeBlocked(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {number[]} */
  const out = [];
  for (const v of raw) {
    if (!Number.isInteger(v) || v < 0 || v >= BOARD_SIZE) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Pure tic-tac-toe rules (no networking).
 * @param {number[]} [blocked]
 */
export function createInitialState(blocked = []) {
  const blockedCells = normalizeBlocked(blocked);
  return {
    board: Array(BOARD_SIZE).fill(null),
    blocked: blockedCells,
    turn: /** @type {'X'|'O'} */ ("X"),
    status: /** @type {'playing'|'won'|'draw'} */ ("playing"),
    winner: /** @type {'X'|'O'|null} */ (null),
    winningLine: /** @type {number[]|null} */ (null),
  };
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 */
export function cloneState(state) {
  return {
    board: [...state.board],
    blocked: [...(state.blocked || [])],
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    winningLine: state.winningLine ? [...state.winningLine] : null,
  };
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {number} index
 */
export function isBlocked(state, index) {
  return (state.blocked || []).includes(index);
}

/**
 * Empty playable cells (not marked, not blocked).
 * @param {ReturnType<typeof createInitialState>} state
 * @returns {number[]}
 */
export function freeCells(state) {
  /** @type {number[]} */
  const free = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (state.board[i] == null && !isBlocked(state, i)) free.push(i);
  }
  return free;
}

/**
 * @param {(string|null)[]} board
 */
export function findWinner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {number} index
 * @param {'X'|'O'} mark
 */
export function applyMove(state, index, mark) {
  if (state.status !== "playing") {
    return { ok: false, reason: "Spel is al afgelopen" };
  }
  if (mark !== state.turn) {
    return { ok: false, reason: "Niet jouw beurt" };
  }
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) {
    return { ok: false, reason: "Ongeldige zet" };
  }
  if (isBlocked(state, index)) {
    return { ok: false, reason: "Vakje is geblokkeerd" };
  }
  if (state.board[index] !== null) {
    return { ok: false, reason: "Vakje is bezet" };
  }

  const next = cloneState(state);
  next.board[index] = mark;

  const win = findWinner(next.board);
  if (win) {
    next.status = "won";
    next.winner = /** @type {'X'|'O'} */ (win.winner);
    next.winningLine = win.line;
    return { ok: true, state: next };
  }

  if (freeCells(next).length === 0) {
    next.status = "draw";
    next.winner = null;
    next.winningLine = null;
    return { ok: true, state: next };
  }

  next.turn = mark === "X" ? "O" : "X";
  return { ok: true, state: next };
}

/**
 * Timer expired: place mark on a random free cell.
 * @param {ReturnType<typeof createInitialState>} state
 * @param {'X'|'O'} mark
 * @param {number} [index] host-chosen index (required for replay sync)
 * @param {() => number} [rng]
 */
export function applyTimeoutMove(state, mark, index, rng = Math.random) {
  const free = freeCells(state);
  if (!free.length) {
    return { ok: false, reason: "Geen vrije vakjes" };
  }
  let chosen = index;
  if (!Number.isInteger(chosen) || !free.includes(chosen)) {
    chosen = free[Math.floor(rng() * free.length)];
  }
  return applyMove(state, chosen, mark);
}
