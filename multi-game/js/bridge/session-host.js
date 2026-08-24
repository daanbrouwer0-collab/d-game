import { createHostCommit } from "../sync/host-commit.js";
import { encodeSyncPacket, tipSeq } from "../sync/event-log.js";
import { loadSessionLog, saveSessionLog } from "../core/desk.js";
import { RoomMsg } from "../sync/room-msg.js";

/**
 * Host-side session log helper for room shell relay mode.
 * @param {{ gameId: string, sessionId: string, roomCode: string }} opts
 */
export function createSessionHost({ gameId, sessionId, roomCode }) {
  const hostCommit = createHostCommit({ gameId });
  let log = loadSessionLog(roomCode, sessionId, gameId);

  return {
    get log() {
      return log;
    },
    bindPeer(peerId, playerId) {
      hostCommit.bindPeer(peerId, playerId);
    },
    unbindPeer(peerId) {
      hostCommit.unbindPeer(peerId);
    },
    setLog(next) {
      log = next;
      saveSessionLog(roomCode, sessionId, gameId, log);
    },
    persist() {
      saveSessionLog(roomCode, sessionId, gameId, log);
    },
    encodeWire(fromSeq = 0) {
      return {
        type: RoomMsg.SESSION_LOG,
        sessionId,
        gameId,
        packet: encodeSyncPacket(log, fromSeq),
      };
    },
    tipSeq() {
      return tipSeq(log);
    },
    hostCommit,
  };
}
