import { hideLegacyP2pLobby } from "./room-only-multiplayer.js";

let navGuardBound = false;

/**
 * Block in-iframe link navigation (resolves against jsDelivr <base> → CDN leak).
 * @param {ParentNode} [root]
 */
export function bindEmbeddedNavGuard(root = document) {
  if (navGuardBound) return;
  navGuardBound = true;
  root.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank") return;
      const href = String(anchor.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#")) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

/**
 * Strip standalone shell chrome when a game runs inside the room iframe (layer 2).
 * Removes D-robotrally leftover nav/session UI so it cannot cover play/upgrade.
 */
export function stripEmbeddedChrome() {
  document.documentElement.classList.add("dgame-embedded");
  window.__DGAME_EMBEDDED = 1;
  document.querySelector("header.header")?.classList.add("hidden");
  document.querySelector(".nav")?.classList.add("hidden");
  document.getElementById("lobby")?.classList.add("hidden");
  document.getElementById("shell-nav")?.remove();
  document.getElementById("room-strip")?.remove();
  document.documentElement.classList.remove("has-shell-nav", "has-room-strip");
  // Remove — display:none alone still left a late FOUC / tap-blocker for guests.
  document.querySelector(".bottom-nav")?.remove();
  document.getElementById("menu-scrim")?.remove();
  document.getElementById("menu-popup")?.remove();
  document.getElementById("menu-overlay")?.remove();
  document.getElementById("session-modal")?.remove();
  [
    "screen-courses",
    "screen-character",
    "screen-help",
    "screen-settings",
  ].forEach((id) => document.getElementById(id)?.classList.add("hidden"));
  hideLegacyP2pLobby();
  bindEmbeddedNavGuard(document);
}

/**
 * Hide in-game leave/back buttons — room playing-bar owns navigation.
 * @param {string} [selector] CSS selector for buttons to hide
 */
export function hideEmbeddedLeaveButtons(selector = "#btn-leave, #btn-leave-game, .embedded-leave") {
  document.querySelectorAll(selector).forEach((el) => {
    el.classList.add("hidden");
  });
}

/**
 * Lock input for spectators; room playing-bar shows the kijken hint.
 * @param {boolean} isSpectator
 */
export function applySpectatorMode(isSpectator) {
  document.documentElement.classList.toggle("dgame-spectator", isSpectator);
}
