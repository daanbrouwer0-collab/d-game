const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * @param {number} [length]
 * @returns {string}
 */
export function generateRoomCode(length = 6) {
  let code = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    code += ROOM_ALPHABET[values[i] % ROOM_ALPHABET.length];
  }
  return code;
}

/**
 * PeerJS wrapper. Host can accept multiple guests (star topology).
 * @param {{ maxGuests?: number }} [options]
 * maxGuests: max remote peers (default 1). Total players = 1 host + guests.
 */
export class Net {
  /**
   * @param {{ maxGuests?: number }} [options]
   */
  constructor(options = {}) {
    /** @type {number} */
    this.maxGuests = Math.max(1, options.maxGuests ?? 1);
    /** @type {import('peerjs').Peer | null} */
    this.peer = null;
    /** @type {Map<string, import('peerjs').DataConnection>} */
    this.conns = new Map();
    /** Guest's single connection to host */
    /** @type {import('peerjs').DataConnection | null} */
    this.conn = null;
    /** @type {'idle'|'hosting'|'connecting'|'connected'|'disconnected'|'error'} */
    this.status = "idle";
    /** @type {string | null} */
    this.roomCode = null;
    /** @type {'host'|'guest'|null} */
    this.role = null;
    /** @type {((status: string, detail?: string) => void) | null} */
    this.onStatus = null;
    /** @type {((data: unknown, fromPeerId: string | null) => void) | null} */
    this.onMessage = null;
    /** @type {((err: Error) => void) | null} */
    this.onError = null;
    /** @type {((peerId: string) => void) | null} */
    this.onPeerJoin = null;
    /** @type {((peerId: string) => void) | null} */
    this.onPeerLeave = null;
  }

  /**
   * @param {string} status
   * @param {string} [detail]
   */
  #setStatus(status, detail) {
    this.status = status;
    this.onStatus?.(status, detail);
  }

  guestCount() {
    return this.conns.size;
  }

  #hasOpenDataConnection() {
    if (this.role === "guest") return Boolean(this.conn?.open);
    return [...this.conns.values()].some((c) => c.open);
  }

  /**
   * PeerJS "disconnected" = lost the cloud signaling server, not the WebRTC
   * data channel. After join that often fires while the game still works.
   * @param {import('peerjs').Peer} peer
   */
  #watchSignaling(peer) {
    peer.on("disconnected", () => {
      if (this.status === "idle" || this.peer !== peer) return;
      if (this.#hasOpenDataConnection()) {
        try {
          if (!peer.destroyed) peer.reconnect();
        } catch {
          /* keep playing over the existing data channel */
        }
        return;
      }
      // Host zonder gasten: PeerJS verliest soms alleen de cloud — lobby/QR open houden.
      if (this.role === "host" && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          this.#setStatus("disconnected", "Verbinding verbroken");
        }
        return;
      }
      this.#setStatus("disconnected", "Verbinding verbroken");
    });
  }

  /**
   * @param {string} [preferredId]
   */
  #createPeer(preferredId) {
    if (typeof Peer === "undefined") {
      throw new Error("PeerJS is niet geladen. Controleer je netwerkverbinding.");
    }
    const options = { debug: 0 };
    return preferredId ? new Peer(preferredId, options) : new Peer(options);
  }

  /**
   * @param {number} [ms]
   */
  async #waitForPeerJs(ms = 8000) {
    const start = Date.now();
    while (typeof Peer === "undefined") {
      if (Date.now() - start > ms) {
        throw new Error("PeerJS is niet geladen. Controleer je netwerkverbinding.");
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * @returns {Promise<string>}
   */
  async host() {
    await this.#waitForPeerJs();
    await this.destroy();
    const code = generateRoomCode();
    this.role = "host";
    this.roomCode = code;
    this.#setStatus("connecting", "Kamer wordt aangemaakt…");
    this.peer = this.#createPeer(code);

    return new Promise((resolve, reject) => {
      const peer = this.peer;
      if (!peer) {
        reject(new Error("Peer kon niet worden aangemaakt"));
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        const err = new Error("Room maken duurde te lang. Tik nog eens op Maak room.");
        this.#setStatus("error", err.message);
        reject(err);
      }, 12000);

      const onOpen = (id) => {
        cleanup();
        this.roomCode = id;
        this.#setStatus("hosting", "Lobby open — deel de link");
        resolve(id);
      };

      const onError = (err) => {
        cleanup();
        this.#setStatus("error", err.message);
        this.onError?.(err);
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        peer.off("open", onOpen);
        peer.off("error", onError);
      };

      peer.on("open", onOpen);
      peer.on("error", onError);
      peer.on("connection", (conn) => this.#onIncoming(conn));
      this.#watchSignaling(peer);
    });
  }

  /**
   * @param {string} roomCode
   * @returns {Promise<void>}
   */
  async join(roomCode) {
    const code = roomCode.trim().toUpperCase();
    if (!code) throw new Error("Voer een kamercode in");

    await this.#waitForPeerJs();
    await this.destroy();
    this.role = "guest";
    this.roomCode = code;
    this.#setStatus("connecting", "Verbinden…");
    this.peer = this.#createPeer();

    return new Promise((resolve, reject) => {
      const peer = this.peer;
      if (!peer) {
        reject(new Error("Peer kon niet worden aangemaakt"));
        return;
      }

      let settled = false;
      let timer = null;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.#setStatus("error", err.message);
        this.onError?.(err);
        reject(err);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onOpen = () => {
        const conn = peer.connect(code, { reliable: true });
        this.#bindConnection(conn, { onOpen: succeed, onError: fail });
      };

      const onPeerError = (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      };

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        peer.off("open", onOpen);
        peer.off("error", onPeerError);
      };

      timer = setTimeout(() => {
        fail(new Error("Verbinden duurde te lang. Host moet online blijven."));
      }, 12000);

      peer.on("open", onOpen);
      peer.on("error", onPeerError);
      this.#watchSignaling(peer);
    });
  }

  async reconnect() {
    if (!this.roomCode) {
      throw new Error("Geen kamercode om opnieuw mee te verbinden");
    }
    if (this.role === "host") {
      return this.hostWithCode(this.roomCode);
    }
    return this.join(this.roomCode);
  }

  /**
   * @param {string} code
   * @returns {Promise<string>}
   */
  async hostWithCode(code) {
    await this.#waitForPeerJs();
    await this.destroy();
    this.role = "host";
    this.roomCode = code;
    this.#setStatus("connecting", "Kamer opnieuw starten…");
    this.peer = this.#createPeer(code);

    return new Promise((resolve, reject) => {
      const peer = this.peer;
      if (!peer) {
        reject(new Error("Peer kon niet worden aangemaakt"));
        return;
      }

      const onOpen = (id) => {
        cleanup();
        this.roomCode = id;
        this.#setStatus("hosting", "Lobby open — deel de link");
        resolve(id);
      };

      const onError = (err) => {
        cleanup();
        const type = err?.type || "";
        if (type === "unavailable-id") {
          const taken = new Error(
            "Deze kamercode is al in gebruik. Iemand host deze room nog. Kies Join, of wacht tot de host weg is.",
          );
          taken.type = "unavailable-id";
          this.#setStatus("error", taken.message);
          this.onError?.(taken);
          reject(taken);
          return;
        }
        this.#setStatus("error", err.message);
        this.onError?.(err);
        reject(err);
      };

      const cleanup = () => {
        peer.off("open", onOpen);
        peer.off("error", onError);
      };

      peer.on("open", onOpen);
      peer.on("error", onError);
      peer.on("connection", (conn) => this.#onIncoming(conn));
      this.#watchSignaling(peer);
    });
  }

  /**
   * @param {import('peerjs').DataConnection} conn
   */
  #onIncoming(conn) {
    if (this.role !== "host") {
      conn.close();
      return;
    }
    if (this.conns.size >= this.maxGuests) {
      conn.on("open", () => {
        try {
          conn.send({
            type: "room_full",
            seq: 0,
            payload: { maxPlayers: this.maxGuests + 1 },
          });
        } catch {
          /* ignore */
        }
        setTimeout(() => conn.close(), 100);
      });
      return;
    }
    this.#bindConnection(conn);
  }

  /**
   * @param {import('peerjs').DataConnection} conn
   * @param {{ onOpen?: () => void, onError?: (err: Error) => void }} [hooks]
   */
  #bindConnection(conn, hooks = {}) {
    const peerId = conn.peer;

    conn.on("open", () => {
      if (this.role === "host") {
        this.conns.set(peerId, conn);
        this.onPeerJoin?.(peerId);
        // 1v1: mark connected when the only guest arrives
        if (this.maxGuests === 1) {
          this.#setStatus("connected", "Verbonden");
        } else {
          this.#setStatus(
            "hosting",
            `${this.conns.size + 1}/${this.maxGuests + 1} in lobby`,
          );
        }
      } else {
        this.conn = conn;
        this.#setStatus("connected", "Verbonden");
      }
      hooks.onOpen?.();
    });

    conn.on("data", (data) => {
      this.onMessage?.(data, this.role === "host" ? peerId : null);
    });

    conn.on("close", () => {
      if (this.status === "idle") return;
      if (this.role === "host") {
        if (this.conns.get(peerId) !== conn) return;
        this.conns.delete(peerId);
        this.onPeerLeave?.(peerId);
        if (this.#hasOpenDataConnection()) return;
        if (this.maxGuests === 1) {
          this.#setStatus("disconnected", "Verbinding verbroken");
        } else {
          this.#setStatus(
            "hosting",
            `${this.conns.size + 1}/${this.maxGuests + 1} in lobby`,
          );
        }
        return;
      }
      if (this.conn && this.conn !== conn) return;
      this.conn = null;
      if (this.#hasOpenDataConnection()) return;
      // Brief delay: mobile WebRTC sometimes flaps before a reconnect lands.
      const code = this.roomCode;
      setTimeout(() => {
        if (this.status === "idle") return;
        if (this.roomCode !== code) return;
        if (this.#hasOpenDataConnection()) return;
        // Skip only while an explicit reconnect/join is in flight.
        if (this.status === "connecting") return;
        this.#setStatus("disconnected", "Verbinding verbroken");
      }, 1200);
    });

    conn.on("error", (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.#setStatus("error", error.message);
      this.onError?.(error);
      hooks.onError?.(error);
    });
  }

  /**
   * Guest → host, or host → single guest (1v1 uses guest conn).
   * @param {unknown} data
   * @returns {boolean}
   */
  send(data) {
    if (this.role === "guest") {
      if (!this.conn || !this.conn.open) return false;
      this.conn.send(data);
      return true;
    }
    // host 1v1 convenience: send to the only guest
    if (this.conns.size === 1) {
      const conn = this.conns.values().next().value;
      if (conn?.open) {
        conn.send(data);
        return true;
      }
    }
    return false;
  }

  /**
   * Host → one guest
   * @param {string} peerId
   * @param {unknown} data
   */
  sendTo(peerId, data) {
    const conn = this.conns.get(peerId);
    if (!conn?.open) return false;
    conn.send(data);
    return true;
  }

  /**
   * Host → all guests
   * @param {unknown} data
   */
  broadcast(data) {
    if (this.role !== "host") return 0;
    let n = 0;
    for (const conn of this.conns.values()) {
      if (conn.open) {
        conn.send(data);
        n++;
      }
    }
    return n;
  }

  isConnected() {
    if (this.role === "guest") return Boolean(this.conn?.open);
    if (this.maxGuests === 1) {
      return [...this.conns.values()].some((c) => c.open);
    }
    // multi: host is "in session" while hosting (lobby open)
    return this.status === "hosting" || this.status === "connected";
  }

  /**
   * Force UI/session into disconnected (e.g. failed keepalive send).
   * @param {string} [detail]
   */
  markDisconnected(detail = "Verbinding verbroken") {
    if (this.status === "idle" || this.status === "connecting") return;
    this.#setStatus("disconnected", detail);
  }

  async destroy() {
    const prev = this.status;
    this.status = "idle";

    for (const conn of this.conns.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.conns.clear();

    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        /* ignore */
      }
      this.conn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* ignore */
      }
      this.peer = null;
    }

    if (prev !== "idle") {
      this.onStatus?.("idle");
    }
  }
}
