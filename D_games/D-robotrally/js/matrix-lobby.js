/**
 * Lobby UI for Matrix RobotRally (host invite / guest join / ready / start).
 */
const MatrixLobbyUi = {
  invites: new Map(),

  init() {
    document.getElementById('btn-matrix-invite')?.addEventListener('click', () => this.onInvite());
    document.getElementById('btn-matrix-ready')?.addEventListener('click', () => this.onReadyToggle());
    document.getElementById('btn-matrix-start')?.addEventListener('click', () => this.onStart());
    document.getElementById('btn-matrix-refresh-invites')?.addEventListener('click', () => this.renderInvites());
    document.getElementById('btn-matrix-share-facebook')?.addEventListener('click', () => this.onShareFacebook());
    document.getElementById('btn-matrix-share-native')?.addEventListener('click', () => this.onShareNative());
    document.getElementById('btn-matrix-share-copy')?.addEventListener('click', () => this.onShareCopy());
    document.getElementById('btn-matrix-rejoin')?.addEventListener('click', () => this.onRejoin());
    document.getElementById('btn-matrix-leave-lobby')?.addEventListener('click', () => {
      MatrixSessionController.stop();
      SessionMenu.showView('new');
    });
    document.getElementById('btn-matrix-login-link')?.addEventListener('click', () => {
      window.location.href = '../multi.html';
    });
  },

  async onRejoin() {
    try {
      const roomId = MatrixSessionController.roomId
        || MatrixSessionController.loadPersistedRoom()?.roomId;
      if (!roomId) {
        const ok = await MatrixSessionController.tryResumeActiveRoom();
        if (!ok) Toast.show('Geen actieve Matrix-lobby om te hervatten');
        else SessionMenu.showView('matrix-lobby');
        return;
      }
      await MatrixSessionController.joinRoom(roomId, { acceptInvite: true });
      if (MatrixSessionController.isHost()) {
        MatrixSessionController.startHostHeartbeat();
        MatrixSessionController.wireHostAutosnapshots();
      }
      Toast.show('Opnieuw verbonden');
    } catch (err) {
      Toast.show(err.message || 'Opnieuw verbinden mislukt');
    }
  },

  currentInviteOptions() {
    const roomId = MatrixSessionController.roomId;
    if (!roomId) throw new Error('Geen actieve lobby om te delen.');
    return {
      roomId,
      game: 'robotrally',
      minPlayers: CONFIG.MATRIX?.MIN_PLAYERS || 2
    };
  },

  refreshShareLink() {
    const input = document.getElementById('matrix-share-link');
    if (!input || !MatrixSessionController.roomId || typeof InviteShare === 'undefined') return;
    try {
      input.value = InviteShare.buildInviteUrl(this.currentInviteOptions());
    } catch {
      input.value = '';
    }
  },

  async onShareFacebook() {
    try {
      InviteShare.shareFacebook(this.currentInviteOptions());
      Toast.show('Facebook-deelvenster geopend');
    } catch (err) {
      Toast.show(err.message || 'Delen mislukt');
    }
  },

  async onShareNative() {
    try {
      const result = await InviteShare.shareInvite(this.currentInviteOptions());
      if (result === 'copied') Toast.show('Uitnodigingstekst gekopieerd');
      else if (result === 'native') Toast.show('Deelvenster geopend');
    } catch (err) {
      Toast.show(err.message || 'Delen mislukt');
    }
  },

  async onShareCopy() {
    try {
      const url = await InviteShare.copyInviteLink(this.currentInviteOptions());
      this.refreshShareLink();
      Toast.show('Link gekopieerd');
      return url;
    } catch (err) {
      Toast.show(err.message || 'Kopiëren mislukt');
    }
  },

  ingestSync(syncData) {
    const inviteRooms = syncData?.rooms?.invite || {};
    Object.entries(inviteRooms).forEach(([roomId, room]) => {
      const events = room.invite_state?.events || [];
      let isRally = false;
      let name = 'D-RobotRally';
      let hostId = null;
      events.forEach(ev => {
        if (ev.type === RobotRallyMatrix.EVENT_TYPE && RobotRallyMatrix.isRallyLobby(ev.content)) {
          isRally = true;
          hostId = ev.content.hostId;
          name = ev.content.settings?.name || name;
        }
        if (ev.type === 'm.room.name' && String(ev.content?.name || '').includes('RobotRally')) {
          isRally = true;
          name = ev.content.name;
        }
        if (ev.type === 'm.room.member' && ev.state_key === RobotRallyMatrix.loadSession()?.userId) {
          hostId = hostId || ev.sender;
        }
      });
      if (isRally) {
        this.invites.set(roomId, { roomId, name, hostId, updated: Date.now() });
      }
    });
    this.renderInvites();
  },

  renderInvites() {
    const list = document.getElementById('matrix-invite-list');
    const empty = document.getElementById('matrix-invite-empty');
    if (!list) return;
    list.innerHTML = '';
    const items = Array.from(this.invites.values());
    empty?.classList.toggle('hidden', items.length > 0);
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'matrix-lobby-item';
      li.innerHTML = `
        <div class="matrix-lobby-meta">
          <strong>${item.name}</strong>
          <span>van ${RobotRallyMatrix.shortId(item.hostId)}</span>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn success small';
      btn.textContent = 'Join';
      btn.addEventListener('click', async () => {
        try {
          await MatrixSessionController.joinRoom(item.roomId, { acceptInvite: true });
          this.invites.delete(item.roomId);
          SessionMenu.showView('matrix-lobby');
          Toast.show('Lobby gejoined');
        } catch (err) {
          Toast.show(err.message || 'Joinen mislukt');
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  },

  render(controller = MatrixSessionController) {
    const authWarn = document.getElementById('matrix-auth-warning');
    const lobbyPanel = document.getElementById('matrix-lobby-panel');
    const auth = RobotRallyMatrix.loadSession();
    authWarn?.classList.toggle('hidden', !!auth);
    lobbyPanel?.classList.toggle('hidden', !controller.isActive());

    const conn = document.getElementById('matrix-conn-status');
    if (conn) {
      const status = controller.connectionStatus || 'idle';
      conn.classList.remove('is-online', 'is-warn', 'is-error');
      if (status === 'online') {
        conn.textContent = controller.isHost()
          ? 'Verbonden · jij bent host (blijf online)'
          : 'Verbonden · host online';
        conn.classList.add('is-online');
      } else if (status === 'host_offline') {
        conn.textContent = 'Host lijkt offline — wachten / opnieuw verbinden';
        conn.classList.add('is-warn');
      } else if (status === 'connecting') {
        conn.textContent = 'Verbinden…';
        conn.classList.add('is-warn');
      } else if (status === 'error') {
        conn.textContent = controller.lastError || 'Verbindingsfout';
        conn.classList.add('is-error');
      } else {
        conn.textContent = 'Nog geen actieve Matrix-lobby';
      }
    }

    if (!controller.isActive() || !controller.lobby) {
      this.renderInvites();
      return;
    }

    const you = document.getElementById('matrix-lobby-you');
    if (you) {
      you.textContent = `Ingelogd als ${auth.displayName || RobotRallyMatrix.shortId(auth.userId)} · room ${controller.roomId}`;
    }

    const counts = document.getElementById('matrix-lobby-counts');
    if (counts) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.MATRIX?.MIN_PLAYERS || 2;
      const readyCount = seats.filter((s) => s.ready).length;
      counts.textContent = `Spelers ${seats.length}/${CONFIG.MATRIX?.MAX_PLAYERS || 5} · Ready ${readyCount}/${seats.length} · Min. ${minPlayers} om te starten`;
    }

    const seatsEl = document.getElementById('matrix-seat-list');
    if (seatsEl) {
      seatsEl.innerHTML = '';
      (controller.lobby.seats || []).forEach(seat => {
        const li = document.createElement('li');
        li.className = 'matrix-lobby-item';
        const isYou = seat.userId === auth.userId;
        const hostTag = seat.userId === controller.lobby.hostId ? ' · host' : '';
        li.innerHTML = `
          <div class="matrix-lobby-meta">
            <strong style="color:${seat.color || '#0ff'}">${seat.name}${isYou ? ' (jij)' : ''}</strong>
            <span>${RobotRallyMatrix.shortId(seat.userId)}${hostTag} · ${seat.ready ? 'READY' : 'wacht…'}</span>
          </div>
        `;
        seatsEl.appendChild(li);
      });
    }

    const readyBtn = document.getElementById('btn-matrix-ready');
    const seat = controller.localSeat();
    if (readyBtn && seat) {
      readyBtn.textContent = seat.ready ? 'Ready annuleren' : 'Ready';
      readyBtn.classList.toggle('success', !seat.ready);
      readyBtn.classList.toggle('alt', !!seat.ready);
    }

    const hostOnly = document.getElementById('matrix-host-controls');
    hostOnly?.classList.toggle('hidden', !controller.isHost());
    this.refreshShareLink();

    const startBtn = document.getElementById('btn-matrix-start');
    if (startBtn) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.MATRIX?.MIN_PLAYERS || 2;
      const readyCount = seats.filter(s => s.ready).length;
      const enoughPeople = seats.length >= minPlayers;
      const allReady = enoughPeople && seats.every(s => s.ready);
      const canStart = controller.isHost()
        && allReady
        && controller.lobby.status === 'lobby';
      startBtn.disabled = !canStart;
      if (controller.lobby.status === 'playing') {
        startBtn.textContent = 'Race bezig';
      } else if (!enoughPeople) {
        startBtn.textContent = `Nog ${minPlayers - seats.length} speler(s) nodig`;
      } else if (!allReady) {
        startBtn.textContent = `Wacht op ready (${readyCount}/${seats.length})`;
      } else {
        startBtn.textContent = `Start race (${seats.length} spelers)`;
      }
    }

    const status = document.getElementById('matrix-lobby-status');
    if (status) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.MATRIX?.MIN_PLAYERS || 2;
      if (controller.lobby.status === 'playing') {
        status.textContent = 'Race is gestart — ga naar Speel.';
      } else if (controller.isHost()) {
        status.textContent = seats.length < minPlayers
          ? `Deel de link (Facebook). Minimaal ${minPlayers} spelers nodig voordat je kunt starten.`
          : 'Genoeg mensen in de room. Start zodra iedereen Ready is.';
      } else {
        status.textContent = 'Stel je robot in bij Karakter, druk Ready, wacht tot de host start.';
      }
    }

    this.renderInvites();
  },

  async onInvite() {
    const input = document.getElementById('matrix-invite-input');
    try {
      await MatrixSessionController.invite(input?.value || '');
      if (input) input.value = '';
    } catch (err) {
      Toast.show(err.message || 'Uitnodigen mislukt');
    }
  },

  async onReadyToggle() {
    try {
      const seat = MatrixSessionController.localSeat();
      await MatrixSessionController.setReady(!seat?.ready);
    } catch (err) {
      Toast.show(err.message || 'Ready mislukt');
    }
  },

  async onStart() {
    try {
      MatrixSessionController.wireHostAutosnapshots();
      await MatrixSessionController.startRace();
    } catch (err) {
      Toast.show(err.message || 'Start mislukt');
    }
  }
};

window.MatrixLobbyUi = MatrixLobbyUi;
