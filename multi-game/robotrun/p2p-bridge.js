import { createRoom } from "../js/core/room.js";
import { drawQr } from "../js/shell/qr-ui.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { showHostInviteCard } from "../js/shell/p2p-invite-ui.js";
import { mountShellNav } from "../js/shell/nav.js";
import {
  clearRoomFromUrl,
  readRoomFromUrl,
  writeRoomToUrl,
} from "../js/shell/site-url.js";

mountShellNav({ active: "games", base: "../" });

window.RobotRunP2P = {
  createRoom,
  drawQr,
  parseP2pInvite,
  openQrScanner,
  showHostInviteCard,
  readRoomFromUrl,
  writeRoomToUrl,
  clearRoomFromUrl,
};
