/**
 * MD-Tic-Tac-Too protocol — thin layer over MatrixClient (create happens in hub).
 */
(function () {
  const EVENT_TYPE = 'com.d5games.tictactoe';
  const ROOM_TYPE = 'com.d5games.tictactoe.game';

  function loadSession() {
    return MatrixClient?.loadSession?.() || MatrixAuth?.loadSession?.() || null;
  }

  function shortId(userId) {
    return MatrixClient?.shortId?.(userId) || '—';
  }

  function api(session, path, opts) {
    return MatrixClient.api(session, path, opts);
  }

  async function joinRoom(session, roomId) {
    return MatrixClient.joinRoom(session, roomId);
  }

  async function sendGameEvent(session, roomId, content) {
    return MatrixClient.sendEvent(session, roomId, EVENT_TYPE, content);
  }

  async function getRoomState(session, roomId) {
    return MatrixClient.getState(session, roomId, EVENT_TYPE);
  }

  async function getGameEvents(session, roomId) {
    const data = await MatrixClient.getMessages(session, roomId, { limit: 200, dir: 'b' });
    const chunk = Array.isArray(data?.chunk) ? data.chunk.slice() : [];
    chunk.reverse();
    return chunk.filter((ev) => ev?.type === EVENT_TYPE);
  }

  async function claimOpenSeat(session, roomId) {
    const state = await getRoomState(session, roomId);
    if (!state) throw new Error('Lobby niet gevonden.');
    if (state.players?.O && state.players.O !== session.userId) {
      throw new Error('Deze lobby is al vol.');
    }
    if (state.players?.X === session.userId) return state;

    const players = { X: state.players?.X, O: session.userId };
    const next = {
      ...state,
      players,
      status: 'playing',
      openLobby: true,
      updatedAt: Date.now()
    };
    try {
      await MatrixClient.putState(session, roomId, EVENT_TYPE, next);
    } catch { /* guest may lack state power */ }
    await sendGameEvent(session, roomId, {
      op: 'claim_seat',
      players,
      userId: session.userId
    });
    await sendGameEvent(session, roomId, { op: 'start', players });
    return next;
  }

  async function syncOnce(session, since, timeout = 0, signal) {
    return MatrixClient.sync(session, {
      since: since || undefined,
      timeout,
      signal,
      setPresence: 'offline',
      persistSince: false
    });
  }

  window.TttMatrix = {
    EVENT_TYPE,
    ROOM_TYPE,
    loadSession,
    api,
    claimOpenSeat,
    joinRoom,
    sendGameEvent,
    getRoomState,
    getGameEvents,
    syncOnce,
    shortId
  };
})();
