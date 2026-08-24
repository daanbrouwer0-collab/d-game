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

/**
 * @typedef {{ playerId: string, name: string }} SeatHolder
 * @typedef {{ X: SeatHolder | null, O: SeatHolder | null }} SeatMap
 */

/**
 * Latest seat claim per mark from the event chain.
 * @param {import('../js/sync/event-log.js').EventLog} log
 * @returns {SeatMap}
 */
export function seatsFromLog(log) {
  /** @type {SeatMap} */
  const seats = { X: null, O: null };
  for (const ev of log.events || []) {
    if (ev.type !== "seat") continue;
    const p = /** @type {{ mark?: string, playerId?: string, name?: string }} */ (
      ev.payload || {}
    );
    if (p.mark !== "X" && p.mark !== "O") continue;
    const playerId = String(p.playerId || "");
    const name = String(p.name || "").trim();
    if (playerId) {
      for (const m of /** @type {const} */ (["X", "O"])) {
        if (m !== p.mark && seats[m]?.playerId === playerId) seats[m] = null;
      }
    }
    seats[p.mark] = { playerId, name };
  }
  return seats;
}

/**
 * @param {SeatMap} seats
 * @param {string} playerId
 * @param {string} name
 * @returns {'X'|'O'|null}
 */
export function markForPlayer(seats, playerId, name) {
  const id = String(playerId || "");
  const nm = String(name || "").trim().toLowerCase();
  for (const mark of /** @type {const} */ (["X", "O"])) {
    const seat = seats[mark];
    if (id && seat?.playerId && seat.playerId === id) return mark;
  }
  if (nm) {
    const hits = /** @type {const} */ (["X", "O"]).filter(
      (m) => seats[m]?.name && seats[m].name.trim().toLowerCase() === nm,
    );
    if (hits.length === 1) return hits[0];
  }
  return null;
}
