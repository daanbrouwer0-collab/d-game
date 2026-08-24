import {
  appendEvent,
  encodeSyncPacket,
  tipEventId,
  tipSeq,
} from "./event-log.js";

/**
 * Host-side commit helpers for log-only canon.
 * @param {{ gameId: string }} opts
 */
export function createHostCommit({ gameId }) {
  /** @type {Map<string, string>} */
  const peerToPlayer = new Map();
  /** @type {Set<string>} */
  const doneTurnKeys = new Set();

  return {
    bindPeer(peerId, playerId) {
      const p = String(peerId || "");
      const id = String(playerId || "");
      if (!p || !id) return;
      peerToPlayer.set(p, id);
    },
    unbindPeer(peerId) {
      peerToPlayer.delete(String(peerId || ""));
    },
    playerForPeer(peerId) {
      return peerToPlayer.get(String(peerId || "")) || null;
    },
    /**
     * @param {import('./event-log.js').EventLog} log
     * @param {string} type
     * @param {unknown} payload
     */
    commit(log, type, payload) {
      if (log.gameId !== gameId) {
        return { ok: false, reason: "gameId" };
      }
      const added = appendEvent(log, type, payload);
      if (!added.ok) return { ok: false, reason: added.reason };
      return {
        ok: true,
        log: added.log,
        tipSeq: tipSeq(added.log),
        tipEventId: tipEventId(added.log),
        event: added.event,
      };
    },
    /**
     * @param {{
     *   log: import('./event-log.js').EventLog,
     *   fromPeerId: string,
     *   intentId?: string,
     *   actorPlayerId: string,
     *   turnKey?: string,
     *   apply: (log: import('./event-log.js').EventLog) =>
     *     | { ok: true, log: import('./event-log.js').EventLog }
     *     | { ok: false, reason?: string },
     * }} opts
     */
    acceptBoundIntent({
      log,
      fromPeerId,
      intentId,
      actorPlayerId,
      turnKey,
      apply,
    }) {
      const bound = peerToPlayer.get(String(fromPeerId || ""));
      if (!bound) return { ok: false, reason: "unbound" };
      if (String(actorPlayerId || "") !== bound) {
        return { ok: false, reason: "actor" };
      }
      if (turnKey && doneTurnKeys.has(String(turnKey))) {
        return { ok: false, reason: "turnKey" };
      }
      const result = apply(log);
      if (!result?.ok) {
        return { ok: false, reason: result?.reason || "apply" };
      }
      if (turnKey) doneTurnKeys.add(String(turnKey));
      return {
        ok: true,
        log: result.log,
        tipSeq: tipSeq(result.log),
        tipEventId: tipEventId(result.log),
        intentId,
      };
    },
    markTurnKeyDone(turnKey) {
      if (turnKey) doneTurnKeys.add(String(turnKey));
    },
    isTurnKeyDone(turnKey) {
      return doneTurnKeys.has(String(turnKey));
    },
    clearTurnKeys() {
      doneTurnKeys.clear();
    },
    encodeSince(log, fromSeq = 0) {
      return encodeSyncPacket(log, fromSeq);
    },
  };
}
