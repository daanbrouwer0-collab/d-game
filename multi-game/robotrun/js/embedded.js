import { runEmbeddedGame } from "../../js/bridge/embedded-bootstrap.js";
import {
  bootstrapRoomEmbedded,
  notifySessionEnded,
  patchP2pSessionForRoom,
} from "./room-embedded.js";

patchP2pSessionForRoom();

runEmbeddedGame({
  gameId: "robotrun",
  prepareUI() {
    document.querySelector(".bottom-nav")?.classList.add("hidden");
    document.getElementById("menu-overlay")?.classList.add("hidden");
    document.querySelector("header.header")?.classList.add("hidden");

    const leaveBtn = document.createElement("button");
    leaveBtn.type = "button";
    leaveBtn.className = "btn alt embedded-leave";
    leaveBtn.textContent = "Terug naar room";
    leaveBtn.style.cssText =
      "position:fixed;top:0.5rem;right:0.5rem;z-index:9000;font-size:0.85rem;padding:0.35rem 0.65rem;";
    leaveBtn.addEventListener("click", () => {
      notifySessionEnded({ reason: "back_to_lobby" });
    });
    document.body.appendChild(leaveBtn);

    if (window.RobotRallyApp && !window.RobotRallyApp.engine) {
      window.RobotRallyApp.init();
    }
  },
  start(ctx) {
    bootstrapRoomEmbedded(ctx);
  },
});
