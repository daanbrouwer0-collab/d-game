import { BridgeMsg } from "./bridge-protocol.js";
import { BridgeTransport, connectGameBridge } from "./bridge-transport.js";
import { contextFromInit } from "./embedded-contract.js";

/**
 * @typedef {import('./embedded-contract.js').EmbeddedContext} EmbeddedContext
 */

/**
 * @typedef {Object} EmbeddedGameAdapter
 * @property {string} gameId
 * @property {() => void} [prepareUI]
 * @property {(ctx: EmbeddedContext) => void | Promise<void>} start
 */

/**
 * @param {{
 *   reason?: string,
 *   winnerName?: string | null,
 *   winnerId?: string | null,
 *   summary?: string | null,
 * }} [payload]
 */
export function notifySessionEnded(payload = {}) {
  window.parent.postMessage(
    {
      type: BridgeMsg.SESSION_ENDED,
      payload: {
        reason: payload.reason || "finished",
        winnerName: payload.winnerName || null,
        winnerId: payload.winnerId || null,
        summary: payload.summary || null,
      },
    },
    "*",
  );
}

/** Guest pauses local game view; room session stays active for rejoin. */
export function notifyLeaveGame() {
  window.parent.postMessage({ type: BridgeMsg.LEAVE_GAME }, "*");
}

/**
 * Tell the room shell the embedded document height (for iframe sizing).
 * @param {number} [explicitHeight]
 */
export function reportContentHeight(explicitHeight) {
  if (window.parent === window) return;
  const app = document.getElementById("app");
  const height = Number.isFinite(explicitHeight) && explicitHeight > 0
    ? explicitHeight
    : Math.max(
      app?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      320,
    );
  window.parent.postMessage(
    { type: BridgeMsg.CONTENT_HEIGHT, height: Math.ceil(height) },
    "*",
  );
}

/**
 * Vertical pan on non-controls scrolls the room play card (same-origin iframe).
 * @param {ParentNode} [root]
 */
export function bindEmbeddedParentScroll(root = document) {
  if (!document.documentElement.classList.contains("dgame-embedded")) return;
  if (window.parent === window) return;

  /** @type {number | null} */
  let lastY = null;
  let tracking = false;

  const playPanel = () => {
    try {
      return window.parent.document?.getElementById("panel-playing");
    } catch {
      return null;
    }
  };

  root.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const target = /** @type {Element | null} */ (event.target);
      if (
        target?.closest?.(
          "button, input, textarea, select, a, .card-item, .register-slot, .playback-btn",
        )
      ) {
        tracking = false;
        return;
      }
      tracking = true;
      lastY = event.touches[0].clientY;
    },
    { passive: true },
  );

  root.addEventListener(
    "touchmove",
    (event) => {
      if (!tracking || lastY == null || event.touches.length !== 1) return;
      const panel = playPanel();
      if (!panel) return;
      const y = event.touches[0].clientY;
      panel.scrollTop += lastY - y;
      lastY = y;
      event.preventDefault();
    },
    { passive: false },
  );

  const end = () => {
    tracking = false;
    lastY = null;
  };
  root.addEventListener("touchend", end, { passive: true });
  root.addEventListener("touchcancel", end, { passive: true });

  // PC: forward mouse wheel to the room play card.
  root.addEventListener(
    "wheel",
    (event) => {
      const panel = playPanel();
      if (!panel) return;
      const target = /** @type {Element | null} */ (event.target);
      if (
        target?.closest?.(
          "input, textarea, select, .cards-hand-wrap, .rules-sheet-body, .program-board",
        )
      ) {
        return;
      }
      panel.scrollTop += event.deltaY;
      event.preventDefault();
    },
    { passive: false },
  );
}

/**
 * Host-only: roep aan wanneer sessie klaar is (win, draw, quit).
 * @param {() => boolean} isFinished
 * @param {string | (() => {
 *   reason?: string,
 *   winnerName?: string | null,
 *   winnerId?: string | null,
 *   summary?: string | null,
 * })} [reasonOrPayload]
 */
export function watchSessionEnd(isFinished, reasonOrPayload = "finished") {
  let sent = false;
  return () => {
    if (sent || !isFinished()) return;
    sent = true;
    const payload =
      typeof reasonOrPayload === "function"
        ? reasonOrPayload() || {}
        : { reason: reasonOrPayload };
    notifySessionEnded(payload);
  };
}

/**
 * Standard embedded entry for room iframe games.
 * @param {EmbeddedGameAdapter} adapter
 */
export function runEmbeddedGame(adapter) {
  const transport = new BridgeTransport();

  connectGameBridge(transport, async (init) => {
    if (String(init.gameId || "") && init.gameId !== adapter.gameId) {
      console.warn(
        `[embedded] gameId mismatch: expected ${adapter.gameId}, got ${init.gameId}`,
      );
    }
    adapter.prepareUI?.();
    const ctx = contextFromInit(transport, init);
    await adapter.start(ctx);
  });
}

/**
 * Stub adapter for games not yet room-ready.
 * @param {{ gameId: string, title: string }} opts
 * @returns {EmbeddedGameAdapter}
 */
export function stubEmbeddedAdapter({ gameId, title }) {
  return {
    gameId,
    prepareUI() {
      document.body.innerHTML = "";
    },
    start() {
      document.body.innerHTML = `<main class="panel embedded-stub">
        <h2>${escapeHtml(title)}</h2>
        <p class="hint">Room-modus voor dit spel is nog in ontwikkeling. Speel voorlopig via het standalone spel of kies tic-tac-toe in de room.</p>
      </main>`;
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Call from game index.html when <code>?embedded=1</code>.
 * @param {() => Promise<{ default?: EmbeddedGameAdapter } | EmbeddedGameAdapter>} loadAdapter
 */
export async function loadEmbeddedIfPresent(loadAdapter) {
  const params = new URLSearchParams(location.search);
  if (params.get("embedded") !== "1") return false;
  const mod = await loadAdapter();
  const adapter =
    mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
  if (!adapter || typeof adapter.start !== "function") {
    throw new Error("embedded adapter must export start()");
  }
  runEmbeddedGame(/** @type {EmbeddedGameAdapter} */ (adapter));
  return true;
}
