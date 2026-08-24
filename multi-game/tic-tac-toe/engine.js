import { TransportType } from "../js/core/room.js";
import { loadRoomLog, saveRoomLog, touchDeskRoom } from "../js/core/desk.js";
import { getPlayerId, listAllRecentRooms, playerLabel } from "../js/core/storage.js";
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
  GAME_ID,
  GameMsg,
  applyMove,
  applyTimeoutMove,
  cloneState,
  createInitialState,
  freeCells,
  pickBlocked,
} from "./game.js";
import { markForPlayer, replayTtt, seatsFromLog, tttSummary } from "./log.js";

/**
 * Host-authoritative tic-tac-toe. Moves live in a light event chain.
 * X/O stays on the player (id + name), not on who currently hosts.
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
    this.playerId = getPlayerId();
    this.playerName = playerLabel();
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
    this.playerName = playerLabel();
    this.localMark = this.#claimSeat(this.playerId, this.playerName);
    this.#ensureBoardSetup();
    this.#replay();
    this.#persist();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  startLocalHotseat() {
    this.hotseat = true;
    this.localMark = "X";
    this.log = createEventLog(GAME_ID);
    this.state = createInitialState(pickBlocked());
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  startAsGuest() {
    this.hotseat = false;
    this.playerName = playerLabel();
    this.localMark = markForPlayer(
      seatsFromLog(this.log),
      this.playerId,
      this.playerName,
    );
    this.#replay();
    this.session.sendHello({
      log: encodeSyncPacket(this.log),
      playerId: this.playerId,
      name: this.playerName,
    });
  }

  onPeerConnected() {
    if (this.session.role !== "host" || this.hotseat) return;
    this.playerName = playerLabel();
    this.localMark = this.#claimSeat(this.playerId, this.playerName);
    this.#ensureBoardSetup();
    this.#replay();
    this.#persist();
    this.onReady?.(this.localMark);
    this.onState?.(cloneState(this.state));
  }

  onReconnected() {
    if (this.hotseat) return;
    this.playerName = playerLabel();
    if (this.session.role === "host") {
      this.localMark = this.#claimSeat(this.playerId, this.playerName);
      this.#sendLogWelcome();
    } else {
      this.session.sendHello({
        log: encodeSyncPacket(this.log),
        playerId: this.playerId,
        name: this.playerName,
      });
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
    if (this.state.blocked?.includes(index)) {
      return { ok: false, reason: "Vakje is geblokkeerd" };
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
        this.state = createInitialState(pickBlocked());
        this.localMark = "X";
      } else {
        this.#appendAndBroadcast("restart", { blocked: pickBlocked() });
      }
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return;
    }
    this.session.send(GameMsg.RESTART);
  }

  /**
   * Turn timer expired: place a random free cell for the current turn (P2P).
   * Guests request; host chooses the index and appends a timeout event.
   */
  tryTimeout() {
    if (this.hotseat) return { ok: false, reason: "Geen timer in hotseat" };
    if (this.state.status !== "playing") {
      return { ok: false, reason: "Spel is al afgelopen" };
    }
    const mark = this.state.turn;
    const free = freeCells(this.state);
    if (!free.length) return { ok: false, reason: "Geen vrije vakjes" };

    if (this.session.role === "host") {
      const index = free[Math.floor(Math.random() * free.length)];
      const result = applyTimeoutMove(this.state, mark, index);
      if (!result.ok) return result;
      this.#appendAndBroadcast("timeout", { index, mark });
      this.onState?.(cloneState(this.state));
      return { ok: true };
    }

    const sent = this.session.send(GameMsg.TIMEOUT, { mark });
    if (!sent) return { ok: false, reason: "Niet verbonden" };
    return { ok: true };
  }

  /** Host: first board of a room gets blocked cells via restart event. */
  #ensureBoardSetup() {
    if (this.hotseat) return;
    if (this.session.role !== "host") return;
    const events = this.log.events || [];
    if (events.some((e) => e.type === "restart")) return;
    // Don't wipe an in-progress legacy game (moves without restart).
    if (events.some((e) => e.type === "move" || e.type === "timeout")) return;
    const added = appendEvent(this.log, "restart", { blocked: pickBlocked() });
    if (added.ok) this.log = added.log;
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
      name: this.playerName || role,
      summary: tttSummary(this.state),
      seq: tipSeq(this.log),
    });
    this.#storeMark(code, this.localMark);
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
   * @param {'X'|'O'|null} [youAre]
   */
  #sendLogWelcome(peerId, youAre = null) {
    this.session.sendWelcome(
      {
        youAre,
        log: encodeSyncPacket(this.log),
        state: this.state,
        seats: seatsFromLog(this.log),
      },
      peerId,
    );
  }

  /**
   * @param {string} playerId
   * @param {string} name
   * @param {{ otherThan?: 'X'|'O'|null }} [opts]
   * @returns {'X'|'O'}
   */
  #claimSeat(playerId, name, opts = {}) {
    const seats = seatsFromLog(this.log);
    const id = String(playerId || "");
    let mark = markForPlayer(seats, id, name);
    const local = id && id === this.playerId;
    if (!mark && local) {
      const saved = this.#savedMark() || this.#deskHintMark(seats);
      if (
        saved &&
        saved !== opts.otherThan &&
        (!seats[saved] ||
          seats[saved].playerId === id ||
          !seats[saved].playerId)
      ) {
        mark = saved;
      }
    }
    if (!mark) {
      const order =
        opts.otherThan === "X"
          ? /** @type {const} */ (["O", "X"])
          : /** @type {const} */ (["X", "O"]);
      mark =
        order.find((m) => !seats[m]) ||
        (id ? order.find((m) => seats[m]?.playerId === id) : undefined) ||
        order.find((m) => !seats[m]?.playerId) ||
        order[0];
    }
    this.#recordSeat(mark, id, name);
    if (local) {
      this.localMark = mark;
      const code = this.session.roomCode;
      if (code) this.#storeMark(code, mark);
    }
    return mark;
  }

  /**
   * Old rooms had no seat events: host was always X. Use last desk role once.
   * @param {ReturnType<typeof seatsFromLog>} seats
   * @returns {'X'|'O'|null}
   */
  #deskHintMark(seats) {
    if (seats.X || seats.O) return null;
    const code = this.session.roomCode;
    if (!code) return null;
    const rec = listAllRecentRooms().find(
      (r) => r.gameId === GAME_ID && r.code === code,
    );
    if (rec?.role === "guest") return "O";
    if (rec?.role === "host") return "X";
    return null;
  }

  /**
   * @param {'X'|'O'} mark
   * @param {string} playerId
   * @param {string} name
   */
  #recordSeat(mark, playerId, name) {
    const seats = seatsFromLog(this.log);
    const cur = seats[mark];
    const id = String(playerId || "");
    const nm = String(name || "").trim();
    if (!id && !nm) return;
    if (cur && cur.playerId === id && cur.name === nm) return;
    const added = appendEvent(this.log, "seat", {
      mark,
      playerId: id,
      name: nm,
    });
    if (added.ok) this.log = added.log;
  }

  /** @returns {'X'|'O'|null} */
  #savedMark() {
    const code = this.session.roomCode;
    if (!code) return null;
    try {
      const raw = localStorage.getItem(`dgame.ttt.mark.${code}`);
      return raw === "X" || raw === "O" ? raw : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} code
   * @param {'X'|'O'|null} mark
   */
  #storeMark(code, mark) {
    if (!code || (mark !== "X" && mark !== "O")) return;
    try {
      localStorage.setItem(`dgame.ttt.mark.${code}`, mark);
    } catch {
      /* ignore */
    }
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
          const payload = /** @type {{ log?: unknown, playerId?: string, name?: string }} */ (
            msg.payload || {}
          );
          this.#adoptRemoteLog(payload.log);
          this.playerName = playerLabel();
          this.localMark = this.#claimSeat(this.playerId, this.playerName);
          const guestMark = this.#claimSeat(
            String(payload.playerId || ""),
            String(payload.name || ""),
            { otherThan: this.localMark },
          );
          this.#persist();
          this.onReady?.(this.localMark);
          this.#sendLogWelcome(msg.fromPeerId || undefined, guestMark);
        }
        break;

      case TransportType.WELCOME: {
        const payload = /** @type {{ youAre?: string, log?: unknown, state?: typeof this.state }} */ (
          msg.payload || {}
        );
        if (payload.log) this.#adoptRemoteLog(payload.log);
        else if (payload.state) {
          this.state = cloneState(payload.state);
          this.onState?.(cloneState(this.state));
        }
        if (payload.youAre === "X" || payload.youAre === "O") {
          this.localMark = payload.youAre;
          const code = this.session.roomCode;
          if (code) this.#storeMark(code, payload.youAre);
          this.onReady?.(this.localMark);
        } else {
          const guessed = markForPlayer(
            seatsFromLog(this.log),
            this.playerId,
            this.playerName,
          );
          if (guessed) {
            this.localMark = guessed;
            this.onReady?.(this.localMark);
          }
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
        const mark = payload.mark === "X" || payload.mark === "O" ? payload.mark : null;
        if (!mark || mark === this.localMark || typeof payload.index !== "number") {
          break;
        }
        const result = applyMove(this.state, payload.index, mark);
        if (!result.ok) break;
        this.#appendAndBroadcast("move", { index: payload.index, mark });
        this.onState?.(cloneState(this.state));
        break;
      }

      case GameMsg.RESTART:
        if (this.session.role === "host") {
          this.#appendAndBroadcast("restart", { blocked: pickBlocked() });
          this.onState?.(cloneState(this.state));
        }
        break;

      case GameMsg.TIMEOUT: {
        if (this.session.role !== "host") break;
        if (this.state.status !== "playing") break;
        const mark = this.state.turn;
        const free = freeCells(this.state);
        if (!free.length) break;
        const index = free[Math.floor(Math.random() * free.length)];
        const result = applyTimeoutMove(this.state, mark, index);
        if (!result.ok) break;
        this.#appendAndBroadcast("timeout", { index, mark });
        this.onState?.(cloneState(this.state));
        break;
      }

      default:
        break;
    }
  }
}
