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
    if (!window.RobotRallyApp?.init) {
      throw new Error("RobotRun boot: RobotRallyApp ontbreekt (main.js niet geladen)");
    }
    if (!window.RobotRallyApp.engine) {
      window.RobotRallyApp.init({ embedded: true });
    }
    if (!window.P2pSessionController) {
      throw new Error("RobotRun boot: P2pSessionController ontbreekt");
    }
  },
  start(ctx) {
    applySpectatorMode(ctx.participation === "spectator");
    stripEmbeddedChrome();
    hideEmbeddedLeaveButtons(".embedded-leave");
    if (!window.RobotRallyApp?.engine) {
      throw new Error("RobotRun boot: engine niet geïnitialiseerd");
    }
    bootstrapRoomEmbedded(ctx);
  },
});
