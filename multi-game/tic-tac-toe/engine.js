import { TransportType } from "../js/core/room.js";
import {
  loadRoomLog,
  saveRoomLog,
  touchDeskRoom,
} from "../js/core/desk.js";
import {
  appendEvent,
  coerceEventLog,
  createEventLog,
  encodeSyncPacket,
  mergeLogs,
  parseSyncPacket,
  tipSeq,
} from "../js/sync/event-log.js";
import { GAME_ID, GameMsg, applyMove, cloneState, createInitialState } from "./game.js";
import { replayTtt, tttSummary } from "./log.js";

/**
 * Host-authoritative tic-tac-toe. Moves live in a light event chain.
 */
export class GameEngine {
  /**
   * @param {ReturnType<typeof import('../js/core/room.js').createRoom>} room
   */
  constructor(room) {
    this.session = room;
    /** @type {'X'|'O'|null} */
    this.localMark = null;
    this.hotseat = false;
    /** @type {ReturnType<typeof createInitialState>} */
    this.state = createInitialState();
    this.log = createEventLog(GAME_ID);
    /** @type {((state: typeof this.state) => void) | null} */
    this.onState = null;
    /** @type {((mark: 'X'|'O'|null) => void) | null} */
    this.onReady = null;

    this.session.onMessage = (msg) => this.#handleMessage(msg);
  }

  /**
   * @param {string} code
   */
  loadPersisted(code) {
    this.log = loadRoomLog(GAME_ID, code);
    this.#replay();
  }

  startAsHost() {
    this.hotseat = false;
    this.localMark = "X";
    this.#replay();
    this.#persist();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  startLocalHotseat() {
    this.hotseat = true;
    this.localMark = "X";
    this.log = createEventLog(GAME_ID);
    this.state = createInitialState();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  startAsGuest() {
    this.hotseat = false;
    this.localMark = null;
    this.#replay();
    this.session.sendHello({ log: encodeSyncPacket(this.log) });
  }

  onPeerConnected() {
    if (this.session.role !== "host" || this.hotseat) return;
    this.localMark = "X";
    this.#replay();
    this.#sendLogWelcome();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  onReconnected() {
    if (this.hotseat) return;
    if (this.session.role === "host") {
      this.#sendLogWelcome();
    } else {
      this.session.sendHello({ log: encodeSyncPacket(this.log) });
    }
  }

  /** @returns {'X'|'O'|null} */
  activeMark() {
    if (this.hotseat) {
      return this.state.status === "playing" ? this.state.turn : this.localMark;
    }
    return this.localMark;
  }

  /**
   * @param {number} index
   */
  tryMove(index) {
    const mark = this.activeMark();
    if (!mark) return { ok: false, reason: "Nog niet klaar" };

    if (this.hotseat || this.session.role === "host") {
      const result = applyMove(this.state, index, mark);
      if (!result.ok) return result;
      this.state = result.state;
      if (!this.hotseat) this.#appendAndBroadcast("move", { index, mark });
      if (this.hotseat) this.localMark = this.state.turn;
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return { ok: true };
    }

    if (this.state.turn !== this.localMark || this.state.status !== "playing") {
      return { ok: false, reason: "Niet jouw beurt" };
    }
    if (this.state.board[index] !== null) {
      return { ok: false, reason: "Vakje is bezet" };
    }

    const sent = this.session.send(GameMsg.MOVE, {
      index,
      mark: this.localMark,
    });
    if (!sent) return { ok: false, reason: "Niet verbonden" };
    return { ok: true };
  }

  requestRestart() {
    if (this.hotseat || this.session.role === "host") {
      if (this.hotseat) {
        this.state = createInitialState();
        this.localMark = "X";
      } else {
        this.#appendAndBroadcast("restart", null);
      }
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return;
    }
    this.session.send(GameMsg.RESTART);
  }

  stop() {
    this.localMark = null;
    this.hotseat = false;
  }

  #replay() {
    this.state = replayTtt(this.log);
  }

  #persist() {
    const code = this.session.roomCode;
    if (!code || this.hotseat) return;
    saveRoomLog(GAME_ID, code, this.log);
    const role = this.session.role === "guest" ? "guest" : "host";
    touchDeskRoom({
      gameId: GAME_ID,
      code,
      role,
      name: role,
      summary: tttSummary(this.state),
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
    this.session.send(GameMsg.LOG, encodeSyncPacket(this.log));
  }

  /**
   * @param {string} [peerId]
   */
  #sendLogWelcome(peerId) {
    this.session.sendWelcome(
      {
        youAre: "O",
        log: encodeSyncPacket(this.log),
        state: this.state,
      },
      peerId,
    );
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
    this.onState?.(cloneState(this.state));
  }

  /**
   * @param {{ type: string, payload: unknown, fromPeerId?: string|null }} msg
   */
  #handleMessage(msg) {
    if (this.hotseat) return;

    switch (msg.type) {
      case TransportType.HELLO:
        if (this.session.role === "host") {
          const payload = /** @type {{ log?: unknown }} */ (msg.payload || {});
          this.#adoptRemoteLog(payload.log);
          this.#sendLogWelcome(msg.fromPeerId || undefined);
        }
        break;

      case TransportType.WELCOME: {
        const payload = /** @type {{ youAre?: string, log?: unknown, state?: typeof this.state }} */ (
          msg.payload || {}
        );
        if (payload.youAre === "X" || payload.youAre === "O") {
          this.localMark = payload.youAre;
          this.onReady?.(this.localMark);
        }
        if (payload.log) this.#adoptRemoteLog(payload.log);
        else if (payload.state) {
          this.state = cloneState(payload.state);
          this.onState?.(cloneState(this.state));
        }
        break;
      }

      case GameMsg.LOG:
        this.#adoptRemoteLog(msg.payload);
        this.onReady?.(this.localMark);
        break;

      case GameMsg.MOVE: {
        if (this.session.role !== "host") break;
        const payload = /** @type {{ index?: number, mark?: string }} */ (
          msg.payload || {}
        );
        if (payload.mark !== "O" || typeof payload.index !== "number") break;
        const result = applyMove(this.state, payload.index, "O");
        if (!result.ok) break;
        this.#appendAndBroadcast("move", {
          index: payload.index,
          mark: "O",
        });
        this.onState?.(cloneState(this.state));
        break;
      }

      case GameMsg.RESTART:
        if (this.session.role === "host") {
          this.#appendAndBroadcast("restart", null);
          this.onState?.(cloneState(this.state));
        }
        break;

      default:
        break;
    }
  }
}
