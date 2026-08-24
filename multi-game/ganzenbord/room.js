import { TransportType } from "../js/core/room.js";
import {
  Msg,
  MIN_PLAYERS,
  MAX_PLAYERS,
  addPlayer,
  applyRoll,
  canStart,
  cloneState,
  createLobbyState,
  removePlayer,
  rollDice,
  startGame,
} from "./game.js";

/**
 * Host-authoritative lobby + ganzenbord over a Room (local or p2p).
 */
export class Room {
  /**
   * @param {ReturnType<typeof import('../js/core/room.js').createRoom>} session
   * @param {{ localName: string }} opts
   */
  constructor(session, { localName }) {
    this.session = session;
    this.localName = localName.trim() || "Speler";
    /** @type {string} */
    this.localId =
      session.role === "host"
        ? "host"
        : `p_${Math.random().toString(36).slice(2, 9)}`;
    /** @type {import('./game.js').GameState} */
    this.state = createLobbyState("host", this.localName);
    /** @type {Map<string, string>} peerId → playerId */
    this.peerToPlayer = new Map();
    /** @type {((state: import('./game.js').GameState) => void) | null} */
    this.onState = null;
    /** @type {((reason: string) => void) | null} */
    this.onReject = null;
    this.joined = false;

    this.session.onMessage = (msg) => this.#onMessage(msg);
    this.session.onPeerLeave = (peerId) => this.#onPeerLeave(peerId);
  }

  get isLocal() {
    return this.session.transport === "local";
  }

  /** Call after session.host() */
  beginAsHost() {
    this.localId = "host";
    this.state = createLobbyState("host", this.localName);
    this.peerToPlayer.clear();
    this.#emit();
  }

  /** Call after guest connection opens */
  beginAsGuest() {
    this.session.sendHello({
      name: this.localName,
      playerId: this.localId,
    });
  }

  /**
   * Local hotseat: add another seat on this device.
   * @param {string} name
   */
  addLocalPlayer(name) {
    if (!this.isLocal || this.session.role !== "host") {
      return { ok: false, reason: "Alleen in local-lobby" };
    }
    const id = `local_${Math.random().toString(36).slice(2, 8)}`;
    const result = addPlayer(this.state, {
      id,
      name: (name || "Speler").trim().slice(0, 20) || "Speler",
      isHost: false,
      peerId: null,
    });
    if (!result.ok) return result;
    this.state = result.state;
    this.#emit();
    return { ok: true, playerId: id };
  }

  /**
   * Host starts the game if enough players.
   */
  tryStart() {
    if (this.session.role !== "host") {
      return { ok: false, reason: "Alleen de host kan starten" };
    }
    const result = startGame(this.state);
    if (!result.ok) return result;
    this.state = result.state;
    this.#syncAll();
    this.#emit();
    return { ok: true };
  }

  tryRoll() {
    if (this.state.phase !== "playing") {
      return { ok: false, reason: "Spel loopt niet" };
    }
    const current = this.state.players[this.state.turnIndex];
    if (!current) {
      return { ok: false, reason: "Geen beurt" };
    }

    // Local hotseat: host rolls for whoever's turn it is.
    if (this.isLocal && this.session.role === "host") {
      const roll = rollDice();
      const result = applyRoll(this.state, current.id, roll);
      if (!result.ok) return result;
      this.state = result.state;
      this.#emit();
      return { ok: true };
    }

    if (current.id !== this.localId) {
      return { ok: false, reason: "Niet jouw beurt" };
    }

    if (this.session.role === "host") {
      const roll = rollDice();
      const result = applyRoll(this.state, this.localId, roll);
      if (!result.ok) return result;
      this.state = result.state;
      this.#syncAll();
      this.#emit();
      return { ok: true };
    }

    this.session.send(Msg.ROLL, { playerId: this.localId });
    return { ok: true };
  }

  #emit() {
    this.onState?.(cloneState(this.state));
  }

  #syncAll() {
    if (this.isLocal) return;
    this.session.broadcast(Msg.STATE, this.state);
  }

  /**
   * @param {string} peerId
   */
  #syncTo(peerId) {
    this.session.sendTo(peerId, Msg.STATE, this.state);
  }

  /**
   * @param {{ type: string, payload: unknown, fromPeerId?: string|null }} msg
   */
  #onMessage(msg) {
    const from = msg.fromPeerId || null;

    switch (msg.type) {
      case TransportType.HELLO: {
        if (this.session.role !== "host" || !from) break;
        if (this.state.phase !== "lobby") {
          this.session.sendTo(from, Msg.REJECT, {
            reason: "Het spel is al gestart",
          });
          break;
        }
        const payload = /** @type {{ name?: string, playerId?: string }} */ (
          msg.payload || {}
        );
        const playerId =
          payload.playerId || `p_${Math.random().toString(36).slice(2, 9)}`;
        const name = (payload.name || "Speler").slice(0, 20);
        const result = addPlayer(this.state, {
          id: playerId,
          name,
          isHost: false,
          peerId: from,
        });
        if (!result.ok) {
          this.session.sendTo(from, Msg.REJECT, { reason: result.reason });
          break;
        }
        this.state = result.state;
        this.peerToPlayer.set(from, playerId);
        this.session.sendWelcome(
          {
            youAre: playerId,
            state: this.state,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
          },
          from,
        );
        this.#syncAll();
        this.#emit();
        break;
      }

      case TransportType.WELCOME: {
        if (this.session.role === "host") break;
        const payload = /** @type {{ youAre?: string, state?: import('./game.js').GameState }} */ (
          msg.payload || {}
        );
        if (payload.youAre) this.localId = payload.youAre;
        if (payload.state) {
          this.state = cloneState(payload.state);
          this.#emit();
        }
        break;
      }

      case Msg.STATE: {
        if (this.session.role === "host") break;
        const state = /** @type {import('./game.js').GameState} */ (msg.payload);
        if (!state?.players) break;
        this.state = cloneState(state);
        this.#emit();
        break;
      }

      case Msg.ROLL: {
        if (this.session.role !== "host") break;
        const payload = /** @type {{ playerId?: string }} */ (msg.payload || {});
        if (!payload.playerId) break;
        const roll = rollDice();
        const result = applyRoll(this.state, payload.playerId, roll);
        if (!result.ok) break;
        this.state = result.state;
        this.#syncAll();
        this.#emit();
        break;
      }

      case Msg.REJECT: {
        const reason =
          /** @type {{ reason?: string }} */ (msg.payload || {}).reason ||
          "Je kon niet joinen";
        this.onReject?.(reason);
        break;
      }

      default:
        break;
    }
  }

  /**
   * @param {string} peerId
   */
  #onPeerLeave(peerId) {
    if (this.session.role !== "host") return;
    const playerId = this.peerToPlayer.get(peerId);
    this.peerToPlayer.delete(peerId);
    if (!playerId) return;
    this.state = removePlayer(this.state, playerId);
    if (this.state.phase === "lobby") {
      this.#syncAll();
      this.#emit();
    } else if (this.state.players.length < MIN_PLAYERS) {
      this.state.phase = "lobby";
      this.state.lastLog = "Te weinig spelers — terug in lobby";
      this.#syncAll();
      this.#emit();
    } else {
      this.#syncAll();
      this.#emit();
    }
  }
}

export { canStart };
