import { TransportType } from "../js/core/room.js";
import { loadRoomLog, saveRoomLog, touchDeskRoom } from "../js/core/desk.js";
import { getPlayerId, listAllRecentRooms, playerLabel } from "../js/core/storage.js";
import {
  appendEvent,
  createEventLog,
  encodeSyncPacket,
  parseSyncPacket,
  adoptHostPacket,
  replaceFromHostPacket,
  coerceEventLog,
  tipEventId,
  tipSeq,
} from "../js/sync/event-log.js";
import { createHostCommit } from "../js/sync/host-commit.js";
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
 * Host-authoritative tic-tac-toe (log-only canon).
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
    this.hostCommit = createHostCommit({ gameId: GAME_ID });
    /** @type {string|null} */
    this._pendingIntentId = null;
    /** @type {((state: typeof this.state) => void) | null} */
    this.onState = null;
    /** @type {((mark: 'X'|'O'|null) => void) | null} */
    this.onReady = null;
    /** @type {((reason: string) => void) | null} */
    this.onReject = null;

    this.session.onMessage = (msg) => this.#handleMessage(msg);
    this.session.onPeerLeave = (peerId) => {
      this.hostCommit.unbindPeer(peerId);
    };
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
    if (this.session.transport === "bridge") {
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return;
    }
    this.session.sendHello({
      playerId: this.playerId,
      name: this.playerName,
    });
  }

  /**
   * Embedded in room shell — log and role come from SESSION_INIT.
   * @param {{ role: 'host'|'guest', log?: unknown }} init
   */
  bootstrapEmbedded(init) {
    this.hotseat = false;
    this.playerName = playerLabel();
    if (init.log) {
      const packet = /** @type {import('../js/sync/event-log.js').SyncPacket} */ (
        init.log
      );
      if (packet?.v === 1 && Array.isArray(packet.events)) {
        const replaced = replaceFromHostPacket(GAME_ID, packet);
        if (replaced.ok) this.log = replaced.log;
      } else {
        const coerced = coerceEventLog(init.log, GAME_ID);
        if (coerced) this.log = coerced;
      }
    }
    if (init.role === "host") {
      this.startAsHost();
    } else {
      this.localMark = markForPlayer(
        seatsFromLog(this.log),
        this.playerId,
        this.playerName,
      );
      this.#replay();
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
    }
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
      this.#ensureBoardSetup();
      this.#replay();
      this.#persist();
      this.#sendLogWelcome();
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
    } else {
      this.session.sendHello({
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

    if (this.hotseat) {
      const result = applyMove(this.state, index, mark);
      if (!result.ok) return result;
      this.state = result.state;
      this.localMark = this.state.turn;
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return { ok: true };
    }

    if (this.session.role === "host") {
      if (this.state.turn !== mark || this.state.status !== "playing") {
        return { ok: false, reason: "Niet jouw beurt" };
      }
      const result = applyMove(this.state, index, mark);
      if (!result.ok) return result;
      this.#appendAndBroadcast("move", { index, mark });
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
    if (this._pendingIntentId) {
      return { ok: false, reason: "Zet wordt verwerkt…" };
    }

    const intentId = `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this._pendingIntentId = intentId;
    const sent = this.session.send(GameMsg.INTENT, {
      intentId,
      kind: "move",
      index,
      mark: this.localMark,
      actorPlayerId: this.playerId,
    });
    if (!sent) {
      this._pendingIntentId = null;
      return { ok: false, reason: "Niet verbonden" };
    }
    return { ok: true, pending: true };
  }

  requestRestart() {
    if (this.hotseat) {
      this.state = createInitialState(pickBlocked());
      this.localMark = "X";
      this.hostCommit.clearTurnKeys();
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return;
    }
    if (this.session.role === "host") {
      this.hostCommit.clearTurnKeys();
      this.#appendAndBroadcast("restart", { blocked: pickBlocked() });
      this.onReady?.(this.localMark);
      this.onState?.(cloneState(this.state));
      return;
    }
    const intentId = `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.session.send(GameMsg.INTENT, {
      intentId,
      kind: "restart",
      actorPlayerId: this.playerId,
    });
  }

  /**
   * Host-only timer: one timeout commit per turnKey.
   */
  tryTimeout() {
    if (this.hotseat) return { ok: false, reason: "Geen timer in hotseat" };
    if (this.session.role !== "host") {
      return { ok: false, reason: "Alleen host-timer" };
    }
    if (this.state.status !== "playing") {
      return { ok: false, reason: "Spel is al afgelopen" };
    }
    const mark = this.state.turn;
    const turnKey = `timeout:${mark}:${tipSeq(this.log)}`;
    if (this.hostCommit.isTurnKeyDone(turnKey)) {
      return { ok: false, reason: "already" };
    }
    const free = freeCells(this.state);
    if (!free.length) return { ok: false, reason: "Geen vrije vakjes" };

    const index = free[Math.floor(Math.random() * free.length)];
    const result = applyTimeoutMove(this.state, mark, index);
    if (!result.ok) return result;
    this.hostCommit.markTurnKeyDone(turnKey);
    this.#appendAndBroadcast("timeout", { index, mark });
    this.onState?.(cloneState(this.state));
    return { ok: true };
  }

  /** Host: first board of a room gets blocked cells via restart event. */
  #ensureBoardSetup() {
    if (this.hotseat) return;
    if (this.session.role !== "host") return;
    const events = this.log.events || [];
    if (events.some((e) => e.type === "restart")) return;
    if (events.some((e) => e.type === "move" || e.type === "timeout")) return;
    const committed = this.hostCommit.commit(this.log, "restart", {
      blocked: pickBlocked(),
    });
    if (committed.ok) this.log = committed.log;
  }

  stop() {
    this.localMark = null;
    this.hotseat = false;
    this._pendingIntentId = null;
  }

  #replay() {
    this.state = replayTtt(this.log);
  }

  #persist() {
    if (this.session.transport === "bridge") return;
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
    const committed = this.hostCommit.commit(this.log, type, payload);
    if (!committed.ok) return;
    this.log = committed.log;
    this.#replay();
    this.#persist();
    if (this.hotseat) return;
    const packet = this.hostCommit.encodeSince(this.log, 0);
    const n = this.session.broadcast(GameMsg.LOG, packet);
    if (!n) this.session.send(GameMsg.LOG, packet);
  }

  /**
   * @param {string} [peerId]
   * @param {'X'|'O'|null} [youAre]
   */
  #sendLogWelcome(peerId, youAre = null) {
    const tip = tipSeq(this.log);
    this.session.sendWelcome(
      {
        youAre,
        log: encodeSyncPacket(this.log, 0),
        checkpoint: {
          tipSeq: tip,
          tipEventId: tipEventId(this.log),
          state: cloneState(this.state),
        },
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
    const committed = this.hostCommit.commit(this.log, "seat", {
      mark,
      playerId: id,
      name: nm,
    });
    if (committed.ok) this.log = committed.log;
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
   * Guest: adopt host LOG packet only.
   * @param {unknown} raw
   */
  #adoptHostLog(raw) {
    const packet = parseSyncPacket(raw);
    if (!packet) return false;
    const adopted = adoptHostPacket(this.log, packet);
    if (!adopted.ok) {
      this.session.send(GameMsg.RESYNC, {
        haveTipSeq: tipSeq(this.log),
        haveTipEventId: tipEventId(this.log),
      });
      return false;
    }
    this.log = adopted.log;
    this.#replay();
    this.#persist();
    this.onState?.(cloneState(this.state));
    return true;
  }

  /**
   * @param {{ type: string, payload: unknown, fromPeerId?: string|null }} msg
   */
  #handleMessage(msg) {
    if (this.hotseat) return;

    switch (msg.type) {
      case TransportType.HELLO:
        if (this.session.role === "host") {
          const payload = /** @type {{ playerId?: string, name?: string }} */ (
            msg.payload || {}
          );
          // Do not adopt guest log — host is sole writer.
          this.playerName = playerLabel();
          this.localMark = this.#claimSeat(this.playerId, this.playerName);
          const guestId = String(payload.playerId || "");
          const guestMark = this.#claimSeat(guestId, String(payload.name || ""), {
            otherThan: this.localMark,
          });
          if (msg.fromPeerId && guestId) {
            this.hostCommit.bindPeer(msg.fromPeerId, guestId);
          }
          this.#persist();
          this.onReady?.(this.localMark);
          this.#sendLogWelcome(msg.fromPeerId || undefined, guestMark);
        }
        break;

      case TransportType.WELCOME: {
        if (this.session.role === "host") break;
        const payload = /** @type {{
          youAre?: string,
          log?: unknown,
          checkpoint?: { tipSeq?: number, tipEventId?: string|null, state?: unknown },
        }} */ (msg.payload || {});
        if (payload.log) {
          const packet = parseSyncPacket(payload.log);
          if (packet) {
            const replaced = replaceFromHostPacket(GAME_ID, packet);
            if (replaced.ok) {
              this.log = replaced.log;
              this.#replay();
              this.#persist();
            }
          }
        }
        const cp = payload.checkpoint;
        if (
          cp &&
          cp.tipSeq === tipSeq(this.log) &&
          cp.tipEventId === tipEventId(this.log) &&
          cp.state &&
          typeof cp.state === "object"
        ) {
          // Tip-proven checkpoint: optional UI fast-path; state still equals replay.
          this.state = cloneState(
            /** @type {ReturnType<typeof createInitialState>} */ (cp.state),
          );
        }
        this.onState?.(cloneState(this.state));
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

      case GameMsg.LOG: {
        if (this.session.role === "host") break;
        this.#adoptHostLog(msg.payload);
        this.onReady?.(this.localMark);
        break;
      }

      case GameMsg.STATE:
      case GameMsg.CHECKPOINT:
        // Unproven state is not canon — ignore (checkpoint only via welcome tip-check).
        break;

      case GameMsg.RESYNC: {
        if (this.session.role !== "host") break;
        const peerId = msg.fromPeerId || undefined;
        this.#sendLogWelcome(peerId, null);
        break;
      }

      case GameMsg.ACK: {
        if (this.session.role === "host") break;
        const payload = /** @type {{ intentId?: string }} */ (msg.payload || {});
        if (payload.intentId && payload.intentId === this._pendingIntentId) {
          this._pendingIntentId = null;
        }
        break;
      }

      case GameMsg.REJECT: {
        if (this.session.role === "host") break;
        const payload = /** @type {{ intentId?: string, reason?: string }} */ (
          msg.payload || {}
        );
        if (payload.intentId && payload.intentId === this._pendingIntentId) {
          this._pendingIntentId = null;
        }
        this.onReject?.(String(payload.reason || "Zet geweigerd"));
        break;
      }

      case GameMsg.INTENT: {
        if (this.session.role !== "host") break;
        const payload = /** @type {{
          intentId?: string,
          kind?: string,
          index?: number,
          mark?: string,
          actorPlayerId?: string,
        }} */ (msg.payload || {});
        const from = msg.fromPeerId || "";
        const intentId = payload.intentId;
        const actorPlayerId = String(payload.actorPlayerId || "");

        if (payload.kind === "restart") {
          const bound = this.hostCommit.acceptBoundIntent({
            log: this.log,
            fromPeerId: from,
            intentId,
            actorPlayerId,
            apply: (log) => {
              this.hostCommit.clearTurnKeys();
              return this.hostCommit.commit(log, "restart", {
                blocked: pickBlocked(),
              });
            },
          });
          if (!bound.ok) {
            this.session.sendTo(from, GameMsg.REJECT, {
              intentId,
              reason: bound.reason,
            });
            break;
          }
          this.log = bound.log;
          this.#replay();
          this.#persist();
          this.session.sendTo(from, GameMsg.ACK, {
            intentId,
            tipSeq: bound.tipSeq,
            tipEventId: bound.tipEventId,
          });
          this.session.broadcast(
            GameMsg.LOG,
            this.hostCommit.encodeSince(this.log, 0),
          );
          this.onState?.(cloneState(this.state));
          break;
        }

        if (payload.kind !== "move") break;
        const mark =
          payload.mark === "X" || payload.mark === "O" ? payload.mark : null;
        if (!mark || typeof payload.index !== "number") {
          this.session.sendTo(from, GameMsg.REJECT, {
            intentId,
            reason: "ongeldig",
          });
          break;
        }

        const bound = this.hostCommit.acceptBoundIntent({
          log: this.log,
          fromPeerId: from,
          intentId,
          actorPlayerId,
          apply: (log) => {
            const state = replayTtt(log);
            const seats = seatsFromLog(log);
            if (seats[mark]?.playerId && seats[mark].playerId !== actorPlayerId) {
              return { ok: false, reason: "mark" };
            }
            const moved = applyMove(state, payload.index, mark);
            if (!moved.ok) return { ok: false, reason: moved.reason };
            return this.hostCommit.commit(log, "move", {
              index: payload.index,
              mark,
            });
          },
        });
        if (!bound.ok) {
          this.session.sendTo(from, GameMsg.REJECT, {
            intentId,
            reason: bound.reason,
          });
          this.session.sendTo(
            from,
            GameMsg.LOG,
            this.hostCommit.encodeSince(this.log, 0),
          );
          break;
        }
        this.log = bound.log;
        this.#replay();
        this.#persist();
        this.session.sendTo(from, GameMsg.ACK, {
          intentId,
          tipSeq: bound.tipSeq,
          tipEventId: bound.tipEventId,
        });
        this.session.broadcast(
          GameMsg.LOG,
          this.hostCommit.encodeSince(this.log, 0),
        );
        this.onState?.(cloneState(this.state));
        break;
      }

      // Legacy MOVE/TIMEOUT/RESTART from older clients — map if bound, else ignore.
      case GameMsg.MOVE: {
        if (this.session.role !== "host") break;
        const payload = /** @type {{ index?: number, mark?: string }} */ (
          msg.payload || {}
        );
        const mark =
          payload.mark === "X" || payload.mark === "O" ? payload.mark : null;
        if (!mark || typeof payload.index !== "number") break;
        const seats = seatsFromLog(this.log);
        const actorPlayerId = seats[mark]?.playerId || "";
        const from = msg.fromPeerId || "";
        if (!this.hostCommit.playerForPeer(from)) break;
        this.#handleMessage({
          type: GameMsg.INTENT,
          fromPeerId: from,
          payload: {
            intentId: `legacy_${Date.now()}`,
            kind: "move",
            index: payload.index,
            mark,
            actorPlayerId,
          },
        });
        break;
      }

      case GameMsg.RESTART:
        if (this.session.role === "host") {
          this.hostCommit.clearTurnKeys();
          this.#appendAndBroadcast("restart", { blocked: pickBlocked() });
          this.onState?.(cloneState(this.state));
        }
        break;

      case GameMsg.TIMEOUT:
        // Guests no longer drive timeout; host clock only.
        break;

      default:
        break;
    }
  }
}
