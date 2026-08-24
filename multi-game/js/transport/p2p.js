import { Session, TransportType } from "../p2p/session.js";

/**
 * Thin wrap over PeerJS Session — same surface as LocalTransport / Room facade.
 * @param {{ gameId: string, maxGuests?: number }} options
 */
export class P2PTransport {
  /**
   * @param {{ gameId: string, maxGuests?: number }} options
   */
  constructor(options) {
    this.transport = "p2p";
    this.session = new Session(options);
    this.gameId = this.session.gameId;
    this.maxGuests = this.session.maxGuests;
    this.maxPlayers = this.session.maxPlayers;

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

    this.session.onStatus = (status, detail) => this.onStatus?.(status, detail);
    this.session.onMessage = (msg) => this.onMessage?.(msg);
    this.session.onError = (err) => this.onError?.(err);
    this.session.onGameMismatch = (reason) => this.onGameMismatch?.(reason);
    this.session.onPeerJoin = (id) => this.onPeerJoin?.(id);
    this.session.onPeerLeave = (id) => this.onPeerLeave?.(id);
    this.session.onRoomFull = (info) => this.onRoomFull?.(info);
  }

  get role() {
    return this.session.role;
  }

  get roomCode() {
    return this.session.roomCode;
  }

  get status() {
    return this.session.status;
  }

  guestCount() {
    return this.session.guestCount();
  }

  isConnected() {
    return this.session.isConnected();
  }

  host() {
    return this.session.host();
  }

  /**
   * @param {string} code
   */
  hostWithCode(code) {
    return this.session.hostWithCode(code);
  }

  /**
   * @param {string} code
   */
  join(code) {
    return this.session.join(code);
  }

  reconnect() {
    return this.session.reconnect();
  }

  destroy() {
    return this.session.destroy();
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  send(type, payload = null) {
    return this.session.send(type, payload);
  }

  /**
   * @param {string} peerId
   * @param {string} type
   * @param {unknown} [payload]
   */
  sendTo(peerId, type, payload = null) {
    return this.session.sendTo(peerId, type, payload);
  }

  /**
   * @param {string} type
   * @param {unknown} [payload]
   */
  broadcast(type, payload = null) {
    return this.session.broadcast(type, payload);
  }

  /**
   * @param {Record<string, unknown>} [extra]
   */
  sendHello(extra = {}) {
    return this.session.sendHello(extra);
  }

  /**
   * @param {Record<string, unknown>} [extra]
   * @param {string} [peerId]
   */
  sendWelcome(extra = {}, peerId) {
    return this.session.sendWelcome(extra, peerId);
  }

  /**
   * @param {string} gamePath
   * @param {string} code
   * @param {string} [origin]
   */
  buildShareUrl(gamePath, code, origin) {
    return this.session.buildShareUrl(gamePath, code, origin);
  }

  /**
   * @param {string} [search]
   */
  readRoomFromUrl(search) {
    return this.session.readRoomFromUrl(search);
  }

  /**
   * @param {string} code
   */
  writeRoomToUrl(code) {
    return this.session.writeRoomToUrl(code);
  }

  clearRoomFromUrl() {
    return this.session.clearRoomFromUrl();
  }
}

export { TransportType };
