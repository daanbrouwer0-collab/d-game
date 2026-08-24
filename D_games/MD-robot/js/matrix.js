/**
 * MD-robot protocol — thin layer over MatrixClient (create happens in hub).
 */
(function () {
  const EVENT_TYPE = 'com.d5games.mdrobot';
  const ROOM_KIND = 'com.d5games.mdrobot.game';

  function loadSession() {
    return MatrixClient?.loadSession?.() || MatrixAuth?.loadSession?.() || null;
  }

  function shortId(userId) {
    return MatrixClient?.shortId?.(userId) || '—';
  }

  function api(session, path, opts) {
    return MatrixClient.api(session, path, opts);
  }

  function isMdRobot(state) {
    return !!(
      state
      && (state.kind === ROOM_KIND || Array.isArray(state.robots))
      && (state.v === 1 || state.v === 2 || state.robots)
    );
  }

  async function putState(session, roomId, state) {
    return MatrixClient.putState(session, roomId, EVENT_TYPE, state);
  }

  async function getState(session, roomId) {
    return MatrixClient.getState(session, roomId, EVENT_TYPE);
  }

  async function sendEvent(session, roomId, content) {
    return MatrixClient.sendEvent(session, roomId, EVENT_TYPE, content);
  }

  async function joinRoom(session, roomId) {
    return MatrixClient.joinRoom(session, roomId);
  }

  /** Room-scoped sync — do not advance hub persisted since. */
  async function syncOnce(session, since, timeout = 0, signal) {
    return MatrixClient.sync(session, {
      since: since || undefined,
      timeout,
      signal,
      setPresence: 'offline',
      persistSince: false
    });
  }

  /** Full state for host; redacted hands for others until executing. */
  function viewState(state, viewerId, isHost) {
    if (!state || typeof MdRobotEngine?.sanitizeStateForViewer !== 'function') return state;
    if (isHost) return state;
    return MdRobotEngine.sanitizeStateForViewer(state, viewerId);
  }

  window.MdRobotMatrix = {
    EVENT_TYPE,
    ROOM_KIND,
    loadSession,
    api,
    putState,
    getState,
    sendEvent,
    joinRoom,
    syncOnce,
    shortId,
    isMdRobot,
    viewState
  };
})();
