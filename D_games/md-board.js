/**
 * Prikbord via public Matrix room #d-game:matrix.org
 * Listings = timeline events com.d5games.listing (open/update/close).
 */
(function () {
  const HUB_ALIAS = '#d-game:matrix.org';
  const LISTING_TYPE = 'com.d5games.listing';
  const LISTING_KIND = 'com.d5games.listing.v1';
  const HISTORY_LIMIT = 80;
  const STALE_MS = 6 * 60 * 60 * 1000; // verberg listings ouder dan 6 uur

  let session = null;
  let hubRoomId = null;
  /** @type {Map<string, object>} gameRoomId -> listing */
  let listings = new Map();

  const el = {
    panel: document.getElementById('md-board-panel'),
    list: document.getElementById('md-board-list'),
    empty: document.getElementById('md-board-empty'),
    status: document.getElementById('md-board-status'),
    refresh: document.getElementById('md-board-refresh')
  };

  function escapeHtml(value) {
    if (typeof MatrixClient?.escapeHtml === 'function') return MatrixClient.escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortId(userId) {
    const m = String(userId || '').match(/^@([^:]+):/);
    return m ? m[1] : (userId || '—');
  }

  function gameTitle(game) {
    return InviteShare?.GAME_TITLES?.[game] || game || 'Game';
  }

  function setStatus(msg) {
    if (el.status) el.status.textContent = msg || '';
  }

  async function resolveHubRoomId() {
    if (hubRoomId) return hubRoomId;
    const data = await MatrixClient.api(
      session,
      `/_matrix/client/v3/directory/room/${encodeURIComponent(HUB_ALIAS)}`
    );
    if (!data?.room_id) throw new Error('Open games niet gevonden.');
    hubRoomId = data.room_id;
    return hubRoomId;
  }

  async function ensureJoined() {
    if (!session) throw new Error('Niet ingelogd.');
    const roomId = await resolveHubRoomId();
    try {
      await MatrixClient.joinRoom(session, HUB_ALIAS);
    } catch (err) {
      // Al lid, of join via room id
      if (err?.status !== 403) {
        try {
          await MatrixClient.joinRoom(session, roomId);
        } catch (err2) {
          if (err2?.errcode !== 'M_FORBIDDEN' && err2?.status !== 403) {
            // "Already joined" variants — doorzetten
            const msg = String(err2?.message || '');
            if (!/already|joined/i.test(msg) && err2?.status !== 400) {
              throw err2;
            }
          }
        }
      }
    }
    return roomId;
  }

  function applyListingEvent(ev) {
    if (!ev || ev.type !== LISTING_TYPE) return false;
    const c = ev.content || {};
    if (c.kind && c.kind !== LISTING_KIND) return false;
    const gameRoomId = c.roomId || c.gameRoomId;
    if (!gameRoomId) return false;

    if (c.op === 'close' || c.status === 'closed') {
      listings.delete(gameRoomId);
      return true;
    }

    if (c.op === 'open' || c.op === 'update' || c.status === 'open' || !c.op) {
      const prev = listings.get(gameRoomId) || {};
      const updatedAt = Number(c.updatedAt) || Date.now();
      // Nieuwere listing wint
      if (prev.updatedAt && updatedAt < prev.updatedAt) return false;
      listings.set(gameRoomId, {
        roomId: gameRoomId,
        game: c.game || prev.game || 'md-robot',
        hostId: c.hostId || prev.hostId || ev.sender,
        hostName: c.hostName || prev.hostName || shortId(c.hostId || ev.sender),
        players: Number(c.players) || prev.players || 1,
        maxPlayers: Number(c.maxPlayers) || prev.maxPlayers || 2,
        status: 'open',
        updatedAt,
        eventId: ev.event_id || prev.eventId || null
      });
      return true;
    }
    return false;
  }

  function pruneStale() {
    const now = Date.now();
    for (const [id, item] of listings.entries()) {
      if (item.updatedAt && now - item.updatedAt > STALE_MS) {
        listings.delete(id);
      }
    }
  }

  async function loadHistory() {
    if (!session || !hubRoomId) return;
    const data = await MatrixClient.getMessages(session, hubRoomId, {
      limit: HISTORY_LIMIT,
      dir: 'b'
    });
    const chunk = Array.isArray(data?.chunk) ? data.chunk.slice() : [];
    // Oud → nieuw toepassen
    chunk.reverse();
    for (const ev of chunk) applyListingEvent(ev);
    pruneStale();
    render();
  }

  function applySyncRoomData(roomData) {
    if (!hubRoomId || !roomData) return;
    const timeline = roomData.timeline?.events || [];
    let changed = false;
    for (const ev of timeline) {
      if (applyListingEvent(ev)) changed = true;
    }
    if (changed) {
      pruneStale();
      render();
    }
  }

  function handleSyncPayload(data) {
    if (!hubRoomId || !data?.rooms?.join) return;
    const roomData = data.rooms.join[hubRoomId];
    if (roomData) applySyncRoomData(roomData);
  }

  async function postListing({
    roomId,
    game,
    hostId,
    hostName,
    players = 1,
    maxPlayers = 2,
    op = 'open'
  }) {
    if (!session) return;
    const hub = await ensureJoined();
    const inviteUrl = typeof InviteShare?.buildInviteUrl === 'function'
      ? InviteShare.buildInviteUrl({ roomId, game, minPlayers: maxPlayers })
      : '';
    const content = {
      kind: LISTING_KIND,
      op,
      status: op === 'close' ? 'closed' : 'open',
      roomId,
      game,
      hostId: hostId || session.userId,
      hostName: hostName || shortId(session.userId),
      players,
      maxPlayers,
      inviteUrl,
      updatedAt: Date.now()
    };
    await MatrixClient.sendEvent(session, hub, LISTING_TYPE, content);
    applyListingEvent({ type: LISTING_TYPE, sender: session.userId, content });
    if (op === 'close') listings.delete(roomId);
    render();
  }

  async function closeListing(roomId) {
    if (!roomId) return;
    try {
      await postListing({ roomId, game: listings.get(roomId)?.game || 'md-robot', op: 'close' });
    } catch { /* ignore */ }
    listings.delete(roomId);
    render();
  }

  async function updateListing(partial) {
    if (!partial?.roomId) return;
    const prev = listings.get(partial.roomId) || {};
    await postListing({
      roomId: partial.roomId,
      game: partial.game || prev.game || 'md-robot',
      hostId: partial.hostId || prev.hostId,
      hostName: partial.hostName || prev.hostName,
      players: partial.players ?? prev.players ?? 1,
      maxPlayers: partial.maxPlayers ?? prev.maxPlayers ?? 2,
      op: 'update'
    });
  }

  function render() {
    if (!el.list) return;
    pruneStale();
    const mine = session?.userId;
    const items = [...listings.values()]
      .filter((x) => x.status !== 'closed')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!items.length) {
      el.list.innerHTML = '';
      el.empty?.classList.remove('hidden');
      return;
    }
    el.empty?.classList.add('hidden');
    el.list.innerHTML = items.map((item) => {
      const title = escapeHtml(gameTitle(item.game));
      const host = escapeHtml(item.hostName || shortId(item.hostId));
      const roomId = escapeHtml(item.roomId);
      const game = escapeHtml(item.game || '');
      const n = Number(item.players) || 1;
      const max = Number(item.maxPlayers) || 2;
      const mineTag = item.hostId === mine
        ? '<span class="md-room-tag admin">jij</span>'
        : '';
      return `
        <li class="md-room-row joined action-wait-join">
          <div class="md-room-main">
            <div class="md-room-title">
              <strong>${title}</strong>
              <span class="md-room-tag action-wait-join">${n}/${max}</span>
              ${mineTag}
            </div>
            <div class="md-room-meta">host ${host} · open</div>
          </div>
          <div class="md-room-actions">
            <button type="button" class="hub-btn-primary md-row-btn" data-board-join="${roomId}" data-game="${game}">Joinen</button>
          </div>
        </li>`;
    }).join('');

    el.list.querySelectorAll('[data-board-join]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roomId = btn.getAttribute('data-board-join');
        const game = btn.getAttribute('data-game') || 'md-robot';
        if (typeof MdLobby?.openGame === 'function') {
          MdLobby.openGame(roomId, game);
        } else if (typeof InviteShare?.gameEntryUrl === 'function') {
          window.location.href = InviteShare.gameEntryUrl({ roomId, game });
        }
      });
    });
  }

  async function refresh() {
    if (!session) return;
    setStatus('Open games laden…');
    try {
      await ensureJoined();
      await loadHistory();
      setStatus('');
    } catch (err) {
      setStatus(err.message || 'Open games niet bereikbaar');
    }
  }

  async function start(sess) {
    session = sess || MatrixClient?.loadSession?.() || MatrixAuth?.loadSession?.();
    if (!session) return;
    if (el.panel) el.panel.hidden = false;
    await refresh();
  }

  function getHubRoomId() {
    return hubRoomId;
  }

  function init() {
    el.refresh?.addEventListener('click', () => refresh());
  }

  window.MdBoard = {
    HUB_ALIAS,
    LISTING_TYPE,
    start,
    refresh,
    postListing,
    updateListing,
    closeListing,
    handleSyncPayload,
    getHubRoomId,
    ensureJoined
  };

  init();
})();
