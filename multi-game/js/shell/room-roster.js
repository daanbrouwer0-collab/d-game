/**
 * Standard room roster bar (shared room shell pattern).
 * Matches ganzenbord `.player-list` / `.player-row` styling in site.css.
 */

/**
 * @param {HTMLElement | null} listEl
 * @param {HTMLElement | null} countEl
 * @param {{
 *   members: { playerId: string, name: string }[],
 *   hostPlayerId?: string | null,
 *   localPlayerId?: string,
 *   maxPlayers?: number,
 *   votes?: Map<string, string>,
 *   getGameTitle?: (gameId: string) => string,
 * }} opts
 */
export function renderRoomRoster(listEl, countEl, opts) {
  if (!listEl) return;
  const {
    members,
    hostPlayerId = null,
    localPlayerId = "",
    maxPlayers = 6,
    votes = new Map(),
    getGameTitle = (id) => id,
  } = opts;

  if (countEl) {
    countEl.textContent = `${members.length} / ${maxPlayers} spelers`;
  }

  listEl.innerHTML = "";
  listEl.className = "player-list room-roster-list";

  for (const m of members) {
    const li = document.createElement("li");
    li.className = "player-row";
    const you = m.playerId === localPlayerId ? " (jij)" : "";
    const host =
      hostPlayerId && m.playerId === hostPlayerId ? " · host" : "";
    const votedFor = votes.get(m.playerId);
    const voteLabel = votedFor
      ? ` · stem: ${getGameTitle(votedFor)}`
      : "";
    li.innerHTML = `<span><strong>${escapeHtml(m.name)}</strong>${escapeHtml(you)}${escapeHtml(host)}${escapeHtml(voteLabel)}</span>`;
    if (m.playerId === localPlayerId) li.classList.add("is-you");
    if (hostPlayerId && m.playerId === hostPlayerId) {
      li.classList.add("is-host");
    }
    listEl.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {Map<string, string>} votes playerId → gameId
 * @returns {Map<string, number>} gameId → count
 */
export function tallyVotes(votes) {
  /** @type {Map<string, number>} */
  const tallies = new Map();
  for (const gameId of votes.values()) {
    if (!gameId) continue;
    tallies.set(gameId, (tallies.get(gameId) || 0) + 1);
  }
  return tallies;
}

/**
 * @param {Map<string, number>} tallies
 * @returns {string | null}
 */
export function leadingGameId(tallies) {
  let best = null;
  let bestN = 0;
  for (const [gameId, n] of tallies) {
    if (n > bestN) {
      best = gameId;
      bestN = n;
    }
  }
  return best;
}

/**
 * Winnend spel onder speelbare games; bij gelijke stand wint vroegste in catalog-volgorde.
 * @param {Map<string, number>} tallies
 * @param {string[]} playableGameIds
 * @returns {string | null}
 */
export function pickWinningGame(tallies, playableGameIds) {
  let best = null;
  let bestN = 0;
  for (const gameId of playableGameIds) {
    const n = tallies.get(gameId) || 0;
    if (n > bestN) {
      best = gameId;
      bestN = n;
    }
  }
  return bestN > 0 ? best : null;
}
