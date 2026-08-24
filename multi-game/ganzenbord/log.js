import {
  addPlayer,
  applyRoll,
  applyTimeout,
  cloneState,
  createEmptyLobby,
  normalizeColors,
  returnToLobby,
  startGame,
} from "./game.js";

/**
 * Ordered unique seats from seat events (first appearance keeps order).
 * @param {import('../js/sync/event-log.js').EventLog} log
 * @returns {{ playerId: string, name: string, colors?: import('./game.js').CharacterColors }[]}
 */
export function seatsFromLog(log) {
  /** @type {Map<string, { playerId: string, name: string, colors?: import('./game.js').CharacterColors }>} */
  const byId = new Map();
  /** @type {string[]} */
  const order = [];
  for (const ev of log.events || []) {
    if (ev.type !== "seat") continue;
    const p = /** @type {{ playerId?: string, name?: string, colors?: unknown }} */ (
      ev.payload || {}
    );
    const playerId = String(p.playerId || "");
    const name = String(p.name || "").trim() || "Speler";
    if (!playerId) continue;
    if (!byId.has(playerId)) order.push(playerId);
    const prev = byId.get(playerId);
    byId.set(playerId, {
      playerId,
      name,
      colors: p.colors != null ? normalizeColors(p.colors, order.length - 1) : prev?.colors,
    });
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
      const p = /** @type {{ playerId?: string, name?: string, colors?: unknown }} */ (
        ev.payload || {}
      );
      const playerId = String(p.playerId || "");
      const name = String(p.name || "").trim().slice(0, 20) || "Speler";
      if (!playerId) continue;
      const colors = normalizeColors(p.colors, state.players.length);
      const existing = state.players.find((pl) => pl.id === playerId);
      if (existing) {
        const next = cloneState(state);
        const seat = next.players.find((pl) => pl.id === playerId);
        if (seat) {
          seat.name = name;
          if (p.colors != null) seat.colors = colors;
        }
        state = next;
        continue;
      }
      if (state.phase !== "lobby") continue;
      const added = addPlayer(state, {
        id: playerId,
        name,
        isHost: false,
        peerId: null,
        colors,
      });
      if (added.ok) state = added.state;
      continue;
    }
    if (ev.type === "start") {
      const payload = /** @type {{ championId?: string|null }} */ (ev.payload || {});
      const started = startGame(state, {
        championId:
          payload.championId !== undefined
            ? payload.championId
            : undefined,
      });
      if (started.ok) state = started.state;
      continue;
    }
    if (ev.type === "to_lobby") {
      const back = returnToLobby(state);
      if (back.ok) state = back.state;
      continue;
    }
    if (ev.type === "timeout") {
      const payload = /** @type {{ playerId?: string }} */ (ev.payload || {});
      if (typeof payload.playerId !== "string") continue;
      const timed = applyTimeout(state, payload.playerId);
      if (timed.ok) state = timed.state;
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
