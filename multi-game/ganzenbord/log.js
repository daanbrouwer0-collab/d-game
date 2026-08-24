import {
  addPlayer,
  applyRoll,
  cloneState,
  createEmptyLobby,
  startGame,
} from "./game.js";

/**
 * Ordered unique seats from seat events (first appearance keeps order).
 * @param {import('../js/sync/event-log.js').EventLog} log
 * @returns {{ playerId: string, name: string }[]}
 */
export function seatsFromLog(log) {
  /** @type {Map<string, { playerId: string, name: string }>} */
  const byId = new Map();
  /** @type {string[]} */
  const order = [];
  for (const ev of log.events || []) {
    if (ev.type !== "seat") continue;
    const p = /** @type {{ playerId?: string, name?: string }} */ (
      ev.payload || {}
    );
    const playerId = String(p.playerId || "");
    const name = String(p.name || "").trim() || "Speler";
    if (!playerId) continue;
    if (!byId.has(playerId)) order.push(playerId);
    byId.set(playerId, { playerId, name });
  }
  return order.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * @param {{ playerId: string, name: string }[]} seats
 * @param {string} playerId
 * @param {string} name
 * @returns {string|null} matched playerId
 */
export function matchSeat(seats, playerId, name) {
  const id = String(playerId || "");
  const nm = String(name || "").trim().toLowerCase();
  if (id && seats.some((s) => s.playerId === id)) return id;
  if (nm) {
    const hits = seats.filter(
      (s) => s.name && s.name.trim().toLowerCase() === nm,
    );
    if (hits.length === 1) return hits[0].playerId;
  }
  return null;
}

/**
 * Replay ganzenbord from seat / start / roll events.
 * @param {import('../js/sync/event-log.js').EventLog} log
 * @returns {import('./game.js').GameState}
 */
export function replayGanzenbord(log) {
  let state = createEmptyLobby();
  for (const ev of log.events || []) {
    if (ev.type === "seat") {
      const p = /** @type {{ playerId?: string, name?: string }} */ (
        ev.payload || {}
      );
      const playerId = String(p.playerId || "");
      const name = String(p.name || "").trim().slice(0, 20) || "Speler";
      if (!playerId) continue;
      const existing = state.players.find((pl) => pl.id === playerId);
      if (existing) {
        const next = cloneState(state);
        const seat = next.players.find((pl) => pl.id === playerId);
        if (seat) seat.name = name;
        state = next;
        continue;
      }
      if (state.phase !== "lobby") continue;
      const added = addPlayer(state, {
        id: playerId,
        name,
        isHost: false,
        peerId: null,
      });
      if (added.ok) state = added.state;
      continue;
    }
    if (ev.type === "start") {
      const started = startGame(state);
      if (started.ok) state = started.state;
      continue;
    }
    if (ev.type !== "roll") continue;
    const payload = /** @type {{ playerId?: string, value?: number }} */ (
      ev.payload || {}
    );
    if (typeof payload.playerId !== "string") continue;
    if (typeof payload.value !== "number") continue;
    const rolled = applyRoll(state, payload.playerId, payload.value);
    if (rolled.ok) state = rolled.state;
  }
  return state;
}

/**
 * @param {import('./game.js').GameState} state
 */
export function gbSummary(state) {
  if (!state) return "Lege room";
  if (state.phase === "lobby") {
    return `Lobby · ${state.players.length} spelers`;
  }
  if (state.phase === "finished") {
    const w = state.players.find((p) => p.id === state.winnerId);
    return w ? `${w.name} wint` : "Afgelopen";
  }
  const current = state.players[state.turnIndex];
  return current
    ? `Beurt: ${current.name}`
    : `Bezig · ${state.players.length} spelers`;
}
