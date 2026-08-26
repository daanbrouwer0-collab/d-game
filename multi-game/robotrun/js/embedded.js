import {
  runEmbeddedGame,
  reportContentHeight,
  bindEmbeddedParentScroll,
} from "../../js/bridge/embedded-bootstrap.js";
import {
  hideEmbeddedLeaveButtons,
  stripEmbeddedChrome,
  applySpectatorMode,
} from "../../js/shell/embedded-chrome.js";
import { bootstrapRoomEmbedded, patchP2pSessionForRoom } from "./room-embedded.js";

patchP2pSessionForRoom();

function wireEmbeddedLayout() {
  stripEmbeddedChrome();
  hideEmbeddedLeaveButtons(".embedded-leave");
  bindEmbeddedParentScroll(document.getElementById("screen-play") || document);
  const report = () => reportContentHeight();
  report();
  requestAnimationFrame(report);
  if (typeof ResizeObserver !== "undefined") {
    const root = document.getElementById("app") || document.body;
    const ro = new ResizeObserver(() => report());
    if (root) ro.observe(root);
  }
  window.addEventListener("resize", report);
  const prev = window.RobotRallyApp?.engine?.onStateChange;
  if (window.RobotRallyApp?.engine) {
    window.RobotRallyApp.engine.onStateChange = () => {
      if (typeof prev === "function") prev();
      requestAnimationFrame(report);
    };
  }
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
