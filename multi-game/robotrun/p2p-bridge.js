/**
 * Minimal stubs for RobotRun standalone + room-embedded.
 * Standalone multiplayer uses room shell; this file no longer hosts PeerJS lobbies.
 */
import { getPlayerId, playerLabel } from "../js/core/storage.js";
import {
  appendEvent,
  coerceEventLog,
  createEventLog,
  encodeSyncPacket,
  mergeLogs,
  parseSyncPacket,
  tipSeq,
} from "../js/sync/event-log.js";
import { mountShellNav } from "../js/shell/nav.js";
import { setupStandaloneLocalGame } from "../js/shell/room-only-multiplayer.js";
import {
  clearRoomFromUrl,
  isEmbeddedGame,
  readHostIntentFromUrl,
  readRoomFromUrl,
  writeRoomToUrl,
} from "../js/shell/site-url.js";

if (!isEmbeddedGame()) {
  mountShellNav({ active: "games", base: "../" });
  setupStandaloneLocalGame();
}

window.RobotRunP2P = {
  getPlayerId,
  playerLabel,
  readRoomFromUrl,
  writeRoomToUrl,
  clearRoomFromUrl,
  readHostIntentFromUrl,
  appendEvent,
  coerceEventLog,
  createEventLog,
  encodeSyncPacket,
  mergeLogs,
  parseSyncPacket,
  tipSeq,
};
