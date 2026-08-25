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
 * Standalone game page: hide per-game P2P lobby; multiplayer = room shell only.
 * @param {ParentNode | null} [root]
 */
export function setupStandaloneLocalGame(root = document) {
  hideLegacyP2pLobby(root);
  const scope = root instanceof Document ? root : root || document;
  scope.querySelector(".room-multiplayer-banner")?.remove();
  scope.getElementById?.("room-strip")?.remove();
  if (scope === document) {
    document.documentElement.classList.remove("has-room-strip");
  } else {
    document.getElementById("room-strip")?.remove();
    document.documentElement.classList.remove("has-room-strip");
  }
}

/**
 * Hide standalone P2P lobby UI; multiplayer runs in room/ only.
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

/**
 * @param {ParentNode | null} [root]
 */
export function mountRoomMultiplayerBanner(root = document) {
  const main =
    root instanceof Document
      ? root.querySelector("main")
      : root?.querySelector?.("main") || root;
  if (!main || main.querySelector(".room-multiplayer-banner")) return;

  const banner = document.createElement("section");
  banner.className = "panel room-multiplayer-banner";
  banner.innerHTML = `
    <h2>Met vrienden</h2>
    <p class="lede">
      Multiplayer doe je in een <strong>room</strong>: start of join daar, stem op een spel, en speel samen.
      Op deze pagina alleen hotseat / solo op dit apparaat.
    </p>
    <div class="actions">
      <a href="../room/" class="btn btn-primary">Start / join room</a>
    </div>`;
  main.prepend(banner);
  hideLegacyP2pLobby(main);
}
