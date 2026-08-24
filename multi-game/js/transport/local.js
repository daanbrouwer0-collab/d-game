import {
  TransportType,
  createMessage,
  parseMessage,
  resetSeq,
} from "../p2p/protocol.js";

const LOCAL_CODE = "LOCAL";

/**
 * In-process transport: same message envelope as P2P, no network.
 * Host is authoritative; send/broadcast deliver via onMessage on next microtask.
 * @param {{ gameId: string, maxGuests?: number }} options
 */
export class LocalTransport {
  /**
   * @param {{ gameId: string, maxGuests?: number }} options
   */
  constructor({ gameId, maxGuests = 1 }) {
    if (!gameId) throw new Error("gameId is verplicht");
    this.gameId = gameId;
    this.maxGuests = maxGuests;
    this.maxPlayers = maxGuests + 1;
    this.transport = "local";

    /** @type {'host'|'guest'|null} */
    this.role = null;
    /** @type {string|null} */
    this.roomCode = null;
    /** @type {string} */
    this.status = "idle";

    /** @type {((status: string, detail?: string) => void) | null} */
    this.onStatus = null;
    /** @type {((msg: { type: string, seq: number, payload: unknown, fromPeerId?: string|null }) => void) | null} */
    this.onMessage = null;
    /** @type {((err: Error) => void) | null} */
    this.onError = null;
    /** @type {((reason: string) => void) | null} */
    this.onGameMismatch = null;
    /** @type {((peerId: string) => void) | null} */
    this.onPeerJoin = null;
    /** @type {((peerId: string) => void) | null} */
    this.onPeerLeave = null;
    /** @type {((info: { maxPlayers: number }) => void) | null} */
    this.onRoomFull = null;
  }

  guestCount() {
    return 0;
  }

  isConnected() {
    return this.status === "connected" || this.status === "hosting";
  }

  /** @returns {Promise<string>} */
  async host() {
    resetSeq();
    this.role = "host";
    this.roomCode = LOCAL_CODE;
    this.#setStatus("hosting");
    // Local rooms are immediately "ready" for hotseat / solo host play.
    this.#setStatus("connected");
    return this.roomCode;
  }

  /**
   * @param {string} _code
   * @returns {Promise<string>}
   */
  async hostWithCode(_code) {
    return this.host();
  }

  /**
   * Local join is not used across devices; kept for API parity.
   * @param {string} _code
   */
  async join(_code) {
    throw new Error(
      "Local transport kan niet joinen via code. Gebruik P2P om een link te delen.",
    );
  }

  async reconnect() {
    if (this.role === "host") {
      this.#setStatus("connected");
      return;
    }
    throw new Error("Niets om te herverbinden (local).");
  }

  async destroy() {
    this.role = null;
    this.roomCode = null;
    this.#setStatus("idle");
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  send(type, payload = null) {
    return this.#deliver(createMessage(type, payload), null);
  }

  /**
   * @param {string} peerId
   * @param {string} type
   * @param {unknown} [payload]
   */
  sendTo(peerId, type, payload = null) {
    return this.#deliver(createMessage(type, payload), peerId);
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  broadcast(type, payload = null) {
    return this.#deliver(createMessage(type, payload), null);
  }

  /**
   * @param {Record<string, unknown>} [extra]
   */
  sendHello(extra = {}) {
    return this.send(TransportType.HELLO, {
      version: 1,
      gameId: this.gameId,
      ...extra,
    });
  }

  /**
   * @param {Record<string, unknown>} [extra]
   * @param {string} [peerId]
   */
  sendWelcome(extra = {}, peerId) {
    const msg = {
      version: 1,
      gameId: this.gameId,
      ...extra,
    };
    if (peerId) return this.sendTo(peerId, TransportType.WELCOME, msg);
    return this.send(TransportType.WELCOME, msg);
  }

  /**
   * @param {string} _gamePath
   * @param {string} _code
   * @returns {null}
   */
  buildShareUrl(_gamePath, _code) {
    return null;
  }

  /**
   * @returns {null}
   */
  readRoomFromUrl() {
    return null;
  }

  writeRoomToUrl() {
    /* no-op for local */
  }

  clearRoomFromUrl() {
    /* no-op for local */
  }

  /**
   * @param {string} status
   * @param {string} [detail]
   */
  #setStatus(status, detail) {
    this.status = status;
    this.onStatus?.(status, detail);
  }

  /**
   * @param {{ type: string, seq: number, payload: unknown, ts?: number }} msg
   * @param {string | null} fromPeerId
   */
  #deliver(msg, fromPeerId) {
    if (!this.isConnected() && this.status !== "hosting") return false;

    if (msg.type === TransportType.HELLO || msg.type === TransportType.WELCOME) {
      const payload = /** @type {{ gameId?: string }} */ (msg.payload || {});
      if (payload.gameId && payload.gameId !== this.gameId) {
        this.onGameMismatch?.(
          `Dit is een uitnodiging voor “${payload.gameId}”, niet “${this.gameId}”.`,
        );
        return false;
      }
    }

    // Echo to local handlers (host-authoritative in-process).
    queueMicrotask(() => {
      this.onMessage?.({ ...msg, fromPeerId: fromPeerId ?? null });
    });
    return true;
  }
}

export { TransportType, createMessage, parseMessage, LOCAL_CODE };
