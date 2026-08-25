import { runEmbeddedGame } from "../../js/bridge/embedded-bootstrap.js";
import {
  hideEmbeddedLeaveButtons,
  stripEmbeddedChrome,
  applySpectatorMode,
} from "../../js/shell/embedded-chrome.js";
import { bootstrapRoomEmbedded, patchP2pSessionForRoom } from "./room-embedded.js";

patchP2pSessionForRoom();

runEmbeddedGame({
  gameId: "robotrun",
  prepareUI() {
    stripEmbeddedChrome();
    hideEmbeddedLeaveButtons(".embedded-leave");

    if (window.RobotRallyApp && !window.RobotRallyApp.engine) {
      window.RobotRallyApp.init({ embedded: true });
    }
  },
  start(ctx) {
    applySpectatorMode(ctx.participation === "spectator");
    stripEmbeddedChrome();
    hideEmbeddedLeaveButtons(".embedded-leave");
    bootstrapRoomEmbedded(ctx);
  },
});
