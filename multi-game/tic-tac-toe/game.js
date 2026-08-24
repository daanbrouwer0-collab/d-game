const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const GAME_ID = "tic-tac-toe";

export const GameMsg = Object.freeze({
  MOVE: "move",
  STATE: "state",
  RESTART: "restart",
});

/**
 * Pure tic-tac-toe rules (no networking).
 */
export function createInitialState() {
  return {
    board: Array(9).fill(null),
    turn: "X",
    status: "playing",
    winner: null,
    winningLine: null,
  };
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 */
export function cloneState(state) {
  return {
    board: [...state.board],
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    winningLine: state.winningLine ? [...state.winningLine] : null,
  };
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
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return { ok: false, reason: "Ongeldige zet" };
  }
  if (state.board[index] !== null) {
    return { ok: false, reason: "Vakje is bezet" };
  }

  const next = cloneState(state);
  next.board[index] = mark;

  const win = findWinner(next.board);
  if (win) {
    next.status = "won";
    next.winner = win.winner;
    next.winningLine = win.line;
    return { ok: true, state: next };
  }

  if (next.board.every((cell) => cell !== null)) {
    next.status = "draw";
    next.winner = null;
    next.winningLine = null;
    return { ok: true, state: next };
  }

  next.turn = mark === "X" ? "O" : "X";
  return { ok: true, state: next };
}
