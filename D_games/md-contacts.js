/**
 * Vriendenlijst — Matrix account_data + uitnodigen voor games.
 */
(function () {
  const ACCOUNT_TYPE = 'com.d5games.contacts';

  let session = null;
  let contacts = [];
  let busy = false;

  const el = {
    list: document.getElementById('md-contact-list'),
    empty: document.getElementById('md-contact-empty'),
    addInput: document.getElementById('md-contact-add'),
    addBtn: document.getElementById('md-contact-add-btn'),
    status: document.getElementById('md-contact-status'),
    beheerSelect: document.getElementById('md-beheer-invite-user'),
    playFriend: document.getElementById('md-play-friend'),
    playAddWrap: document.getElementById('md-play-add-wrap'),
    playFriendSelectWrap: document.getElementById('md-play-friend-select-wrap'),
    playAdd: document.getElementById('md-play-add'),
    playAddBtn: document.getElementById('md-play-add-btn')
  };

  function setStatus(msg) {
    if (el.status) el.status.textContent = msg || '';
  }

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

  function parseUserId(input) {
    if (typeof MatrixAuth?.parseMatrixId === 'function') {
      return MatrixAuth.parseMatrixId(input).userId;
    }
    const raw = String(input || '').trim();
    if (!raw.startsWith('@') || !raw.includes(':')) {
      throw new Error('Gebruik @naam:matrix.org');
    }
    return raw;
  }

  function normalizeList(raw) {
    const list = Array.isArray(raw?.contacts) ? raw.contacts : Array.isArray(raw) ? raw : [];
    const map = new Map();
    for (const c of list) {
      if (!c?.userId) continue;
      map.set(c.userId, {
        userId: c.userId,
        displayName: c.displayName || shortId(c.userId),
        addedAt: c.addedAt || Date.now()
      });
    }
    return [...map.values()].sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }

  async function persist() {
    if (!session) return;
    await MatrixClient.putAccountData(session, ACCOUNT_TYPE, { contacts });
  }

  async function loadFromServer() {
    if (!session) return;
    try {
      const data = await MatrixClient.getAccountData(session, ACCOUNT_TYPE);
      contacts = normalizeList(data);
    } catch {
      contacts = [];
    }
  }

  async function mergeDirectSuggestions() {
    if (!session) return;
    try {
      const direct = await MatrixClient.getAccountData(session, 'm.direct');
      if (!direct || typeof direct !== 'object') return;
      const existing = new Set(contacts.map((c) => c.userId));
      let changed = false;
      for (const userId of Object.keys(direct)) {
        if (!userId.startsWith('@') || existing.has(userId) || userId === session.userId) continue;
        contacts.push({
          userId,
          displayName: shortId(userId),
          addedAt: Date.now(),
          fromDirect: true
        });
        existing.add(userId);
        changed = true;
      }
      if (changed) {
        contacts = normalizeList({ contacts });
        await persist();
      }
    } catch { /* optional */ }
  }

  function gameTitle(game) {
    return InviteShare?.GAME_TITLES?.[game] || game;
  }

  /** Stuur vriend een DM met speellink (zichtbaar in Element + onze site). */
  async function notifyFriend(userId, { game, roomId, minPlayers = 2 }) {
    if (typeof MatrixClient?.sendDirectMessage !== 'function') return;
    const link = typeof InviteShare?.buildInviteUrl === 'function'
      ? InviteShare.buildInviteUrl({ roomId, game, minPlayers })
      : roomId;
    const title = gameTitle(game);
    const from = session.displayName || shortId(session.userId);
    const body = `${from} nodigt je uit voor ${title} op D-Games.\n\nOpen de link (log in met Matrix):\n${link}`;
    await MatrixClient.sendDirectMessage(session, userId, body);
  }

  function fillPlayFriendSelect(preferUserId) {
    if (!el.playFriend) return;
    const prev = preferUserId || el.playFriend.value;
    el.playFriend.innerHTML = '<option value="">— kies vriend —</option>'
      + contacts.map((c) => {
        const label = escapeHtml(c.displayName || shortId(c.userId));
        return `<option value="${escapeHtml(c.userId)}">${label}</option>`;
      }).join('');
    if (prev && contacts.some((c) => c.userId === prev)) {
      el.playFriend.value = prev;
    }
    const hasFriends = contacts.length > 0;
    el.playFriendSelectWrap?.classList.toggle('hidden', !hasFriends);
    if (el.playAddWrap) el.playAddWrap.hidden = hasFriends;
  }

  function fillBeheerSelect() {
    if (!el.beheerSelect) return;
    const prev = el.beheerSelect.value;
    el.beheerSelect.innerHTML = '<option value="">— kies vriend —</option>'
      + contacts.map((c) => {
        const label = escapeHtml(`${c.displayName || shortId(c.userId)} (${c.userId})`);
        return `<option value="${escapeHtml(c.userId)}">${label}</option>`;
      }).join('');
    if (prev && contacts.some((c) => c.userId === prev)) {
      el.beheerSelect.value = prev;
    }
  }

  function selectFriend(userId) {
    fillPlayFriendSelect(userId);
    if (el.playFriend && userId) el.playFriend.value = userId;
    document.getElementById('md-play-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    fillPlayFriendSelect();
    fillBeheerSelect();

    if (!el.list) return;
    if (!contacts.length) {
      el.list.innerHTML = '';
      el.empty?.classList.remove('hidden');
      return;
    }
    el.empty?.classList.add('hidden');
    el.list.innerHTML = contacts.map((c) => {
      const name = escapeHtml(c.displayName || shortId(c.userId));
      const id = escapeHtml(c.userId);
      return `
        <li class="md-room-row joined">
          <div class="md-room-main">
            <div class="md-room-title"><strong>${name}</strong></div>
            <div class="md-room-meta">${id}</div>
          </div>
          <div class="md-room-actions md-friend-actions">
            <button type="button" class="hub-btn-primary md-row-btn" data-invite-friend="${id}">Uitnodigen</button>
            <button type="button" class="hub-btn-ghost md-row-btn" data-remove-contact="${id}">Verwijder</button>
          </div>
        </li>`;
    }).join('');

    el.list.querySelectorAll('[data-invite-friend]').forEach((btn) => {
      btn.addEventListener('click', () => selectFriend(btn.getAttribute('data-invite-friend')));
    });
    el.list.querySelectorAll('[data-remove-contact]').forEach((btn) => {
      btn.addEventListener('click', () => removeContact(btn.getAttribute('data-remove-contact')));
    });
  }

  async function addContact(rawId, { selectAfter = false } = {}) {
    if (!session || busy) return;
    busy = true;
    setStatus('Vriend toevoegen…');
    try {
      const userId = parseUserId(rawId);
      if (userId === session.userId) throw new Error('Je kunt jezelf niet toevoegen.');
      let displayName = shortId(userId);
      try {
        const profile = await MatrixClient.getProfile(session, userId);
        if (profile?.displayname) displayName = profile.displayname;
      } catch { /* ok */ }
      contacts = normalizeList({
        contacts: [
          ...contacts.filter((c) => c.userId !== userId),
          { userId, displayName, addedAt: Date.now() }
        ]
      });
      await persist();
      if (el.addInput) el.addInput.value = '';
      if (el.playAdd) el.playAdd.value = '';
      setStatus(`${displayName} staat op je vriendenlijst.`);
      render();
      if (selectAfter) selectFriend(userId);
    } catch (err) {
      setStatus(err.message || 'Toevoegen mislukt');
    } finally {
      busy = false;
    }
  }

  async function removeContact(userId) {
    if (!session || !userId) return;
    contacts = contacts.filter((c) => c.userId !== userId);
    try {
      await persist();
      setStatus('Vriend verwijderd.');
    } catch (err) {
      setStatus(err.message || 'Verwijderen mislukt');
    }
    render();
  }

  async function inviteToGame(userId, game) {
    if (!session || !userId || typeof window.MdLobby?.createAndInvite !== 'function') {
      setStatus('Lobby nog niet klaar — log eerst in.');
      return;
    }
    if (busy) return;
    busy = true;
    const name = contacts.find((c) => c.userId === userId)?.displayName || shortId(userId);
    setStatus(`Spel maken en ${name} uitnodigen…`);
    try {
      await window.MdLobby.createAndInvite(userId, game);
      setStatus(`Uitnodiging voor ${gameTitle(game)} gestuurd naar ${name}.`);
    } catch (err) {
      setStatus(err.message || 'Uitnodigen mislukt');
    } finally {
      busy = false;
    }
  }

  function applyAccountData(content) {
    if (!content) return;
    contacts = normalizeList(content);
    render();
  }

  function getContacts() {
    return contacts.slice();
  }

  async function start(sess) {
    session = sess || MatrixClient?.loadSession?.() || MatrixAuth?.loadSession?.();
    if (!session) return;
    await loadFromServer();
    await mergeDirectSuggestions();
    render();
  }

  function init() {
    el.addBtn?.addEventListener('click', () => addContact(el.addInput?.value));
    el.addInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addContact(el.addInput?.value);
      }
    });
    el.playAddBtn?.addEventListener('click', () => addContact(el.playAdd?.value, { selectAfter: true }));
    el.playAdd?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addContact(el.playAdd?.value, { selectAfter: true });
      }
    });
  }

  window.MdContacts = {
    start,
    getContacts,
    applyAccountData,
    fillBeheerSelect,
    fillPlayFriendSelect,
    selectFriend,
    inviteToGame,
    notifyFriend,
    ACCOUNT_TYPE
  };

  init();
})();
