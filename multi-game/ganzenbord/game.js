export const GAME_ID = "ganzenbord";
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const BOARD_SIZE = 40;

export const Msg = Object.freeze({
  LOBBY: "lobby",
  JOIN: "join",
  START: "start",
  ROLL: "roll",
  STATE: "state",
  LOG: "log",
  REJECT: "reject",
});

/**
 * @typedef {{ id: string, name: string, isHost: boolean, peerId: string|null }} Player
 * @typedef {{
 *   phase: 'lobby'|'playing'|'finished',
 *   players: Player[],
 *   positions: Record<string, number>,
 *   turnIndex: number,
 *   lastRoll: number|null,
 *   lastLog: string,
 *   winnerId: string|null,
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
    turnIndex: 0,
    lastRoll: null,
    lastLog: "Lobby: wacht op spelers…",
    winnerId: null,
  };
}

/**
 * @param {string} playerId
 * @param {string} playerName
 * @returns {GameState}
 */
export function createLobbyState(playerId, playerName) {
  return {
    phase: "lobby",
    players: [
      {
        id: playerId,
        name: playerName,
        isHost: false,
        peerId: null,
      },
    ],
    positions: {},
    turnIndex: 0,
    lastRoll: null,
    lastLog: "Lobby: wacht op spelers…",
    winnerId: null,
  };
}

/**
 * @param {GameState} state
 */
export function cloneState(state) {
  return {
    phase: state.phase,
    players: state.players.map((p) => ({ ...p })),
    positions: { ...state.positions },
    turnIndex: state.turnIndex,
    lastRoll: state.lastRoll,
    lastLog: state.lastLog,
    winnerId: state.winnerId,
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
  next.players.push(player);
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
  if (next.phase === "playing" && next.players.length > 0) {
    next.turnIndex = next.turnIndex % next.players.length;
  }
  return next;
}

/**
 * @param {GameState} state
 */
export function canStart(state) {
  return (
    state.phase === "lobby" &&
    state.players.length >= MIN_PLAYERS &&
    state.players.length <= MAX_PLAYERS
  );
}

/**
 * @param {GameState} state
 */
export function startGame(state) {
  if (!canStart(state)) {
    return {
      ok: false,
      reason: `Minimaal ${MIN_PLAYERS} spelers nodig (nu ${state.players.length})`,
    };
  }
  const next = cloneState(state);
  next.phase = "playing";
  next.turnIndex = 0;
  next.winnerId = null;
  next.lastRoll = null;
  next.positions = {};
  for (const p of next.players) {
    next.positions[p.id] = 0;
  }
  next.lastLog = `Spel gestart met ${next.players.length} spelers. ${next.players[0].name} mag gooien.`;
  return { ok: true, state: next };
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
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { ok: false, reason: "Ongeldige worp" };
  }

  const next = cloneState(state);
  let pos = (next.positions[playerId] || 0) + roll;

  // Bounce back if past finish
  if (pos > BOARD_SIZE) {
    pos = BOARD_SIZE - (pos - BOARD_SIZE);
  }

  // Simple goose: land on multiple of 9 → extra move of same roll (once)
  let log = `${current.name} gooit ${roll} → vak ${pos}`;
  if (pos < BOARD_SIZE && pos > 0 && pos % 9 === 0) {
    pos = Math.min(BOARD_SIZE, pos + roll);
    log += ` (gans! verder naar ${pos})`;
  }

  next.positions[playerId] = pos;
  next.lastRoll = roll;

  if (pos >= BOARD_SIZE) {
    next.positions[playerId] = BOARD_SIZE;
    next.phase = "finished";
    next.winnerId = playerId;
    next.lastLog = `${log}. ${current.name} wint!`;
    return { ok: true, state: next };
  }

  next.turnIndex = (next.turnIndex + 1) % next.players.length;
  const nextPlayer = next.players[next.turnIndex];
  next.lastLog = `${log}. Beurt: ${nextPlayer.name}`;
  return { ok: true, state: next };
}

export function rollDice() {
  return 1 + Math.floor(Math.random() * 6);
}
