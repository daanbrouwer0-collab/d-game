import { BridgeMsg } from "./bridge-protocol.js";

/**
 * Iframe-side transport: same surface as P2P for GameEngine.
 */
export class BridgeTransport {
  constructor() {
    this.transport = "bridge";
    /** @type {'host'|'guest'|null} */
    this.role = null;
    /** @type {'player'|'spectator'} */
    this.participation = "player";
    this.roomCode = null;
    this.maxGuests = 5;
    this.maxPlayers = 6;
    /** @type {((status: string, detail?: string) => void) | null} */
    this.onStatus = null;
    /** @type {((msg: { type: string, seq: number, payload: unknown, fromPeerId?: string|null }) => void) | null} */
    this.onMessage = null;
    /** @type {((err: Error) => void) | null} */
    this.onError = null;
    /** @type {((payload: { inGame?: string[] }) => void) | null} */
    this.onPresence = null;
    /** @type {{ inGame?: string[] } | null} */
    this._lastPresence = null;
    this._ready = false;
  }

  /**
   * @param {((payload: { inGame?: string[] }) => void) | null} handler
   */
  setPresenceHandler(handler) {
    this.onPresence = handler;
    if (handler && this._lastPresence) handler(this._lastPresence);
  }

  /**
   * @param {{ inGame?: string[] }} payload
   */
  deliverPresence(payload) {
    this._lastPresence = payload;
    this.onPresence?.(payload);
  }

  guestCount() {
    return 0;
  }

  isConnected() {
    return this._ready;
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  send(type, payload = null) {
    if (!this._ready) return false;
    if (this.participation === "spectator") return false;
    window.parent.postMessage(
      { type: BridgeMsg.GAME_OUT, gameType: type, payload },
      "*",
    );
    return true;
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  broadcast(type, payload = null) {
    return this.send(type, payload);
  }

  /**
   * @param {string} _peerId
   * @param {string} type
   * @param {unknown} [payload]
   */
  sendTo(_peerId, type, payload = null) {
    return this.send(type, payload);
  }

  /**
   * @param {{ type: string, payload?: unknown, fromPeerId?: string|null }} msg
   */
  deliver(msg) {
    this.onMessage?.({
      type: msg.type,
      seq: 0,
      payload: msg.payload ?? null,
      fromPeerId: msg.fromPeerId ?? null,
    });
  }

  markReady(role, roomCode) {
    this.role = role;
    this.roomCode = roomCode;
    this._ready = true;
    this.onStatus?.("connected");
  }

  destroy() {
    this._ready = false;
    this.onStatus?.("idle");
  }
}

/**
 * Game iframe: connect to room shell.
 * @param {BridgeTransport} transport
 * @param {(init: Record<string, unknown>) => void} onInit
 */
export function connectGameBridge(transport, onInit) {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === BridgeMsg.SESSION_INIT) {
      transport.participation =
        data.participation === "spectator" ? "spectator" : "player";
      transport.markReady(
        /** @type {'host'|'guest'} */ (data.role),
        String(data.roomCode || ""),
      );
      onInit(data);
      return;
    }

    if (data.type === BridgeMsg.GAME_IN) {
      if (String(data.gameType || "") === "__presence__") {
        const payload =
          data.payload && typeof data.payload === "object"
            ? /** @type {{ inGame?: string[] }} */ (data.payload)
            : {};
        transport.deliverPresence(payload);
        return;
      }
      transport.deliver({
        type: String(data.gameType || ""),
        payload: data.payload,
        fromPeerId: data.fromPeerId ?? null,
      });
      return;
    }

    if (data.type === BridgeMsg.SESSION_ACK) {
      transport.deliver({ type: "ack", payload: data.payload });
      return;
    }

    if (data.type === BridgeMsg.SESSION_REJECT) {
      transport.deliver({ type: "reject", payload: data.payload });
    }
  });

  window.parent.postMessage({ type: BridgeMsg.READY }, "*");
}
