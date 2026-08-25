/**
 * Game catalog — no Single/Multi modes.
 * @typedef {import('../bridge/embedded-contract.js').EmbeddedManifest} EmbeddedManifest
 * @typedef {{
 *   id: string,
 *   title: string,
 *   path: string,
 *   minPlayers: number,
 *   maxPlayers: number,
 *   blurb: string,
 *   tags?: string[],
 *   embedded?: EmbeddedManifest,
 * }} GameEntry
 */

/** @type {GameEntry[]} */
export const GAMES = [
  {
    id: "tic-tac-toe",
    title: "Tic Tac Toe",
    path: "tic-tac-toe/",
    minPlayers: 2,
    maxPlayers: 2,
    blurb: "4×4 met geblokkeerde vakjes — 3 op rij/kolom. Room of hotseat.",
    tags: ["snel", "2 spelers"],
    embedded: {
      entry: "embedded.js",
      syncProfile: "event-log",
      roomReady: true,
    },
  },
  {
    id: "ganzenbord",
    title: "Ganzenbord",
    path: "ganzenbord/",
    minPlayers: 2,
    maxPlayers: 6,
    blurb: "Klassiek spiraalbord (63) — tot 6 spelers via room of hotseat.",
    tags: ["bordspel", "lobby"],
    embedded: {
      entry: "embedded.js",
      syncProfile: "event-log",
      roomReady: true,
    },
  },
  {
    id: "robotrun",
    title: "RobotRun",
    path: "robotrun/",
    minPlayers: 2,
    maxPlayers: 5,
    blurb: "RoboRally — hotseat of room (2–5 spelers, room-modus volgt).",
    tags: ["bordspel", "tactisch", "p2p"],
    embedded: {
      entry: "js/embedded.js",
      syncProfile: "snapshot",
      roomReady: true,
    },
  },
];

/**
 * @param {string} id
 * @returns {GameEntry | undefined}
 */
export function getGame(id) {
  return GAMES.find((g) => g.id === id);
}

/**
 * @param {number} count
 * @returns {GameEntry[]}
 */
export function gamesForPlayerCount(count) {
  const n = Math.max(0, Math.floor(count));
  return GAMES.filter((g) => n >= g.minPlayers && n <= g.maxPlayers);
}

/**
 * Spellen die in de room gestart kunnen worden (embedded klaar).
 * @param {number} count
 * @returns {GameEntry[]}
 */
export function roomReadyGames(count) {
  return gamesForPlayerCount(count).filter((g) => g.embedded?.roomReady === true);
}
