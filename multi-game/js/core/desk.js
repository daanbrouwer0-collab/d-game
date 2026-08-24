import { getGame } from "./catalog.js";
import { loadEventLog, saveEventLog } from "./storage.js";
import {
  coerceEventLog,
  createEventLog,
} from "../sync/event-log.js";
import {
  roomLogKey as p2pRoomLogKey,
  sessionLogKey,
  ROOM_GAME_ID,
} from "../sync/log-keys.js";
import { createRoomLog } from "../sync/room-log.js";
import {
  listAllRecent,
  pushRecent,
  removeRecent,
  removeRecentByCode,
} from "../p2p/room-memory.js";
import { navigateInShell, toHashPath, ROOM_PATH } from "../shell/site-url.js";

/**
 * @param {string} gameId
 * @param {string} code
 */
export function roomLogKey(gameId, code) {
  return `p2p:${gameId}:${String(code || "").trim().toUpperCase()}`;
}

/**
 * @param {string} gameId
 * @param {string} code
 * @returns {import('../sync/event-log.js').EventLog}
 */
export function loadRoomLog(gameId, code) {
  const raw = loadEventLog(roomLogKey(gameId, code));
  return coerceEventLog(raw, gameId) || createEventLog(gameId);
}

/**
 * @param {string} gameId
 * @param {string} code
 * @param {import('../sync/event-log.js').EventLog} log
 */
export function saveRoomLog(gameId, code, log) {
  saveEventLog(roomLogKey(gameId, code), log);
}

export function loadRoomLogByCode(code) {
  const raw = loadEventLog(p2pRoomLogKey(code));
  return coerceEventLog(raw, ROOM_GAME_ID) || createRoomLog(code);
}

export function saveRoomLogByCode(code, log) {
  saveEventLog(p2pRoomLogKey(code), log);
}

export function loadSessionLog(code, sessionId, gameId) {
  const raw = loadEventLog(sessionLogKey(code, sessionId, gameId));
  return coerceEventLog(raw, gameId) || createEventLog(gameId);
}

export function saveSessionLog(code, sessionId, gameId, log) {
  saveEventLog(sessionLogKey(code, sessionId, gameId), log);
}

/**
 * @param {{
 *   code: string,
 *   role: 'host'|'guest',
 *   name?: string,
 *   summary?: string,
 *   seq?: number,
 *   gameId?: string,
 *   memberCount?: number,
 *   activeGameId?: string | null,
 *   activeSessionId?: string | null,
 * }} room
 */
export function touchDeskRoom(room) {
  const code = String(room.code || "").trim().toUpperCase();
  if (!code) return;
  pushRecent({
    gameId: room.activeGameId || room.gameId || "",
    code,
    role: room.role,
    name: room.name || room.role,
    summary: room.summary || "",
    seq: room.seq ?? 0,
    memberCount: room.memberCount ?? 0,
    activeGameId: room.activeGameId || null,
    activeSessionId: room.activeSessionId || null,
    isRoomShell: !room.activeGameId && !room.gameId,
  });
}

/**
 * @param {string} gameId
 * @param {string} code
 */
export function forgetDeskRoom(gameId, code) {
  if (gameId) removeRecent(gameId, code);
  else removeRecentByCode(code);
}

/**
 * @typedef {{
 *   gameId: string,
 *   code: string,
 *   role: 'host'|'guest',
 *   title: string,
 *   summary: string,
 *   seq: number,
 *   lastSeen: number,
 *   memberCount?: number,
 *   activeGameId?: string | null,
 *   isRoomShell?: boolean,
 *   openHref: string,
 *   hostHref: string,
 *   joinHref: string,
 * }} DeskCard
 */

/**
 * @param {string} [base]
 * @returns {DeskCard[]}
 */
export function listDeskCards(base = "") {
  const root = base.endsWith("/") || base === "" ? base : `${base}/`;
  return listAllRecent().map((r) => {
    const code = r.code;
    const q = `room=${encodeURIComponent(code)}`;
    const roomHref = `${root}${ROOM_PATH}?${q}`;
    const n = r.memberCount || 0;
    const activeGameId = r.activeGameId || r.gameId || "";
    const game = activeGameId ? getGame(activeGameId) : null;
    let title = `Room ${code}`;
    let summary = r.summary || "";
    if (!summary) {
      summary = n ? `${n} speler${n === 1 ? "" : "s"}` : "Lobby";
    }
    if (game && r.activeGameId) {
      title = `Room ${code} · ${game.title}`;
    }
    return {
      gameId: activeGameId,
      code,
      role: r.role,
      title,
      summary,
      seq: r.seq || 0,
      lastSeen: r.lastSeen || 0,
      memberCount: r.memberCount,
      activeGameId: r.activeGameId,
      isRoomShell: true,
      openHref: roomHref,
      hostHref: `${roomHref}&as=host`,
      joinHref: roomHref,
    };
  });
}

/**
 * @param {DeskCard} card
 * @param {'open'|'host'|'join'} [intent]
 */
export function deskHashHref(card, intent = "open") {
  const game = getGame(card.gameId);
  const path = toHashPath(game?.path || `${card.gameId}/`);
  const params = new URLSearchParams();
  params.set("room", card.code);
  if (intent === "host") params.set("as", "host");
  return `#${path}?${params.toString()}`;
}

/**
 * Open / join / host a desk room without hitting the jsDelivr <base> URL.
 * @param {DeskCard} card
 * @param {'open'|'host'|'join'} [intent]
 */
export function navigateDeskCard(card, intent = "open") {
  /** @type {Record<string, string>} */
  const params = { room: card.code };
  if (intent === "host") params.as = "host";
  navigateInShell(ROOM_PATH, params);
}
