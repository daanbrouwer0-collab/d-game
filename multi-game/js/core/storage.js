/**
 * Local profile, friends, room memory, event-log blobs.
 * No server — browser storage only.
 */

import {
  saveRoom as saveActiveRoom,
  loadRoom as loadActiveRoom,
  clearRoom as clearActiveRoom,
  listRecent,
  removeRecent,
  pushRecent,
} from "../p2p/room-memory.js";

const NAME_KEY = "dgame.displayName";
const CHARACTER_KEY = "dgame.character";
const FRIENDS_KEY = "dgame.friends";
const EVENT_LOGS_KEY = "dgame.eventLogs";
const RECENT_KEY = "dgame.rooms.recent";

/**
 * @returns {string}
 */
export function getDisplayName() {
  try {
    return (localStorage.getItem(NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} name
 */
export function setDisplayName(name) {
  try {
    const trimmed = String(name || "").trim().slice(0, 20);
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {{ head: string, body: string, legs: string }} CharacterColors
 */

/**
 * @returns {CharacterColors | null}
 */
export function getCharacter() {
  try {
    const raw = localStorage.getItem(CHARACTER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return {
      head: String(data.head || "#cccccc"),
      body: String(data.body || "#888888"),
      legs: String(data.legs || "#444444"),
    };
  } catch {
    return null;
  }
}

/**
 * @param {CharacterColors} colors
 */
export function setCharacter(colors) {
  try {
    localStorage.setItem(
      CHARACTER_KEY,
      JSON.stringify({
        head: colors.head,
        body: colors.body,
        legs: colors.legs,
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {{ id: string, name: string, note?: string, createdAt: number }} Friend
 */

/**
 * @returns {Friend[]}
 */
export function listFriends() {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * @param {Friend[]} friends
 */
function saveFriends(friends) {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
}

/**
 * @param {{ name: string, note?: string }} input
 * @returns {Friend}
 */
export function addFriend({ name, note = "" }) {
  const friend = {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || "").trim().slice(0, 24) || "Vriend",
    note: String(note || "").trim().slice(0, 80),
    createdAt: Date.now(),
  };
  const list = listFriends();
  list.unshift(friend);
  saveFriends(list.slice(0, 50));
  return friend;
}

/**
 * @param {string} id
 * @param {{ name?: string, note?: string }} patch
 * @returns {Friend | null}
 */
export function updateFriend(id, patch) {
  const list = listFriends();
  const idx = list.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  if (patch.name != null) list[idx].name = String(patch.name).trim().slice(0, 24);
  if (patch.note != null) list[idx].note = String(patch.note).trim().slice(0, 80);
  saveFriends(list);
  return list[idx];
}

/**
 * @param {string} id
 */
export function removeFriend(id) {
  saveFriends(listFriends().filter((f) => f.id !== id));
}

export function clearFriends() {
  try {
    localStorage.removeItem(FRIENDS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {import('../p2p/room-memory.js').RecentRoom[]}
 */
export function listAllRecentRooms() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function clearAllRecentRooms() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Persist a named event-log snapshot (for Geheugen / QR sessions).
 * @param {string} key
 * @param {unknown} log
 */
export function saveEventLog(key, log) {
  try {
    const all = loadAllEventLogs();
    all[key] = { savedAt: Date.now(), log };
    localStorage.setItem(EVENT_LOGS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 * @returns {unknown | null}
 */
export function loadEventLog(key) {
  const all = loadAllEventLogs();
  return all[key]?.log ?? null;
}

/**
 * @returns {Record<string, { savedAt: number, log: unknown }>}
 */
export function loadAllEventLogs() {
  try {
    const raw = localStorage.getItem(EVENT_LOGS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function clearEventLogs() {
  try {
    localStorage.removeItem(EVENT_LOGS_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAllSandboxData() {
  clearFriends();
  clearAllRecentRooms();
  clearEventLogs();
  clearActiveRoom();
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CHARACTER_KEY);
    localStorage.removeItem("dgame.preferredTransport");
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ friends: number, recentRooms: number, eventLogs: number }}
 */
export function storageCounts() {
  return {
    friends: listFriends().length,
    recentRooms: listAllRecentRooms().length,
    eventLogs: Object.keys(loadAllEventLogs()).length,
  };
}

export {
  saveActiveRoom as saveRoom,
  loadActiveRoom as loadRoom,
  clearActiveRoom as clearRoom,
  listRecent,
  removeRecent,
  pushRecent,
};
