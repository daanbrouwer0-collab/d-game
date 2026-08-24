/**
 * Room-create helpers for Multi Device hub.
 * Loaded after MatrixClient + MdRobotEngine; used by md-lobby.js
 */
(function () {
  const EVENT_ROBOT = 'com.d5games.mdrobot';
  const EVENT_TTT = 'com.d5games.tictactoe';
  const EVENT_RALLY = 'com.d5games.robotrally';

  function api(session, path, opts) {
    return MatrixClient.api(session, path, opts);
  }

  async function sendEvent(session, roomId, eventType, content) {
    return MatrixClient.sendEvent(session, roomId, eventType, content);
  }

  function hubName(session) {
    return MatrixClient.hubCharacterName(MatrixClient.shortId(session?.userId));
  }

  async function createRobotRoom(session, playerCount, opts = {}) {
    let content = MdRobotEngine.createLobbyState(session.userId, hubName(session), playerCount);
    if (opts.boardId) {
      content = MdRobotEngine.updateSettings(content, { boardId: opts.boardId });
    }
    const cap = content.maxPlayers;
    const boardLabel = content.settings?.boardId || 'easy';
    const created = await api(session, '/_matrix/client/v3/createRoom', {
      method: 'POST',
      body: {
        name: `MD-robot (${cap}p · ${boardLabel})`,
        topic: `MD-robot lobby · bord ${boardLabel}`,
        preset: 'public_chat',
        visibility: 'private',
        power_level_content_override: {
          users: { [session.userId]: 100 },
          events: { [EVENT_ROBOT]: 0, 'm.room.message': 0 },
          events_default: 0,
          state_default: 50
        },
        initial_state: [
          { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'public' } },
          { type: EVENT_ROBOT, state_key: '', content }
        ]
      }
    });
    await sendEvent(session, created.room_id, EVENT_ROBOT, { op: 'lobby_open', hostId: session.userId });
    return { roomId: created.room_id, game: 'md-robot', state: content };
  }

  async function createTttRoom(session) {
    const content = {
      v: 1,
      kind: 'com.d5games.tictactoe.game',
      players: { X: session.userId, O: null },
      status: 'waiting',
      openLobby: true,
      hostId: session.userId,
      updatedAt: Date.now()
    };
    const created = await api(session, '/_matrix/client/v3/createRoom', {
      method: 'POST',
      body: {
        name: 'MD-Tic-Tac-Too',
        topic: 'MD-Tic-Tac-Too open lobby',
        preset: 'public_chat',
        visibility: 'private',
        power_level_content_override: {
          users: { [session.userId]: 100 },
          events: { [EVENT_TTT]: 0, 'm.room.message': 0 },
          events_default: 0,
          state_default: 50
        },
        initial_state: [
          { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'public' } },
          { type: EVENT_TTT, state_key: '', content }
        ]
      }
    });
    await sendEvent(session, created.room_id, EVENT_TTT, { op: 'lobby_open', hostId: session.userId });
    return { roomId: created.room_id, game: 'tic-tac-too', state: content };
  }

  async function createRallyRoom(session) {
    const me = session.userId;
    const name = hubName(session);
    const content = {
      v: 1,
      kind: 'com.d5games.robotrally.lobby',
      hostId: me,
      status: 'lobby',
      settings: {
        name: 'Matrix Rally',
        difficulty: 'normal',
        checkpointsCount: 3,
        startingLives: 3,
        seed: Date.now() >>> 0
      },
      seats: [{
        userId: me,
        robotId: 'player_1',
        name,
        color: '#39f3ff',
        colors: { head: '#39f3ff', body: '#39f3ff', legs: '#39f3ff' },
        style: 'scout',
        ready: false
      }],
      boardData: null,
      gameState: null,
      updatedAt: Date.now()
    };
    const created = await api(session, '/_matrix/client/v3/createRoom', {
      method: 'POST',
      body: {
        name: 'D-RobotRally · Matrix Rally',
        topic: 'D-RobotRally Matrix lobby',
        preset: 'public_chat',
        visibility: 'private',
        power_level_content_override: {
          users: { [me]: 100 },
          events: { [EVENT_RALLY]: 0, 'm.room.message': 0 },
          events_default: 0,
          state_default: 50
        },
        initial_state: [
          { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'public' } },
          { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
          { type: EVENT_RALLY, state_key: '', content }
        ]
      }
    });
    return { roomId: created.room_id, game: 'robotrally', state: content };
  }

  async function createForGame(session, game, playerCount = 2, opts = {}) {
    if (game === 'tic-tac-too') return createTttRoom(session);
    if (game === 'robotrally') return createRallyRoom(session);
    return createRobotRoom(session, playerCount, opts);
  }

  window.MdCreate = {
    EVENT_ROBOT,
    EVENT_TTT,
    EVENT_RALLY,
    createRobotRoom,
    createTttRoom,
    createRallyRoom,
    createForGame
  };
})();
