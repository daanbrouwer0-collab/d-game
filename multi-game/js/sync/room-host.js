import { createHostCommit } from "./host-commit.js";
import { RoomEvent } from "./room-log.js";
import { ROOM_GAME_ID } from "./log-keys.js";
import { encodeSyncPacket } from "./event-log.js";
import { RoomMsg } from "./room-msg.js";

const CHAT_MAX_LEN = 500;
const CHAT_RATE_MAX = 10;
const CHAT_RATE_WINDOW_MS = 60_000;

/**
 * @param {import("./event-log.js").EventLog} log
 * @param {string} playerId
 * @returns {boolean}
 */
function chatRateOk(log, playerId) {
  const now = Date.now();
  const cutoff = now - CHAT_RATE_WINDOW_MS;
  let count = 0;
  for (let i = log.events.length - 1; i >= 0; i--) {
    const ev = log.events[i];
    if (ev.type !== RoomEvent.CHAT_MESSAGE) continue;
    const p = /** @type {{ playerId?: string, ts?: number }} */ (ev.payload || {});
    if (String(p.playerId || "") !== playerId) continue;
    const ts = Number(p.ts) || 0;
    if (ts < cutoff) break;
    count++;
    if (count >= CHAT_RATE_MAX) return false;
  }
  return true;
}

export function createRoomHostCommit() {
  const commit = createHostCommit({ gameId: ROOM_GAME_ID });
  return {
    ...commit,
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ playerId: string, name: string }} member
     */
    joinMember(log, { playerId, name }) {
      const exists = log.events.some(
        (e) =>
          e.type === RoomEvent.MEMBER_JOIN &&
          /** @type {{ playerId?: string }} */ (e.payload)?.playerId ===
            playerId,
      );
      if (exists) return { ok: true, log };
      return commit.commit(log, RoomEvent.MEMBER_JOIN, { playerId, name });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {string} playerId
     * @param {boolean} ready
     */
    setReady(log, playerId, ready) {
      return commit.commit(log, RoomEvent.MEMBER_READY, { playerId, ready });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ playerId: string, gameId: string }} opts
     */
    voteGame(log, { playerId, gameId }) {
      return commit.commit(log, RoomEvent.GAME_VOTE, { playerId, gameId });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ playerId: string, name: string, text: string }} opts
     */
    postChat(log, { playerId, name, text }) {
      const trimmed = String(text || "").trim();
      if (!trimmed) return { ok: false, reason: "empty" };
      if (trimmed.length > CHAT_MAX_LEN) {
        return { ok: false, reason: "too_long" };
      }
      if (!chatRateOk(log, playerId)) {
        return { ok: false, reason: "rate_limit" };
      }
      const messageId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      return commit.commit(log, RoomEvent.CHAT_MESSAGE, {
        messageId,
        playerId,
        name: String(name || "").trim() || "Speler",
        text: trimmed,
        ts: Date.now(),
      });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ sessionId: string, gameId: string, roster: unknown[] }} opts
     */
    startSession(log, { sessionId, gameId, roster }) {
      return commit.commit(log, RoomEvent.SESSION_START, {
        sessionId,
        gameId,
        roster,
      });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ sessionId: string, gameId: string, reason: string, summary?: string }} opts
     */
    endSession(log, { sessionId, gameId, reason, summary }) {
      return commit.commit(log, RoomEvent.SESSION_END, {
        sessionId,
        gameId,
        reason,
        summary,
      });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ sessionId: string, playerId: string }} opts
     */
    setPlayerInGame(log, { sessionId, playerId }) {
      return commit.commit(log, RoomEvent.SESSION_PLAYER_IN, {
        sessionId,
        playerId,
      });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {{ sessionId: string, playerId: string }} opts
     */
    setPlayerOutGame(log, { sessionId, playerId }) {
      return commit.commit(log, RoomEvent.SESSION_PLAYER_OUT, {
        sessionId,
        playerId,
      });
    },
    /**
     * @param {import("./event-log.js").EventLog} log
     * @param {number} [fromSeq]
     */
    encodeRoomLog(log, fromSeq = 0) {
      return { type: RoomMsg.ROOM_LOG, packet: encodeSyncPacket(log, fromSeq) };
    },
  };
}
