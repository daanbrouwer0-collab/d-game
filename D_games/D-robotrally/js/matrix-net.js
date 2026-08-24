/**
 * D-RobotRally Matrix protocol — thin layer over MatrixClient.
 */
(function () {
  const EVENT_TYPE = CONFIG.MATRIX?.EVENT_TYPE || 'com.d5games.robotrally';
  const ROOM_KIND = CONFIG.MATRIX?.ROOM_KIND || 'com.d5games.robotrally.lobby';

  function loadSession() {
    return MatrixClient?.loadSession?.() || MatrixAuth?.loadSession?.() || null;
  }

  function shortId(userId) {
    return MatrixClient?.shortId?.(userId) || '—';
  }

  function api(session, path, opts) {
    return MatrixClient.api(session, path, opts);
  }

  function txnId(prefix = 'rr') {
    return MatrixClient?.makeTxnId?.(prefix)
      || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function makeSeat(userId, index, profile = {}) {
    const colors = StorageManager.makeColors(
      profile.color || StorageManager.getPlayerColor(profile) || CONFIG.DEFAULT_PLAYERS[index]?.colors?.head
    );
    return {
      userId,
      robotId: profile.robotId || `player_${index + 1}`,
      name: (profile.name || shortId(userId) || `Speler ${index + 1}`).slice(0, 24),
      color: colors.head,
      colors,
      style: profile.style || CONFIG.DEFAULT_PLAYERS[index]?.style || 'scout',
      ready: !!profile.ready
    };
  }

  async function putLobbyState(session, roomId, content) {
    return MatrixClient.putState(session, roomId, EVENT_TYPE, content);
  }

  async function getLobbyState(session, roomId) {
    return MatrixClient.getState(session, roomId, EVENT_TYPE);
  }

  async function sendEvent(session, roomId, content) {
    return MatrixClient.sendEvent(session, roomId, EVENT_TYPE, content);
  }

  async function createLobbyRoom(session, settings) {
    const me = session.userId;
    const hubChar = StorageManager.loadCharacter();
    const seat = makeSeat(me, 0, {
      name: hubChar.name,
      colors: hubChar.colors,
      style: hubChar.style,
      ready: false
    });

    const lobby = {
      v: 1,
      kind: ROOM_KIND,
      hostId: me,
      status: 'lobby',
      settings: {
        name: settings.name || 'Matrix Rally',
        difficulty: settings.difficulty || 'normal',
        checkpointsCount: settings.checkpointsCount || CONFIG.DEFAULT_CHECKPOINTS,
        startingLives: settings.startingLives || CONFIG.DEFAULT_STARTING_LIVES,
        seed: settings.seed || (Date.now() >>> 0)
      },
      seats: [seat],
      boardData: null,
      gameState: null,
      updatedAt: Date.now()
    };

    const created = await api(session, '/_matrix/client/v3/createRoom', {
      method: 'POST',
      body: {
        name: `D-RobotRally · ${lobby.settings.name}`,
        topic: 'D-RobotRally Matrix lobby — deelbaar via link',
        preset: 'public_chat',
        visibility: 'private',
        power_level_content_override: {
          users: { [me]: 100 },
          events: {
            [EVENT_TYPE]: 0,
            'm.room.message': 0
          },
          events_default: 0,
          state_default: 50
        },
        initial_state: [
          {
            type: 'm.room.join_rules',
            state_key: '',
            content: { join_rule: 'public' }
          },
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: { history_visibility: 'shared' }
          },
          {
            type: EVENT_TYPE,
            state_key: '',
            content: lobby
          }
        ]
      }
    });

    return { roomId: created.room_id, lobby };
  }

  async function inviteUser(session, roomId, userId) {
    return MatrixClient.inviteUser(session, roomId, userId);
  }

  async function joinRoom(session, roomId) {
    return MatrixClient.joinRoom(session, roomId);
  }

  async function syncOnce(session, since, timeout = 0) {
    return MatrixClient.sync(session, {
      since: since || undefined,
      timeout,
      setPresence: 'offline',
      persistSince: false
    });
  }

  function isRallyLobby(content) {
    return !!(content && (content.kind === ROOM_KIND || content.seats));
  }

  function parseMatrixId(input) {
    return MatrixAuth?.parseMatrixId?.(input)
      || (() => { throw new Error('MatrixAuth ontbreekt'); })();
  }

  window.RobotRallyMatrix = {
    EVENT_TYPE,
    ROOM_KIND,
    loadSession,
    parseMatrixId,
    api,
    shortId,
    makeSeat,
    putLobbyState,
    getLobbyState,
    sendEvent,
    createLobbyRoom,
    inviteUser,
    joinRoom,
    syncOnce,
    isRallyLobby,
    txnId
  };
})();
