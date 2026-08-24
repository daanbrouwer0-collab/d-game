import { TransportType } from "../js/core/room.js";
import { loadRoomLog, saveRoomLog, touchDeskRoom } from "../js/core/desk.js";
import { getPlayerId } from "../js/core/storage.js";
import {
  appendEvent,
  coerceEventLog,
  createEventLog,
  encodeSyncPacket,
  mergeLogs,
  parseSyncPacket,
  tipSeq,
} from "../js/sync/event-log.js";
import {
  Msg,
  MIN_PLAYERS,
  MAX_PLAYERS,
  addPlayer,
  applyRoll,
  canStart,
  cloneState,
  createEmptyLobby,
  createLobbyState,
  removePlayer,
  rollDice,
  startGame,
  GAME_ID,
} from "./game.js";
import {
  gbSummary,
  matchSeat,
  replayGanzenbord,
  seatsFromLog,
} from "./log.js";

/**
 * Host-authoritative lobby + ganzenbord. P2P progress lives in an event log.
 */
export class Room {
  /**
   * @param {ReturnType<typeof import('../js/core/room.js').createRoom>} session
   * @param {{ localName: string }} opts
   */
  constructor(session, { localName }) {
    this.session = session;
    this.localName = localName.trim() || "Speler";
    this.playerId = getPlayerId();
    /** @type {string} */
    this.localId = this.playerId;
    /** @type {import('./game.js').GameState} */
    this.state = createEmptyLobby();
    this.log = createEventLog(GAME_ID);
    /** @type {Map<string, string>} peerId → playerId */
    this.peerToPlayer = new Map();
    /** @type {Set<string>} playerIds currently connected (excl. local host self) */
    this.onlineIds = new Set();
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

  /**
   * @param {string} code
   */
  loadPersisted(code) {
    this.log = loadRoomLog(GAME_ID, code);
    this.#replay();
  }

  /** Call after session.host() / hostWithCode() */
  beginAsHost() {
    this.localId = this.playerId;
    this.localName = this.localName.trim() || "Speler";
    this.peerToPlayer.clear();
    this.onlineIds = new Set([this.playerId]);

    if (this.isLocal) {
      this.log = createEventLog(GAME_ID);
      this.state = createLobbyState(this.playerId, this.localName);
      this.state.players[0].isHost = true;
      this.#emit();
      return;
    }

    this.#claimSeat(this.playerId, this.localName);
    this.#markTransportHost();
    this.#replay();
    this.#persist();
    this.#emit();
  }

  /** Call after guest connection opens */
  beginAsGuest() {
    this.localId = this.playerId;
    this.session.sendHello({
      name: this.localName,
      playerId: this.playerId,
      log: encodeSyncPacket(this.log),
    });
  }

  onReconnected() {
    if (this.isLocal) return;
    if (this.session.role === "host") {
      this.#claimSeat(this.playerId, this.localName);
      this.#markTransportHost();
      this.#replay();
      this.#persist();
      this.#sendLogWelcome();
      this.#emit();
    } else {
      this.beginAsGuest();
    }
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
    this.onlineIds.add(id);
    this.#emit();
    return { ok: true, playerId: id };
  }

  tryStart() {
    if (this.session.role !== "host") {
      return { ok: false, reason: "Alleen de host kan starten" };
    }
    if (this.isLocal) {
      const result = startGame(this.state);
      if (!result.ok) return result;
      this.state = result.state;
      this.#emit();
      return { ok: true };
    }
    if (!canStart(this.state)) {
      return {
        ok: false,
        reason: `Minimaal ${MIN_PLAYERS} spelers nodig (nu ${this.state.players.length})`,
      };
    }
    this.#appendAndBroadcast("start", null);
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
      this.#appendAndBroadcast("roll", {
        playerId: this.localId,
        value: roll,
      });
      return { ok: true };
    }

    this.session.send(Msg.ROLL, { playerId: this.localId });
    return { ok: true };
  }

  /**
   * @param {string} playerId
   */
  isPlayerOnline(playerId) {
    if (this.isLocal) return true;
    if (playerId === this.localId) return true;
    return this.onlineIds.has(playerId);
  }

  #emit() {
    this.onState?.(cloneState(this.state));
  }

  #replay() {
    this.state = replayGanzenbord(this.log);
    this.#markTransportHost();
  }

  #markTransportHost() {
    const hostSeat = this.session.role === "host";
    for (const p of this.state.players) {
      p.isHost = hostSeat && p.id === this.localId;
    }
  }

  #persist() {
    const code = this.session.roomCode;
    if (!code || this.isLocal) return;
    saveRoomLog(GAME_ID, code, this.log);
    const role = this.session.role === "guest" ? "guest" : "host";
    touchDeskRoom({
      gameId: GAME_ID,
      code,
      role,
      name: this.localName || role,
      summary: gbSummary(this.state),
      seq: tipSeq(this.log),
    });
  }

  /**
   * @param {string} type
   * @param {unknown} payload
   */
  #appendAndBroadcast(type, payload) {
    const added = appendEvent(this.log, type, payload);
    if (!added.ok) return;
    this.log = added.log;
    this.#replay();
    this.#persist();
    if (!this.isLocal) {
      this.session.broadcast(Msg.LOG, encodeSyncPacket(this.log));
    }
    this.#emit();
  }

  /**
   * @param {string} [peerId]
   * @param {string|null} [youAre]
   */
  #sendLogWelcome(peerId, youAre = null) {
    this.session.sendWelcome(
      {
        youAre,
        log: encodeSyncPacket(this.log),
        state: this.state,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
      },
      peerId,
    );
  }

  /**
   * @param {string} playerId
   * @param {string} name
   */
  #claimSeat(playerId, name) {
    const id = String(playerId || "");
    const nm = String(name || "").trim().slice(0, 20) || "Speler";
    if (!id) return;
    const seats = seatsFromLog(this.log);
    const matched = matchSeat(seats, id, nm);
    const seatId = matched || id;
    const cur = seats.find((s) => s.playerId === seatId);
    if (cur && cur.name === nm && seatId === id) {
      if (id === this.playerId) this.localId = id;
      return seatId;
    }
    if (!matched && seats.length >= MAX_PLAYERS) return null;
    const added = appendEvent(this.log, "seat", {
      playerId: seatId,
      name: nm,
    });
    if (added.ok) this.log = added.log;
    if (id === this.playerId) this.localId = seatId;
    return seatId;
  }

  /**
   * @param {unknown} raw
   */
  #adoptRemoteLog(raw) {
    const packet = parseSyncPacket(raw);
    if (!packet) return;
    const remote = coerceEventLog(
      { gameId: packet.gameId, events: packet.events },
      GAME_ID,
    );
    this.log = mergeLogs(this.log, remote);
    this.#replay();
    this.#persist();
  }

  /**
   * @param {{ type: string, payload: unknown, fromPeerId?: string|null }} msg
   */
  #onMessage(msg) {
    const from = msg.fromPeerId || null;

    switch (msg.type) {
      case TransportType.HELLO: {
        if (this.session.role !== "host" || !from) break;
        const payload = /** @type {{ name?: string, playerId?: string, log?: unknown }} */ (
          msg.payload || {}
        );
        this.#adoptRemoteLog(payload.log);
        this.#claimSeat(this.playerId, this.localName);

        const guestId = String(payload.playerId || "");
        const guestName = String(payload.name || "Speler").slice(0, 20);
        const seats = seatsFromLog(this.log);
        let youAre = matchSeat(seats, guestId, guestName);

        if (!youAre) {
          if (this.state.phase !== "lobby") {
            this.session.sendTo(from, Msg.REJECT, {
              reason: "Het spel is al gestart — alleen bekende spelers kunnen terugjoinen",
            });
            break;
          }
          if (seats.length >= MAX_PLAYERS) {
            this.session.sendTo(from, Msg.REJECT, {
              reason: `Lobby is vol (max ${MAX_PLAYERS})`,
            });
            break;
          }
          youAre = this.#claimSeat(guestId || `p_${Date.now().toString(36)}`, guestName);
        } else {
          this.#claimSeat(youAre, guestName);
        }

        if (!youAre) {
          this.session.sendTo(from, Msg.REJECT, { reason: "Kon geen stoel toewijzen" });
          break;
        }

        this.peerToPlayer.set(from, youAre);
        this.onlineIds.add(youAre);
        this.#replay();
        this.#persist();
        this.#sendLogWelcome(from, youAre);
        this.#emit();
        break;
      }

      case TransportType.WELCOME: {
        if (this.session.role === "host") break;
        const payload = /** @type {{ youAre?: string, log?: unknown, state?: import('./game.js').GameState }} */ (
          msg.payload || {}
        );
        if (payload.log) this.#adoptRemoteLog(payload.log);
        else if (payload.state) {
          this.state = cloneState(payload.state);
        }
        if (payload.youAre) this.localId = payload.youAre;
        this.onlineIds = new Set(this.state.players.map((p) => p.id));
        this.#emit();
        break;
      }

      case Msg.LOG: {
        if (this.session.role === "host") break;
        this.#adoptRemoteLog(msg.payload);
        this.#emit();
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
        const current = this.state.players[this.state.turnIndex];
        if (!current || current.id !== payload.playerId) break;
        if (payload.playerId === this.localId) break;
        const roll = rollDice();
        const result = applyRoll(this.state, payload.playerId, roll);
        if (!result.ok) break;
        this.#appendAndBroadcast("roll", {
          playerId: payload.playerId,
          value: roll,
        });
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
    if (playerId) this.onlineIds.delete(playerId);

    if (this.isLocal && playerId) {
      this.state = removePlayer(this.state, playerId);
      this.onlineIds.delete(playerId);
      this.#emit();
      return;
    }

    // P2P: keep seat (lobby or mid-game); late rejoin rematches by playerId.
    this.#emit();
  }
}

export { canStart };
