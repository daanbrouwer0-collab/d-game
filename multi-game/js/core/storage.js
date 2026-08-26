/**
 * Local profile, friends, room memory, event-log blobs.
 * No server — browser storage only.
 */

import {
  saveRoom as saveActiveRoom,
  loadRoom as loadActiveRoom,
  clearRoom as clearActiveRoom,
  listRecent,
  listAllRecent,
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
const PLAYER_ID_KEY = "dgame.playerId";

/** @returns {string} */
function toHex2(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Mostly gray with a hint of color (~3/4 gray, ~1/4 chroma).
 * Same hue family for pijl / lichaam / ogen so it still reads as one character.
 */
function randomMutedCharacterColors() {
  const baseHue = Math.random() * 360;
  const mk = (lightnessBias, hueShift = 0) => {
    const h = (baseHue + hueShift + 360) % 360;
    // ~18–28% saturation ≈ one quarter color, three quarters gray.
    const s = 0.18 + Math.random() * 0.1;
    const l = 0.32 + lightnessBias * 0.38 + (Math.random() * 0.05 - 0.025);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return `#${toHex2((r + m) * 255)}${toHex2((g + m) * 255)}${toHex2((b + m) * 255)}`;
  };
  return {
    head: mk(0.72, 0),
    body: mk(0.48, 8 + Math.random() * 16),
    legs: mk(0.28, -10 - Math.random() * 14),
  };
}

/** @returns {string} */
function randomPlayerName() {
  const n = 1 + Math.floor(Math.random() * 9999);
  return `Speler ${n}`;
}

/**
 * First visit: assign Speler + number and muted (~3/4 gray) character.
 * Idempotent — keeps existing profile.
 */
export function ensureLocalProfile() {
  if (!getDisplayName()) {
    setDisplayName(randomPlayerName());
  }
  if (!getCharacter()) {
    setCharacter(randomMutedCharacterColors());
  }
}

export function getDisplayName() {
  try {
    return (localStorage.getItem(NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

/**
 * Stable id for this browser — used to keep X/O when host switches.
 * @returns {string}
 */
export function getPlayerId() {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY) || "";
    if (!id) {
      id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * @returns {string}
 */
export function playerLabel() {
  ensureLocalProfile();
  return getDisplayName() || "Speler";
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
  return listAllRecent();
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
  ensureLocalProfile();
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
