import {
  TransportType,
  createMessage,
  parseMessage,
  resetSeq,
} from "../p2p/protocol.js";
import {
  appendEvent,
  applySyncPacket,
  createEventLog,
  encodeSyncPacket,
  packetFromQrText,
  packetToQrText,
} from "../sync/event-log.js";
import { saveEventLog } from "../core/storage.js";
import {
  buildShareUrl as buildSiteShareUrl,
  clearRoomFromUrl as clearSiteRoomFromUrl,
  getUrlParams,
  getUrlSearch,
  readRoomFromUrl as readSiteRoomFromUrl,
  writeRoomToUrl as writeSiteRoomToUrl,
} from "../shell/site-url.js";

/**
 * QR transport: Room-compatible API. Sync via show/scan event-log packets.
 * No live socket — `exportSyncText` / `importSyncText` drive the lab & games.
 *
 * @param {{ gameId: string, maxGuests?: number }} options
 */
export class QrTransport {
  /**
   * @param {{ gameId: string, maxGuests?: number }} options
   */
  constructor({ gameId, maxGuests = 1 }) {
    if (!gameId) throw new Error("gameId is verplicht");
    this.gameId = gameId;
    this.maxGuests = maxGuests;
    this.maxPlayers = maxGuests + 1;
    this.transport = "qr";

    /** @type {'host'|'guest'|null} */
    this.role = null;
    /** @type {string|null} */
    this.roomCode = null;
    /** @type {string} */
    this.status = "idle";

    /** @type {import('../sync/event-log.js').EventLog} */
    this.log = createEventLog(gameId);
    /** @type {number} */
    this.knownPeerSeq = 0;

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
    /** @type {((text: string) => void) | null} fired when sync QR text is ready */
    this.onSyncPayload = null;
  }

  guestCount() {
    return this.knownPeerSeq > 0 ? 1 : 0;
  }

  isConnected() {
    return this.status === "connected" || this.status === "hosting";
  }

  /** @returns {Promise<string>} */
  async host() {
    resetSeq();
    this.role = "host";
    this.roomCode = `QR${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    this.log = createEventLog(this.gameId);
    this.knownPeerSeq = 0;
    this.#setStatus("hosting");
    this.#setStatus("connected", "QR-host — deel sync via QR");
    this.#persist();
    return this.roomCode;
  }

  /**
   * @param {string} code
   */
  async hostWithCode(code) {
    const result = await this.host();
    if (code) this.roomCode = String(code).trim().toUpperCase() || result;
    return this.roomCode;
  }

  /**
   * Guest starts an empty log and waits for first QR import.
   * @param {string} code
   */
  async join(code) {
    resetSeq();
    this.role = "guest";
    this.roomCode = String(code || "QRJOIN").trim().toUpperCase();
    this.log = createEventLog(this.gameId);
    this.knownPeerSeq = 0;
    this.#setStatus("connecting");
    this.#setStatus("connected", "QR-gast — scan sync van host");
    this.#persist();
  }

  async reconnect() {
    if (this.role) {
      this.#setStatus("connected", "QR opnieuw actief");
      return;
    }
    throw new Error("Geen QR-sessie om te herstellen");
  }

  async destroy() {
    this.role = null;
    this.roomCode = null;
    this.log = createEventLog(this.gameId);
    this.#setStatus("idle");
  }

  /**
   * Game messages become events on the log, then deliver locally.
   * @param {string} type
   * @param {unknown} [payload]
   */
  send(type, payload = null) {
    if (!this.isConnected()) return false;
    if (type === TransportType.PING || type === TransportType.PONG) return true;

    const appended = appendEvent(this.log, type, payload);
    if (!appended.ok) {
      this.onError?.(new Error(appended.reason));
      return false;
    }
    this.log = appended.log;
    this.#persist();
    this.#emitMessage(createMessage(type, payload));
    this.#publishSync();
    return true;
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
   * @param {string} type
   * @param {unknown} [payload]
   */
  broadcast(type, payload = null) {
    return this.send(type, payload);
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
   * @param {string} [_peerId]
   */
  sendWelcome(extra = {}, _peerId) {
    return this.send(TransportType.WELCOME, {
      version: 1,
      gameId: this.gameId,
      ...extra,
    });
  }

  /**
   * Text for QR encoding (delta since peer last known seq).
   * @param {number} [fromSeq]
   */
  exportSyncText(fromSeq = this.knownPeerSeq) {
    const packet = encodeSyncPacket(this.log, fromSeq);
    return packetToQrText(packet);
  }

  /**
   * Apply scanned/pasted QR payload.
   * @param {string} text
   */
  importSyncText(text) {
    const packet = packetFromQrText(text);
    if (!packet) {
      const err = new Error("Ongeldige QR-payload");
      this.onError?.(err);
      return { ok: false, reason: err.message };
    }
    if (packet.gameId !== this.gameId) {
      this.onGameMismatch?.(
        `Dit is een sync voor “${packet.gameId}”, niet “${this.gameId}”.`,
      );
      return { ok: false, reason: "game mismatch" };
    }
    const result = applySyncPacket(this.log, packet);
    if (!result.ok) {
      this.onError?.(new Error(result.reason));
      return result;
    }
    this.log = result.log;
    const maxSeq = this.log.events.reduce((m, e) => Math.max(m, e.seq), 0);
    this.knownPeerSeq = Math.max(this.knownPeerSeq, maxSeq);
    this.#persist();
    for (const ev of packet.events) {
      this.#emitMessage(createMessage(ev.type, ev.payload));
    }
    this.onStatus?.(
      this.status,
      `QR sync: ${result.applied} event(s) toegepast`,
    );
    return result;
  }

  /** Full log as sync text (lab helper). */
  exportFullSyncText() {
    return this.exportSyncText(0);
  }

  /**
   * @param {string} gamePath
   * @param {string} code
   * @param {string} [origin]
   */
  buildShareUrl(gamePath, code, origin) {
    return buildSiteShareUrl(gamePath, code, {
      origin,
      via: "qr",
    });
  }

  /**
   * @param {string} [search]
   */
  readRoomFromUrl(search) {
    const params = getUrlParams(search ?? getUrlSearch());
    if (params.get("via") !== "qr") return null;
    return readSiteRoomFromUrl(search);
  }

  /**
   * @param {string} code
   */
  writeRoomToUrl(code) {
    writeSiteRoomToUrl(`/${this.gameId}/`, code, { via: "qr" });
  }

  clearRoomFromUrl() {
    clearSiteRoomFromUrl(`/${this.gameId}/`);
  }

  /**
   * @param {string} status
   * @param {string} [detail]
   */
  #setStatus(status, detail) {
    this.status = status;
    this.onStatus?.(status, detail);
  }

  #publishSync() {
    const text = this.exportSyncText();
    this.onSyncPayload?.(text);
  }

  #persist() {
    if (this.roomCode) {
      saveEventLog(`qr:${this.gameId}:${this.roomCode}`, this.log);
    }
  }

  /**
   * @param {{ type: string, seq: number, payload: unknown, ts?: number }} msg
   */
  #emitMessage(msg) {
    const parsed = parseMessage(msg) || msg;
    queueMicrotask(() => {
      this.onMessage?.({ ...parsed, fromPeerId: "qr" });
    });
  }
}

export { TransportType };
