import { BridgeMsg } from "./bridge-protocol.js";

/**
 * Room shell: bridge to embedded game iframe.
 * @param {HTMLIFrameElement} iframe
 */
export function mountGameBridge(iframe) {
  /** @type {((msg: { gameType: string, payload: unknown }) => void) | null} */
  let onGameOut = null;

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === BridgeMsg.READY) {
      return;
    }

    if (data.type === BridgeMsg.GAME_OUT) {
      onGameOut?.({
        gameType: String(data.gameType || ""),
        payload: data.payload,
      });
      return;
    }

    if (data.type === BridgeMsg.SESSION_ENDED) {
      onGameOut?.({ gameType: "__session_ended__", payload: data.payload });
    }
  });

  return {
    /**
     * @param {(msg: { gameType: string, payload: unknown }) => void} handler
     */
    onGameOut(handler) {
      onGameOut = handler;
    },
    /**
     * @param {Record<string, unknown>} init
     */
    sendSessionInit(init) {
      iframe.contentWindow?.postMessage(
        { type: BridgeMsg.SESSION_INIT, ...init },
        "*",
      );
    },
    /**
     * @param {string} gameType
     * @param {unknown} payload
     * @param {string|null} [fromPeerId]
     */
    sendGameIn(gameType, payload, fromPeerId = null) {
      iframe.contentWindow?.postMessage(
        { type: BridgeMsg.GAME_IN, gameType, payload, fromPeerId },
        "*",
      );
    },
    destroy() {
      onGameOut = null;
      iframe.src = "about:blank";
    },
  };
}
