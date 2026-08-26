import { BridgeMsg } from "./bridge-protocol.js";

/**
 * Room shell: bridge to embedded game iframe.
 * SESSION_INIT is deferred until the game posts READY (modules load after iframe onload).
 * @param {HTMLIFrameElement} iframe
 */
export function mountGameBridge(iframe) {
  /** @type {((msg: { gameType: string, payload: unknown }) => void) | null} */
  let onGameOut = null;
  /** @type {(() => void) | null} */
  let onHandshakeReady = null;
  /** @type {((height: number) => void) | null} */
  let onContentHeight = null;
  /** @type {Record<string, unknown> | null} */
  let pendingInit = null;
  let gameReady = false;
  let alive = true;

  /**
   * @param {MessageEvent} event
   */
  function onMessage(event) {
    if (!alive) return;
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === BridgeMsg.READY) {
      gameReady = true;
      flushSessionInit();
      return;
    }

    if (data.type === BridgeMsg.CONTENT_HEIGHT) {
      const height = Number(/** @type {{ height?: unknown }} */ (data).height);
      if (Number.isFinite(height) && height > 0) {
        onContentHeight?.(height);
      }
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
      return;
    }

    if (data.type === BridgeMsg.LEAVE_GAME) {
      onGameOut?.({ gameType: "__leave_game__", payload: null });
    }
  }

  function flushSessionInit() {
    if (!gameReady || !pendingInit) return;
    const init = pendingInit;
    iframe.contentWindow?.postMessage(
      { type: BridgeMsg.SESSION_INIT, ...init },
      "*",
    );
    onHandshakeReady?.();
  }

  window.addEventListener("message", onMessage);

  return {
    /**
     * @param {(msg: { gameType: string, payload: unknown }) => void} handler
     */
    onGameOut(handler) {
      onGameOut = handler;
    },
    /**
     * Fired after READY + SESSION_INIT were delivered to the iframe.
     * @param {() => void} handler
     */
    onHandshakeReady(handler) {
      onHandshakeReady = handler;
    },
    /**
     * Embedded game reports document height so the room can size the iframe.
     * @param {(height: number) => void} handler
     */
    onContentHeight(handler) {
      onContentHeight = handler;
    },
    /**
     * Call before navigating the iframe to a new game document.
     */
    resetHandshake() {
      gameReady = false;
    },
    /**
     * Queue session init; delivered when the game iframe posts READY.
     * @param {Record<string, unknown>} init
     */
    sendSessionInit(init) {
      pendingInit = init;
      flushSessionInit();
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
      alive = false;
      onGameOut = null;
      onHandshakeReady = null;
      onContentHeight = null;
      pendingInit = null;
      gameReady = false;
      window.removeEventListener("message", onMessage);
      iframe.src = "about:blank";
    },
  };
}
