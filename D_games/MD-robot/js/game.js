/**
 * MD-robot speelbord v2 — simultane registers via Matrix, host lost op.
 */
(function () {
  const el = {
    status: document.getElementById('status-line'),
    auth: document.getElementById('screen-auth'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    youAre: document.getElementById('you-are'),
    roleBadge: document.getElementById('role-badge'),
    rulesLine: document.getElementById('rules-line'),
    robotMeta: document.getElementById('robot-meta'),
    board: document.getElementById('board'),
    players: document.getElementById('players-line'),
    phase: document.getElementById('phase-line'),
    slots: document.getElementById('program-slots'),
    hand: document.getElementById('hand-cards'),
    btnClear: document.getElementById('btn-clear'),
    btnSent: document.getElementById('btn-sent'),
    btnStart: document.getElementById('btn-start'),
    btnAgain: document.getElementById('btn-again'),
    programPanel: document.getElementById('program-panel'),
    hostActions: document.getElementById('host-play-actions'),
    guestNote: document.getElementById('guest-note'),
    waitingShare: document.getElementById('waiting-share'),
    btnShareWhatsapp: document.getElementById('btn-share-whatsapp'),
    btnShareCopy: document.getElementById('btn-share-copy'),
    pendingJoins: document.getElementById('pending-joins'),
    chatLog: document.getElementById('game-chat-log'),
    chatInput: document.getElementById('game-chat-input'),
    chatSend: document.getElementById('game-chat-send')
  };

  let session = null;
  let syncToken = null;
  let syncTimer = null;
  let syncLoopOn = false;
  let syncController = null;
  let activeRoomId = null;
  let gameState = null;
  /** @type {(string|null)[]} local register card ids */
  let localRegs = [null, null, null, null, null];
  let busy = false;
  let executing = false;
  let lastSeenRound = 0;
  let pendingJoinMap = new Map();
  let chatEvents = [];
  const ACTIVE_KEY = 'd-games-mdrobot-active';
  const MIN_PLAYERS = MdRobotEngine.MIN_PLAYERS;
  const REG_COUNT = MdRobotEngine.REGISTER_COUNT;
  const STEP_MS = 700;

  function setStatus(text) {
    if (el.status) el.status.textContent = text;
  }

  function showScreen(name) {
    el.auth?.classList.toggle('hidden', name !== 'auth');
    el.lobby?.classList.toggle('hidden', name !== 'lobby');
    el.game?.classList.toggle('hidden', name !== 'game');
  }

  function hubName() {
    if (typeof MatrixClient?.hubCharacterName === 'function') {
      return MatrixClient.hubCharacterName(MdRobotMatrix.shortId(session?.userId));
    }
    return MdRobotMatrix.shortId(session?.userId);
  }

  function isHost() {
    return !!(gameState && session && gameState.hostId === session.userId);
  }

  function meRobot() {
    return (gameState?.robots || []).find((r) => r.userId === session?.userId) || null;
  }

  function hostName() {
    const host = (gameState?.robots || []).find((r) => r.userId === gameState?.hostId);
    return host?.name || MdRobotMatrix.shortId(gameState?.hostId);
  }

  function lobbyCap() {
    return MdRobotEngine.lobbyCap(gameState);
  }

  function persistRoom(roomId) {
    if (!session || !roomId) return;
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        roomId,
        userId: session.userId,
        savedAt: Date.now()
      }));
    } catch { /* ignore */ }
  }

  function clearPersisted() {
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function tileClass(cell) {
    if (!cell) return 'tile-floor';
    const t = cell.tile || 'floor';
    return `tile-${t}`;
  }

  function dirGlyph(dir) {
    return MdRobotEngine.DIR_ARROW[dir] || '';
  }

  function renderBoard() {
    if (!el.board || !gameState) return;
    if (typeof MdRobotEngine?.ensureBoard === 'function') {
      gameState = MdRobotEngine.ensureBoard(gameState);
    }
    const board = gameState.board;
    const size = board?.size || gameState.size || 12;
    const robots = gameState.robots || [];
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = board?.grid?.[y]?.[x];
        const robot = robots.find((r) => r.x === x && r.y === y);
        const walls = cell?.walls || {};
        const wallCls = [
          walls[0] ? 'w-n' : '',
          walls[1] ? 'w-e' : '',
          walls[2] ? 'w-s' : '',
          walls[3] ? 'w-w' : ''
        ].filter(Boolean).join(' ');
        let mark = '';
        if (cell?.tile === 'checkpoint') mark = `<span class="tile-mark">⚑${cell.num || ''}</span>`;
        else if (cell?.tile === 'conveyor' || cell?.tile === 'express') mark = `<span class="tile-mark">${dirGlyph(cell.dir)}</span>`;
        else if (cell?.tile === 'laser') mark = `<span class="tile-mark laser">${dirGlyph(cell.dir)}</span>`;
        else if (cell?.tile === 'gear_cw') mark = '<span class="tile-mark">↻</span>';
        else if (cell?.tile === 'gear_ccw') mark = '<span class="tile-mark">↺</span>';
        else if (cell?.tile === 'pit') mark = '<span class="tile-mark">●</span>';
        else if (cell?.tile === 'repair') mark = '<span class="tile-mark">+</span>';
        else if (cell?.tile === 'start') mark = '<span class="tile-mark">S</span>';

        let bot = '';
        if (robot) {
          const arrow = dirGlyph(robot.facing);
          const mine = robot.userId === session?.userId ? ' mine' : '';
          bot = `<span class="bot${mine}" style="--bot:${robot.color}" title="${robot.name}">${arrow}</span>`;
        }
        cells.push(`<div class="cell ${tileClass(cell)} ${wallCls}">${mark}${bot}</div>`);
      }
    }
    el.board.style.setProperty('--size', String(size));
    el.board.innerHTML = cells.join('');
  }

  function usedHandIds() {
    return new Set(localRegs.filter(Boolean));
  }

  function renderRegistersAndHand() {
    const robot = meRobot();
    const unlocked = robot ? MdRobotEngine.getUnlockedRegisterCount(robot) : REG_COUNT;
    const committed = !!gameState?.programs?.[session?.userId]?.sent;

    if (el.slots) {
      const slots = [];
      for (let i = 0; i < REG_COUNT; i++) {
        const locked = i >= unlocked;
        let card = null;
        if (locked) {
          card = robot?.lockedRegisters?.[i] || robot?.registers?.[i];
        } else if (committed) {
          card = gameState.programs?.[session.userId]?.registers?.[i];
        } else if (localRegs[i]) {
          card = (robot?.hand || []).find((c) => c.id === localRegs[i]);
        }
        const label = card ? MdRobotEngine.cardLabel(card) : (locked ? '🔒' : '·');
        const prio = card?.priority != null ? `<small>${card.priority}</small>` : '';
        slots.push(
          `<button type="button" class="slot${locked ? ' locked' : ''}${localRegs[i] ? ' filled' : ''}" data-reg="${i}" ${locked || committed ? 'disabled' : ''}>`
          + `<span>${label}</span>${prio}</button>`
        );
      }
      el.slots.innerHTML = slots.join('');
      el.slots.querySelectorAll('[data-reg]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-reg'));
          if (localRegs[i]) {
            localRegs[i] = null;
            renderRegistersAndHand();
            updateControls();
          }
        });
      });
    }

    if (el.hand) {
      const hand = robot?.hand || [];
      const used = usedHandIds();
      if (!hand.length && gameState?.status === 'programming') {
        el.hand.innerHTML = '<p class="hint">Geen kaarten (te veel damage?).</p>';
      } else {
        el.hand.innerHTML = hand.map((c) => {
          const taken = used.has(c.id) || committed;
          return `<button type="button" class="hand-card${taken ? ' used' : ''}" data-card="${c.id}" ${taken || committed ? 'disabled' : ''}>`
            + `<strong>${MdRobotEngine.cardLabel(c)}</strong><small>${c.priority}</small></button>`;
        }).join('');
        el.hand.querySelectorAll('[data-card]').forEach((btn) => {
          btn.addEventListener('click', () => addCardToNextSlot(btn.getAttribute('data-card')));
        });
      }
    }
  }

  function addCardToNextSlot(cardId) {
    if (gameState?.programs?.[session?.userId]?.sent) return;
    const robot = meRobot();
    if (!robot) return;
    const unlocked = MdRobotEngine.getUnlockedRegisterCount(robot);
    for (let i = 0; i < unlocked; i++) {
      if (!localRegs[i]) {
        localRegs[i] = cardId;
        renderRegistersAndHand();
        updateControls();
        return;
      }
    }
  }

  function clearRegs() {
    const robot = meRobot();
    const unlocked = robot ? MdRobotEngine.getUnlockedRegisterCount(robot) : REG_COUNT;
    for (let i = 0; i < unlocked; i++) localRegs[i] = null;
    renderRegistersAndHand();
    updateControls();
  }

  function renderPlayers() {
    if (!el.players || !gameState) return;
    el.players.innerHTML = (gameState.robots || []).map((r) => {
      const sent = !!gameState.programs?.[r.userId]?.sent;
      const you = r.userId === session?.userId ? ' (jij)' : '';
      const admin = r.userId === gameState.hostId ? ' · host' : '';
      const mark = gameState.status === 'programming' ? (sent ? '✓' : '…') : '•';
      const cp = ` CP${(r.checkpoint || 0) + 1}`;
      const dmg = r.damage ? ` ⚠${r.damage}` : '';
      return `<span class="pills" style="--bot:${r.color}">${mark} ${r.name}${you}${admin}${cp}${dmg}</span>`;
    }).join(' ');
  }

  function renderRobotMeta() {
    if (!el.robotMeta) return;
    const r = meRobot();
    if (!r || gameState?.status === 'lobby') {
      el.robotMeta.textContent = '';
      return;
    }
    const need = gameState.checkpointsCount || gameState.board?.checkpointsCount || 2;
    el.robotMeta.textContent = `Jij: damage ${r.damage || 0}/9 · checkpoint ${(r.checkpoint || 0)}/${need} · hand ${MdRobotEngine.handSize(r.damage)}`;
  }

  function renderPendingJoins() {
    if (!el.pendingJoins) return;
    if (!isHost() || gameState?.status !== 'lobby' || pendingJoinMap.size === 0) {
      el.pendingJoins.classList.add('hidden');
      el.pendingJoins.innerHTML = '';
      return;
    }
    el.pendingJoins.classList.remove('hidden');
    el.pendingJoins.innerHTML = '<p class="hint">Wachtende spelers:</p>'
      + [...pendingJoinMap.values()].map((p) => `
        <div class="pending-row">
          <span>${p.name || MdRobotMatrix.shortId(p.userId)}</span>
          <button type="button" class="btn primary small" data-admit="${p.userId}">Toelaten</button>
        </div>`).join('');
    el.pendingJoins.querySelectorAll('[data-admit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-admit');
        const p = pendingJoinMap.get(id);
        hostAdmit(id, p?.name);
      });
    });
  }

  function renderRole() {
    if (!el.roleBadge || !gameState) return;
    el.roleBadge.classList.remove('is-admin', 'is-guest');
    if (isHost()) {
      el.roleBadge.textContent = 'Jij bent host · instellingen in lobby';
      el.roleBadge.classList.add('is-admin');
    } else {
      el.roleBadge.textContent = `Gast · host: ${hostName()}`;
      el.roleBadge.classList.add('is-guest');
    }
  }

  function renderRules() {
    if (!el.rulesLine || !gameState) return;
    el.rulesLine.textContent = `Regels: ${MdRobotEngine.settingsSummary(gameState)}`;
  }

  function renderPhase() {
    if (!el.phase || !gameState) return;
    const status = gameState.status;
    if (status === 'lobby') {
      const n = (gameState.robots || []).length;
      const cap = lobbyCap();
      const canStart = n >= MIN_PLAYERS;
      el.phase.textContent = isHost()
        ? `Lobby · ${n}/${cap}${canStart ? ' · klaar om te starten' : ` · min. ${MIN_PLAYERS}`}`
        : `Lobby · ${n}/${cap} · wachten op host`;
    } else if (status === 'programming') {
      const sent = Object.values(gameState.programs || {}).filter((p) => p.sent).length;
      el.phase.textContent = `Ronde ${gameState.round} · Programmeren ${sent}/${(gameState.robots || []).length}`;
    } else if (status === 'executing') {
      const ri = (gameState.registerIndex || 0);
      el.phase.textContent = `Ronde ${gameState.round} · Register ${Math.min(ri + 1, REG_COUNT)}/${REG_COUNT}`;
    } else if (status === 'finished') {
      const win = (gameState.robots || []).find((r) => r.userId === gameState.winner);
      el.phase.textContent = win ? `${win.name} wint!` : 'Klaar';
    } else {
      el.phase.textContent = status;
    }
  }

  function inviteOptions() {
    return {
      roomId: activeRoomId,
      game: 'md-robot',
      minPlayers: lobbyCap()
    };
  }

  function waitingForPlayers() {
    if (!gameState || !activeRoomId) return false;
    if (gameState.status !== 'lobby') return false;
    return (gameState.robots || []).length < MIN_PLAYERS;
  }

  function updateControls() {
    const programming = gameState?.status === 'programming';
    const lobby = gameState?.status === 'lobby';
    const finished = gameState?.status === 'finished';
    const host = isHost();
    const iSent = !!gameState?.programs?.[session?.userId]?.sent;
    const waiting = waitingForPlayers();
    const n = (gameState?.robots || []).length;
    const cap = lobbyCap();
    const robot = meRobot();
    const unlocked = robot ? MdRobotEngine.getUnlockedRegisterCount(robot) : REG_COUNT;

    el.programPanel?.classList.toggle('hidden', !programming);
    el.hostActions?.classList.toggle('hidden', !host);
    el.guestNote?.classList.toggle('hidden', host || (!lobby && !programming && !finished));
    el.waitingShare?.classList.toggle('hidden', !waiting && !(lobby && n < cap));

    if (host) {
      if (el.btnStart) {
        el.btnStart.classList.toggle('hidden', !lobby);
        const canStart = n >= MIN_PLAYERS;
        el.btnStart.disabled = busy || !canStart;
        el.btnStart.textContent = canStart
          ? (n < cap ? `Start race (${n}/${cap})` : 'Start race')
          : `Start (min. ${MIN_PLAYERS}, nu ${n})`;
      }
      if (el.btnAgain) {
        el.btnAgain.classList.toggle('hidden', !finished);
        el.btnAgain.disabled = busy;
      }
    }

    const canEdit = programming && !iSent && !busy;
    let filled = 0;
    for (let i = 0; i < unlocked; i++) if (localRegs[i]) filled += 1;
    if (el.btnClear) el.btnClear.disabled = !canEdit;
    if (el.btnSent) {
      el.btnSent.disabled = !canEdit || filled !== unlocked;
      el.btnSent.textContent = iSent ? 'Commit ✓' : 'Commit';
    }
  }

  function escapeHtml(value) {
    if (typeof MatrixClient?.escapeHtml === 'function') return MatrixClient.escapeHtml(value);
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderChat() {
    if (!el.chatLog) return;
    if (!chatEvents.length) {
      el.chatLog.innerHTML = '<p class="hint">Chat terwijl je programmeert.</p>';
      return;
    }
    el.chatLog.innerHTML = chatEvents.map((ev) => {
      const who = escapeHtml(MdRobotMatrix.shortId(ev.sender));
      const body = escapeHtml(ev.content?.body || '');
      const mine = ev.sender === session?.userId ? ' mine' : '';
      return `<div class="chat-msg${mine}"><strong>${who}</strong> ${body}</div>`;
    }).join('');
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  function renderAll() {
    renderRole();
    renderRules();
    renderBoard();
    renderPlayers();
    renderPhase();
    renderRobotMeta();
    renderRegistersAndHand();
    renderPendingJoins();
    updateControls();
    renderChat();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function publishState(next, opPayload) {
    gameState = next;
    await MdRobotMatrix.putState(session, activeRoomId, next);
    if (opPayload) {
      await MdRobotMatrix.sendEvent(session, activeRoomId, opPayload);
    }
    renderAll();
  }

  async function maybeHostExecute() {
    // Do not gate on `busy` — host commit sets busy, then must still execute.
    if (!isHost() || !gameState || executing) return;
    if (gameState.status !== 'programming') return;
    if (!MdRobotEngine.allCommitted(gameState)) return;

    executing = true;
    try {
      let next = typeof MdRobotEngine.ensureBoard === 'function'
        ? MdRobotEngine.ensureBoard(gameState)
        : gameState;
      while (true) {
        next = MdRobotEngine.executeNextRegister(next);
        const step = next.registerIndex || 0;
        await publishState(next, {
          op: next.status === 'executing' ? 'execute_step' : 'play',
          registerIndex: step,
          round: next.round,
          winner: next.winner,
          status: next.status
        });
        setStatus(
          next.status === 'finished'
            ? 'Race gewonnen!'
            : next.status === 'programming'
              ? `Ronde ${next.round} — programmeer`
              : `Register ${Math.min(step, REG_COUNT)}/${REG_COUNT}`
        );
        if (next.status !== 'executing') break;
        await sleep(STEP_MS);
      }
      localRegs = [null, null, null, null, null];
      lastSeenRound = gameState?.round || 0;
      renderAll();
    } catch (err) {
      setStatus(err.message || 'Uitvoeren mislukt');
    } finally {
      executing = false;
      updateControls();
    }
  }

  async function maybeAutoStart() {
    if (!isHost() || !gameState || executing) return;
    if (gameState.status !== 'lobby') return;
    const settings = MdRobotEngine.getSettings(gameState);
    if (!settings.autoStart) return;
    if ((gameState.robots || []).length < MIN_PLAYERS) return;
    await onStart();
  }

  async function enterRoom(roomId) {
    if (!session) return;
    busy = true;
    let shouldAutoStart = false;
    let shouldExecute = false;
    try {
      await MdRobotMatrix.joinRoom(session, roomId);
      let state = await MdRobotMatrix.getState(session, roomId);
      if (!state || !MdRobotMatrix.isMdRobot(state)) {
        throw new Error('Dit is geen MD-robot spel.');
      }
      if (state.v !== 2) {
        if (state.status && state.status !== 'lobby') {
          throw new Error('Dit is een oud MD-robot spel. Maak een nieuw spel in de lobby.');
        }
        try {
          state = MdRobotEngine.updateSettings(state, { boardId: state.settings?.boardId || 'easy' });
          state.v = 2;
          if (state.hostId === session.userId) {
            await MdRobotMatrix.putState(session, roomId, state);
          }
        } catch (err) {
          throw new Error(err.message || 'Oud spel kon niet worden geüpgraded. Maak een nieuw spel.');
        }
      }
      if (typeof MdRobotEngine.ensureBoard === 'function') {
        state = MdRobotEngine.ensureBoard(state);
      }

      const already = (state.robots || []).some((r) => r.userId === session.userId);
      if (!already) {
        if (state.status !== 'lobby') throw new Error('Deze race is al gestart.');
        const name = hubName();
        if (state.hostId === session.userId) {
          state = MdRobotEngine.addPlayer(state, session.userId, name);
          await MdRobotMatrix.putState(session, roomId, state);
        } else {
          await MdRobotMatrix.sendEvent(session, roomId, {
            op: 'join_request',
            userId: session.userId,
            name
          });
          await MdRobotMatrix.sendEvent(session, roomId, {
            op: 'seat_join',
            userId: session.userId,
            name
          });
          setStatus('Wachten tot de host je toelaat…');
        }
      }

      if (!state.hostId && state.robots?.[0]?.userId) {
        state = { ...state, hostId: state.robots[0].userId };
        if (state.hostId === session.userId) {
          try { await MdRobotMatrix.putState(session, roomId, state); } catch { /* ignore */ }
        }
      }

      activeRoomId = roomId;
      gameState = state;
      pendingJoinMap.clear();
      persistRoom(roomId);
      localRegs = [null, null, null, null, null];
      showScreen('game');
      renderAll();
      setStatus(isHost() ? 'Speelbord (host)' : 'Speelbord (gast)');
      await loadChatHistory();
      shouldAutoStart = true;
      shouldExecute = true;
    } catch (err) {
      setStatus(err.message || 'Joinen mislukt');
      throw err;
    } finally {
      busy = false;
    }
    if (shouldAutoStart) await maybeAutoStart();
    if (shouldExecute) await maybeHostExecute();
  }

  async function hostAdmit(userId, name) {
    if (!isHost() || !gameState || gameState.status !== 'lobby') return;
    if ((gameState.robots || []).some((r) => r.userId === userId)) {
      pendingJoinMap.delete(userId);
      renderPendingJoins();
      return;
    }
    try {
      gameState = MdRobotEngine.addPlayer(gameState, userId, name);
      await MdRobotMatrix.putState(session, activeRoomId, gameState);
      pendingJoinMap.delete(userId);
      renderAll();
      setStatus(`${name || MdRobotMatrix.shortId(userId)} toegelaten`);
      await maybeAutoStart();
    } catch (err) {
      setStatus(err.message || 'Speler toevoegen mislukt');
    }
  }

  async function onStart() {
    if (!isHost() || busy) return;
    busy = true;
    try {
      gameState = MdRobotEngine.startGame(gameState);
      await MdRobotMatrix.putState(session, activeRoomId, gameState);
      await MdRobotMatrix.sendEvent(session, activeRoomId, {
        op: 'start',
        round: 1,
        seed: gameState.seed,
        boardId: gameState.boardId
      });
      if (typeof MdBoard?.closeListing === 'function' && activeRoomId) {
        MdBoard.closeListing(activeRoomId).catch(() => {});
      }
      localRegs = [null, null, null, null, null];
      pendingJoinMap.clear();
      renderAll();
      setStatus('Race gestart — programmeer je registers');
    } catch (err) {
      setStatus(err.message || 'Start mislukt');
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function onAgain() {
    if (!isHost() || busy) return;
    busy = true;
    try {
      gameState = MdRobotEngine.startGame(gameState);
      await MdRobotMatrix.putState(session, activeRoomId, gameState);
      await MdRobotMatrix.sendEvent(session, activeRoomId, { op: 'rematch', seed: gameState.seed });
      localRegs = [null, null, null, null, null];
      renderAll();
      setStatus('Opnieuw');
    } catch (err) {
      setStatus(err.message || 'Opnieuw mislukt');
    } finally {
      busy = false;
    }
  }

  function resolveLocalRegisterCards() {
    const robot = meRobot();
    if (!robot) return null;
    const unlocked = MdRobotEngine.getUnlockedRegisterCount(robot);
    const cards = [];
    for (let i = 0; i < REG_COUNT; i++) {
      if (i >= unlocked) {
        cards.push(robot.lockedRegisters?.[i] || null);
        continue;
      }
      const id = localRegs[i];
      if (!id) return null;
      const card = (robot.hand || []).find((c) => c.id === id);
      if (!card) return null;
      cards.push({ id: card.id, type: card.type, label: card.label, priority: card.priority });
    }
    return cards;
  }

  async function onCommit() {
    if (!session || !activeRoomId || busy || executing) return;
    const cards = resolveLocalRegisterCards();
    if (!cards) return;
    busy = true;
    let runExecute = false;
    try {
      if (isHost()) {
        gameState = MdRobotEngine.commitRegisters(gameState, session.userId, cards);
        await MdRobotMatrix.putState(session, activeRoomId, gameState);
        await MdRobotMatrix.sendEvent(session, activeRoomId, {
          op: 'intent_commit',
          userId: session.userId,
          registers: cards
        });
        renderAll();
        runExecute = true;
      } else {
        await MdRobotMatrix.sendEvent(session, activeRoomId, {
          op: 'intent_commit',
          userId: session.userId,
          registers: cards
        });
        try {
          gameState = MdRobotEngine.commitRegisters(gameState, session.userId, cards);
        } catch { /* host will confirm */ }
        renderAll();
        setStatus('Commit — wachten op anderen…');
      }
    } catch (err) {
      setStatus(err.message || 'Commit mislukt');
    } finally {
      busy = false;
      updateControls();
    }
    if (runExecute) await maybeHostExecute();
  }

  async function handleTimelineEvent(ev) {
    if (!ev) return;
    if (ev.type === 'm.room.message' && ev.content?.body) {
      if (!chatEvents.some((e) => e.event_id && e.event_id === ev.event_id)) {
        chatEvents.push(ev);
        if (chatEvents.length > 80) chatEvents.splice(0, chatEvents.length - 80);
        renderChat();
      }
      return;
    }
    if (ev.type !== MdRobotMatrix.EVENT_TYPE) return;
    const c = ev.content || {};
    if ((c.op === 'join_request' || c.op === 'seat_join') && isHost() && c.userId !== session.userId) {
      if (!(gameState?.robots || []).some((r) => r.userId === c.userId)) {
        pendingJoinMap.set(c.userId, { userId: c.userId, name: c.name });
        renderPendingJoins();
        await hostAdmit(c.userId, c.name);
      }
    }
    if ((c.op === 'intent_commit' || c.op === 'program_sent') && isHost() && c.userId && c.userId !== session.userId) {
      if (gameState?.status === 'programming' && !gameState.programs?.[c.userId]?.sent && !executing) {
        try {
          if (c.registers) {
            gameState = MdRobotEngine.commitRegisters(gameState, c.userId, c.registers);
          } else if (c.cards) {
            gameState = MdRobotEngine.setProgram(gameState, c.userId, c.cards);
          } else {
            return;
          }
          await MdRobotMatrix.putState(session, activeRoomId, gameState);
          await MdRobotMatrix.sendEvent(session, activeRoomId, {
            op: 'state_snapshot',
            updatedAt: gameState.updatedAt
          });
          renderAll();
          await maybeHostExecute();
        } catch (err) {
          setStatus(err.message || 'Commit ontvangen mislukt');
        }
      }
    }
  }

  function applyRemoteState(next) {
    if (!next?.robots) return false;
    const incoming = Number(next.updatedAt) || 0;
    const local = Number(gameState?.updatedAt) || 0;
    // Host owns writes during execute — ignore older echoes
    if (executing && isHost()) return false;
    if (gameState && local > 0 && incoming > 0 && incoming < local && isHost()) return false;
    if (typeof MdRobotEngine?.ensureBoard === 'function') {
      next = MdRobotEngine.ensureBoard(next);
    }
    const prevRound = gameState?.round || 0;
    gameState = next;
    for (const r of next.robots || []) pendingJoinMap.delete(r.userId);
    const roundChanged = (next.round || 0) !== prevRound;
    if (roundChanged || next.status !== 'programming' || next.programs?.[session?.userId]?.sent) {
      localRegs = [null, null, null, null, null];
    }
    lastSeenRound = next.round || 0;
    return true;
  }

  async function loadChatHistory() {
    if (!session || !activeRoomId || typeof MatrixClient?.getMessages !== 'function') return;
    try {
      const data = await MatrixClient.getMessages(session, activeRoomId, { limit: 40, dir: 'b' });
      const chunk = Array.isArray(data?.chunk) ? data.chunk.slice() : [];
      chunk.reverse();
      chatEvents = chunk.filter((ev) => ev?.type === 'm.room.message' && ev.content?.body);
      renderChat();
    } catch { /* ignore */ }
  }

  async function sendChat() {
    if (!session || !activeRoomId) return;
    const text = String(el.chatInput?.value || '').trim();
    if (!text) return;
    try {
      await MatrixClient.sendTextMessage(session, activeRoomId, text);
      if (el.chatInput) el.chatInput.value = '';
      chatEvents.push({
        event_id: `local_${Date.now()}`,
        sender: session.userId,
        type: 'm.room.message',
        content: { msgtype: 'm.text', body: text }
      });
      renderChat();
    } catch (err) {
      setStatus(err.message || 'Chat sturen mislukt');
    }
  }

  async function poll() {
    if (!session || !activeRoomId || !syncLoopOn) return;
    const controller = new AbortController();
    syncController = controller;
    try {
      const data = await MdRobotMatrix.syncOnce(session, syncToken, 30000, controller.signal);
      if (!syncLoopOn) return;
      syncToken = data.next_batch || syncToken;
      const join = data.rooms?.join?.[activeRoomId];
      if (join) {
        const stateEv = [...(join.state?.events || []), ...(join.timeline?.events || [])]
          .reverse()
          .find((ev) => ev.type === MdRobotMatrix.EVENT_TYPE && (ev.state_key === '' || ev.state_key == null) && ev.content?.robots);
        if (stateEv?.content && applyRemoteState(stateEv.content)) {
          renderAll();
          await maybeAutoStart();
          if (!executing) await maybeHostExecute();
        }
        for (const ev of (join.timeline?.events || [])) {
          await handleTimelineEvent(ev);
        }
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
        clearPersisted();
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
    if (session?.userId && typeof MatrixClient?.getPersistedSince === 'function') {
      syncToken = MatrixClient.getPersistedSince(session.userId) || syncToken;
    }
    poll();
  }

  async function handleInviteLink() {
    if (typeof InviteShare === 'undefined' || !session) return;
    const invite = InviteShare.parseInviteFromLocation() || InviteShare.loadPendingInvite();
    if (!invite?.roomId) return;
    if (invite.game && invite.game !== 'md-robot') return;
    InviteShare.savePendingInvite({ ...invite, game: 'md-robot' });
    try {
      await enterRoom(invite.roomId);
      InviteShare.clearPendingInvite();
      const url = new URL(window.location.href);
      ['join', 'matrixRoom', 'game', 'min', 'room'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch (err) {
      setStatus(err.message || 'Joinen via link mislukt');
    }
  }

  async function tryResume() {
    const saved = loadPersisted();
    if (!saved?.roomId || !session) return;
    if (saved.userId && saved.userId !== session.userId) {
      clearPersisted();
      return;
    }
    try {
      await enterRoom(saved.roomId);
    } catch {
      clearPersisted();
    }
  }

  async function init() {
    session = MdRobotMatrix.loadSession();
    if (!session) {
      showScreen('auth');
      setStatus('Log in via de Multi Device-lobby.');
      return;
    }

    if (typeof MatrixAuth?.ensureFreshSession === 'function') {
      session = (await MatrixAuth.ensureFreshSession(session)) || session;
    }

    if (el.youAre) {
      el.youAre.textContent = `Ingelogd als ${session.displayName || MdRobotMatrix.shortId(session.userId)}`;
    }
    showScreen('lobby');
    setStatus('Open een spel via de Multi Device-lobby');

    el.btnStart?.addEventListener('click', onStart);
    el.btnAgain?.addEventListener('click', onAgain);
    el.btnClear?.addEventListener('click', clearRegs);
    el.btnSent?.addEventListener('click', onCommit);
    el.chatSend?.addEventListener('click', sendChat);
    el.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChat();
      }
    });
    el.btnShareWhatsapp?.addEventListener('click', () => {
      if (!activeRoomId || typeof InviteShare === 'undefined') return;
      InviteShare.shareWhatsApp(inviteOptions());
      setStatus('WhatsApp geopend — stuur de uitnodiging');
    });
    el.btnShareCopy?.addEventListener('click', async () => {
      if (!activeRoomId || typeof InviteShare === 'undefined') return;
      const url = await InviteShare.copyInviteLink(inviteOptions());
      setStatus(`Link gekopieerd: ${url}`);
    });

    await handleInviteLink();
    if (!activeRoomId) await tryResume();
    if (activeRoomId) startSync();
  }

  init();
})();
