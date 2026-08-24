/**
 * Centrale Multi Device lobby — Element-achtig sync-model:
 * - Live updates via gefilterde GET /_matrix/client/v3/sync (long-poll), niet N× getState
 * - Filter: alleen com.d5games.* state/timeline (zoals Element filters / sliding sync-idee)
 * - localStorage = alleen identity (roomId, game, hostId)
 * - rooms Map = display cache met stateRev (oudere state wordt genegeerd)
 * - Start: snelle getState voor owned rooms, daarna continuous /sync
 * @see https://spec.matrix.org/v1.11/client-server-api/#syncing
 * @see https://app.element.io/
 */
(function () {
  const STORAGE_SESSION = 'd-games-matrix-session';
  const OWNED_KEY = 'd-games-md-owned-rooms';
  const EVENT_ROBOT = 'com.d5games.mdrobot';
  const EVENT_TTT = 'com.d5games.tictactoe';
  const EVENT_RALLY = 'com.d5games.robotrally';
  const STALE_MS = 3 * 60 * 1000;
  const SYNC_TIMEOUT_MS = 30000;
  const SYNC_RETRY_MS = 2000;

  const OWNED_ACCOUNT_TYPE = 'com.d5games.md.owned_rooms';
  const SYNC_BACKOFF_MAX_MS = 30000;

  const el = {
    section: document.getElementById('matrix-games-section'),
    createGame: document.getElementById('md-create-game'),
    createPlayers: document.getElementById('md-create-players'),
    createPlayersWrap: document.getElementById('md-create-players-wrap'),
    createBtn: document.getElementById('md-create-btn'),
    createStatus: document.getElementById('md-create-status'),
    syncStatus: document.getElementById('md-sync-status'),
    actionSummary: document.getElementById('md-action-summary'),
    gamesList: document.getElementById('md-games-list'),
    gamesEmpty: document.getElementById('md-games-empty'),
    playFriend: document.getElementById('md-play-friend'),
    playGame: document.getElementById('md-play-game'),
    playFriendBtn: document.getElementById('md-play-friend-btn'),
    playAddWrap: document.getElementById('md-play-add-wrap'),
    playFriendSelectWrap: document.getElementById('md-play-friend-select-wrap'),
    invitePanel: document.getElementById('md-invites-panel'),
    inviteList: document.getElementById('md-invite-list'),
    inviteEmpty: document.getElementById('md-invite-empty'),
    refreshBtn: document.getElementById('md-refresh-btn'),
    beheerOverlay: document.getElementById('md-beheer-overlay'),
    beheerClose: document.getElementById('md-beheer-close'),
    beheerTitle: document.getElementById('md-beheer-title'),
    beheerStatus: document.getElementById('md-beheer-status'),
    beheerReady: document.getElementById('md-beheer-ready'),
    beheerPlayersList: document.getElementById('md-beheer-players-list'),
    beheerPlayersEmpty: document.getElementById('md-beheer-players-empty'),
    adminPlayers: document.getElementById('md-beheer-players'),
    adminProgram: document.getElementById('md-beheer-program'),
    adminBoard: document.getElementById('md-beheer-board'),
    createBoard: document.getElementById('md-create-board'),
    createBoardWrap: document.getElementById('md-create-board-wrap'),
    adminPush: document.getElementById('md-beheer-push'),
    adminAutostart: document.getElementById('md-beheer-autostart'),
    adminSave: document.getElementById('md-beheer-save'),
    adminShare: document.getElementById('md-beheer-share'),
    adminWhatsapp: document.getElementById('md-beheer-whatsapp'),
    adminOpen: document.getElementById('md-beheer-open'),
    adminToLobby: document.getElementById('md-beheer-to-lobby'),
    adminRobotFields: document.getElementById('md-beheer-robot-fields'),
    adminInviteUser: document.getElementById('md-beheer-invite-user'),
    adminInviteBtn: document.getElementById('md-beheer-invite-btn'),
    shareLink: document.getElementById('md-beheer-link'),
    chatLog: document.getElementById('md-beheer-chat-log'),
    chatInput: document.getElementById('md-beheer-chat-input'),
    chatSend: document.getElementById('md-beheer-chat-send'),
    connStatus: document.getElementById('matrix-conn-status')
  };

  let session = null;
  let rooms = new Map();
  let ownedIds = loadOwned();
  let inviteRooms = new Map();
  let robotStateByRoom = new Map();
  let tttStateByRoom = new Map();
  let tttEventsByRoom = new Map();
  let chatByRoom = new Map();
  let beheerRoomId = null;
  let beheerGame = null;
  let beheerState = null;
  let busy = false;
  let lastDetailsAt = 0;
  let syncEpoch = 0;
  let syncSince = null;
  let syncLoopOn = false;
  let syncController = null;
  let syncLoopPromise = null;
  let startPromise = null;
  let refreshAllPromise = null;
  let syncFailStreak = 0;
  let ownedAccountSyncTimer = null;

  function loadOwned() {
    try {
      const raw = localStorage.getItem(OWNED_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const map = new Map();
      (Array.isArray(list) ? list : []).forEach((x) => {
        if (!x?.roomId) return;
        // Identity only — strip any legacy play-data fields
        map.set(x.roomId, {
          roomId: x.roomId,
          game: x.game || 'md-robot',
          hostId: x.hostId || null,
          savedAt: x.savedAt || Date.now()
        });
      });
      return map;
    } catch {
      return new Map();
    }
  }

  function saveOwned() {
    try {
      const clean = [...ownedIds.values()].map((x) => ({
        roomId: x.roomId,
        game: x.game || 'md-robot',
        hostId: x.hostId || null,
        savedAt: x.savedAt || Date.now()
      }));
      localStorage.setItem(OWNED_KEY, JSON.stringify(clean));
    } catch { /* ignore */ }
  }

  function rememberOwned(roomId, game, hostId = null) {
    const prev = ownedIds.get(roomId) || {};
    ownedIds.set(roomId, {
      roomId,
      game: game || prev.game || 'md-robot',
      hostId: hostId || prev.hostId || session?.userId || null,
      savedAt: Date.now()
    });
    saveOwned();
    scheduleOwnedAccountSync();
  }

  function scheduleOwnedAccountSync() {
    if (!session) return;
    if (ownedAccountSyncTimer) clearTimeout(ownedAccountSyncTimer);
    ownedAccountSyncTimer = setTimeout(() => {
      syncOwnedToAccountData().catch(() => {});
    }, 400);
  }

  async function syncOwnedToAccountData() {
    if (!session || typeof MatrixClient?.putAccountData !== 'function') return;
    const roomsList = [...ownedIds.values()].map((x) => ({
      roomId: x.roomId,
      game: x.game || 'md-robot',
      hostId: x.hostId || session.userId,
      savedAt: x.savedAt || Date.now()
    }));
    await MatrixClient.putAccountData(session, OWNED_ACCOUNT_TYPE, { rooms: roomsList });
  }

  async function loadOwnedFromAccountData() {
    if (!session || typeof MatrixClient?.getAccountData !== 'function') return;
    try {
      const data = await MatrixClient.getAccountData(session, OWNED_ACCOUNT_TYPE);
      const list = Array.isArray(data?.rooms) ? data.rooms : [];
      let changed = false;
      for (const x of list) {
        if (!x?.roomId) continue;
        if (!ownedIds.has(x.roomId)) {
          ownedIds.set(x.roomId, {
            roomId: x.roomId,
            game: x.game || 'md-robot',
            hostId: x.hostId || session.userId,
            savedAt: x.savedAt || Date.now()
          });
          changed = true;
        }
      }
      if (changed) saveOwned();
    } catch { /* optional */ }
  }

  function applyOwnedAccountData(content) {
    const list = Array.isArray(content?.rooms) ? content.rooms : [];
    let changed = false;
    for (const x of list) {
      if (!x?.roomId) continue;
      if (!ownedIds.has(x.roomId)) {
        ownedIds.set(x.roomId, {
          roomId: x.roomId,
          game: x.game || 'md-robot',
          hostId: x.hostId || session?.userId || null,
          savedAt: x.savedAt || Date.now()
        });
        changed = true;
      }
    }
    if (changed) {
      saveOwned();
      for (const [roomId, meta] of ownedIds.entries()) {
        if (!rooms.has(roomId)) {
          upsertRoom(roomId, {
            game: meta.game,
            hostId: meta.hostId || session?.userId,
            hostName: hubName(),
            status: 'onbekend'
          }, { source: 'identity' });
        }
      }
      renderLists();
    }
  }

  function loadSession() {
    if (typeof MatrixAuth?.loadSession === 'function') return MatrixAuth.loadSession();
    if (typeof MatrixClient?.loadSession === 'function') return MatrixClient.loadSession();
    try {
      const raw = localStorage.getItem(STORAGE_SESSION);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.accessToken || !data?.userId || !data?.baseUrl) return null;
      return data;
    } catch {
      return null;
    }
  }

  function shortId(userId) {
    if (typeof MatrixClient?.shortId === 'function') return MatrixClient.shortId(userId);
    const m = String(userId || '').match(/^@([^:]+):/);
    return m ? m[1] : (userId || '—');
  }

  function hubName() {
    if (typeof MatrixClient?.hubCharacterName === 'function') {
      return MatrixClient.hubCharacterName(shortId(session?.userId));
    }
    try {
      const raw = localStorage.getItem('d-games-hub-character');
      const data = raw ? JSON.parse(raw) : null;
      const name = (data?.name || '').trim();
      if (name) return name;
    } catch { /* ignore */ }
    return shortId(session?.userId);
  }

  function setConnStatus(text) {
    if (el.connStatus) el.connStatus.textContent = text || '';
  }

  function gameTitle(game) {
    return InviteShare?.GAME_TITLES?.[game] || game;
  }

  function stateRevFromContent(content) {
    const rev = Number(content?.updatedAt);
    if (Number.isFinite(rev) && rev > 0) return rev;
    // Geen wall-clock fallback: die maakt trage/oude responses "nieuwer".
    return 0;
  }

  async function api(path, { method = 'GET', body, query, signal } = {}) {
    if (typeof MatrixClient?.api === 'function') {
      return MatrixClient.api(session, path, { method, body, query, signal });
    }
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${session.accessToken}`
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let url = `${session.baseUrl}${path}`;
    if (query) {
      url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.errcode = data?.errcode;
      throw err;
    }
    return data;
  }

  function escapeHtml(value) {
    if (typeof MatrixClient?.escapeHtml === 'function') return MatrixClient.escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function matrixSync({ since = undefined, timeout = 0, signal = undefined } = {}) {
    if (typeof MatrixClient?.sync === 'function') {
      const opts = {
        timeout,
        signal,
        setPresence: 'offline',
        persistSince: true
      };
      // undefined → MatrixClient gebruikt persisted since; null = verse initial sync
      if (since !== undefined) opts.since = since;
      else if (syncSince) opts.since = syncSince;
      const data = await MatrixClient.sync(session, opts);
      if (data?.next_batch) syncSince = data.next_batch;
      return data;
    }
    const query = {
      timeout: String(timeout),
      set_presence: 'offline'
    };
    const useSince = since !== undefined ? since : syncSince;
    if (useSince) query.since = useSince;
    const data = await api('/_matrix/client/v3/sync', { query, signal });
    if (data?.next_batch) syncSince = data.next_batch;
    return data;
  }

  function sleep(ms) {
    if (typeof MatrixClient?.sleep === 'function') return MatrixClient.sleep(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mergeTttEvents(roomId, events, limited) {
    const incoming = (events || []).filter((ev) => ev?.type === EVENT_TTT);
    if (limited) {
      tttEventsByRoom.set(roomId, incoming.slice());
      return tttEventsByRoom.get(roomId);
    }
    const prev = tttEventsByRoom.get(roomId) || [];
    const seen = new Set(prev.map((ev) => ev.event_id).filter(Boolean));
    const merged = prev.slice();
    for (const ev of incoming) {
      if (ev.event_id && seen.has(ev.event_id)) continue;
      if (ev.event_id) seen.add(ev.event_id);
      merged.push(ev);
    }
    if (merged.length > 120) merged.splice(0, merged.length - 120);
    tttEventsByRoom.set(roomId, merged);
    return merged;
  }

  function applyRoomSync(roomId, roomData, epoch) {
    const stateEvents = roomData?.state?.events || [];
    for (const ev of stateEvents) {
      if (!ev?.type) continue;
      const key = ev.state_key;
      if (key !== '' && key != null) continue;
      if (ev.type === EVENT_ROBOT && ev.content?.robots) {
        robotStateByRoom.set(roomId, ev.content);
      }
      if (ev.type === EVENT_TTT && (ev.content?.players || ev.content?.kind)) {
        tttStateByRoom.set(roomId, ev.content);
      }
      if (ev.type === EVENT_RALLY && (ev.content?.seats || ev.content?.kind)) {
        // store on rooms via ingest below
        upsertRoom(roomId, {
          game: 'robotrally',
          status: ev.content.status || 'lobby',
          hostId: ev.content.hostId || ev.content.seats?.[0]?.userId,
          hostName: ev.content.seats?.[0]?.name || shortId(ev.content.hostId),
          maxPlayers: 4,
          players: (ev.content.seats || []).length,
          actionKind: ev.content.status === 'lobby' ? 'wait_join' : 'other',
          actionLabel: statusLabel(ev.content.status),
          stateRev: stateRevFromContent(ev.content),
          fetchedAt: Date.now()
        }, { source: 'details', epoch });
      }
    }

    const timeline = roomData?.timeline?.events || [];
    const limited = !!roomData?.timeline?.limited;
    if (timeline.some((ev) => ev?.type === EVENT_TTT) || limited) {
      mergeTttEvents(roomId, timeline, limited);
    }

    const msgs = timeline.filter((ev) => ev?.type === 'm.room.message');
    if (msgs.length) {
      mergeChatMessages(roomId, msgs, limited);
      if (beheerRoomId === roomId) renderBeheerChat();
    }

    // Host in hub: join_requests toelaten zodat gasten niet vastlopen als het speelbord dicht is
    maybeAdmitJoinRequests(roomId, timeline);

    const robot = robotStateByRoom.get(roomId);
    if (robot?.robots) {
      ingestRobotState(roomId, robot, 'details', epoch);
      return true;
    }
    const ttt = tttStateByRoom.get(roomId);
    if (ttt && (ttt.players || ttt.kind)) {
      const events = tttEventsByRoom.get(roomId) || [];
      const turnInfo = events.length ? tttTurnFromEvents(events, ttt.players) : { status: ttt.status || 'waiting' };
      ingestTttState(roomId, ttt, 'details', turnInfo, epoch);
      return true;
    }
    const room = rooms.get(roomId);
    return !!(room?.game === 'robotrally' && room.detail);
  }

  function mergeChatMessages(roomId, events, limited) {
    const incoming = (events || []).filter((ev) => ev?.type === 'm.room.message' && ev.content?.body);
    if (limited) {
      chatByRoom.set(roomId, incoming.slice(-80));
      return;
    }
    const prev = chatByRoom.get(roomId) || [];
    const seen = new Set(prev.map((ev) => ev.event_id).filter(Boolean));
    const merged = prev.slice();
    for (const ev of incoming) {
      if (ev.event_id && seen.has(ev.event_id)) continue;
      if (ev.event_id) seen.add(ev.event_id);
      merged.push(ev);
    }
    if (merged.length > 80) merged.splice(0, merged.length - 80);
    chatByRoom.set(roomId, merged);
  }

  const admitInFlight = new Set();

  function maybeAdmitJoinRequests(roomId, timeline) {
    if (!session || typeof MdRobotEngine?.addPlayer !== 'function') return;
    const state = robotStateByRoom.get(roomId);
    if (!state?.robots || state.status !== 'lobby') return;
    if ((state.hostId || state.robots[0]?.userId) !== session.userId) return;

    for (const ev of timeline || []) {
      if (ev?.type !== EVENT_ROBOT) continue;
      const c = ev.content || {};
      if (c.op !== 'join_request' && c.op !== 'seat_join') continue;
      if (!c.userId || c.userId === session.userId) continue;
      if ((state.robots || []).some((r) => r.userId === c.userId)) continue;
      const key = `${roomId}:${c.userId}`;
      if (admitInFlight.has(key)) continue;
      admitInFlight.add(key);
      (async () => {
        try {
          let next = robotStateByRoom.get(roomId) || state;
          if ((next.robots || []).some((r) => r.userId === c.userId)) return;
          if (next.status !== 'lobby') return;
          next = MdRobotEngine.addPlayer(next, c.userId, c.name || shortId(c.userId));
          robotStateByRoom.set(roomId, next);
          await putState(roomId, EVENT_ROBOT, next);
          ingestRobotState(roomId, next, 'mutation', syncEpoch);
          if (beheerRoomId === roomId) {
            beheerState = next;
            if (el.beheerStatus) {
              const s = MdRobotEngine.getSettings(next);
              const n = (next.robots || []).length;
              el.beheerStatus.textContent = `${statusLabel(next.status)} · ${playersLabel({ players: n, maxPlayers: s.maxPlayers, detail: true })}`;
            }
            renderBeheerPlayers(next, 'md-robot');
          }
        } catch { /* ignore race */ }
        finally {
          admitInFlight.delete(key);
        }
      })();
    }
  }

  function detectInviteGame(inviteStateEvents) {
    for (const ev of inviteStateEvents || []) {
      if (ev?.type === EVENT_ROBOT && (ev.content?.robots || ev.content?.kind)) {
        return { game: 'md-robot', content: ev.content };
      }
      if (ev?.type === EVENT_TTT && (ev.content?.players || ev.content?.kind)) {
        return { game: 'tic-tac-too', content: ev.content };
      }
      if (ev?.type === EVENT_RALLY && (ev.content?.seats || ev.content?.kind)) {
        return { game: 'robotrally', content: ev.content };
      }
    }
    return null;
  }

  function upsertInvite(roomId, inviteStateEvents) {
    const detected = detectInviteGame(inviteStateEvents);
    if (!detected) {
      inviteRooms.delete(roomId);
      return false;
    }
    const hostId = detected.content?.hostId
      || detected.content?.robots?.[0]?.userId
      || detected.content?.players?.X
      || null;
    inviteRooms.set(roomId, {
      roomId,
      game: detected.game,
      hostId,
      hostName: shortId(hostId),
      status: 'invite'
    });
    return true;
  }

  function applyAccountDataEvents(events) {
    for (const ev of events || []) {
      if (ev?.type === OWNED_ACCOUNT_TYPE) {
        applyOwnedAccountData(ev.content);
      }
      if (ev?.type === 'com.d5games.contacts' && typeof MdContacts?.applyAccountData === 'function') {
        MdContacts.applyAccountData(ev.content);
      }
    }
  }

  function applySyncPayload(data, epoch = syncEpoch) {
    if (!data) return 0;
    let found = 0;

    applyAccountDataEvents(data.account_data?.events);

    const join = data.rooms?.join || {};
    for (const [roomId, roomData] of Object.entries(join)) {
      inviteRooms.delete(roomId);
      if (applyRoomSync(roomId, roomData, epoch)) found += 1;
    }

    const leave = data.rooms?.leave || {};
    for (const roomId of Object.keys(leave)) {
      rooms.delete(roomId);
      inviteRooms.delete(roomId);
    }

    const invite = data.rooms?.invite || {};
    for (const [roomId, roomData] of Object.entries(invite)) {
      const events = roomData?.invite_state?.events || [];
      if (upsertInvite(roomId, events)) {
        const fake = { state: { events }, timeline: { events: [] } };
        applyRoomSync(roomId, fake, epoch);
        found += 1;
      }
    }

    if (data.next_batch) {
      syncSince = data.next_batch;
      if (session?.userId && typeof MatrixClient?.setPersistedSince === 'function') {
        MatrixClient.setPersistedSince(session.userId, data.next_batch);
      }
    }
    if (found || inviteRooms.size) {
      lastDetailsAt = Date.now();
      const n = [...rooms.values()].filter((r) => r.detail).length;
      if (el.createStatus) {
        el.createStatus.textContent = n
          ? `${n} room${n === 1 ? '' : 's'} live via Matrix /sync`
          : (inviteRooms.size
            ? `${inviteRooms.size} uitnodiging${inviteRooms.size === 1 ? '' : 'en'} — accepteer hieronder.`
            : 'Nog geen MD-rooms. Maak er hierboven een aan of accepteer een uitnodiging.');
      }
      updateSyncStatus('Live verbonden met Matrix (/sync).');
      setConnStatus(`Verbonden · ${session?.displayName || shortId(session?.userId)}`);
    }
    if (typeof MdBoard?.handleSyncPayload === 'function') {
      MdBoard.handleSyncPayload(data);
    }
    renderLists();
    renderInvites();
    return found;
  }

  function txnId() {
    return `mdl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function getState(roomId, eventType) {
    try {
      return await api(`/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${eventType}`);
    } catch {
      return null;
    }
  }

  async function putState(roomId, eventType, content) {
    return api(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${eventType}/`,
      { method: 'PUT', body: content }
    );
  }

  async function sendEvent(roomId, eventType, content) {
    return api(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${eventType}/${txnId()}`,
      { method: 'PUT', body: content }
    );
  }

  /**
   * @param {string} roomId
   * @param {object} meta
   * @param {{ source?: 'identity'|'discover'|'details'|'mutation', force?: boolean, epoch?: number }} opts
   */
  function upsertRoom(roomId, meta, opts = {}) {
    const source = opts.source || 'details';
    const force = !!opts.force;
    const epoch = Number(opts.epoch);
    const prev = rooms.get(roomId) || {};
    const incomingRev = Number(meta?.stateRev) || 0;
    const prevRev = Number(prev.stateRev) || 0;
    const prevEpoch = Number(prev.syncEpoch) || 0;

    // Late response van een oudere refresh/probe → negeren
    if (!force && Number.isFinite(epoch) && prevEpoch > 0 && epoch < prevEpoch) {
      return false;
    }

    // Oudere Matrix-state mag nieuwere cache niet overschrijven.
    // Geen updatedAt (rev 0) mag nooit een bekende nieuwere stand vervangen —
    // dat gebeurt vaak bij trage/parallelle Matrix-responses.
    if (!force && source !== 'identity' && source !== 'discover' && prev.detail) {
      if (prevRev > 0 && (incomingRev === 0 || incomingRev < prevRev)) {
        return false;
      }
      if (
        incomingRev > 0
        && prevRev > 0
        && incomingRev === prevRev
        && Number.isFinite(epoch)
        && epoch < prevEpoch
      ) {
        return false;
      }
    }

    const next = { ...prev, roomId };

    if (source === 'identity' || source === 'discover') {
      // Only soft-merge identity; never invent play counts from localStorage
      if (meta.game) next.game = meta.game;
      if (meta.hostId) next.hostId = meta.hostId;
      if (meta.hostName) next.hostName = meta.hostName;
      if (!next.detail) {
        next.status = next.status || 'onbekend';
        next.detail = false;
      }
    } else {
      for (const [k, v] of Object.entries(meta || {})) {
        if (v === null || v === undefined || v === '') continue;
        next[k] = v;
      }
      next.detail = true;
      next.fetchedAt = meta.fetchedAt || Date.now();
      if (Number.isFinite(epoch)) next.syncEpoch = epoch;
      else if (!Number.isFinite(Number(next.syncEpoch))) next.syncEpoch = syncEpoch;
    }

    if (next.hostId === session?.userId || ownedIds.has(roomId)) {
      rememberOwned(roomId, next.game || prev.game || 'md-robot', next.hostId || session?.userId);
    }

    rooms.set(roomId, next);
    renderLists();
    return true;
  }

  function isOwned(item) {
    if (!item || !session) return false;
    if (ownedIds.has(item.roomId)) return true;
    return !!(item.hostId && item.hostId === session.userId);
  }

  function statusLabel(s) {
    if (s === 'lobby' || s === 'waiting') return 'Lobby';
    if (s === 'programming' || s === 'playing') return 'Bezig';
    if (s === 'executing') return 'Registers';
    if (s === 'finished') return 'Klaar';
    if (s === 'onbekend' || s === 'laden…') return 'Laden…';
    return s || 'Room';
  }

  /** @returns {{ kind: 'turn'|'wait_others'|'wait_join'|'other', label: string }} */
  function actionFromRobot(c, me) {
    if (!c?.robots || !me) return { kind: 'other', label: statusLabel(c?.status) };
    const robots = c.robots || [];
    const max = Number(c.settings?.maxPlayers || c.maxPlayers || 2) || 2;
    const minStart = typeof MdRobotEngine?.MIN_PLAYERS === 'number' ? MdRobotEngine.MIN_PLAYERS : 2;
    const n = robots.length;
    const inGame = robots.some((r) => r.userId === me);
    const isHost = (c.hostId || robots[0]?.userId) === me;
    const status = c.status || 'lobby';

    if (status === 'finished') return { kind: 'other', label: 'Afgelopen' };
    if (status === 'lobby') {
      if (n < minStart) return { kind: 'wait_join', label: `Wacht op spelers (${n}/${max})` };
      if (isHost) return { kind: 'turn', label: n < max ? `Start mogelijk (${n}/${max})` : 'Start het spel' };
      if (inGame) return { kind: 'wait_others', label: 'Wacht tot host start' };
      return { kind: 'other', label: 'Lobby' };
    }
    if (status === 'programming') {
      if (!inGame) return { kind: 'other', label: 'Bezig (toeschouwer)' };
      const sent = !!c.programs?.[me]?.sent;
      const allSent = robots.every((r) => c.programs?.[r.userId]?.sent);
      if (!sent) return { kind: 'turn', label: 'Jouw registers committen' };
      if (allSent && isHost) return { kind: 'turn', label: 'Registers uitvoeren' };
      if (allSent) return { kind: 'wait_others', label: 'Wacht op uitvoering' };
      const pending = robots.filter((r) => !c.programs?.[r.userId]?.sent).length;
      return { kind: 'wait_others', label: `Wacht op ${pending} speler${pending === 1 ? '' : 's'}` };
    }
    if (status === 'executing') {
      const ri = Number(c.registerIndex) || 0;
      return { kind: 'wait_others', label: `Register ${Math.min(ri + 1, 5)}/5` };
    }
    return { kind: 'other', label: statusLabel(status) };
  }

  /** @returns {{ kind: 'turn'|'wait_others'|'wait_join'|'other', label: string }} */
  function actionFromTtt(c, me, turnInfo) {
    if (!c || !me) return { kind: 'other', label: statusLabel(c?.status) };
    const px = c.players?.X;
    const po = c.players?.O;
    const myMark = px === me ? 'X' : po === me ? 'O' : null;
    const status = turnInfo?.status || c.status || 'waiting';

    if (status === 'finished') return { kind: 'other', label: 'Afgelopen' };
    if (!po || status === 'waiting') {
      if (myMark === 'X' || c.hostId === me) return { kind: 'wait_join', label: 'Wacht op tegenstander' };
      if (!myMark) return { kind: 'wait_join', label: 'Nog open om te joinen' };
      return { kind: 'wait_others', label: 'Wacht tot het spel start' };
    }
    if (status === 'playing') {
      if (!myMark) return { kind: 'other', label: 'Bezig (toeschouwer)' };
      if (turnInfo?.turn === myMark) return { kind: 'turn', label: 'Jij bent aan zet' };
      return { kind: 'wait_others', label: 'Wacht op tegenstander' };
    }
    return { kind: 'other', label: statusLabel(status) };
  }

  function tttTurnFromEvents(events, players) {
    const board = Array(9).fill(null);
    let winner = null;
    let status = 'waiting';
    let moves = 0;
    let pl = players || {};

    for (const ev of events || []) {
      const c = ev.content || {};
      if (c.op === 'start' && c.players) {
        pl = c.players;
        status = 'playing';
      }
      if (c.op === 'rematch') {
        for (let i = 0; i < 9; i++) board[i] = null;
        winner = null;
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
        const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
        for (const [a, b, d] of lines) {
          if (board[a] && board[a] === board[b] && board[a] === board[d]) {
            winner = board[a];
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
      status,
      turn: moves % 2 === 0 ? 'X' : 'O',
      winner
    };
  }

  async function getGameEvents(roomId, eventType) {
    try {
      const data = await api(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`,
        { query: { dir: 'b', limit: '80' } }
      );
      const chunk = Array.isArray(data?.chunk) ? data.chunk.slice() : [];
      chunk.reverse();
      return chunk.filter((ev) => ev?.type === eventType);
    } catch {
      return [];
    }
  }

  function actionTagClass(kind) {
    if (kind === 'turn') return 'action-turn';
    if (kind === 'wait_others') return 'action-wait-others';
    if (kind === 'wait_join') return 'action-wait-join';
    return 'action-other';
  }

  function playersLabel(item) {
    if (!item?.detail) return '';
    const max = Number(item?.maxPlayers);
    const curRaw = item?.players;
    const cur = curRaw === 0 || curRaw ? Number(curRaw) : NaN;
    const hasCur = Number.isFinite(cur);
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasCur && hasMax) {
      if (cur >= max) return `${cur} van ${max} spelers (vol)`;
      return `${cur} van ${max} spelers`;
    }
    if (hasMax) return `max. ${max} spelers`;
    if (hasCur) return `${cur} speler${cur === 1 ? '' : 's'}`;
    return '';
  }

  function rulesLabel(state) {
    if (!state || typeof MdRobotEngine === 'undefined') return '';
    const s = MdRobotEngine.getSettings(state);
    return `bord ${s.boardId || 'easy'} · 5 registers · duwen ${s.pushEnabled ? 'aan' : 'uit'}`;
  }

  function formatTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  }

  function updateSyncStatus(extra = '') {
    if (!el.syncStatus) return;
    const age = lastDetailsAt ? Date.now() - lastDetailsAt : Infinity;
    let base = '';
    if (!lastDetailsAt) {
      base = '';
    } else if (age > STALE_MS) {
      base = `Bijgewerkt ${formatTime(lastDetailsAt)} — mogelijk verouderd.`;
    } else {
      base = `Bijgewerkt ${formatTime(lastDetailsAt)}`;
    }
    el.syncStatus.textContent = extra ? (base ? `${base} · ${extra}` : extra) : base;
  }

  function renderBeheerPlayers(state, game) {
    const names = [];
    if (game === 'md-robot') {
      for (const r of state?.robots || []) {
        names.push(r.name || shortId(r.userId));
      }
    } else if (game === 'robotrally') {
      for (const s of state?.seats || []) {
        names.push(s.name || shortId(s.userId));
      }
    } else if (state?.players) {
      if (state.players.X) names.push(`${shortId(state.players.X)} (X)`);
      if (state.players.O) names.push(`${shortId(state.players.O)} (O)`);
    }
    if (el.beheerPlayersList) {
      el.beheerPlayersList.innerHTML = names.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    }
    el.beheerPlayersEmpty?.classList.toggle('hidden', names.length > 0);

    const isHost = session && (
      state?.hostId === session.userId
      || (state?.robots?.[0]?.userId === session.userId)
    );
    const ready = game === 'md-robot'
      && isHost
      && state?.status === 'lobby'
      && (state?.robots || []).length >= 2;
    if (el.beheerReady) el.beheerReady.hidden = !ready;
  }

  function openGame(roomId, game) {
    const item = rooms.get(roomId);
    const g = game || item?.game || ownedIds.get(roomId)?.game || 'md-robot';
    const minPlayers = item?.detail ? (item.maxPlayers || 2) : 2;
    const url = InviteShare.gameEntryUrl({ roomId, game: g, minPlayers });
    stop(); // stop hub sync — game page owns its own sync
    window.location.href = url;
  }

  function renderLists() {
    const all = [];
    let nTurn = 0;
    let nWaitOthers = 0;
    let nWaitJoin = 0;

    for (const item of rooms.values()) {
      all.push(item);
      const kind = item.actionKind || 'other';
      if (kind === 'turn') nTurn += 1;
      else if (kind === 'wait_others') nWaitOthers += 1;
      else if (kind === 'wait_join') nWaitJoin += 1;
    }

    const byActionThenFresh = (a, b) => {
      const oa = isOwned(a) ? 0 : 1;
      const ob = isOwned(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const pa = a.actionKind === 'turn' ? 0 : a.actionKind === 'wait_others' ? 1 : a.actionKind === 'wait_join' ? 2 : 3;
      const pb = b.actionKind === 'turn' ? 0 : b.actionKind === 'wait_others' ? 1 : b.actionKind === 'wait_join' ? 2 : 3;
      if (pa !== pb) return pa - pb;
      return (b.fetchedAt || b.stateRev || 0) - (a.fetchedAt || a.stateRev || 0);
    };
    all.sort(byActionThenFresh);

    const row = (item) => {
      const title = gameTitle(item.game);
      const players = playersLabel(item);
      const ownedRow = isOwned(item);
      const stale = item.detail && item.fetchedAt && (Date.now() - item.fetchedAt > STALE_MS);
      const actionKind = item.actionKind || 'other';
      const actionLabel = item.actionLabel || statusLabel(item.status);
      const safeRoom = escapeHtml(item.roomId);
      const beheerBtn = ownedRow
        ? `<button type="button" class="hub-btn-ghost md-row-btn" data-beheer="${safeRoom}">Beheer</button>`
        : '';
      const openLabel = actionKind === 'turn' ? 'Naar bord' : 'Open';
      const safeTitle = escapeHtml(title);
      const safeAction = escapeHtml(actionLabel);
      const safeHost = escapeHtml(item.hostName || '');
      const safeGame = escapeHtml(item.game || '');
      return `
        <li class="md-room-row ${ownedRow ? 'owned' : 'joined'} action-${actionKind.replace('_', '-')}${stale ? ' stale' : ''}">
          <div class="md-room-main">
            <div class="md-room-title">
              <strong>${safeTitle}</strong>
              <span class="md-room-tag ${actionTagClass(actionKind)}">${safeAction}</span>
              <span class="md-room-tag ${ownedRow ? 'admin' : 'guest'}">${ownedRow ? 'beheerder' : 'gast'}</span>
              ${item.detail ? '' : '<span class="md-room-tag guest">laden…</span>'}
            </div>
            <div class="md-room-meta">${escapeHtml(statusLabel(item.status))}${players ? ` · ${escapeHtml(players)}` : ''}${safeHost && !ownedRow ? ` · host ${safeHost}` : ''}${stale ? ' · mogelijk verouderd' : ''}</div>
          </div>
          <div class="md-room-actions">
            ${beheerBtn}
            <button type="button" class="hub-btn-primary md-row-btn" data-open="${safeRoom}" data-game="${safeGame}">${openLabel}</button>
          </div>
        </li>`;
    };

    if (el.gamesList) {
      el.gamesList.innerHTML = all.map(row).join('');
      bindRowButtons(el.gamesList);
    }
    el.gamesEmpty?.classList.toggle('hidden', all.length > 0);

    if (el.actionSummary) {
      const parts = [];
      if (inviteRooms.size) parts.push(`${inviteRooms.size} uitnodiging${inviteRooms.size === 1 ? '' : 'en'}`);
      if (nTurn) parts.push(`${nTurn} jouw zet`);
      if (nWaitOthers) parts.push(`${nWaitOthers} wacht op anderen`);
      if (nWaitJoin) parts.push(`${nWaitJoin} wacht op spelers`);
      el.actionSummary.textContent = parts.length ? parts.join(' · ') : '';
    }
    updateSyncStatus();
  }

  function renderInvites() {
    const list = [...inviteRooms.values()];
    if (el.invitePanel) el.invitePanel.hidden = list.length === 0;
    if (!el.inviteList) return;
    if (!list.length) {
      el.inviteList.innerHTML = '';
      el.inviteEmpty?.classList.remove('hidden');
      return;
    }
    el.inviteEmpty?.classList.add('hidden');
    el.inviteList.innerHTML = list.map((item) => {
      const title = escapeHtml(gameTitle(item.game));
      const safeRoom = escapeHtml(item.roomId);
      const host = escapeHtml(item.hostName || '');
      return `
        <li class="md-room-row joined action-wait-join">
          <div class="md-room-main">
            <div class="md-room-title">
              <strong>${title}</strong>
              <span class="md-room-tag action-wait-join">uitnodiging</span>
            </div>
            <div class="md-room-meta">${host ? `van ${host}` : 'Matrix-uitnodiging'}</div>
          </div>
          <div class="md-room-actions">
            <button type="button" class="hub-btn-primary md-row-btn" data-accept-invite="${safeRoom}">Accepteer</button>
            <button type="button" class="hub-btn-ghost md-row-btn" data-decline-invite="${safeRoom}">Weiger</button>
          </div>
        </li>`;
    }).join('');
    el.inviteList.querySelectorAll('[data-accept-invite]').forEach((btn) => {
      btn.addEventListener('click', () => acceptInvite(btn.getAttribute('data-accept-invite')));
    });
    el.inviteList.querySelectorAll('[data-decline-invite]').forEach((btn) => {
      btn.addEventListener('click', () => declineInvite(btn.getAttribute('data-decline-invite')));
    });
  }

  async function acceptInvite(roomId) {
    if (!session || !roomId) return;
    const meta = inviteRooms.get(roomId);
    try {
      await MatrixClient.joinRoom(session, roomId);
      inviteRooms.delete(roomId);
      renderInvites();
      await probeRoom(roomId, syncEpoch);
      openGame(roomId, meta?.game || rooms.get(roomId)?.game);
    } catch (err) {
      if (el.createStatus) el.createStatus.textContent = err.message || 'Uitnodiging accepteren mislukt';
    }
  }

  async function declineInvite(roomId) {
    if (!session || !roomId) return;
    try {
      await MatrixClient.leaveRoom(session, roomId);
      inviteRooms.delete(roomId);
      rooms.delete(roomId);
      renderInvites();
      renderLists();
    } catch (err) {
      if (el.createStatus) el.createStatus.textContent = err.message || 'Weigeren mislukt';
    }
  }

  function bindRowButtons(root) {
    root.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => openGame(btn.getAttribute('data-open'), btn.getAttribute('data-game')));
    });
    root.querySelectorAll('[data-beheer]').forEach((btn) => {
      btn.addEventListener('click', () => openBeheer(btn.getAttribute('data-beheer')));
    });
  }

  function ingestRobotState(roomId, c, source = 'details', epoch = syncEpoch) {
    if (!c?.robots) return false;
    const fetchedAt = Date.now();
    const hostId = c.hostId || c.robots?.[0]?.userId;
    const action = actionFromRobot(c, session?.userId);
    const ok = upsertRoom(roomId, {
      game: 'md-robot',
      status: c.status || 'lobby',
      hostId,
      hostName: (c.robots || []).find((r) => r.userId === hostId)?.name || shortId(hostId),
      maxPlayers: c.settings?.maxPlayers || c.maxPlayers || 2,
      players: (c.robots || []).length,
      actionKind: action.kind,
      actionLabel: action.label,
      stateRev: stateRevFromContent(c),
      fetchedAt
    }, { source, epoch, force: source === 'mutation' });
    syncBoardListing(roomId, 'md-robot', c);
    if (beheerRoomId === roomId && beheerGame === 'md-robot') {
      beheerState = c;
      robotStateByRoom.set(roomId, c);
      renderBeheerPlayers(c, 'md-robot');
    }
    return ok;
  }

  function ingestTttState(roomId, c, source = 'details', turnInfo = null, epoch = syncEpoch) {
    if (!c || !(c.players || c.kind)) return false;
    const fetchedAt = Date.now();
    const hostId = c.hostId || c.players?.X;
    const n = [c.players?.X, c.players?.O].filter(Boolean).length;
    const rev = stateRevFromContent(c);
    const status = turnInfo?.status || c.status || 'waiting';
    const action = actionFromTtt(c, session?.userId, turnInfo || { status });
    const ok = upsertRoom(roomId, {
      game: 'tic-tac-too',
      status,
      hostId,
      hostName: shortId(hostId),
      maxPlayers: 2,
      players: n || 1,
      actionKind: action.kind,
      actionLabel: action.label,
      stateRev: rev,
      fetchedAt
    }, { source, epoch, force: source === 'mutation' });
    syncBoardListing(roomId, 'tic-tac-too', { ...c, status, players: n || 1, maxPlayers: 2 });
    return ok;
  }

  /** Host: open listing op prikbord zolang lobby open is; sluit bij start. */
  const boardLastSent = new Map(); // roomId -> signature
  const boardCloseSent = new Set();
  let boardUpdateTimer = null;
  const boardPending = new Map();

  function syncBoardListing(roomId, game, state) {
    if (!session || typeof MdBoard?.postListing !== 'function') return;
    if (!isOwned({ roomId, hostId: state?.hostId })) return;
    const status = state?.status || 'lobby';
    const open = game === 'tic-tac-too'
      ? (status === 'waiting' || !state?.players?.O)
      : status === 'lobby';

    if (!open) {
      if (boardCloseSent.has(roomId)) return;
      boardCloseSent.add(roomId);
      boardLastSent.delete(roomId);
      boardPending.delete(roomId);
      MdBoard.closeListing(roomId).catch(() => {});
      return;
    }

    boardCloseSent.delete(roomId);
    const players = game === 'tic-tac-too'
      ? [state?.players?.X, state?.players?.O].filter(Boolean).length
      : (state?.robots || []).length;
    const maxPlayers = game === 'tic-tac-too'
      ? 2
      : (state?.settings?.maxPlayers || state?.maxPlayers || 2);
    const hostId = state?.hostId || session.userId;
    const hostName = (state?.robots || []).find((r) => r.userId === hostId)?.name || hubName();
    const sig = `${game}|${players}|${maxPlayers}|open`;
    if (boardLastSent.get(roomId) === sig) return;
    boardPending.set(roomId, {
      roomId,
      game,
      hostId,
      hostName,
      players: players || 1,
      maxPlayers,
      op: boardLastSent.has(roomId) ? 'update' : 'open'
    });
    if (boardUpdateTimer) clearTimeout(boardUpdateTimer);
    boardUpdateTimer = setTimeout(flushBoardListings, 800);
  }

  async function flushBoardListings() {
    boardUpdateTimer = null;
    const items = [...boardPending.values()];
    boardPending.clear();
    for (const item of items) {
      const sig = `${item.game}|${item.players}|${item.maxPlayers}|open`;
      if (boardLastSent.get(item.roomId) === sig) continue;
      try {
        await MdBoard.postListing(item);
        boardLastSent.set(item.roomId, sig);
      } catch { /* ignore */ }
    }
  }

  async function publishBoardListing(created) {
    if (!created?.roomId || typeof MdBoard?.postListing !== 'function') return;
    const maxPlayers = created.state?.settings?.maxPlayers
      || created.state?.maxPlayers
      || (created.game === 'tic-tac-too' ? 2 : 2);
    const players = created.game === 'tic-tac-too'
      ? 1
      : (created.state?.robots || []).length || 1;
    try {
      await MdBoard.postListing({
        roomId: created.roomId,
        game: created.game,
        hostId: session.userId,
        hostName: hubName(),
        players,
        maxPlayers,
        op: 'open'
      });
      boardLastSent.set(created.roomId, `${created.game}|${players}|${maxPlayers}|open`);
      boardCloseSent.delete(created.roomId);
    } catch { /* prikbord optioneel */ }
  }

  async function bootstrapJoinedRooms(epoch = syncEpoch) {
    if (!session || typeof MatrixClient?.getJoinedRooms !== 'function') return;
    let joined = [];
    try {
      joined = await MatrixClient.getJoinedRooms(session);
    } catch {
      return;
    }
    const batch = joined.slice(0, 80);
    await Promise.all(batch.map(async (roomId) => {
      if (epoch < syncEpoch) return;
      try {
        await probeRoom(roomId, epoch);
      } catch { /* ignore non-game rooms */ }
    }));
  }

  async function loadBeheerChat(roomId) {
    if (!session || !roomId || typeof MatrixClient?.getMessages !== 'function') return;
    try {
      const data = await MatrixClient.getMessages(session, roomId, { limit: 40, dir: 'b' });
      const chunk = Array.isArray(data?.chunk) ? data.chunk.slice() : [];
      chunk.reverse();
      const msgs = chunk.filter((ev) => ev?.type === 'm.room.message' && ev.content?.body);
      chatByRoom.set(roomId, msgs);
      renderBeheerChat();
    } catch { /* ignore */ }
  }

  function renderBeheerChat() {
    if (!el.chatLog || !beheerRoomId) return;
    const msgs = chatByRoom.get(beheerRoomId) || [];
    if (!msgs.length) {
      el.chatLog.innerHTML = '<p class="hint-muted">Nog geen berichten — zeg hallo.</p>';
      return;
    }
    el.chatLog.innerHTML = msgs.map((ev) => {
      const who = escapeHtml(shortId(ev.sender));
      const body = escapeHtml(ev.content?.body || '');
      const mine = ev.sender === session?.userId ? ' mine' : '';
      return `<div class="md-chat-msg${mine}"><span class="md-chat-who">${who}</span> ${body}</div>`;
    }).join('');
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  async function sendBeheerChat() {
    if (!session || !beheerRoomId || busy) return;
    const text = String(el.chatInput?.value || '').trim();
    if (!text) return;
    busy = true;
    try {
      await MatrixClient.sendTextMessage(session, beheerRoomId, text);
      if (el.chatInput) el.chatInput.value = '';
      const fake = {
        event_id: `local_${Date.now()}`,
        sender: session.userId,
        type: 'm.room.message',
        content: { msgtype: 'm.text', body: text }
      };
      mergeChatMessages(beheerRoomId, [fake], false);
      renderBeheerChat();
    } catch (err) {
      if (el.beheerStatus) el.beheerStatus.textContent = err.message || 'Chat sturen mislukt';
    } finally {
      busy = false;
    }
  }

  async function inviteContactToBeheer() {
    if (!session || !beheerRoomId || busy) return;
    const userId = el.adminInviteUser?.value;
    if (!userId) {
      if (el.beheerStatus) el.beheerStatus.textContent = 'Kies eerst een vriend.';
      return;
    }
    busy = true;
    try {
      await MatrixClient.inviteUser(session, beheerRoomId, userId);
      const minPlayers = beheerState?.settings?.maxPlayers || beheerState?.maxPlayers || 2;
      const link = el.shareLink?.value
        || (typeof InviteShare?.buildInviteUrl === 'function'
          ? InviteShare.buildInviteUrl({ roomId: beheerRoomId, game: beheerGame || 'md-robot', minPlayers })
          : '');
      try {
        await MatrixClient.sendTextMessage(
          session,
          beheerRoomId,
          `Uitnodiging gestuurd naar ${userId}.${link ? ` Link: ${link}` : ''}`
        );
      } catch { /* ignore */ }
      if (typeof MdContacts?.notifyFriend === 'function') {
        await MdContacts.notifyFriend(userId, {
          game: beheerGame || 'md-robot',
          roomId: beheerRoomId,
          minPlayers
        });
      }
      if (el.beheerStatus) {
        el.beheerStatus.textContent = `Vriend ${shortId(userId)} uitgenodigd (Matrix + DM).`;
      }
    } catch (err) {
      if (el.beheerStatus) el.beheerStatus.textContent = err.message || 'Uitnodigen mislukt';
    } finally {
      busy = false;
    }
  }

  /** Fallback voor één room (Beheer / net aangemaakt) — niet voor de hele lobby. */
  async function probeRoom(roomId, epoch = syncEpoch) {
    if (epoch < syncEpoch) return null;

    const robot = await getState(roomId, EVENT_ROBOT);
    if (epoch < syncEpoch) return null;
    if (robot?.robots) {
      robotStateByRoom.set(roomId, robot);
      if (ingestRobotState(roomId, robot, 'details', epoch)) return 'md-robot';
    }

    const ttt = await getState(roomId, EVENT_TTT);
    if (epoch < syncEpoch) return null;
    if (ttt && (ttt.players || ttt.kind)) {
      tttStateByRoom.set(roomId, ttt);
      let turnInfo = { status: ttt.status || 'waiting' };
      if (ttt.players?.O || ttt.status === 'playing') {
        const events = await getGameEvents(roomId, EVENT_TTT);
        if (epoch < syncEpoch) return null;
        tttEventsByRoom.set(roomId, events);
        turnInfo = tttTurnFromEvents(events, ttt.players);
      }
      if (ingestTttState(roomId, ttt, 'details', turnInfo, epoch)) return 'tic-tac-too';
    }

    const rally = await getState(roomId, EVENT_RALLY);
    if (epoch < syncEpoch) return null;
    if (rally && (rally.seats || rally.kind)) {
      upsertRoom(roomId, {
        game: 'robotrally',
        status: rally.status || 'lobby',
        hostId: rally.hostId || rally.seats?.[0]?.userId,
        hostName: rally.seats?.[0]?.name || shortId(rally.hostId),
        maxPlayers: 4,
        players: (rally.seats || []).length,
        actionKind: rally.status === 'lobby' ? 'wait_join' : 'other',
        actionLabel: statusLabel(rally.status),
        stateRev: stateRevFromContent(rally),
        fetchedAt: Date.now()
      }, { source: 'details', epoch });
      return 'robotrally';
    }

    return rooms.get(roomId)?.game || null;
  }

  async function syncOnceNow(timeout = 0) {
    session = loadSession();
    if (!session) return null;
    const epoch = syncEpoch;
    const data = await matrixSync({ timeout });
    if (epoch < syncEpoch) return data;
    applySyncPayload(data, epoch);
    return data;
  }

  function interruptSyncPoll() {
    try { syncController?.abort(); } catch { /* ignore */ }
  }

  async function runSyncLoop() {
    while (syncLoopOn) {
      session = loadSession();
      if (!session) break;

      const controller = new AbortController();
      syncController = controller;
      try {
        const timeout = syncSince ? SYNC_TIMEOUT_MS : 0;
        const data = await matrixSync({
          timeout,
          signal: controller.signal
        });
        if (!syncLoopOn) break;
        syncFailStreak = 0;
        applySyncPayload(data, syncEpoch);
        setConnStatus(`Verbonden · ${session.displayName || shortId(session.userId)}`);
      } catch (err) {
        if (!syncLoopOn) break;
        if (err?.name === 'AbortError') {
          continue;
        }
        if (MatrixClient?.isAuthError?.(err) || err?.status === 401) {
          const refreshed = typeof MatrixAuth?.refreshAccessToken === 'function'
            ? await MatrixAuth.refreshAccessToken(session)
            : null;
          if (refreshed) {
            session = refreshed;
            continue;
          }
          updateSyncStatus('Sessie verlopen — log opnieuw in.');
          setConnStatus('Sessie verlopen');
          break;
        }
        syncFailStreak += 1;
        const backoff = Math.min(SYNC_BACKOFF_MAX_MS, SYNC_RETRY_MS * (2 ** Math.min(syncFailStreak, 4)));
        updateSyncStatus(`Matrix /sync even weg — opnieuw over ${Math.round(backoff / 1000)}s…`);
        setConnStatus('Opnieuw verbinden…');
        await sleep(backoff);
      }
    }
  }

  function startSyncLoop() {
    if (syncLoopOn) {
      interruptSyncPoll();
      return;
    }
    syncLoopOn = true;
    syncLoopPromise = runSyncLoop().finally(() => {
      syncLoopPromise = null;
    });
  }

  async function refreshRoomDetails(target = 'all') {
    session = loadSession();
    if (!session) return;

    if (target !== 'all') {
      const kind = await probeRoom(target, syncEpoch);
      if (kind) {
        lastDetailsAt = Date.now();
        updateSyncStatus('Room bijgewerkt.');
      } else {
        updateSyncStatus('Room niet bereikbaar — vorige stand blijft staan.');
      }
      renderLists();
      interruptSyncPoll();
      return kind;
    }

    if (refreshAllPromise) return refreshAllPromise;

    refreshAllPromise = (async () => {
      syncEpoch += 1;
      if (el.createStatus) el.createStatus.textContent = 'Live sync met Matrix…';
      updateSyncStatus('Bezig met /sync (Element-stijl)…');

      for (const [roomId, meta] of ownedIds.entries()) {
        if (!rooms.has(roomId)) {
          upsertRoom(roomId, {
            game: meta.game,
            hostId: meta.hostId || session.userId,
            hostName: hubName(),
            status: 'laden…'
          }, { source: 'identity' });
        }
      }

      try {
        // Owned probe + joined_rooms bootstrap + /sync
        const ownedList = [...ownedIds.keys()];
        await Promise.all(ownedList.map((id) => probeRoom(id, syncEpoch).catch(() => null)));
        await bootstrapJoinedRooms(syncEpoch);
        interruptSyncPoll();
        await syncOnceNow(0);
        lastDetailsAt = Date.now();
        const n = [...rooms.values()].filter((r) => r.detail).length;
        if (el.createStatus) {
          el.createStatus.textContent = n
            ? `${n} room${n === 1 ? '' : 's'} live via Matrix /sync`
            : 'Nog geen MD-rooms. Maak er hierboven een aan of accepteer een uitnodiging.';
        }
        updateSyncStatus('Live verbonden met Matrix (/sync).');
        setConnStatus(`Verbonden · ${session.displayName || shortId(session.userId)}`);
      } catch (err) {
        if (el.createStatus) {
          el.createStatus.textContent = err.message || 'Sync mislukt — vorige stand blijft zichtbaar.';
        }
        updateSyncStatus('Sync mislukt — cache blijft staan. Opnieuw proberen…');
        setConnStatus('Verbinding mislukt');
        interruptSyncPoll();
      }
      renderLists();
      startSyncLoop();
    })();

    try {
      await refreshAllPromise;
    } finally {
      refreshAllPromise = null;
    }
  }

  async function createGameRoom(game) {
    if (typeof MdCreate?.createForGame !== 'function') {
      throw new Error('md-create.js niet geladen.');
    }
    return MdCreate.createForGame(session, game, Number(el.createPlayers?.value || 2), {
      boardId: el.createBoard?.value || 'easy'
    });
  }

  async function openBeheer(roomId) {
    const item = rooms.get(roomId) || ownedIds.get(roomId);
    if (!item && !ownedIds.has(roomId)) return;
    beheerRoomId = roomId;
    beheerGame = item?.game || ownedIds.get(roomId)?.game || 'md-robot';
    if (el.beheerTitle) el.beheerTitle.textContent = `Spel beheren · ${gameTitle(beheerGame)}`;
    if (el.beheerStatus) el.beheerStatus.textContent = 'Laden…';
    if (el.beheerReady) el.beheerReady.hidden = true;
    if (el.adminShare) el.adminShare.textContent = 'Kopieer link';
    el.beheerOverlay?.classList.remove('hidden');
    el.beheerOverlay?.setAttribute('aria-hidden', 'false');

    try {
      // Always fresh from Matrix when opening Beheer
      await refreshRoomDetails(roomId);
      if (beheerGame === 'md-robot') {
        beheerState = await getState(roomId, EVENT_ROBOT);
        if (!beheerState) throw new Error('Spel-state niet gevonden.');
        el.adminRobotFields?.classList.remove('hidden');
        const s = MdRobotEngine.getSettings(beheerState);
        if (el.adminPlayers) el.adminPlayers.value = String(s.maxPlayers);
        if (el.adminBoard) el.adminBoard.value = s.boardId || 'easy';
        if (el.adminPush) el.adminPush.checked = !!s.pushEnabled;
        if (el.adminAutostart) el.adminAutostart.checked = !!s.autoStart;
        if (el.adminToLobby) el.adminToLobby.hidden = beheerState.status === 'lobby';
        const n = (beheerState.robots || []).length;
        if (el.beheerStatus) {
          el.beheerStatus.textContent = `${statusLabel(beheerState.status)} · ${playersLabel({ players: n, maxPlayers: s.maxPlayers, detail: true })} · ${rulesLabel(beheerState)}`;
        }
      } else if (beheerGame === 'robotrally') {
        beheerState = await getState(roomId, EVENT_RALLY);
        el.adminRobotFields?.classList.add('hidden');
        if (el.adminToLobby) el.adminToLobby.hidden = true;
        const n = (beheerState?.seats || []).length;
        if (el.beheerStatus) {
          el.beheerStatus.textContent = `${statusLabel(beheerState?.status)} · ${playersLabel({ players: n, maxPlayers: 4, detail: true })}`;
        }
      } else {
        beheerState = await getState(roomId, EVENT_TTT);
        el.adminRobotFields?.classList.add('hidden');
        if (el.adminToLobby) el.adminToLobby.hidden = true;
        const n = [beheerState?.players?.X, beheerState?.players?.O].filter(Boolean).length;
        if (el.beheerStatus) {
          el.beheerStatus.textContent = `${statusLabel(beheerState?.status)} · ${playersLabel({ players: n, maxPlayers: 2, detail: true })}`;
        }
      }
      renderBeheerPlayers(beheerState, beheerGame);
      const invite = {
        roomId,
        game: beheerGame,
        minPlayers: beheerState?.settings?.maxPlayers || beheerState?.maxPlayers || 2
      };
      if (el.shareLink) el.shareLink.value = InviteShare.buildInviteUrl(invite);
      if (typeof MdContacts?.fillBeheerSelect === 'function') MdContacts.fillBeheerSelect();
      await loadBeheerChat(roomId);
    } catch (err) {
      if (el.beheerStatus) el.beheerStatus.textContent = err.message || 'Beheer laden mislukt';
    }
  }

  function closeBeheer() {
    beheerRoomId = null;
    beheerGame = null;
    beheerState = null;
    el.beheerOverlay?.classList.add('hidden');
    el.beheerOverlay?.setAttribute('aria-hidden', 'true');
  }

  async function saveBeheer() {
    if (!beheerRoomId || beheerGame !== 'md-robot' || busy) return;
    if (!beheerState) return;
    if (beheerState.status && beheerState.status !== 'lobby') {
      if (el.beheerStatus) el.beheerStatus.textContent = 'Eerst terug naar lobby om regels te wijzigen.';
      return;
    }
    busy = true;
    try {
      if (!beheerState.hostId) beheerState.hostId = session.userId;
      beheerState = MdRobotEngine.updateSettings(beheerState, {
        maxPlayers: Number(el.adminPlayers?.value || 2),
        boardId: el.adminBoard?.value || 'easy',
        pushEnabled: !!el.adminPush?.checked,
        autoStart: !!el.adminAutostart?.checked
      });
      // Optimistic: lobby meteen bijwerken zodat trage Matrix geen oude stand terugzet
      ingestRobotState(beheerRoomId, beheerState, 'mutation', syncEpoch);
      await putState(beheerRoomId, EVENT_ROBOT, beheerState);
      await sendEvent(beheerRoomId, EVENT_ROBOT, { op: 'settings', settings: beheerState.settings });

      const confirmed = await getState(beheerRoomId, EVENT_ROBOT);
      if (confirmed) {
        beheerState = confirmed;
        ingestRobotState(beheerRoomId, confirmed, 'mutation', syncEpoch);
      }
      lastDetailsAt = Date.now();

      const s = MdRobotEngine.getSettings(beheerState);
      const n = (beheerState.robots || []).length;
      if (el.beheerStatus) {
        el.beheerStatus.textContent = confirmed
          ? `Opgeslagen · ${playersLabel({ players: n, maxPlayers: s.maxPlayers, detail: true })}`
          : `Opgeslagen (Matrix bevestiging traag) · ${playersLabel({ players: n, maxPlayers: s.maxPlayers, detail: true })}`;
      }
      if (el.shareLink) {
        el.shareLink.value = InviteShare.buildInviteUrl({
          roomId: beheerRoomId,
          game: 'md-robot',
          minPlayers: s.maxPlayers
        });
      }
      updateSyncStatus(confirmed ? 'Beheer-wijziging bevestigd.' : 'Opgeslagen — bevestiging volgt.');
    } catch (err) {
      if (el.beheerStatus) el.beheerStatus.textContent = err.message || 'Opslaan mislukt';
    } finally {
      busy = false;
    }
  }

  async function beheerToLobby() {
    if (!beheerRoomId || beheerGame !== 'md-robot' || !beheerState || busy) return;
    busy = true;
    try {
      beheerState = MdRobotEngine.returnToLobby(beheerState);
      await putState(beheerRoomId, EVENT_ROBOT, beheerState);
      await sendEvent(beheerRoomId, EVENT_ROBOT, { op: 'to_lobby' });
      const confirmed = await getState(beheerRoomId, EVENT_ROBOT);
      if (confirmed) {
        beheerState = confirmed;
        ingestRobotState(beheerRoomId, confirmed, 'mutation');
        lastDetailsAt = Date.now();
      }
      if (el.adminToLobby) el.adminToLobby.hidden = true;
      if (el.beheerStatus) el.beheerStatus.textContent = 'Terug in lobby — bevestigd door Matrix. Pas nu regels aan.';
      if (el.adminPlayers && beheerState) {
        const s = MdRobotEngine.getSettings(beheerState);
        el.adminPlayers.value = String(s.maxPlayers);
        if (el.adminBoard) el.adminBoard.value = s.boardId || 'easy';
        el.adminPush.checked = !!s.pushEnabled;
      }
      updateSyncStatus();
    } catch (err) {
      if (el.beheerStatus) el.beheerStatus.textContent = err.message || 'Terug naar lobby mislukt';
    } finally {
      busy = false;
    }
  }

  function updateCreateForm() {
    const game = el.createGame?.value || 'md-robot';
    el.createPlayersWrap?.classList.toggle('hidden', game !== 'md-robot');
    el.createBoardWrap?.classList.toggle('hidden', game !== 'md-robot');
  }

  async function createAndInvite(userId, game = 'md-robot') {
    if (!session) throw new Error('Niet ingelogd.');
    const created = await createGameRoom(game);
    rememberOwned(created.roomId, created.game, session.userId);
    await publishBoardListing(created);
    await MatrixClient.inviteUser(session, created.roomId, userId);
    const minPlayers = created.state?.settings?.maxPlayers || created.state?.maxPlayers || 2;
    try {
      const link = InviteShare.buildInviteUrl({
        roomId: created.roomId,
        game: created.game,
        minPlayers
      });
      await MatrixClient.sendTextMessage(
        session,
        created.roomId,
        `Welkom! Join via ${link}`
      );
    } catch { /* ignore */ }
    if (typeof MdContacts?.notifyFriend === 'function') {
      try {
        await MdContacts.notifyFriend(userId, {
          game: created.game,
          roomId: created.roomId,
          minPlayers
        });
      } catch { /* DM optioneel */ }
    }
    await refreshRoomDetails(created.roomId);
    openGame(created.roomId, created.game);
    return created;
  }

  async function onPlayWithFriend() {
    if (!session || busy) return;
    const userId = el.playFriend?.value;
    const game = el.playGame?.value || 'md-robot';
    if (!userId) {
      if (el.createStatus) el.createStatus.textContent = 'Kies eerst een vriend (of voeg er een toe).';
      return;
    }
    busy = true;
    if (el.playFriendBtn) el.playFriendBtn.disabled = true;
    if (el.createStatus) el.createStatus.textContent = 'Spel maken en uitnodigen…';
    try {
      // Align max players with create form for MD-robot
      if (game === 'md-robot' && el.createGame) el.createGame.value = game;
      await createAndInvite(userId, game);
    } catch (err) {
      if (el.createStatus) el.createStatus.textContent = err.message || 'Uitnodigen mislukt';
    } finally {
      busy = false;
      if (el.playFriendBtn) el.playFriendBtn.disabled = false;
    }
  }

  async function onCreate() {
    if (!session || busy) return;
    busy = true;
    if (el.createBtn) el.createBtn.disabled = true;
    if (el.createStatus) el.createStatus.textContent = 'Spel aanmaken…';
    try {
      const game = el.createGame?.value || 'md-robot';
      const created = await createGameRoom(game);
      rememberOwned(created.roomId, created.game, session.userId);
      await publishBoardListing(created);
      await refreshRoomDetails(created.roomId);
      if (el.createStatus) {
        el.createStatus.textContent = 'Spel aangemaakt — deel de link of nodig een vriend uit.';
      }
      openBeheer(created.roomId);
    } catch (err) {
      if (el.createStatus) el.createStatus.textContent = err.message || 'Aanmaken mislukt';
    } finally {
      busy = false;
      if (el.createBtn) el.createBtn.disabled = false;
    }
  }

  function stop() {
    syncLoopOn = false;
    interruptSyncPoll();
  }

  async function start() {
    session = loadSession();
    if (!session) return;
    if (startPromise) return startPromise;

    startPromise = (async () => {
      if (el.section) el.section.hidden = false;
      const hint = document.getElementById('matrix-login-hint');
      if (hint) hint.hidden = true;
      updateCreateForm();
      setConnStatus(`Verbonden · ${session.displayName || shortId(session.userId)}`);

      if (session?.userId && typeof MatrixClient?.getPersistedSince === 'function') {
        syncSince = MatrixClient.getPersistedSince(session.userId) || syncSince;
      }
      try {
        if (typeof MatrixClient?.ensureFilterId === 'function') {
          await MatrixClient.ensureFilterId(session);
        }
      } catch { /* filter fallback inline */ }

      await loadOwnedFromAccountData();
      if (typeof MdContacts?.start === 'function') {
        await MdContacts.start(session);
      }
      if (typeof MdBoard?.start === 'function') {
        await MdBoard.start(session);
      }

      for (const [roomId, meta] of ownedIds.entries()) {
        upsertRoom(roomId, {
          game: meta.game,
          hostId: meta.hostId || session.userId,
          hostName: hubName(),
          status: 'onbekend'
        }, { source: 'identity' });
      }
      renderLists();
      renderInvites();
      stop();
      await refreshRoomDetails('all');
    })();

    try {
      await startPromise;
    } finally {
      startPromise = null;
    }
  }

  function init() {
    el.createGame?.addEventListener('change', updateCreateForm);
    el.createBtn?.addEventListener('click', onCreate);
    el.playFriendBtn?.addEventListener('click', onPlayWithFriend);
    el.refreshBtn?.addEventListener('click', () => {
      refreshRoomDetails('all');
      if (typeof MdBoard?.refresh === 'function') MdBoard.refresh();
    });
    el.beheerClose?.addEventListener('click', closeBeheer);
    el.adminSave?.addEventListener('click', saveBeheer);
    el.adminToLobby?.addEventListener('click', beheerToLobby);
    el.adminInviteBtn?.addEventListener('click', inviteContactToBeheer);
    el.chatSend?.addEventListener('click', sendBeheerChat);
    el.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendBeheerChat();
      }
    });
    el.adminOpen?.addEventListener('click', () => {
      if (beheerRoomId) openGame(beheerRoomId, beheerGame);
    });
    el.adminShare?.addEventListener('click', async () => {
      if (!beheerRoomId || !el.shareLink?.value) return;
      const btn = el.adminShare;
      const prev = btn?.textContent || 'Kopieer link';
      try {
        await navigator.clipboard?.writeText(el.shareLink.value);
        if (btn) btn.textContent = 'Gekopieerd ✓';
        if (el.beheerStatus) el.beheerStatus.textContent = 'Link gekopieerd';
        setTimeout(() => {
          if (btn) btn.textContent = prev;
        }, 2000);
      } catch {
        el.shareLink.select();
      }
    });
    el.adminWhatsapp?.addEventListener('click', () => {
      if (!beheerRoomId || typeof InviteShare === 'undefined') return;
      const minPlayers = beheerState?.settings?.maxPlayers || beheerState?.maxPlayers || 2;
      InviteShare.shareWhatsApp({
        roomId: beheerRoomId,
        game: beheerGame || 'md-robot',
        minPlayers
      });
      if (el.beheerStatus) el.beheerStatus.textContent = 'WhatsApp geopend — stuur de uitnodiging';
    });

    try {
      const legacy = localStorage.getItem('d-games-mdrobot-owned');
      if (legacy) {
        const list = JSON.parse(legacy);
        if (Array.isArray(list)) {
          list.forEach((id) => rememberOwned(id, 'md-robot', session?.userId));
        }
        localStorage.removeItem('d-games-mdrobot-owned');
      }
    } catch { /* ignore */ }

    saveOwned();

    const prevHook = window.onMatrixLoginSuccess;
    window.onMatrixLoginSuccess = function (sess) {
      if (typeof prevHook === 'function') prevHook(sess);
      start();
    };

    // Session restore UI is owned by MatrixAuth — wait for validated start from there
    // (avoid racing a start before validateSession). Still allow direct start if already logged in
    // after auth init; MatrixAuth calls MdLobby.start when valid.
  }

  window.MdLobby = {
    start,
    stop,
    openBeheer,
    openGame,
    refreshRoomDetails,
    createAndInvite
  };
  init();
})();
