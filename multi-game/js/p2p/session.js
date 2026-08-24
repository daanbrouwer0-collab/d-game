import { Net } from "./net.js";
import {
  TransportType,
  createMessage,
  parseMessage,
  resetSeq,
} from "./protocol.js";

/**
 * Game-agnostic P2P session: connect, share URLs, transport handshake + ping.
 * @param {{ gameId: string, maxGuests?: number }} options
 */
export class Session {
  /** @type {ReturnType<typeof setInterval> | null} */
  #pingTimer = null;

  /**
   * @param {{ gameId: string, maxGuests?: number }} options
   */
  constructor({ gameId, maxGuests = 1 }) {
    if (!gameId) throw new Error("gameId is verplicht");
    this.gameId = gameId;
    this.maxGuests = maxGuests;
    this.maxPlayers = maxGuests + 1;
    this.net = new Net({ maxGuests });
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

    this.net.onStatus = (status, detail) => {
      this.onStatus?.(status, detail);
      if (status === "connected" || (status === "hosting" && maxGuests > 1)) {
        this.#startPing();
      }
      if (status === "disconnected" || status === "error" || status === "idle") {
        this.#stopPing();
      }
    };

    this.net.onError = (err) => this.onError?.(err);
    this.net.onPeerJoin = (id) => this.onPeerJoin?.(id);
    this.net.onPeerLeave = (id) => this.onPeerLeave?.(id);

    this.net.onMessage = (raw, fromPeerId) => {
      const msg = parseMessage(raw);
      if (!msg) return;

      if (msg.type === "room_full") {
        this.onRoomFull?.(
          /** @type {{ maxPlayers: number }} */ (msg.payload || {
            maxPlayers: this.maxPlayers,
          }),
        );
        return;
      }

      if (msg.type === TransportType.PING) {
        this.#reply(
          createMessage(TransportType.PONG, {
            t: /** @type {{ t?: number }} */ (msg.payload || {}).t,
          }),
          fromPeerId,
        );
        return;
      }

      if (msg.type === TransportType.PONG) return;

      if (msg.type === TransportType.HELLO || msg.type === TransportType.WELCOME) {
        const payload = /** @type {{ gameId?: string }} */ (msg.payload || {});
        if (payload.gameId && payload.gameId !== this.gameId) {
          this.onGameMismatch?.(
            `Dit is een uitnodiging voor “${payload.gameId}”, niet “${this.gameId}”.`,
          );
          return;
        }
      }

      this.onMessage?.({ ...msg, fromPeerId: fromPeerId ?? null });
    };
  }

  get role() {
    return this.net.role;
  }

  get roomCode() {
    return this.net.roomCode;
  }

  get status() {
    return this.net.status;
  }

  get peerId() {
    return this.net.peer?.id || this.net.roomCode || null;
  }

  guestCount() {
    return this.net.guestCount();
  }

  isConnected() {
    return this.net.isConnected();
  }

  /** @returns {Promise<string>} */
  host() {
    resetSeq();
    return this.net.host();
  }

  /**
   * Re-open an existing room code as host (e.g. after navigating back).
   * @param {string} code
   * @returns {Promise<string>}
   */
  hostWithCode(code) {
    resetSeq();
    return this.net.hostWithCode(code);
  }

  /** @param {string} code */
  join(code) {
    resetSeq();
    return this.net.join(code);
  }

  reconnect() {
    return this.net.reconnect();
  }

  async destroy() {
    this.#stopPing();
    await this.net.destroy();
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   * @returns {boolean}
   */
  send(type, payload = null) {
    return this.net.send(createMessage(type, payload));
  }

  /**
   * @param {string} peerId
   * @param {string} type
   * @param {unknown} [payload]
   */
  sendTo(peerId, type, payload = null) {
    return this.net.sendTo(peerId, createMessage(type, payload));
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  broadcast(type, payload = null) {
    return this.net.broadcast(createMessage(type, payload));
  }

  /**
   * Host: send to one peer, or guest: send to host
   * @param {unknown} data
   * @param {string | null} [toPeerId]
   */
  #reply(data, toPeerId) {
    if (this.role === "host" && toPeerId) {
      this.net.sendTo(toPeerId, data);
    } else {
      this.net.send(data);
    }
  }

  /** Guest → host */
  sendHello(extra = {}) {
    return this.send(TransportType.HELLO, {
      version: 1,
      gameId: this.gameId,
      ...extra,
    });
  }

  /**
   * Host → one guest (or only guest in 1v1)
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
   * @param {string} gamePath e.g. "/tic-tac-toe/"
   * @param {string} code
   * @param {string} [origin]
   */
  buildShareUrl(gamePath, code, origin = window.location.origin) {
    const path = gamePath.endsWith("/") ? gamePath : `${gamePath}/`;
    const url = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
    url.searchParams.set("room", code);
    return url.toString();
  }

  /**
   * @param {string} [search]
   * @returns {string | null}
   */
  readRoomFromUrl(search = window.location.search) {
    const room = new URLSearchParams(search).get("room");
    if (!room) return null;
    const code = room.trim().toUpperCase();
    return code || null;
  }

  /**
   * @param {string} code
   */
  writeRoomToUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    history.replaceState(null, "", url);
  }

  clearRoomFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
  }

  #startPing() {
    this.#stopPing();
    this.#pingTimer = setInterval(() => {
      if (this.role === "host" && this.maxGuests > 1) {
        this.broadcast(TransportType.PING, { t: Date.now() });
      } else if (this.net.isConnected()) {
        this.send(TransportType.PING, { t: Date.now() });
      }
    }, 8000);
  }

  #stopPing() {
    if (this.#pingTimer) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }
}

export { TransportType, createMessage, parseMessage };
