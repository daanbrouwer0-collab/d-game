const ACTIVE_KEY = "dgame.room";
const RECENT_KEY = "dgame.rooms.recent";
const MAX_RECENT = 16;

/**
 * Active room (this tab) + recent rooms (this browser).
 * No global directory — static P2P has no server listing live rooms.
 */

/**
 * @typedef {{
 *   gameId?: string,
 *   role: 'host'|'guest',
 *   code: string,
 *   name: string,
 *   isRoomShell?: boolean,
 *   memberCount?: number,
 *   activeGameId?: string | null,
 *   activeSessionId?: string | null,
 * }} RoomMemory
 *
 * @typedef {RoomMemory & {
 *   lastSeen: number,
 *   summary?: string,
 *   seq?: number,
 * }} RecentRoom
 */

/**
 * @param {RoomMemory} data
 */
export function saveRoom(data) {
  try {
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  pushRecent(data);
}

/**
 * @param {string} [gameId]
 * @returns {RoomMemory | null}
 */
export function loadRoom(gameId) {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.code || !data.role) return null;
    if (gameId && data.gameId && data.gameId !== gameId) return null;
    return data;
  } catch {
    return null;
  }
}

/** @returns {RoomMemory | null} */
export function loadActiveRoom() {
  return loadRoom();
}

/** Clears only the active room (not recent history). */
export function clearRoom() {
  try {
    sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {RoomMemory} data
 */
export function pushRecent(data) {
  try {
    const extra = /** @type {RecentRoom} */ (data);
    const code = String(data.code || "").trim().toUpperCase();
    const all = readAllRecent().filter((r) => r.code !== code);
    all.unshift({
      gameId: data.gameId || "",
      code,
      role: data.role,
      name: data.name,
      lastSeen: Date.now(),
      summary: extra.summary || "",
      seq: extra.seq || 0,
      memberCount: extra.memberCount ?? 0,
      activeGameId: extra.activeGameId ?? null,
      activeSessionId: extra.activeSessionId ?? null,
      isRoomShell: extra.isRoomShell ?? false,
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(all.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} gameId
 * @returns {RecentRoom[]}
 */
export function listRecent(gameId) {
  return readAllRecent()
    .filter((r) => r.gameId === gameId && r.code)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

/**
 * @returns {RecentRoom[]}
 */
export function listAllRecent() {
  return readAllRecent()
    .filter((r) => r.code)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function readAllRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} gameId
 * @param {string} code
 */
export function removeRecent(gameId, code) {
  try {
    const c = String(code || "").trim().toUpperCase();
    const next = readAllRecent().filter(
      (r) => !(r.gameId === gameId && r.code === c),
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} code
 */
export function removeRecentByCode(code) {
  try {
    const c = String(code || "").trim().toUpperCase();
    const next = readAllRecent().filter((r) => r.code !== c);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
