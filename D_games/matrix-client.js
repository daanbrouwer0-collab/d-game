/**
 * Shared Matrix Client-Server helpers (Element-achtige best practices).
 * @see https://spec.matrix.org/v1.11/client-server-api/
 *
 * - Rate-limit: respecteer retry_after_ms / 429
 * - 401 → één refresh + retry via MatrixAuth
 * - Filter upload + reuse (kortere /sync URLs)
 * - since/next_batch per user bewaren
 * - txnId stabiel bij retries (idempotent send)
 * - set_presence: offline (geen presence-spam)
 * - HTML escape voor Matrix-gestuurde strings
 */
(function () {
  const SESSION_KEY = 'd-games-matrix-session';
  const SYNC_META_PREFIX = 'd-games-matrix-sync:';
  const OWNED_ACCOUNT_DATA = 'com.d5games.md.owned_rooms';
  const CONTACTS_ACCOUNT_DATA = 'com.d5games.contacts';
  const GAME_EVENT_TYPES = [
    'com.d5games.mdrobot',
    'com.d5games.tictactoe',
    'com.d5games.robotrally',
    'com.d5games.listing'
  ];
  const FILTER_VERSION = 3; // bump when buildGameFilter shape changes
  const MAX_RATE_RETRIES = 4;
  const DEFAULT_RETRY_MS = 2000;
  const MAX_RETRY_MS = 30000;

  function loadSession() {
    if (typeof MatrixAuth?.loadSession === 'function') {
      return MatrixAuth.loadSession();
    }
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.accessToken || !data?.userId || !data?.baseUrl) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    if (!session) return;
    if (typeof MatrixAuth?.saveSession === 'function') {
      MatrixAuth.saveSession(session);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function syncMetaKey(userId) {
    return `${SYNC_META_PREFIX}${userId || 'anon'}`;
  }

  function loadSyncMeta(userId) {
    try {
      const raw = localStorage.getItem(syncMetaKey(userId));
      if (!raw) return { since: null, filterId: null };
      const data = JSON.parse(raw);
      if (data?.filterVersion !== FILTER_VERSION) {
        return { since: data?.since || null, filterId: null };
      }
      return {
        since: data?.since || null,
        filterId: data?.filterId || null
      };
    } catch {
      return { since: null, filterId: null };
    }
  }

  function saveSyncMeta(userId, meta) {
    try {
      localStorage.setItem(syncMetaKey(userId), JSON.stringify({
        since: meta?.since || null,
        filterId: meta?.filterId || null,
        filterVersion: FILTER_VERSION,
        savedAt: Date.now()
      }));
    } catch { /* ignore */ }
  }

  function clearSyncMeta(userId) {
    try {
      localStorage.removeItem(syncMetaKey(userId));
    } catch { /* ignore */ }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function makeTxnId(prefix = 'd5') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function retryDelayMs(data, res, attempt) {
    const fromBody = Number(data?.retry_after_ms);
    if (Number.isFinite(fromBody) && fromBody >= 0) {
      return Math.min(MAX_RETRY_MS, fromBody);
    }
    const header = res?.headers?.get?.('Retry-After');
    if (header) {
      const asNum = Number(header);
      if (Number.isFinite(asNum) && asNum >= 0) {
        return Math.min(MAX_RETRY_MS, asNum * (asNum < 100 ? 1000 : 1));
      }
    }
    return Math.min(MAX_RETRY_MS, DEFAULT_RETRY_MS * (attempt + 1));
  }

  function isAuthError(err) {
    return err?.status === 401 || err?.errcode === 'M_UNKNOWN_TOKEN';
  }

  function buildGameFilter() {
    return {
      presence: { types: [] },
      account_data: {
        types: [OWNED_ACCOUNT_DATA, CONTACTS_ACCOUNT_DATA, 'm.direct']
      },
      room: {
        ephemeral: { types: [] },
        account_data: { types: [] },
        state: {
          lazy_load_members: true,
          types: GAME_EVENT_TYPES.slice()
        },
        timeline: {
          limit: 50,
          types: [...GAME_EVENT_TYPES, 'm.room.message']
        }
      }
    };
  }

  async function resolveSession(session) {
    let current = session;
    if (typeof MatrixAuth?.ensureFreshSession === 'function') {
      const fresh = await MatrixAuth.ensureFreshSession(current);
      if (fresh) {
        Object.assign(current, fresh);
      }
    }
    return current;
  }

  /**
   * Matrix HTTP met M_LIMIT_EXCEEDED / 429 backoff en 401→refresh→retry.
   * @param {object} session
   * @param {string} path
   * @param {{ method?: string, body?: any, query?: object, signal?: AbortSignal, retries?: number, _retriedAuth?: boolean }} opts
   */
  async function api(session, path, opts = {}) {
    const {
      method = 'GET',
      body,
      query,
      signal,
      retries = MAX_RATE_RETRIES,
      _retriedAuth = false
    } = opts;

    if (!session?.accessToken || !session?.baseUrl) {
      throw new Error('Geen Matrix-sessie.');
    }

    await resolveSession(session);

    let url = `${session.baseUrl}${path}`;
    if (query) {
      url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${session.accessToken}`
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        if (attempt >= retries) throw err;
        await sleep(retryDelayMs(null, null, attempt));
        continue;
      }

      let data = null;
      try { data = await res.json(); } catch { data = null; }

      if (res.ok) return data;

      const errcode = data?.errcode || '';
      const isRate = res.status === 429 || errcode === 'M_LIMIT_EXCEEDED';
      if (isRate && attempt < retries) {
        await sleep(retryDelayMs(data, res, attempt));
        continue;
      }

      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.errcode = errcode;
      err.retry_after_ms = data?.retry_after_ms;
      err.soft_logout = data?.soft_logout;

      if (isAuthError(err) && !_retriedAuth && typeof MatrixAuth?.refreshAccessToken === 'function') {
        const refreshed = await MatrixAuth.refreshAccessToken(session);
        if (refreshed?.accessToken) {
          Object.assign(session, refreshed);
          return api(session, path, { ...opts, _retriedAuth: true });
        }
      }

      throw err;
    }

    throw new Error('Matrix request mislukt.');
  }

  async function ensureFilterId(session) {
    if (!session) return null;
    const meta = loadSyncMeta(session.userId);
    if (!meta.filterId) {
      session.filterId = null;
    } else {
      session.filterId = meta.filterId;
      return meta.filterId;
    }
    if (session.filterId) {
      saveSyncMeta(session.userId, { since: meta.since, filterId: session.filterId });
      return session.filterId;
    }

    const created = await api(
      session,
      `/_matrix/client/v3/user/${encodeURIComponent(session.userId)}/filter`,
      { method: 'POST', body: buildGameFilter() }
    );
    const filterId = created?.filter_id;
    if (!filterId) return null;
    session.filterId = filterId;
    saveSession(session);
    saveSyncMeta(session.userId, { since: meta.since, filterId });
    return filterId;
  }

  let syncHttpChain = Promise.resolve();

  function withSyncHttp(fn) {
    const next = syncHttpChain.then(fn, fn);
    syncHttpChain = next.catch(() => {});
    return next;
  }

  /**
   * Gefilterde /sync (één tegelijk per tab).
   * @returns {Promise<object>}
   */
  async function sync(session, {
    since = undefined,
    timeout = 0,
    signal = undefined,
    setPresence = 'offline',
    persistSince = true
  } = {}) {
    return withSyncHttp(async () => {
      const meta = loadSyncMeta(session.userId);
      const useSince = since !== undefined ? since : meta.since;
      const filterId = await ensureFilterId(session);

      const query = {
        timeout: String(timeout),
        set_presence: setPresence
      };
      if (useSince) query.since = useSince;
      if (filterId) query.filter = filterId;
      else query.filter = JSON.stringify(buildGameFilter());

      const data = await api(session, '/_matrix/client/v3/sync', { query, signal });
      if (persistSince && data?.next_batch) {
        saveSyncMeta(session.userId, {
          since: data.next_batch,
          filterId: session.filterId || meta.filterId || null
        });
      }
      return data;
    });
  }

  async function sendEvent(session, roomId, eventType, content, { txnId = null, signal } = {}) {
    const id = txnId || makeTxnId('send');
    return api(
      session,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${eventType}/${encodeURIComponent(id)}`,
      { method: 'PUT', body: content, signal }
    );
  }

  async function putState(session, roomId, eventType, content, { signal } = {}) {
    return api(
      session,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${eventType}/`,
      { method: 'PUT', body: content, signal }
    );
  }

  async function getState(session, roomId, eventType, { signal } = {}) {
    try {
      return await api(
        session,
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${eventType}`,
        { signal }
      );
    } catch (err) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async function getJoinedRooms(session) {
    const data = await api(session, '/_matrix/client/v3/joined_rooms');
    return Array.isArray(data?.joined_rooms) ? data.joined_rooms : [];
  }

  async function joinRoom(session, roomId) {
    return api(session, `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
      method: 'POST',
      body: {}
    });
  }

  async function leaveRoom(session, roomId) {
    return api(session, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: 'POST',
      body: {}
    });
  }

  async function inviteUser(session, roomId, userId) {
    return api(session, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
      method: 'POST',
      body: { user_id: userId }
    });
  }

  async function getAccountData(session, type) {
    try {
      return await api(
        session,
        `/_matrix/client/v3/user/${encodeURIComponent(session.userId)}/account_data/${encodeURIComponent(type)}`
      );
    } catch (err) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async function putAccountData(session, type, content) {
    return api(
      session,
      `/_matrix/client/v3/user/${encodeURIComponent(session.userId)}/account_data/${encodeURIComponent(type)}`,
      { method: 'PUT', body: content || {} }
    );
  }

  async function getProfile(session, userId) {
    return api(session, `/_matrix/client/v3/profile/${encodeURIComponent(userId)}`);
  }

  async function getMessages(session, roomId, { limit = 30, dir = 'b', from } = {}) {
    const query = { dir, limit: String(limit) };
    if (from) query.from = from;
    return api(
      session,
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`,
      { query }
    );
  }

  async function sendTextMessage(session, roomId, body) {
    return sendEvent(session, roomId, 'm.room.message', {
      msgtype: 'm.text',
      body: String(body || '')
    });
  }

  /** Zoek of maak een 1:1 DM met userId (m.direct). */
  async function ensureDirectRoom(session, userId) {
    if (!session || !userId) throw new Error('Geen gebruiker.');
    let direct = {};
    try {
      direct = (await getAccountData(session, 'm.direct')) || {};
    } catch {
      direct = {};
    }
    const existing = direct[userId];
    if (Array.isArray(existing)) {
      for (const roomId of existing) {
        if (!roomId) continue;
        try {
          // Lichte check: room state ophalen lukt als we lid zijn
          await api(session, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`);
          return roomId;
        } catch { /* probeer volgende of nieuw */ }
      }
    }

    const created = await api(session, '/_matrix/client/v3/createRoom', {
      method: 'POST',
      body: {
        invite: [userId],
        is_direct: true,
        preset: 'trusted_private_chat'
      }
    });
    const roomId = created?.room_id;
    if (!roomId) throw new Error('DM aanmaken mislukt.');

    const next = { ...direct };
    const list = Array.isArray(next[userId]) ? next[userId].slice() : [];
    if (!list.includes(roomId)) list.unshift(roomId);
    next[userId] = list;
    try {
      await putAccountData(session, 'm.direct', next);
    } catch { /* optional */ }
    return roomId;
  }

  async function sendDirectMessage(session, userId, body) {
    const roomId = await ensureDirectRoom(session, userId);
    await sendTextMessage(session, roomId, body);
    return roomId;
  }

  function getPersistedSince(userId) {
    return loadSyncMeta(userId).since;
  }

  function setPersistedSince(userId, since) {
    const meta = loadSyncMeta(userId);
    saveSyncMeta(userId, { ...meta, since });
  }

  /** Hub character display name (correct storage key). */
  function hubCharacterName(fallback = '') {
    try {
      const raw = localStorage.getItem('d-games-hub-character');
      const data = raw ? JSON.parse(raw) : null;
      const name = (data?.name || '').trim();
      if (name) return name;
    } catch { /* ignore */ }
    return fallback || '';
  }

  function shortId(userId) {
    if (!userId) return '—';
    const m = String(userId).match(/^@([^:]+):/);
    return m ? m[1] : String(userId);
  }

  window.MatrixClient = {
    GAME_EVENT_TYPES,
    OWNED_ACCOUNT_DATA,
    CONTACTS_ACCOUNT_DATA,
    loadSession,
    saveSession,
    api,
    sync,
    sendEvent,
    putState,
    getState,
    getJoinedRooms,
    joinRoom,
    leaveRoom,
    inviteUser,
    getAccountData,
    putAccountData,
    getProfile,
    getMessages,
    sendTextMessage,
    ensureDirectRoom,
    sendDirectMessage,
    ensureFilterId,
    buildGameFilter,
    makeTxnId,
    escapeHtml,
    shortId,
    loadSyncMeta,
    saveSyncMeta,
    clearSyncMeta,
    getPersistedSince,
    setPersistedSince,
    hubCharacterName,
    sleep,
    isAuthError
  };
})();
