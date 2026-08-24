/**
 * Game catalog — no Single/Multi modes.
 * @typedef {{
 *   id: string,
 *   title: string,
 *   path: string,
 *   minPlayers: number,
 *   maxPlayers: number,
 *   blurb: string,
 *   tags?: string[],
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
    blurb: "Klassiek 3×3 — P2P-deellink of QR-scan.",
    tags: ["snel", "2 spelers"],
  },
  {
    id: "ganzenbord",
    title: "Ganzenbord",
    path: "ganzenbord/",
    minPlayers: 2,
    maxPlayers: 6,
    blurb: "Lobby tot 6 spelers — P2P-deellink of QR-scan.",
    tags: ["bordspel", "lobby"],
  },
  {
    id: "robotrun",
    title: "RobotRun",
    path: "robotrun/",
    minPlayers: 2,
    maxPlayers: 5,
    blurb: "RoboRally — hotseat of P2P (2–5 spelers, QR-deellink).",
    tags: ["bordspel", "tactisch", "p2p"],
  },
];

/**
 * @param {string} id
 * @returns {GameEntry | undefined}
 */
export function getGame(id) {
  return GAMES.find((g) => g.id === id);
}
