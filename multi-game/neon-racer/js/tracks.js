/* MERGE-BLOCK: tracks.js */
const Tracks = (() => {
  let selectedId = 1;
  let listEl;
  let btnRide;
  let sessionHintEl;

  function init() {
    listEl = document.getElementById('track-list');
    btnRide = document.getElementById('btn-track-ride');
    sessionHintEl = document.getElementById('track-session-hint');
    selectedId = clampId(Storage.readSettings().selectedTrack || NeonRacerGame.getCurrentLevel?.() || 1);

    btnRide?.addEventListener('click', () => startSelectedTrack());
    listEl?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-track-id]');
      if (!card || card.classList.contains('track-card-locked')) {
        if (card?.classList.contains('track-card-locked')) {
          const id = Number(card.dataset.trackId);
          const session = getSessionForRecords();
          Toast.show(Vip.getLockReason(id, session) || 'Deze baan is nog vergrendeld');
        }
        return;
      }
      selectTrack(Number(card.dataset.trackId));
    });

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'tracks') render();
    });

    render();
  }

  function clampId(id) {
    return Math.max(1, Math.min(GameConfig.trackCount, Number(id) || 1));
  }

  function getSessionForRecords() {
    const activeId = Menu.getActiveSessionId?.();
    if (activeId) {
      const active = Storage.getSession(activeId);
      if (active) return Vip.syncSessionVip(active);
    }
    const lastId = Storage.readLastSessionId();
    if (lastId) {
      const last = Storage.getSession(lastId);
      if (last) return Vip.syncSessionVip(last);
    }
    const first = Storage.readSessions()[0] || null;
    return first ? Vip.syncSessionVip(first) : null;
  }

  function selectTrack(id) {
    const session = getSessionForRecords();
    if (!Vip.canAccessTrack(id, session)) {
      Toast.show(Vip.getLockReason(id, session) || 'Deze baan is nog vergrendeld');
      return;
    }
    selectedId = clampId(id);
    const settings = Storage.readSettings();
    Storage.writeSettings({ ...settings, selectedTrack: selectedId });
    render();
  }

  function renderRecordBlock(rec) {
    if (!rec) {
      return `<div class="track-record track-record-empty">
        <span class="track-record-label">Jouw record</span>
        <span class="track-record-time">Nog geen record</span>
      </div>`;
    }

    return `<div class="track-record">
      <span class="track-record-label">Jouw record</span>
      <span class="track-record-time">${formatRaceTime(rec.time)}</span>
    </div>`;
  }

  function render() {
    if (!listEl) return;
    const session = getSessionForRecords();
    const hasVip = Vip.resolveVip(session);

    selectedId = clampId(Storage.readSettings().selectedTrack || selectedId);
    if (!Vip.canAccessTrack(selectedId, session)) {
      selectedId = Vip.getHighestUnlockedTrackId(session);
      const settings = Storage.readSettings();
      Storage.writeSettings({ ...settings, selectedTrack: selectedId });
    }

    if (sessionHintEl) {
      if (!session) {
        sessionHintEl.textContent = 'Start een session via Home om records op te slaan.';
      } else if (hasVip) {
        sessionHintEl.textContent = `★ VIP session “${session.sessionName}” — alle banen direct beschikbaar.`;
      } else {
        sessionHintEl.textContent = 'Speel banen op volgorde vrij: rond een baan af met een tijd om de volgende te openen.';
      }
    }

    listEl.innerHTML = GameConfig.tracks.map((track) => {
      const rec = NeonRacerGame.getLevelRecord?.(track.id);
      const isActive = track.id === selectedId;
      const unlocked = Vip.canAccessTrack(track.id, session);
      const locked = !unlocked;
      const lockHint = locked ? Vip.getLockReason(track.id, session) : '';
      const ui = GameConfig.getTrackUi(track);

      return `<button type="button" class="track-card${isActive ? ' active' : ''}${locked ? ' track-card-locked' : ''}${track.vip ? ' track-card-vip' : ''}${ui.rainbow ? ' track-card-rainbow' : ''}" data-track-id="${track.id}" style="--track-accent:${ui.accent};--track-accent2:${ui.accent2};--track-accent3:${ui.accent3}"${locked ? ' disabled' : ''}>
        <div class="track-card-top">
          <span class="track-lvl">Baan ${track.id}${track.vip ? ' · VIP' : ''}</span>
          ${locked ? '<span class="track-locked">Vergrendeld</span>' : (isActive ? '<span class="track-picked">Gekozen</span>' : '')}
        </div>
        <strong class="track-name">${track.name}</strong>
        <span class="track-theme">${ui.label}</span>
        ${locked ? `<span class="track-lock-hint">${lockHint}</span>` : renderRecordBlock(rec)}
      </button>`;
    }).join('');

    if (btnRide) {
      const track = GameConfig.getTrack(selectedId);
      const locked = !Vip.canAccessTrack(selectedId, session);
      btnRide.disabled = locked;
      if (locked) {
        btnRide.textContent = Vip.getLockReason(selectedId, session) || 'Baan vergrendeld';
      } else {
        const rec = NeonRacerGame.getLevelRecord?.(selectedId);
        btnRide.textContent = rec
          ? `Rij ${track.name} (record ${formatRaceTime(rec.time)})`
          : `Rij ${track.name}`;
      }
    }
  }

  function ensureSessionForRide(switchToPlay = true) {
    if (Menu.isSessionActive?.()) return true;
    if (Menu.startLastSession?.(switchToPlay)) return true;
    Toast.show('Maak eerst een session via Home');
    Nav.openStartScreen();
    return false;
  }

  function beginRide() {
    if (!ensureSessionForRide(false)) return false;
    const session = getSessionForRecords();
    if (!Vip.canAccessTrack(selectedId, session)) {
      Toast.show(Vip.getLockReason(selectedId, session) || 'Deze baan is nog vergrendeld');
      return false;
    }
    Menu.hide?.();
    NeonRacerGame.playTrack(selectedId);
    return true;
  }

  function startSelectedTrack() {
    if (!beginRide()) return;
    Nav.switchTab('play');
    Toast.show(`${GameConfig.getTrack(selectedId).name} — rijden!`);
  }

  function launchOnPlayTab() {
    if (beginRide()) {
      NeonRacerGame.onTabVisible();
      return;
    }
    NeonRacerGame.onTabVisible();
  }

  function refresh() {
    render();
  }

  return { init, refresh, launchOnPlayTab, getSelectedId: () => selectedId };
})();
/* END-MERGE-BLOCK */
