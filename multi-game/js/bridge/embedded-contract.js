/** @typedef {'event-log' | 'snapshot'} EmbeddedSyncProfile */

/**
 * @typedef {{
 *   entry?: string,
 *   syncProfile: EmbeddedSyncProfile,
 *   roomReady: boolean,
 * }} EmbeddedManifest
 */

export const SyncProfile = Object.freeze({
  EVENT_LOG: "event-log",
  SNAPSHOT: "snapshot",
});

/**
 * @param {EmbeddedManifest | undefined} manifest
 * @returns {boolean}
 */
export function isRoomPlayable(manifest) {
  return manifest?.roomReady === true;
}

/**
 * @param {import('./bridge-transport.js').BridgeTransport} transport
 * @param {Record<string, unknown>} init
 * @returns {import('./embedded-bootstrap.js').EmbeddedContext}
 */
export function contextFromInit(transport, init) {
  return {
    transport,
    role: /** @type {'host'|'guest'} */ (init.role),
    roomCode: String(init.roomCode || ""),
    sessionId: String(init.sessionId || ""),
    gameId: String(init.gameId || ""),
    playerId: String(init.playerId || ""),
    name: String(init.name || "").trim() || "Speler",
    roster: Array.isArray(init.roster)
      ? init.roster.map((m) => ({
          playerId: String(/** @type {{ playerId?: string }} */ (m).playerId || ""),
          name: String(/** @type {{ name?: string }} */ (m).name || "").trim() || "Speler",
        }))
      : [],
    log: /** @type {import('../sync/event-log.js').SyncPacket} */ (init.log),
  };
}
