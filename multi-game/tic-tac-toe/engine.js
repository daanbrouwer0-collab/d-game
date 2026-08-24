import { TransportType } from "../js/core/room.js";
import {
  GameMsg,
  applyMove,
  cloneState,
  createInitialState,
} from "./game.js";

/**
 * Host-authoritative tic-tac-toe over a Room (local or p2p).
 */
export class GameEngine {
  /**
   * @param {ReturnType<typeof import('../js/core/room.js').createRoom>} room
   */
  constructor(room) {
    this.session = room;
    /** @type {'X'|'O'|null} */
    this.localMark = null;
    /** Hotseat: one device plays both marks */
    this.hotseat = false;
    /** @type {ReturnType<typeof createInitialState>} */
    this.state = createInitialState();
    /** @type {((state: typeof this.state) => void) | null} */
    this.onState = null;
    /** @type {((mark: 'X'|'O'|null) => void) | null} */
    this.onReady = null;

    this.session.onMessage = (msg) => this.#handleMessage(msg);
  }

  startAsHost() {
    this.hotseat = false;
    this.localMark = "X";
    this.state = createInitialState();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  /** Local: both players on this device, alternating turns. */
  startLocalHotseat() {
    this.hotseat = true;
    this.localMark = "X";
    this.state = createInitialState();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  startAsGuest() {
    this.hotseat = false;
    this.localMark = null;
    this.state = createInitialState();
    this.session.sendHello();
  }

  onPeerConnected() {
    if (this.session.role !== "host" || this.hotseat) return;
    this.localMark = "X";
    this.state = createInitialState();
    this.session.sendWelcome({
      youAre: "O",
      state: this.state,
    });
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  onReconnected() {
    if (this.hotseat) return;
    if (this.session.role === "host") {
      this.session.sendWelcome({
        youAre: "O",
        state: this.state,
      });
      this.session.send(GameMsg.STATE, this.state);
    } else {
      this.session.sendHello();
    }
  }

  /**
   * Mark used for the next move (hotseat follows turn).
   * @returns {'X'|'O'|null}
   */
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
    if (!mark) {
      return { ok: false, reason: "Nog niet klaar" };
    }

    if (this.hotseat || this.session.role === "host") {
      const result = applyMove(this.state, index, mark);
      if (!result.ok) return result;
      this.state = result.state;
      if (!this.hotseat) this.#broadcastState();
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
      this.state = createInitialState();
      if (this.hotseat) this.localMark = "X";
      if (!this.hotseat) this.#broadcastState();
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

  #broadcastState() {
    this.session.send(GameMsg.STATE, this.state);
  }

  /**
   * @param {{ type: string, payload: unknown }} msg
   */
  #handleMessage(msg) {
    if (this.hotseat) return;

    switch (msg.type) {
      case TransportType.HELLO:
        if (this.session.role === "host") {
          this.session.sendWelcome({
            youAre: "O",
            state: this.state,
          });
        }
        break;

      case TransportType.WELCOME: {
        const payload = /** @type {{ youAre?: string, state?: typeof this.state }} */ (
          msg.payload || {}
        );
        if (payload.youAre === "X" || payload.youAre === "O") {
          this.localMark = payload.youAre;
          this.onReady?.(this.localMark);
        }
        if (payload.state) {
          this.state = cloneState(payload.state);
          this.onState?.(cloneState(this.state));
        }
        break;
      }

      case GameMsg.MOVE: {
        if (this.session.role !== "host") break;
        const payload = /** @type {{ index?: number, mark?: string }} */ (
          msg.payload || {}
        );
        if (payload.mark !== "O" || typeof payload.index !== "number") break;
        const result = applyMove(this.state, payload.index, "O");
        if (!result.ok) break;
        this.state = result.state;
        this.#broadcastState();
        this.onState?.(cloneState(this.state));
        break;
      }

      case GameMsg.STATE: {
        if (this.session.role === "host") break;
        const state = /** @type {typeof this.state} */ (msg.payload);
        if (!state || !Array.isArray(state.board)) break;
        this.state = cloneState(state);
        this.onState?.(cloneState(this.state));
        break;
      }

      case GameMsg.RESTART:
        if (this.session.role === "host") {
          this.state = createInitialState();
          this.#broadcastState();
          this.onState?.(cloneState(this.state));
        }
        break;

      default:
        break;
    }
  }
}
