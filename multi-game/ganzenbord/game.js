export const GAME_ID = "ganzenbord";
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const BOARD_SIZE = 63;
/** Zigzag grid: 6 wide × ~11 high (0…63). */
export const GRID_COLS = 6;
export const GRID_ROWS = Math.ceil((BOARD_SIZE + 1) / GRID_COLS);

/** Fallback palette when Geheugen-kleuren ontbreken (hotseat / oude seats). */
export const FALLBACK_COLORS = Object.freeze([
  { head: "#e8f0ff", body: "#6eb5ff", legs: "#3a6fa0" },
  { head: "#fff4e0", body: "#f0b45a", legs: "#a06a28" },
  { head: "#e8ffe8", body: "#7dcea0", legs: "#3d7a55" },
  { head: "#ffe8f2", body: "#e8a0bf", legs: "#8a4568" },
  { head: "#f0e8ff", body: "#c4b5fd", legs: "#6b5aa8" },
  { head: "#fffde0", body: "#f5d76e", legs: "#9a8420" },
]);

/**
 * @typedef {{ head: string, body: string, legs: string }} CharacterColors
 */

/**
 * @param {unknown} raw
 * @param {number} [fallbackIndex]
 * @returns {CharacterColors}
 */
export function normalizeColors(raw, fallbackIndex = 0) {
  const fb = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const hex = (v, d) => {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : d;
  };
  return {
    head: hex(o.head, fb.head),
    body: hex(o.body, fb.body),
    legs: hex(o.legs, fb.legs),
  };
}

/** Bankje: next roll from here counts as half (floor). */
export const BANKJE_SQUARES = Object.freeze([
  5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59,
]);

/** @deprecated use BANKJE_SQUARES */
export const GOOSE_SQUARES = BANKJE_SQUARES;

export const SPECIAL = Object.freeze({
  6: { id: "bridge", label: "Brug", below: true },
  12: { id: "bridge", label: "Brug", below: true },
  24: { id: "bridge", label: "Brug", below: true },
  19: { id: "deka", label: "Deka", skip: 1 },
  31: { id: "sloot", label: "Sloot" },
  42: { id: "park", label: "Park", to: 30 },
  52: { id: "prison", label: "Gevangenis", skip: 5 },
  58: { id: "knockout", label: "Knockout", to: 0 },
});

/**
 * Visual column on the zigzag board (even rows left→right, odd right→left).
 * @param {number} square
 * @returns {{ row: number, col: number }}
 */
export function squareRowCol(square) {
  const row = Math.floor(square / GRID_COLS);
  const i = square % GRID_COLS;
  const col = row % 2 === 0 ? i : GRID_COLS - 1 - i;
  return { row, col };
}

/**
 * Path index at visual (row, col), or null if outside 0…BOARD_SIZE.
 * @param {number} row
 * @param {number} col
 * @returns {number | null}
 */
export function squareAt(row, col) {
  if (row < 0 || col < 0 || col >= GRID_COLS) return null;
  const i = row % 2 === 0 ? col : GRID_COLS - 1 - col;
  const square = row * GRID_COLS + i;
  if (square < 0 || square > BOARD_SIZE) return null;
  return square;
}

/**
 * Square directly below on the grid (same column, next row), or null.
 * @param {number} square
 * @returns {number | null}
 */
export function squareBelow(square) {
  const { row, col } = squareRowCol(square);
  return squareAt(row + 1, col);
}

export const Msg = Object.freeze({
  LOBBY: "lobby",
  JOIN: "join",
  START: "start",
  ROLL: "roll",
  TIMEOUT: "timeout",
  STATE: "state",
  LOG: "log",
  REJECT: "reject",
  TO_LOBBY: "to_lobby",
  RESYNC: "resync",
  CHECKPOINT: "checkpoint",
});

/** Seconds to roll before the turn is forfeited. */
export const TURN_SECONDS = 20;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   isHost: boolean,
 *   peerId: string|null,
 *   colors?: CharacterColors,
 * }} Player
 * @typedef {{
 *   phase: 'lobby'|'playing'|'finished',
 *   players: Player[],
 *   positions: Record<string, number>,
 *   skipTurns: Record<string, number>,
 *   trapped: Record<string, 'sloot'>,
 *   turnIndex: number,
 *   lastRoll: number|null,
 *   lastLog: string,
 *   winnerId: string|null,
 *   championId: string|null,
 * }} GameState
 */

/**
 * @returns {GameState}
 */
export function createEmptyLobby() {
  return {
    phase: "lobby",
    players: [],
    positions: {},
    skipTurns: {},
    trapped: {},
    turnIndex: 0,
    lastRoll: null,
    lastLog: "Lobby: wacht op spelers…",
    winnerId: null,
    championId: null,
  };
}

/**
 * @param {string} playerId
 * @param {string} playerName
 * @param {CharacterColors | null | undefined} [colors]
 * @returns {GameState}
 */
export function createLobbyState(playerId, playerName, colors) {
  return {
    phase: "lobby",
    players: [
      {
        id: playerId,
        name: playerName,
        isHost: false,
        peerId: null,
        colors: normalizeColors(colors, 0),
      },
    ],
    positions: {},
    skipTurns: {},
    trapped: {},
    turnIndex: 0,
    lastRoll: null,
    lastLog: "Lobby: wacht op spelers…",
    winnerId: null,
    championId: null,
  };
}

/**
 * @param {GameState} state
 */
export function cloneState(state) {
  return {
    phase: state.phase,
    players: state.players.map((p) => ({
      ...p,
      colors: p.colors ? { ...p.colors } : undefined,
    })),
    positions: { ...(state.positions || {}) },
    skipTurns: { ...(state.skipTurns || {}) },
    trapped: { ...(state.trapped || {}) },
    turnIndex: state.turnIndex,
    lastRoll: state.lastRoll,
    lastLog: state.lastLog,
    winnerId: state.winnerId,
    championId: state.championId ?? null,
  };
}

/**
 * @param {GameState} state
 * @param {Player} player
 */
export function addPlayer(state, player) {
  if (state.phase !== "lobby") {
    return { ok: false, reason: "Spel is al gestart" };
  }
  if (state.players.length >= MAX_PLAYERS) {
    return { ok: false, reason: "Lobby is vol (max 6)" };
  }
  if (state.players.some((p) => p.id === player.id)) {
    return { ok: false, reason: "Speler bestaat al" };
  }
  const next = cloneState(state);
  next.players.push({
    ...player,
    colors: normalizeColors(player.colors, next.players.length),
  });
  next.lastLog = `${player.name} is gejoined (${next.players.length}/${MAX_PLAYERS})`;
  return { ok: true, state: next };
}

/**
 * @param {GameState} state
 * @param {string} playerId
 */
export function removePlayer(state, playerId) {
  const next = cloneState(state);
  const gone = next.players.find((p) => p.id === playerId);
  next.players = next.players.filter((p) => p.id !== playerId);
  if (gone) {
    next.lastLog = `${gone.name} heeft de lobby verlaten`;
  }
  delete next.positions[playerId];
  delete next.skipTurns[playerId];
  delete next.trapped[playerId];
  if (next.phase === "playing" && next.players.length > 0) {
    next.turnIndex = next.turnIndex % next.players.length;
  }
  return next;
}

/**
 * @param {GameState} state
 */
/**
 * @param {GameState} state
 * @returns {boolean}
 */
export function canStart(state) {
  return (
    (state.phase === "lobby" ||
      state.phase === "finished" ||
      state.phase === "playing") &&
    state.players.length >= MIN_PLAYERS &&
    state.players.length <= MAX_PLAYERS
  );
}

/**
 * Start or rematch: always reset the board when seats are valid.
 * @param {GameState} state
 * @param {{ championId?: string|null }} [opts]
 *   Explicit crown (e.g. from compacted rematch `start` payload).
 */
export function startGame(state, opts = {}) {
  if (state.players.length < MIN_PLAYERS) {
    return {
      ok: false,
      reason: `Minimaal ${MIN_PLAYERS} spelers nodig (nu ${state.players.length})`,
    };
  }
  if (state.players.length > MAX_PLAYERS) {
    return { ok: false, reason: `Maximaal ${MAX_PLAYERS} spelers` };
  }
  const next = cloneState(state);
  if (opts.championId !== undefined) {
    next.championId = opts.championId || null;
  } else if (state.phase === "finished" && state.winnerId) {
    next.championId = state.winnerId;
  } else {
    next.championId = state.championId ?? null;
  }
  next.phase = "playing";
  next.turnIndex = 0;
  next.winnerId = null;
  next.lastRoll = null;
  next.positions = {};
  next.skipTurns = {};
  next.trapped = {};
  for (const p of next.players) {
    next.positions[p.id] = 0;
  }
  next.lastLog = `Spel gestart met ${next.players.length} spelers. ${next.players[0].name} mag gooien.`;
  return { ok: true, state: next };
}

/**
 * Keep seats; clear board; back to lobby.
 * @param {GameState} state
 */
export function returnToLobby(state) {
  if (state.phase !== "finished" && state.phase !== "playing") {
    return { ok: false, reason: "Niet in een partij" };
  }
  const next = cloneState(state);
  next.phase = "lobby";
  next.positions = {};
  next.skipTurns = {};
  next.trapped = {};
  next.turnIndex = 0;
  // Keep crown for the next match (winner of the finished game, or existing champ).
  next.championId = state.winnerId || state.championId || null;
  next.winnerId = null;
  next.lastRoll = null;
  next.lastLog = "Terug in lobby. Host kan opnieuw starten.";
  return { ok: true, state: next };
}

/**
 * @param {number} pos
 * @param {number} steps
 */
function moveWithBounce(pos, steps) {
  let next = pos + steps;
  if (next > BOARD_SIZE) {
    next = BOARD_SIZE - (next - BOARD_SIZE);
  }
  return Math.max(0, next);
}

/**
 * Resolve landing effects.
 * @param {GameState} state
 * @param {string} playerId
 * @param {string} playerName
 * @param {number} pos
 * @param {string[]} notes
 * @param {number} depth
 */
function resolveLanding(state, playerId, playerName, pos, notes, depth = 0) {
  if (depth > 24) return pos;
  if (pos >= BOARD_SIZE) {
    state.positions[playerId] = BOARD_SIZE;
    delete state.trapped[playerId];
    return BOARD_SIZE;
  }

  const special = SPECIAL[pos];

  if (special?.id === "bridge") {
    const next = squareBelow(pos);
    if (next == null) return pos;
    notes.push(`${special.label} ↓ → ${next}`);
    return resolveLanding(state, playerId, playerName, next, notes, depth + 1);
  }

  if (special?.id === "park" || special?.id === "knockout") {
    notes.push(`${special.label} → ${special.to}`);
    return resolveLanding(
      state,
      playerId,
      playerName,
      special.to,
      notes,
      depth + 1,
    );
  }

  if (special?.id === "deka" || special?.id === "prison") {
    const skips = special.skip || 1;
    state.skipTurns[playerId] = (state.skipTurns[playerId] || 0) + skips;
    notes.push(
      skips === 1
        ? `${special.label}: 1 beurt overslaan`
        : `${special.label}: ${skips} beurten overslaan`,
    );
    return pos;
  }

  if (special?.id === "sloot") {
    state.trapped[playerId] = "sloot";
    notes.push("Sloot: gooi 4 of 5 om eruit te komen");
    return pos;
  }

  // Bankje: no immediate move — half-speed applies on the next roll from here.
  if (BANKJE_SQUARES.includes(pos)) {
    notes.push("Bankje: volgende worp telt half");
    return pos;
  }

  return pos;
}

/**
 * Advance to the next player who can act (skip deka/gevangenis).
 * Sloot stays: they must roll 4/5 on their turn.
 * @param {GameState} state
 * @param {string[]} notes
 */
function advanceTurn(state, notes) {
  const n = state.players.length;
  if (n === 0) return;
  let idx = (state.turnIndex + 1) % n;
  for (let guard = 0; guard < n * 6; guard++) {
    const p = state.players[idx];
    const skips = state.skipTurns[p.id] || 0;
    if (skips > 0) {
      state.skipTurns[p.id] = skips - 1;
      notes.push(
        `${p.name} slaat over (nog ${state.skipTurns[p.id]} beurt(en))`,
      );
      idx = (idx + 1) % n;
      continue;
    }
    state.turnIndex = idx;
    return;
  }
  state.turnIndex = idx;
}

/**
 * Host applies a dice roll for the current player.
 * @param {GameState} state
 * @param {string} playerId
 * @param {number} roll
 */
export function applyRoll(state, playerId, roll) {
  if (state.phase !== "playing") {
    return { ok: false, reason: "Spel loopt niet" };
  }
  const current = state.players[state.turnIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, reason: "Niet jouw beurt" };
  }
  if ((state.skipTurns[playerId] || 0) > 0) {
    return { ok: false, reason: "Je moet deze beurt overslaan" };
  }
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { ok: false, reason: "Ongeldige worp" };
  }

  const next = cloneState(state);
  const from = next.positions[playerId] || 0;
  /** @type {string[]} */
  const notes = [];

  // Sloot: only leave on 4 or 5, then move that many; otherwise stay.
  if (next.trapped[playerId] === "sloot") {
    if (roll !== 4 && roll !== 5) {
      next.lastRoll = roll;
      /** @type {string[]} */
      const turnNotes = [];
      advanceTurn(next, turnNotes);
      let log = `${current.name} gooit ${roll} in de sloot — blijft zitten`;
      if (turnNotes.length) log += `. ${turnNotes.join("; ")}`;
      const nextPlayer = next.players[next.turnIndex];
      next.lastLog = `${log}. Beurt: ${nextPlayer?.name || "…"}`;
      return { ok: true, state: next };
    }
    delete next.trapped[playerId];
    notes.push("uit de sloot!");
  }

  let steps = roll;
  if (BANKJE_SQUARES.includes(from)) {
    steps = Math.floor(roll / 2);
    notes.push(`bankje: worp ${roll} → ${steps} stap(pen)`);
  }

  let pos = moveWithBounce(from, steps);
  if (steps > 0 && pos !== from + steps && from + steps > BOARD_SIZE) {
    notes.push(`te ver → terug naar ${pos}`);
  }

  pos = resolveLanding(next, playerId, current.name, pos, notes);
  next.positions[playerId] = pos;
  next.lastRoll = roll;

  const detail = notes.length ? ` (${notes.join("; ")})` : "";
  let log = `${current.name} gooit ${roll}: ${from} → ${pos}${detail}`;

  if (pos >= BOARD_SIZE) {
    next.positions[playerId] = BOARD_SIZE;
    delete next.trapped[playerId];
    next.phase = "finished";
    next.winnerId = playerId;
    next.lastLog = `${log}. ${current.name} wint!`;
    return { ok: true, state: next };
  }

  /** @type {string[]} */
  const turnNotes = [];
  advanceTurn(next, turnNotes);
  if (turnNotes.length) log += `. ${turnNotes.join("; ")}`;
  const nextPlayer = next.players[next.turnIndex];
  next.lastLog = `${log}. Beurt: ${nextPlayer?.name || "…"}`;
  return { ok: true, state: next };
}

/**
 * Current player ran out of time — skip without moving.
 * @param {GameState} state
 * @param {string} playerId
 */
export function applyTimeout(state, playerId) {
  if (state.phase !== "playing") {
    return { ok: false, reason: "Spel loopt niet" };
  }
  const current = state.players[state.turnIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, reason: "Niet jouw beurt" };
  }

  const next = cloneState(state);
  /** @type {string[]} */
  const turnNotes = [];
  advanceTurn(next, turnNotes);
  let log = `${current.name} te laat (${TURN_SECONDS}s) — beurt voorbij`;
  if (turnNotes.length) log += `. ${turnNotes.join("; ")}`;
  const nextPlayer = next.players[next.turnIndex];
  next.lastRoll = null;
  next.lastLog = `${log}. Beurt: ${nextPlayer?.name || "…"}`;
  return { ok: true, state: next };
}

export function rollDice() {
  return 1 + Math.floor(Math.random() * 6);
}

/**
 * @param {number} square
 * @returns {{ id: string, label: string } | null}
 */
export function squareInfo(square) {
  if (square === 0) return { id: "start", label: "Start" };
  if (square === BOARD_SIZE) return { id: "finish", label: "Finish" };
  const sp = SPECIAL[square];
  if (sp) return { id: sp.id, label: sp.label };
  if (BANKJE_SQUARES.includes(square)) return { id: "bankje", label: "Bankje" };
  return null;
}
