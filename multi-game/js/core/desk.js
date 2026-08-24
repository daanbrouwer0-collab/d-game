import { getGame } from "./catalog.js";
import { loadEventLog, saveEventLog } from "./storage.js";
import {
  coerceEventLog,
  createEventLog,
  tipSeq,
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
    const activeGameId = r.activeGameId || r.gameId || "";
    const game = activeGameId ? getGame(activeGameId) : null;
    const isRoomShell = r.isRoomShell || (!activeGameId && !game);
    const q = `room=${encodeURIComponent(r.code)}`;

    let title;
    let summary = r.summary || "";
    let seq = r.seq || 0;

    if (isRoomShell || !game) {
      const n = r.memberCount || 0;
      title = `Room ${r.code}`;
      if (!summary) {
        summary = n ? `${n} speler${n === 1 ? "" : "s"}` : "Lobby";
      }
      const roomHref = `${root}${ROOM_PATH}?${q}`;
      return {
        gameId: activeGameId,
        code: r.code,
        role: r.role,
        title,
        summary,
        seq,
        lastSeen: r.lastSeen || 0,
        memberCount: r.memberCount,
        activeGameId: r.activeGameId,
        isRoomShell: true,
        openHref: roomHref,
        hostHref: `${roomHref}&as=host`,
        joinHref: roomHref,
      };
    }

    const folder = (game.path || `${activeGameId}/`).replace(/^\//, "");
    const href = `${root}${folder}`;
    const log = loadRoomLog(activeGameId, r.code);
    seq = r.seq || tipSeq(log);
    if (!summary) {
      summary = seq ? `${seq} zetten in de keten` : "Nog geen zetten";
    }
    return {
      gameId: activeGameId,
      code: r.code,
      role: r.role,
      title: game.title,
      summary,
      seq,
      lastSeen: r.lastSeen || 0,
      memberCount: r.memberCount,
      activeGameId: r.activeGameId,
      isRoomShell: false,
      openHref: `${href}?${q}`,
      hostHref: `${href}?${q}&as=host`,
      joinHref: `${href}?${q}`,
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
  if (card.isRoomShell) {
    /** @type {Record<string, string>} */
    const params = { room: card.code };
    if (intent === "host") params.as = "host";
    navigateInShell(ROOM_PATH, params);
    return;
  }
  const game = getGame(card.gameId);
  const path = game?.path || `${card.gameId}/`;
  /** @type {Record<string, string>} */
  const params = { room: card.code };
  if (intent === "host") params.as = "host";
  navigateInShell(path, params);
}
