import { createRoom } from "../js/core/room.js";
import { loadRoomLog, saveRoomLog, touchDeskRoom } from "../js/core/desk.js";
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
import { drawQr } from "../js/shell/qr-ui.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { showHostInviteCard } from "../js/shell/p2p-invite-ui.js";
import { mountShellNav, mountRoomStrip } from "../js/shell/nav.js";
import {
  clearRoomFromUrl,
  readHostIntentFromUrl,
  readRoomFromUrl,
  writeRoomToUrl,
} from "../js/shell/site-url.js";

mountShellNav({ active: "games", base: "../" });
mountRoomStrip({ base: "../", currentGameId: "robotrun" });

window.RobotRunP2P = {
  createRoom,
  drawQr,
  parseP2pInvite,
  openQrScanner,
  showHostInviteCard,
  readRoomFromUrl,
  writeRoomToUrl,
  clearRoomFromUrl,
  readHostIntentFromUrl,
  getPlayerId,
  playerLabel,
  loadRoomLog,
  saveRoomLog,
  touchDeskRoom,
  appendEvent,
  coerceEventLog,
  createEventLog,
  encodeSyncPacket,
  mergeLogs,
  parseSyncPacket,
  tipSeq,
};
