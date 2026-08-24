/** Transport-level message types (game-agnostic). */
export const TransportType = Object.freeze({
  HELLO: "hello",
  WELCOME: "welcome",
  PING: "ping",
  PONG: "pong",
});

let seqCounter = 0;

/**
 * @param {string} type
 * @param {unknown} [payload]
 */
export function createMessage(type, payload = null) {
  return {
    type,
    seq: ++seqCounter,
    payload,
    ts: Date.now(),
  };
}

/**
 * @param {unknown} raw
 * @returns {{ type: string, seq: number, payload: unknown, ts?: number } | null}
 */
export function parseMessage(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object" || typeof data.type !== "string") {
    return null;
  }

  return /** @type {{ type: string, seq: number, payload: unknown, ts?: number }} */ (
    data
  );
}

export function resetSeq() {
  seqCounter = 0;
}
