import { applyMove, createInitialState } from "./game.js";

/**
 * Replay tic-tac-toe from a light event chain (move / restart).
 * @param {import('../js/sync/event-log.js').EventLog} log
 * @returns {ReturnType<typeof createInitialState>}
 */
export function replayTtt(log) {
  let state = createInitialState();
  for (const ev of log.events || []) {
    if (ev.type === "restart") {
      state = createInitialState();
      continue;
    }
    if (ev.type !== "move") continue;
    const payload = /** @type {{ index?: number, mark?: string }} */ (
      ev.payload || {}
    );
    if (payload.mark !== "X" && payload.mark !== "O") continue;
    if (typeof payload.index !== "number") continue;
    const result = applyMove(state, payload.index, payload.mark);
    if (result.ok) state = result.state;
  }
  return state;
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 */
export function tttSummary(state) {
  if (!state) return "Leeg bord";
  if (state.status === "won") return `${state.winner} wint`;
  if (state.status === "draw") return "Gelijkspel";
  const n = state.board.filter(Boolean).length;
  if (!n) return "Nieuw bord · X aan zet";
  return `${n} zetten · ${state.turn} aan zet`;
}
