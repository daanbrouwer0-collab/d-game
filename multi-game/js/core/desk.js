import { getGame } from "./catalog.js";
import { loadEventLog, saveEventLog } from "./storage.js";
import {
  coerceEventLog,
  createEventLog,
  tipSeq,
} from "../sync/event-log.js";
import {
  listAllRecent,
  pushRecent,
  removeRecent,
} from "../p2p/room-memory.js";
import { navigateInShell, toHashPath } from "../shell/site-url.js";

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

/**
 * @param {{
 *   gameId: string,
 *   code: string,
 *   role: 'host'|'guest',
 *   name?: string,
 *   summary?: string,
 *   seq?: number,
 * }} room
 */
export function touchDeskRoom(room) {
  const code = String(room.code || "").trim().toUpperCase();
  if (!room.gameId || !code) return;
  pushRecent({
    gameId: room.gameId,
    code,
    role: room.role,
    name: room.name || room.role,
    summary: room.summary || "",
    seq: room.seq ?? 0,
  });
}

/**
 * @param {string} gameId
 * @param {string} code
 */
export function forgetDeskRoom(gameId, code) {
  removeRecent(gameId, code);
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
    const game = getGame(r.gameId);
    const folder = (game?.path || `${r.gameId}/`).replace(/^\//, "");
    const href = `${root}${folder}`;
    const q = `room=${encodeURIComponent(r.code)}`;
    const log = loadRoomLog(r.gameId, r.code);
    const seq = r.seq || tipSeq(log);
    return {
      gameId: r.gameId,
      code: r.code,
      role: r.role,
      title: game?.title || r.gameId,
      summary:
        r.summary || (seq ? `${seq} zetten in de keten` : "Nog geen zetten"),
      seq,
      lastSeen: r.lastSeen || 0,
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
  const game = getGame(card.gameId);
  const path = game?.path || `${card.gameId}/`;
  /** @type {Record<string, string>} */
  const params = { room: card.code };
  if (intent === "host") params.as = "host";
  navigateInShell(path, params);
}
