import { appendEvent, createEventLog } from "./event-log.js";
import { ROOM_GAME_ID } from "./log-keys.js";

export const RoomEvent = Object.freeze({
  CREATED: "room.created",
  MEMBER_JOIN: "room.member_join",
  MEMBER_LEAVE: "room.member_leave",
  MEMBER_READY: "room.member_ready",
  GAME_VOTE: "room.game_vote",
  CHAT_MESSAGE: "room.chat_message",
  SESSION_START: "room.session_start",
  SESSION_END: "room.session_end",
});

export function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createRoomLog(roomCode) {
  const log = createEventLog(ROOM_GAME_ID);
  log.meta = {
    scope: "room",
    roomCode: String(roomCode || "").trim().toUpperCase(),
  };
  return log;
}

export function createSessionLog(roomCode, sessionId, gameId) {
  const log = createEventLog(gameId);
  log.meta = { scope: "session", roomCode, sessionId };
  return log;
}

/**
 * @param {import("./event-log.js").EventLog} log
 */
export function replayRoom(log) {
  /** @type {Map<string, { playerId: string, name: string, ready: boolean }>} */
  const members = new Map();
  /** @type {{ sessionId: string, gameId: string } | null} */
  let activeSession = null;
  /** @type {{ sessionId: string, gameId: string, reason: string }[]} */
  const history = [];
  /** @type {Map<string, string>} */
  const votes = new Map();
  /** @type {string | null} */
  let hostPlayerId = null;
  /** @type {{ messageId: string, playerId: string, name: string, text: string, ts: number, seq: number }[]} */
  const chat = [];
  let chatSeq = 0;

  for (const ev of log?.events || []) {
    const p = /** @type {Record<string, unknown>} */ (ev.payload || {});
    switch (ev.type) {
      case RoomEvent.CREATED: {
        hostPlayerId = String(p.hostPlayerId || "") || null;
        break;
      }
      case RoomEvent.MEMBER_JOIN: {
        const playerId = String(p.playerId || "");
        const name = String(p.name || "").trim() || "Speler";
        if (!playerId) break;
        const prev = members.get(playerId);
        members.set(playerId, { playerId, name, ready: prev?.ready ?? false });
        break;
      }
      case RoomEvent.MEMBER_LEAVE: {
        members.delete(String(p.playerId || ""));
        break;
      }
      case RoomEvent.MEMBER_READY: {
        const playerId = String(p.playerId || "");
        const m = members.get(playerId);
        if (m) m.ready = !!p.ready;
        break;
      }
      case RoomEvent.GAME_VOTE: {
        const playerId = String(p.playerId || "");
        const gameId = String(p.gameId || "");
        if (!playerId) break;
        if (!gameId) votes.delete(playerId);
        else votes.set(playerId, gameId);
        break;
      }
      case RoomEvent.CHAT_MESSAGE: {
        const messageId = String(p.messageId || "");
        const playerId = String(p.playerId || "");
        const name = String(p.name || "").trim() || "Speler";
        const text = String(p.text || "");
        const ts = Number(p.ts) || 0;
        if (!messageId || !playerId || !text) break;
        chat.push({ messageId, playerId, name, text, ts, seq: ev.seq });
        chatSeq = ev.seq;
        break;
      }
      case RoomEvent.SESSION_START: {
        votes.clear();
        activeSession = {
          sessionId: String(p.sessionId || ""),
          gameId: String(p.gameId || ""),
        };
        break;
      }
      case RoomEvent.SESSION_END: {
        history.push({
          sessionId: String(p.sessionId || ""),
          gameId: String(p.gameId || ""),
          reason: String(p.reason || "finished"),
        });
        if (activeSession?.sessionId === p.sessionId) activeSession = null;
        votes.clear();
        break;
      }
      default:
        break;
    }
  }
  return { members, activeSession, history, votes, hostPlayerId, chat, chatSeq };
}

export function commitRoomEvent(log, type, payload) {
  return appendEvent(log, type, payload);
}
