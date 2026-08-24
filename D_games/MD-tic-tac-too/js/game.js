/**
 * MD-Tic-Tac-Too speelbord. Room aanmaken/beheer gebeurt in ../multi.html
 */
(function () {
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  const ACTIVE_ROOM_KEY = 'd-games-ttt-matrix-active';
  const SYNC_TIMEOUT_MS = 30000;

  const el = {
    status: document.getElementById('status-line'),
    auth: document.getElementById('screen-auth'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    youAre: document.getElementById('you-are'),
    board: document.getElementById('board'),
    turnLine: document.getElementById('turn-line'),
    playerX: document.getElementById('player-x'),
    playerO: document.getElementById('player-o'),
    btnRematch: document.getElementById('btn-rematch')
  };

  let session = null;
  let syncToken = null;
  let syncTimer = null;
  let syncController = null;
  let syncLoopOn = false;
  let activeRoomId = null;
  let gameModel = null;
  let eventsByRoom = new Map();
  let busy = false;

  function setStatus(text) {
    if (el.status) el.status.textContent = text;
  }

  function showScreen(name) {
    el.auth?.classList.toggle('hidden', name !== 'auth');
    el.lobby?.classList.toggle('hidden', name !== 'lobby');
    el.game?.classList.toggle('hidden', name !== 'game');
  }

  function persistActiveRoom(roomId) {
    if (!session || !roomId) return;
    try {
      localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({
        roomId,
        userId: session.userId,
        savedAt: Date.now()
      }));
    } catch { /* ignore */ }
  }

  function clearActiveRoom() {
    try { localStorage.removeItem(ACTIVE_ROOM_KEY); } catch { /* ignore */ }
  }

  function loadActiveRoom() {
    try {
      const raw = localStorage.getItem(ACTIVE_ROOM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function emptyBoard() {
    return Array(9).fill(null);
  }

  function buildModel(players, events) {
    const board = emptyBoard();
    let winner = null;
    let winLine = null;
    let status = 'waiting';
    let moves = 0;
    let pl = players || {};

    for (const ev of events) {
      const c = ev.content || {};
      if (c.op === 'start' && c.players) {
        pl = c.players;
        status = 'playing';
      }
      if (c.op === 'claim_seat' && c.players) {
        pl = c.players;
        status = 'playing';
      }
      if (c.op === 'rematch') {
        for (let i = 0; i < 9; i++) board[i] = null;
        winner = null;
        winLine = null;
        moves = 0;
        status = 'playing';
      }
      if (c.op === 'move' && Number.isInteger(c.cell) && c.cell >= 0 && c.cell <= 8) {
        if (board[c.cell] || winner) continue;
        const mark = ev.sender === pl.X ? 'X' : ev.sender === pl.O ? 'O' : null;
        if (!mark) continue;
        const expected = moves % 2 === 0 ? 'X' : 'O';
        if (mark !== expected) continue;
        board[c.cell] = mark;
        moves += 1;
        status = 'playing';
        for (const line of WIN_LINES) {
          const [a, b, cIdx] = line;
          if (board[a] && board[a] === board[b] && board[a] === board[cIdx]) {
            winner = board[a];
            winLine = line;
            status = 'finished';
            break;
          }
        }
        if (!winner && moves >= 9) {
          winner = 'draw';
          status = 'finished';
        }
      }
    }

    return {
      players: pl,
      board,
      turn: moves % 2 === 0 ? 'X' : 'O',
      winner,
      winLine,
      status,
      moves
    };
  }

  function mergeRoomEvents(roomId, events, limited) {
    const incoming = (events || []).filter((ev) => ev?.type === TttMatrix.EVENT_TYPE);
    if (limited) {
      eventsByRoom.set(roomId, incoming.slice());
      return;
    }
    const prev = eventsByRoom.get(roomId) || [];
    const seen = new Set(prev.map((ev) => ev.event_id).filter(Boolean));
    const merged = prev.slice();
    for (const ev of incoming) {
      if (ev.event_id && seen.has(ev.event_id)) continue;
      if (ev.event_id) seen.add(ev.event_id);
      merged.push(ev);
    }
    if (merged.length > 200) merged.splice(0, merged.length - 200);
    eventsByRoom.set(roomId, merged);
  }

  async function refreshRoomModel(roomId) {
    let events = eventsByRoom.get(roomId);
    if (!events?.length) {
      events = await TttMatrix.getGameEvents(session, roomId);
      eventsByRoom.set(roomId, events);
    }
    let state = await TttMatrix.getRoomState(session, roomId);
    const players = state?.players || { X: null, O: null };
    return buildModel(players, events);
  }

  function myMark(model) {
    if (!model || !session) return null;
    if (model.players?.X === session.userId) return 'X';
    if (model.players?.O === session.userId) return 'O';
    return null;
  }

  function renderBoard() {
    if (!el.board || !gameModel) return;
    const mark = myMark(gameModel);
    const canPlay = !busy
      && gameModel.status === 'playing'
      && mark
      && gameModel.turn === mark
      && !gameModel.winner;

    el.board.innerHTML = gameModel.board.map((cell, i) => {
      const win = gameModel.winLine?.includes(i) ? ' win' : '';
      const filled = cell ? ` ${cell.toLowerCase()}` : '';
      return `<button type="button" class="cell${filled}${win}" data-i="${i}" ${canPlay && !cell ? '' : 'disabled'}>${cell || ''}</button>`;
    }).join('');

    el.board.querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => onCellClick(Number(btn.getAttribute('data-i'))));
    });

    if (el.playerX) el.playerX.textContent = TttMatrix.shortId(gameModel.players?.X) || '—';
    if (el.playerO) el.playerO.textContent = TttMatrix.shortId(gameModel.players?.O) || 'wacht…';

    if (el.turnLine) {
      if (gameModel.winner === 'draw') el.turnLine.textContent = 'Gelijkspel';
      else if (gameModel.winner) el.turnLine.textContent = `${gameModel.winner} wint!`;
      else if (!gameModel.players?.O) el.turnLine.textContent = 'Wacht op tegenstander…';
      else if (mark && gameModel.turn === mark) el.turnLine.textContent = 'Jij bent aan zet';
      else el.turnLine.textContent = 'Wacht op tegenstander';
    }

    el.btnRematch?.classList.toggle('hidden', !(gameModel.winner && mark));
  }

  async function enterRoom(roomId, { fromLink = false } = {}) {
    if (!session || busy) return;
    busy = true;
    try {
      await TttMatrix.joinRoom(session, roomId);
      let state = await TttMatrix.getRoomState(session, roomId);
      if (state?.openLobby && !state.players?.O && state.players?.X !== session.userId) {
        state = await TttMatrix.claimOpenSeat(session, roomId);
      }

      activeRoomId = roomId;
      persistActiveRoom(roomId);
      const hist = await TttMatrix.getGameEvents(session, roomId);
      eventsByRoom.set(roomId, hist);
      gameModel = buildModel(state?.players || { X: null, O: null }, hist);
      if (gameModel.players?.X && gameModel.players?.O && gameModel.status === 'waiting') {
        gameModel = { ...gameModel, status: 'playing' };
      }

      showScreen('game');
      setStatus(fromLink ? 'Gejoined via uitnodiging' : 'Live via Matrix');
      renderBoard();
      startSync();
    } catch (err) {
      setStatus(err.message || 'Kon game niet openen.');
      throw err;
    } finally {
      busy = false;
      renderBoard();
    }
  }

  async function onCellClick(index) {
    if (!session || !activeRoomId || !gameModel || busy) return;
    const mark = myMark(gameModel);
    if (!mark || gameModel.turn !== mark || gameModel.board[index] || gameModel.winner) return;

    busy = true;
    renderBoard();
    try {
      await TttMatrix.sendGameEvent(session, activeRoomId, { op: 'move', cell: index });
      mergeRoomEvents(activeRoomId, [{
        type: TttMatrix.EVENT_TYPE,
        sender: session.userId,
        event_id: `local_${Date.now()}`,
        content: { op: 'move', cell: index }
      }], false);
      gameModel = buildModel(gameModel.players, eventsByRoom.get(activeRoomId) || []);
      renderBoard();
    } catch (err) {
      setStatus(err.message || 'Zet mislukt.');
    } finally {
      busy = false;
      renderBoard();
    }
  }

  async function rematch() {
    if (!session || !activeRoomId || busy) return;
    busy = true;
    try {
      await TttMatrix.sendGameEvent(session, activeRoomId, { op: 'rematch' });
      mergeRoomEvents(activeRoomId, [{
        type: TttMatrix.EVENT_TYPE,
        sender: session.userId,
        event_id: `local_rm_${Date.now()}`,
        content: { op: 'rematch' }
      }], false);
      gameModel = buildModel(gameModel.players, eventsByRoom.get(activeRoomId) || []);
      renderBoard();
      setStatus('Opnieuw');
    } catch (err) {
      setStatus(err.message || 'Opnieuw mislukt');
    } finally {
      busy = false;
    }
  }

  async function poll() {
    if (!session || !activeRoomId || !syncLoopOn) return;
    const controller = new AbortController();
    syncController = controller;
    try {
      const data = await TttMatrix.syncOnce(session, syncToken, SYNC_TIMEOUT_MS, controller.signal);
      if (!syncLoopOn) return;
      syncToken = data.next_batch || syncToken;
      const join = data.rooms?.join?.[activeRoomId];
      if (join) {
        const limited = !!join.timeline?.limited;
        mergeRoomEvents(activeRoomId, join.timeline?.events || [], limited);
        const stateEv = [...(join.state?.events || []), ...(join.timeline?.events || [])]
          .reverse()
          .find((ev) => ev.type === TttMatrix.EVENT_TYPE
            && (ev.state_key === '' || ev.state_key == null)
            && ev.content?.players);
        const players = stateEv?.content?.players || gameModel?.players;
        gameModel = buildModel(players, eventsByRoom.get(activeRoomId) || []);
        renderBoard();
      }
    } catch (err) {
      if (!syncLoopOn) return;
      if (err?.name === 'AbortError') {
        syncTimer = setTimeout(poll, 0);
        return;
      }
      if (err?.status === 401 || err?.errcode === 'M_UNKNOWN_TOKEN') {
        const refreshed = typeof MatrixAuth?.refreshAccessToken === 'function'
          ? await MatrixAuth.refreshAccessToken(session)
          : null;
        if (refreshed) {
          session = refreshed;
          syncTimer = setTimeout(poll, 0);
          return;
        }
        stopSync();
        clearActiveRoom();
        showScreen('auth');
        setStatus('Sessie verlopen — log opnieuw in via de lobby.');
        return;
      }
      syncTimer = setTimeout(poll, 4000);
      return;
    }
    syncTimer = setTimeout(poll, 0);
  }

  function stopSync() {
    syncLoopOn = false;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    try { syncController?.abort(); } catch { /* ignore */ }
    syncController = null;
  }

  function startSync() {
    if (syncLoopOn) return;
    syncLoopOn = true;
    poll();
  }

  async function handleIncomingInviteLink() {
    if (typeof InviteShare === 'undefined' || !session) return;
    const invite = InviteShare.parseInviteFromLocation() || InviteShare.loadPendingInvite();
    if (!invite?.roomId) return;
    if (invite.game && invite.game !== 'tic-tac-too') return;
    InviteShare.savePendingInvite({ ...invite, game: 'tic-tac-too' });
    try {
      await enterRoom(invite.roomId, { fromLink: true });
      InviteShare.clearPendingInvite();
      const url = new URL(window.location.href);
      ['join', 'matrixRoom', 'game', 'min', 'room'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch (err) {
      setStatus(err.message || 'Joinen via link mislukt');
    }
  }

  async function tryResumeActiveRoom() {
    const saved = loadActiveRoom();
    if (!saved?.roomId || !session) return;
    if (saved.userId && saved.userId !== session.userId) {
      clearActiveRoom();
      return;
    }
    try {
      await enterRoom(saved.roomId);
    } catch {
      clearActiveRoom();
    }
  }

  async function init() {
    session = TttMatrix.loadSession();
    if (!session) {
      showScreen('auth');
      setStatus('Log in via de Multi Device-lobby.');
      return;
    }
    if (typeof MatrixAuth?.ensureFreshSession === 'function') {
      session = (await MatrixAuth.ensureFreshSession(session)) || session;
    }

    if (el.youAre) {
      el.youAre.textContent = `Ingelogd als ${session.displayName || TttMatrix.shortId(session.userId)}`;
    }
    showScreen('lobby');
    setStatus('Open een room via de Multi Device-lobby');

    el.btnRematch?.addEventListener('click', rematch);

    await handleIncomingInviteLink();
    if (!activeRoomId) await tryResumeActiveRoom();
  }

  init();
})();
