import { runEmbeddedGame } from "../../js/bridge/embedded-bootstrap.js";
import {
  hideEmbeddedLeaveButtons,
  stripEmbeddedChrome,
  applySpectatorMode,
} from "../../js/shell/embedded-chrome.js";
import { bootstrapRoomEmbedded, patchP2pSessionForRoom } from "./room-embedded.js";

// Hide D-robotrally chrome before any room bootstrap / first paint settle.
stripEmbeddedChrome();
hideEmbeddedLeaveButtons(".embedded-leave");
patchP2pSessionForRoom();

function wireEmbeddedLayout() {
  stripEmbeddedChrome();
  hideEmbeddedLeaveButtons(".embedded-leave");
  // Scroll only inside #screen-play (CSS). Do not forward touch/wheel to the
  // room parent — that competed with native scroll and felt dead on phones.
}

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
    if (!window.RobotRallyApp?.engine) {
      throw new Error("RobotRun boot: engine niet geïnitialiseerd");
    }
    bootstrapRoomEmbedded(ctx);
    wireEmbeddedLayout();
  },
});
