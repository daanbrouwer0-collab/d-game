/**
 * Append-only game event log for QR (and later other) sync.
 */

/**
 * @typedef {{
 *   id: string,
 *   prevId: string | null,
 *   seq: number,
 *   type: string,
 *   payload: unknown,
 *   ts: number,
 * }} GameEvent
 *
 * @typedef {{
 *   gameId: string,
 *   events: GameEvent[],
 * }} EventLog
 *
 * @typedef {{
 *   v: 1,
 *   gameId: string,
 *   fromSeq: number,
 *   events: GameEvent[],
 * }} SyncPacket
 */

/**
 * @param {string} gameId
 * @returns {EventLog}
 */
export function createEventLog(gameId) {
  return { gameId, events: [] };
}

/**
 * @returns {string}
 */
function newId() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {EventLog} log
 * @param {string} type
 * @param {unknown} [payload]
 * @returns {{ ok: true, log: EventLog, event: GameEvent } | { ok: false, reason: string }}
 */
export function appendEvent(log, type, payload = null) {
  if (!type) return { ok: false, reason: "type verplicht" };
  const prev = log.events[log.events.length - 1] || null;
  const event = {
    id: newId(),
    prevId: prev ? prev.id : null,
    seq: prev ? prev.seq + 1 : 1,
    type,
    payload,
    ts: Date.now(),
  };
  return {
    ok: true,
    log: { gameId: log.gameId, events: [...log.events, event] },
    event,
  };
}

/**
 * @param {EventLog} log
 * @param {number} afterSeq
 * @returns {GameEvent[]}
 */
export function getMissingSince(log, afterSeq) {
  return log.events.filter((e) => e.seq > afterSeq);
}

/**
 * @param {EventLog} log
 * @param {number} [fromSeq]
 * @returns {SyncPacket}
 */
export function encodeSyncPacket(log, fromSeq = 0) {
  return {
    v: 1,
    gameId: log.gameId,
    fromSeq,
    events: getMissingSince(log, fromSeq),
  };
}

/**
 * @param {unknown} raw
 * @returns {SyncPacket | null}
 */
export function parseSyncPacket(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const p = /** @type {Partial<SyncPacket>} */ (data);
  if (p.v !== 1 || typeof p.gameId !== "string" || !Array.isArray(p.events)) {
    return null;
  }
  return /** @type {SyncPacket} */ (p);
}

/**
 * Merge packet into log (host or peer). Rejects wrong gameId / broken chain.
 * @param {EventLog} log
 * @param {SyncPacket} packet
 * @returns {{ ok: true, log: EventLog, applied: number } | { ok: false, reason: string }}
 */
export function applySyncPacket(log, packet) {
  if (packet.gameId !== log.gameId) {
    return { ok: false, reason: `Verkeerd spel: ${packet.gameId}` };
  }
  let events = log.events.slice();
  let applied = 0;
  const byId = new Set(events.map((e) => e.id));

  const sorted = packet.events.slice().sort((a, b) => a.seq - b.seq);
  for (const ev of sorted) {
    if (!ev?.id || typeof ev.seq !== "number" || !ev.type) {
      return { ok: false, reason: "Ongeldig event" };
    }
    if (byId.has(ev.id)) continue;
    const last = events[events.length - 1] || null;
    if (last) {
      if (ev.seq !== last.seq + 1) {
        return {
          ok: false,
          reason: `Gap in keten (verwacht seq ${last.seq + 1}, kreeg ${ev.seq})`,
        };
      }
      if (ev.prevId !== last.id) {
        return { ok: false, reason: "prevId mismatch" };
      }
    } else if (ev.seq !== 1 || ev.prevId != null) {
      return { ok: false, reason: "Eerste event moet seq=1 zijn" };
    }
    events.push(ev);
    byId.add(ev.id);
    applied += 1;
  }
  return { ok: true, log: { gameId: log.gameId, events }, applied };
}

/**
 * Compact string for QR (ASCII-safe).
 * @param {SyncPacket} packet
 */
export function packetToQrText(packet) {
  return JSON.stringify(packet);
}

/**
 * @param {string} text
 * @returns {SyncPacket | null}
 */
export function packetFromQrText(text) {
  return parseSyncPacket(text.trim());
}

/**
 * @param {EventLog} log
 * @returns {number}
 */
export function tipSeq(log) {
  const last = log.events[log.events.length - 1];
  return last ? last.seq : 0;
}

/**
 * @param {EventLog} log
 * @returns {string | null}
 */
export function tipEventId(log) {
  const last = log.events[log.events.length - 1];
  return last ? last.id : null;
}

/**
 * @param {unknown} raw
 * @returns {EventLog | null}
 */
export function coerceEventLog(raw, gameId) {
  if (!raw || typeof raw !== "object") return null;
  const log = /** @type {Partial<EventLog>} */ (raw);
  if (typeof log.gameId !== "string" || !Array.isArray(log.events)) return null;
  if (gameId && log.gameId !== gameId) return null;
  return /** @type {EventLog} */ (log);
}

/**
 * Guest adopts host truth. Never "preferred local" on fork.
 * @param {EventLog} localLog
 * @param {SyncPacket} packet
 * @returns {{ ok: true, log: EventLog } | { ok: false, reason: string, log: EventLog }}
 */
export function adoptHostPacket(localLog, packet) {
  if (!packet || packet.gameId !== localLog.gameId) {
    return { ok: false, reason: "gameId", log: localLog };
  }
  if (!localLog.events.length) {
    const applied = applySyncPacket(createEventLog(localLog.gameId), {
      v: 1,
      gameId: packet.gameId,
      fromSeq: 0,
      events: packet.events,
    });
    return applied.ok
      ? { ok: true, log: applied.log }
      : { ok: false, reason: applied.reason, log: localLog };
  }
  const applied = applySyncPacket(localLog, packet);
  if (applied.ok) return { ok: true, log: applied.log };
  return { ok: false, reason: applied.reason || "gap", log: localLog };
}

/**
 * Full replace from host welcome / resync response.
 * @param {string} gameId
 * @param {SyncPacket} packet
 * @returns {{ ok: true, log: EventLog, applied: number } | { ok: false, reason: string }}
 */
export function replaceFromHostPacket(gameId, packet) {
  if (!packet || packet.gameId !== gameId) {
    return { ok: false, reason: "gameId", log: createEventLog(gameId) };
  }
  return applySyncPacket(createEventLog(gameId), {
    v: 1,
    gameId,
    fromSeq: 0,
    events: packet.events,
  });
}

/**
 * @deprecated Prefer adoptHostPacket / replaceFromHostPacket for P2P guests.
 * Bidirectional merge can prefer local on fork — unsafe for log-only canon.
 * Longest valid chain wins. Forks: keep `preferred`.
 * @param {EventLog} preferred
 * @param {EventLog | null | undefined} other
 * @returns {EventLog}
 */
export function mergeLogs(preferred, other) {
  if (!other || !other.events?.length) return preferred;
  if (!preferred.events.length) {
    const ontoEmpty = applySyncPacket(createEventLog(preferred.gameId), {
      v: 1,
      gameId: other.gameId,
      fromSeq: 0,
      events: other.events,
    });
    return ontoEmpty.ok ? ontoEmpty.log : preferred;
  }
  const packetOther = encodeSyncPacket(other, 0);
  const ontoPreferred = applySyncPacket(preferred, packetOther);
  const packetPref = encodeSyncPacket(preferred, 0);
  const ontoOther = applySyncPacket(other, packetPref);
  if (ontoPreferred.ok && ontoOther.ok) {
    return tipSeq(ontoPreferred.log) >= tipSeq(ontoOther.log)
      ? ontoPreferred.log
      : ontoOther.log;
  }
  if (ontoPreferred.ok) return ontoPreferred.log;
  if (ontoOther.ok) return ontoOther.log;
  return preferred;
}
