/**
 * Game catalog — no Single/Multi modes.
 * @typedef {import('../bridge/embedded-contract.js').EmbeddedManifest} EmbeddedManifest
 * @typedef {{
 *   id: string,
 *   title: string,
 *   path: string,
 *   image: string,
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
    id: "robotrun",
    title: "RobotRun",
    path: "robotrun/",
    image: "robotrun/img/D-RobotRally.jpg",
    minPlayers: 2,
    maxPlayers: 5,
    blurb: "RoboRally — programmeer je robot over de checkpoints. Race live tegen elkaar!",
    tags: ["bordspel", "tactisch", "populair"],
    embedded: {
      entry: "js/embedded.js",
      syncProfile: "snapshot",
      roomReady: true,
    },
  },
  {
    id: "ganzenbord",
    title: "Ganzenbord",
    path: "ganzenbord/",
    image: "assets/games/ganzenbord.svg",
    minPlayers: 2,
    maxPlayers: 6,
    blurb: "Klassiek spiraalbord (63 vakjes) — tot 6 spelers via room of hotseat.",
    tags: ["bordspel", "lobby"],
    embedded: {
      entry: "embedded.js",
      syncProfile: "event-log",
      roomReady: true,
    },
  },
  {
    id: "tic-tac-toe",
    title: "Tic Tac Toe",
    path: "tic-tac-toe/",
    image: "assets/games/tic-tac-toe.svg",
    minPlayers: 2,
    maxPlayers: 2,
    blurb: "4×4 met geblokkeerde vakjes — 3 op rij of kolom. Snel en tactisch.",
    tags: ["snel", "2 spelers"],
    embedded: {
      entry: "embedded.js",
      syncProfile: "event-log",
      roomReady: true,
    },
  },
];

/**
 * @param {GameEntry} game
 * @param {string} [base]
 * @returns {string}
 */
export function resolveGameImageUrl(game, base = "") {
  if (!game || !game.image) return "";
  const prefix = base.endsWith("/") || base === "" ? base : `${base}/`;
  return `${prefix}${game.image}`;
}

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

