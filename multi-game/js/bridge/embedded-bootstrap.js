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
