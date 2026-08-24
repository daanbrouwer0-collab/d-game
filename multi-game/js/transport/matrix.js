/**
 * Matrix transport stub — same surface as local/p2p for a future adapter.
 * Real Matrix (accounts, rooms that outlive a host tab) is intentionally
 * out of scope for the static P2P-first frame. Ideas live in D_games/matrix-*.js.
 *
 * Do not import this from games until implemented; createRoom will throw.
 */

const NOT_IMPLEMENTED =
  "Matrix-transport is nog niet geïmplementeerd. Gebruik local of p2p.";

/**
 * @param {{ gameId: string, maxGuests?: number }} options
 */
export class MatrixTransport {
  /**
   * @param {{ gameId: string, maxGuests?: number }} options
   */
  constructor({ gameId, maxGuests = 1 }) {
    if (!gameId) throw new Error("gameId is verplicht");
    this.transport = "matrix";
    this.gameId = gameId;
    this.maxGuests = maxGuests;
    this.maxPlayers = maxGuests + 1;
    this.role = null;
    this.roomCode = null;
    this.status = "idle";

    this.onStatus = null;
    this.onMessage = null;
    this.onError = null;
    this.onGameMismatch = null;
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onRoomFull = null;

    throw new Error(NOT_IMPLEMENTED);
  }

  guestCount() {
    throw new Error(NOT_IMPLEMENTED);
  }

  isConnected() {
    throw new Error(NOT_IMPLEMENTED);
  }

  host() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  hostWithCode() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  join() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  reconnect() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  destroy() {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }

  send() {
    throw new Error(NOT_IMPLEMENTED);
  }

  sendTo() {
    throw new Error(NOT_IMPLEMENTED);
  }

  broadcast() {
    throw new Error(NOT_IMPLEMENTED);
  }

  sendHello() {
    throw new Error(NOT_IMPLEMENTED);
  }

  sendWelcome() {
    throw new Error(NOT_IMPLEMENTED);
  }

  buildShareUrl() {
    throw new Error(NOT_IMPLEMENTED);
  }

  readRoomFromUrl() {
    throw new Error(NOT_IMPLEMENTED);
  }

  writeRoomToUrl() {
    throw new Error(NOT_IMPLEMENTED);
  }

  clearRoomFromUrl() {
    throw new Error(NOT_IMPLEMENTED);
  }
}

export { NOT_IMPLEMENTED as MATRIX_NOT_IMPLEMENTED };
