import { BOARD_SIZE, MAX_PLAYERS, MIN_PLAYERS, canStart } from "./game.js";

export class UI {
  constructor() {
    this.setup = document.getElementById("setup");
    this.lobby = document.getElementById("lobby");
    this.game = document.getElementById("game");
    this.nameInput = document.getElementById("player-name");
    this.btnLocal = document.getElementById("btn-local");
    this.btnHost = document.getElementById("btn-host");
    this.btnJoin = document.getElementById("btn-join");
    this.joinCode = document.getElementById("join-code");
    this.statusEl = document.getElementById("connection-status");
    this.lobbyError = document.getElementById("lobby-error");
    this.lobbyHint = document.getElementById("lobby-hint");
    this.playerList = document.getElementById("player-list");
    this.lobbyCount = document.getElementById("lobby-count");
    this.roomCodeEl = document.getElementById("room-code");
    this.shareUrlEl = document.getElementById("share-url");
    this.inviteQrCanvas = document.getElementById("invite-qr-canvas");
    this.btnScanQr = document.getElementById("btn-scan-qr");
    this.inviteBox = document.querySelector(".invite-box");
    this.hostControls = document.getElementById("host-controls");
    this.localAdd = document.getElementById("local-add");
    this.localPlayerName = document.getElementById("local-player-name");
    this.btnAddLocal = document.getElementById("btn-add-local");
    this.guestWaiting = document.getElementById("guest-waiting");
    this.btnStart = document.getElementById("btn-start");
    this.btnShareWhatsapp = document.getElementById("btn-share-whatsapp");
    this.btnShare = document.getElementById("btn-share");
    this.btnCopyLink = document.getElementById("btn-copy-link");
    this.btnLeave = document.getElementById("btn-leave");
    this.btnLeaveGame = document.getElementById("btn-leave-game");
    this.btnReconnect = document.getElementById("btn-reconnect");
    this.btnReconnectGame = document.getElementById("btn-reconnect-game");
    this.youLabel = document.getElementById("you-label");
    this.turnLabel = document.getElementById("turn-label");
    this.logLabel = document.getElementById("log-label");
    this.positionsEl = document.getElementById("positions");
    this.btnRoll = document.getElementById("btn-roll");
    this.boardTrack = document.getElementById("board-track");
    this.recentSetup = document.getElementById("recent-setup");
    this.recentSetupList = document.getElementById("recent-setup-list");
    this.recentLobbyList = document.getElementById("recent-lobby-list");
    this.switchCode = document.getElementById("switch-code");
    this.btnSwitchJoin = document.getElementById("btn-switch-join");
    this.btnSwitchNew = document.getElementById("btn-switch-new");
  }

  playerName() {
    return (this.nameInput.value || "").trim() || "Speler";
  }

  showSetup() {
    this.setup.classList.remove("hidden");
    this.lobby.classList.add("hidden");
    this.game.classList.add("hidden");
  }

  showLobby() {
    this.setup.classList.add("hidden");
    this.lobby.classList.remove("hidden");
    this.game.classList.add("hidden");
  }

  showGame() {
    this.setup.classList.add("hidden");
    this.lobby.classList.add("hidden");
    this.game.classList.remove("hidden");
  }

  setError(msg) {
    this.lobbyError.textContent = msg || "";
  }

  setHint(msg) {
    this.lobbyHint.textContent = msg || "";
  }

  /**
   * @param {string} status
   * @param {string} [detail]
   */
  setConnectionStatus(status, detail) {
    const labels = {
      idle: "Niet verbonden",
      hosting: "Lobby open",
      connecting: "Verbinden…",
      connected: "Verbonden",
      disconnected: "Verbinding verbroken",
      error: "Fout",
    };
    this.statusEl.dataset.state = status;
    this.statusEl.textContent = detail
      ? `${labels[status] || status}: ${detail}`
      : labels[status] || status;
  }

  /**
   * @param {boolean} visible
   */
  setReconnectVisible(visible) {
    this.btnReconnect?.classList.toggle("hidden", !visible);
    this.btnReconnectGame?.classList.toggle("hidden", !visible);
  }

  /**
   * @param {string} code
   * @param {string | null} shareUrl
   * @param {boolean} isHost
   * @param {{ local?: boolean }} [opts]
   */
  showInvite(code, shareUrl, isHost, opts = {}) {
    const local = Boolean(opts.local);
    this.roomCodeEl.textContent = local ? "Dit apparaat" : code;
    // Guests must not see the host invite QR (empty canvas looks white).
    if (this.inviteBox) {
      this.inviteBox.classList.toggle("hidden", local || !isHost);
    }
    if (!isHost && this.inviteQrCanvas) {
      this.inviteQrCanvas.innerHTML = "";
    }
    if (shareUrl) {
      this.shareUrlEl.textContent = shareUrl;
      this.shareUrlEl.href = shareUrl;
    } else {
      this.shareUrlEl.textContent = "";
      this.shareUrlEl.removeAttribute("href");
    }
    this.hostControls.classList.toggle("hidden", !isHost);
    this.localAdd?.classList.toggle("hidden", !local || !isHost);
    this.guestWaiting.classList.toggle("hidden", isHost || local);
  }

  /**
   * @param {import('./game.js').GameState} state
   * @param {string} localId
   * @param {boolean} isHost
   * @param {{ local?: boolean, online?: { id: string, online: boolean }[], youName?: string }} [opts]
   */
  renderLobby(state, localId, isHost, opts = {}) {
    const local = Boolean(opts.local);
    /** @type {Map<string, boolean>} */
    const onlineMap = new Map(
      (opts.online || []).map((o) => [o.id, o.online]),
    );
    this.lobbyCount.textContent = `${state.players.length} / ${MAX_PLAYERS} spelers`;
    this.playerList.innerHTML = "";
    for (const p of state.players) {
      const li = document.createElement("li");
      li.className = "player-row";
      const you = p.id === localId ? " (jij)" : "";
      const host = p.isHost ? " · host" : "";
      const online = onlineMap.has(p.id) ? onlineMap.get(p.id) : true;
      const status = local ? "" : online ? "" : " · offline";
      li.textContent = `${p.name}${you}${host}${status}`;
      if (!online && !local) li.classList.add("is-offline");
      this.playerList.appendChild(li);
    }

    if (isHost) {
      const ready = canStart(state);
      this.btnStart.disabled = !ready;
      this.btnStart.textContent = ready
        ? `Start spel (${state.players.length} spelers)`
        : `Start (min. ${MIN_PLAYERS} spelers)`;
      if (local) {
        this.setHint(
          ready
            ? "Je kunt starten, of meer lokale spelers toevoegen."
            : `Voeg nog ${MIN_PLAYERS - state.players.length} speler(s) toe op dit apparaat.`,
        );
      } else {
        this.setHint(
          ready
            ? "Je kunt starten, of wachten op meer spelers (max 6)."
            : `Nog ${MIN_PLAYERS - state.players.length} speler(s) nodig. Deel QR of link.`,
        );
      }
    } else {
      this.setHint("Wachten tot de host het spel start…");
    }
  }

  /**
   * @param {import('./game.js').GameState} state
   * @param {string} localId
   * @param {{ local?: boolean, youName?: string, connected?: boolean, online?: { id: string, online: boolean }[] }} [opts]
   */
  renderGame(state, localId, opts = {}) {
    const local = Boolean(opts.local);
    const connected = opts.connected !== false;
    const current = state.players[state.turnIndex];
    const myTurn =
      state.phase === "playing" &&
      current &&
      (local || current.id === localId);

    if (this.youLabel) {
      const me = state.players.find((p) => p.id === localId);
      const nm = me?.name || opts.youName || "";
      this.youLabel.textContent = nm ? `Jij · ${nm}` : "";
    }

    if (state.phase === "finished") {
      const winner = state.players.find((p) => p.id === state.winnerId);
      this.turnLabel.textContent = winner
        ? `${winner.name} heeft gewonnen!`
        : "Afgelopen";
      this.btnRoll.disabled = true;
    } else {
      this.turnLabel.textContent = myTurn
        ? local
          ? `Beurt: ${current?.name || "…"} — gooi`
          : "Jouw beurt — gooi de dobbelsteen"
        : `Beurt: ${current?.name || "…"}`;
      this.btnRoll.disabled = !myTurn || (!local && !connected);
    }

    this.logLabel.textContent = state.lastLog || "";

    /** @type {Map<string, boolean>} */
    const onlineMap = new Map(
      (opts.online || []).map((o) => [o.id, o.online]),
    );

    this.positionsEl.innerHTML = "";
    for (const p of state.players) {
      const row = document.createElement("div");
      row.className = "pos-row";
      const pos = state.positions[p.id] ?? 0;
      const online = onlineMap.has(p.id) ? onlineMap.get(p.id) : true;
      const off = !local && !online ? " · offline" : "";
      row.innerHTML = `<strong>${p.name}</strong> <span>vak ${pos} / ${BOARD_SIZE}${off}</span>`;
      this.positionsEl.appendChild(row);
    }

    this.#renderTrack(state);
  }

  /**
   * @param {import('../js/p2p/room-memory.js').RecentRoom[]} items
   * @param {string | null} currentCode
   * @param {(item: import('../js/p2p/room-memory.js').RecentRoom) => void} onOpen
   * @param {(code: string) => void} [onRemove]
   */
  renderRecentLists(items, currentCode, onOpen, onRemove) {
    this.#fillRecentList(this.recentSetupList, items, currentCode, onOpen, onRemove);
    this.#fillRecentList(this.recentLobbyList, items, currentCode, onOpen, onRemove);
    const has = items.length > 0;
    this.recentSetup?.classList.toggle("hidden", !has);
  }

  /**
   * @param {HTMLElement | null} listEl
   * @param {import('../js/p2p/room-memory.js').RecentRoom[]} items
   * @param {string | null} currentCode
   * @param {(item: import('../js/p2p/room-memory.js').RecentRoom) => void} onOpen
   * @param {(code: string) => void} [onRemove]
   */
  #fillRecentList(listEl, items, currentCode, onOpen, onRemove) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "recent-empty";
      empty.textContent = "Nog geen recente rooms.";
      listEl.appendChild(empty);
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "recent-row";
      if (item.code === currentCode) li.classList.add("is-current");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "recent-open";
      const roleLabel = item.role === "host" ? "host" : "gast";
      main.textContent =
        item.code === currentCode
          ? `${item.code} · ${roleLabel} (huidig)`
          : `${item.code} · ${roleLabel}`;
      main.addEventListener("click", () => onOpen(item));
      li.appendChild(main);

      if (onRemove && item.code !== currentCode) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "recent-remove";
        del.setAttribute("aria-label", `Verwijder ${item.code}`);
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          onRemove(item.code);
        });
        li.appendChild(del);
      }

      listEl.appendChild(li);
    }
  }

  /**
   * @param {import('./game.js').GameState} state
   */
  #renderTrack(state) {
    if (!this.boardTrack) return;
    this.boardTrack.innerHTML = "";
    // Compact: show finish line markers every 5
    for (let i = 0; i <= BOARD_SIZE; i += 5) {
      const cell = document.createElement("div");
      cell.className = "track-cell";
      const here = state.players.filter((p) => (state.positions[p.id] ?? 0) === i);
      cell.textContent = here.length
        ? `${i}:${here.map((p) => p.name[0] || "?").join("")}`
        : String(i);
      this.boardTrack.appendChild(cell);
    }
  }
}
