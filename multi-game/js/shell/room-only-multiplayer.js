import {
  getUrlParams,
  navigateInShell,
  readHostIntentFromUrl,
  readRoomFromUrl,
  ROOM_PATH,
  isEmbeddedGame,
} from "./site-url.js";

export { isEmbeddedGame };

/**
 * Legacy per-game ?room= links → room shell.
 * @returns {boolean} true when navigation was started
 */
export function redirectLegacyGameRoomToShell() {
  const params = getUrlParams();
  if (params.get("embedded") === "1") return false;
  const room = readRoomFromUrl();
  if (!room) return false;

  /** @type {Record<string, string>} */
  const navParams = { room };
  if (readHostIntentFromUrl()) navParams.as = "host";
  navigateInShell(ROOM_PATH, navParams);
  return true;
}

/**
 * Standalone game page: hide leftover per-game P2P UI; multiplayer = room only.
 * @param {ParentNode | null} [root]
 */
export function setupStandaloneLocalGame(root = document) {
  hideLegacyP2pLobby(root);
  document.getElementById("room-strip")?.remove();
  document.documentElement.classList.remove("has-room-strip");
}

/**
 * Hide any remaining per-game P2P lobby UI.
 * @param {ParentNode | null} [root]
 */
export function hideLegacyP2pLobby(root = document) {
  const scope = root instanceof Document ? root : root || document;
  const hide = (sel) => {
    scope.querySelectorAll(sel).forEach((el) => el.classList.add("hidden"));
  };
  hide("#host-info, .invite-box, .invite-card");
  hide("#btn-host, #btn-join, #btn-scan-qr, #btn-session-p2p-lobby");
  hide(".join-row, .join-controls, .transport-toggle");
  hide("#menu-view-p2p-lobby, #p2p-join-panel");
  scope.querySelectorAll("label[for='join-code']").forEach((el) => {
    el.classList.add("hidden");
  });
}
