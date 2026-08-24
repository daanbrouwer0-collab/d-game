const ACTIVE_KEY = "dgame.room";
const RECENT_KEY = "dgame.rooms.recent";
const MAX_RECENT = 8;

/**
 * Active room (this tab) + recent rooms (this browser).
 * No global directory — static P2P has no server listing live rooms.
 */

/**
 * @typedef {{
 *   gameId: string,
 *   role: 'host'|'guest',
 *   code: string,
 *   name: string,
 * }} RoomMemory
 *
 * @typedef {RoomMemory & { lastSeen: number }} RecentRoom
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
 * @param {string} gameId
 * @returns {RoomMemory | null}
 */
export function loadRoom(gameId) {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.gameId !== gameId || !data.code || !data.role) return null;
    return data;
  } catch {
    return null;
  }
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
    const list = listRecent(data.gameId).filter(
      (r) => r.code !== data.code || r.role !== data.role,
    );
    list.unshift({
      gameId: data.gameId,
      code: data.code,
      role: data.role,
      name: data.name,
      lastSeen: Date.now(),
    });
    const trimmed = list.slice(0, MAX_RECENT);
    const all = readAllRecent().filter((r) => r.gameId !== data.gameId);
    localStorage.setItem(RECENT_KEY, JSON.stringify([...trimmed, ...all]));
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
    const next = readAllRecent().filter(
      (r) => !(r.gameId === gameId && r.code === code),
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
