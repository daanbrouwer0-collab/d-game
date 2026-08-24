import {
  BANKJE_SQUARES,
  BOARD_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPECIAL,
  canStart,
  normalizeColors,
  squareInfo,
} from "./game.js";

/**
 * @param {import('./game.js').CharacterColors | undefined} colors
 * @param {number} index
 * @param {string} [title]
 */
function goosePawnHtml(colors, index, title = "") {
  const c = normalizeColors(colors, index);
  const safe = (title || "").replace(/"/g, "&quot;");
  return `<svg class="goose-pawn-svg" viewBox="0 0 40 40" role="img" aria-label="${safe}">
    <ellipse cx="14" cy="33" rx="3.2" ry="4" fill="${c.legs}"/>
    <ellipse cx="22" cy="33" rx="3.2" ry="4" fill="${c.legs}"/>
    <ellipse cx="16" cy="24" rx="11" ry="8.5" fill="${c.body}"/>
    <circle cx="27" cy="14" r="7.5" fill="${c.head}"/>
    <ellipse cx="33.5" cy="15" rx="3.2" ry="1.6" fill="#f0a050"/>
    <circle cx="29.5" cy="12.5" r="1.15" fill="#1a1f2e"/>
    <path d="M18 18 Q12 10 8 14" fill="none" stroke="${c.head}" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
}

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
    this.btnRematch = document.getElementById("btn-rematch");
    this.btnToLobby = document.getElementById("btn-to-lobby");
    this.winActions = document.getElementById("win-actions");
    this.boardTrack = document.getElementById("board-track");
    this.legendEl = document.getElementById("goose-legend");
    this.timerEl = document.getElementById("turn-timer");
    this.timerFill = document.getElementById("turn-timer-fill");
    this.timerLabel = document.getElementById("turn-timer-label");
    this.recentSetup = document.getElementById("recent-setup");
    /** @type {ReturnType<typeof setInterval> | null} */
    this._timerInterval = null;
    /** @type {string} */
    this._timerKey = "";
    /** @type {(() => void) | null} */
    this._onTimerExpire = null;
    this.recentSetupList = document.getElementById("recent-setup-list");
    this.recentLobbyList = document.getElementById("recent-lobby-list");
    this.switchCode = document.getElementById("switch-code");
    this.btnSwitchJoin = document.getElementById("btn-switch-join");
    this.btnSwitchNew = document.getElementById("btn-switch-new");
    document.documentElement.classList.add("page-ganzenbord");
    this.#renderLegend();
  }

  playerName() {
    return (this.nameInput.value || "").trim() || "Speler";
  }

  showSetup() {
    this.clearTurnTimer();
    this.setup.classList.remove("hidden");
    this.lobby.classList.add("hidden");
    this.game.classList.add("hidden");
  }

  showLobby() {
    this.clearTurnTimer();
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

  clearTurnTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this._timerKey = "";
    this._onTimerExpire = null;
    this.timerEl?.classList.add("hidden");
    if (this.timerFill) this.timerFill.style.width = "100%";
    if (this.timerLabel) this.timerLabel.textContent = "";
  }

  /**
   * Visual + optional expire callback for the roll deadline.
   * Restarts only when `key` changes (new turn).
   * @param {{
   *   key: string,
   *   seconds: number,
   *   active: boolean,
   *   canExpire: boolean,
   *   onExpire?: () => void,
   * }} opts
   */
  syncTurnTimer(opts) {
    if (!opts.active) {
      this.clearTurnTimer();
      return;
    }
    this.timerEl?.classList.remove("hidden");
    this._onTimerExpire = opts.canExpire ? opts.onExpire || null : null;

    if (opts.key === this._timerKey && this._timerInterval) return;
    this._timerKey = opts.key;

    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }

    const total = Math.max(1, opts.seconds);
    let left = total;
    const paint = () => {
      if (this.timerFill) {
        this.timerFill.style.width = `${(left / total) * 100}%`;
      }
      if (this.timerLabel) {
        this.timerLabel.textContent = `${left}s`;
      }
      this.timerEl?.classList.toggle("is-urgent", left <= 5);
    };
    paint();

    this._timerInterval = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        paint();
        const expire = this._onTimerExpire;
        this.clearTurnTimer();
        expire?.();
        return;
      }
      paint();
    }, 1000);
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
    state.players.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "player-row player-row-goose";
      const you = p.id === localId ? " (jij)" : "";
      const host = p.isHost ? " · host" : "";
      const online = onlineMap.has(p.id) ? onlineMap.get(p.id) : true;
      const status = local ? "" : online ? "" : " · offline";
      li.innerHTML = `${goosePawnHtml(p.colors, i, p.name)}<span>${p.name}${you}${host}${status}</span>`;
      if (!online && !local) li.classList.add("is-offline");
      this.playerList.appendChild(li);
    });

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
   * @param {{ local?: boolean, youName?: string, connected?: boolean, online?: { id: string, online: boolean }[], isHost?: boolean }} [opts]
   */
  renderGame(state, localId, opts = {}) {
    const local = Boolean(opts.local);
    const connected = opts.connected !== false;
    const isHost = Boolean(opts.isHost ?? local);
    const current = state.players[state.turnIndex];
    const myTurn =
      state.phase === "playing" &&
      current &&
      (local || current.id === localId);

    if (this.youLabel) {
      const me = state.players.find((p) => p.id === localId);
      const nm = me?.name || opts.youName || "";
      const idx = me ? state.players.indexOf(me) : 0;
      this.youLabel.innerHTML = nm
        ? `${goosePawnHtml(me?.colors, idx, nm)} <span>Jij · ${nm}</span>`
        : "";
      this.youLabel.classList.add("you-label-goose");
    }

    const finished = state.phase === "finished";
    if (finished) {
      const winner = state.players.find((p) => p.id === state.winnerId);
      this.turnLabel.textContent = winner
        ? `${winner.name} heeft gewonnen!`
        : "Afgelopen";
      this.btnRoll.disabled = true;
      this.btnRoll.classList.remove("is-pulse");
    } else {
      const inSloot = state.trapped?.[current?.id] === "sloot";
      this.turnLabel.textContent = myTurn
        ? local
          ? inSloot
            ? `Beurt: ${current?.name || "…"} — sloot: gooi 4 of 5`
            : `Beurt: ${current?.name || "…"} — gooi`
          : inSloot
            ? "Jouw beurt — sloot: gooi 4 of 5 om eruit te komen"
            : "Jouw beurt — gooi de dobbelsteen"
        : `Beurt: ${current?.name || "…"}`;
      this.btnRoll.disabled = !myTurn || (!local && !connected);
      this.btnRoll.classList.toggle("is-pulse", Boolean(myTurn && !this.btnRoll.disabled));
    }

    this.winActions?.classList.toggle("hidden", !finished || !isHost);
    if (this.btnRematch) this.btnRematch.disabled = !finished || !isHost;
    if (this.btnToLobby) this.btnToLobby.disabled = !finished || !isHost;

    this.logLabel.textContent = state.lastLog || "";

    /** @type {Map<string, boolean>} */
    const onlineMap = new Map(
      (opts.online || []).map((o) => [o.id, o.online]),
    );

    this.positionsEl.innerHTML = "";
    state.players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "pos-row";
      if (current && p.id === current.id && state.phase === "playing") {
        row.classList.add("is-turn");
      }
      const pos = state.positions[p.id] ?? 0;
      const online = onlineMap.has(p.id) ? onlineMap.get(p.id) : true;
      const off = !local && !online ? " · offline" : "";
      const trap = state.trapped?.[p.id];
      const trapLabel = trap === "sloot" ? " · sloot" : "";
      const skips = state.skipTurns?.[p.id] || 0;
      const skipLabel = skips > 0 ? ` · overslaan (${skips})` : "";
      const onBankje = BANKJE_SQUARES.includes(pos);
      const bankLabel = onBankje && !trap ? " · bankje" : "";
      row.innerHTML = `<span class="pos-name">${goosePawnHtml(p.colors, i, p.name)}<strong>${p.name}</strong></span> <span>vak ${pos} / ${BOARD_SIZE}${trapLabel}${skipLabel}${bankLabel}${off}</span>`;
      this.positionsEl.appendChild(row);
    });

    this.#renderSpiral(state);
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

  #renderLegend() {
    if (!this.legendEl) return;
    const items = [
      { id: "bankje", label: "Bankje — worp ×½" },
      { id: "bridge", label: "Brug — +12" },
      { id: "deka", label: "Deka — 1 overslaan" },
      { id: "sloot", label: "Sloot — gooi 4/5" },
      { id: "park", label: "Park — naar 30" },
      { id: "prison", label: "Gevangenis — 5 overslaan" },
      { id: "knockout", label: "Knockout — start" },
    ];
    this.legendEl.innerHTML = items
      .map(
        (it) =>
          `<span class="goose-legend-item"><i class="goose-legend-swatch is-${it.id}"></i>${it.label}</span>`,
      )
      .join("");
  }

  /**
   * Spiral board: 0 (start) → 63 (finish).
   * @param {import('./game.js').GameState} state
   */
  #renderSpiral(state) {
    if (!this.boardTrack) return;
    this.boardTrack.className = "goose-board";
    this.boardTrack.setAttribute("aria-label", "Ganzenbord spiraal");
    this.boardTrack.removeAttribute("aria-hidden");
    this.boardTrack.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "goose-spiral";

    const n = BOARD_SIZE + 1;
    const cx = 50;
    const cy = 50;
    const turns = 3.35;
    const angle0 = -Math.PI / 2;
    const rMin = 6;
    const rMax = 46;

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const angle = angle0 + turns * 2 * Math.PI * t;
      const r = rMin + (rMax - rMin) * t;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);

      const cell = document.createElement("div");
      cell.className = "goose-cell";
      const info = squareInfo(i);
      if (info) cell.classList.add(`is-${info.id}`);
      if (BANKJE_SQUARES.includes(i)) cell.classList.add("is-bankje");
      if (SPECIAL[i]) cell.classList.add(`is-${SPECIAL[i].id}`);
      if (i === 0) cell.classList.add("is-start");
      if (i === BOARD_SIZE) cell.classList.add("is-finish");

      cell.style.left = `${x}%`;
      cell.style.top = `${y}%`;
      cell.title = info ? `${i}: ${info.label}` : `Vak ${i}`;

      const num = document.createElement("span");
      num.className = "goose-num";
      num.textContent = String(i);
      cell.appendChild(num);

      if (
        info &&
        info.id !== "start" &&
        info.id !== "finish" &&
        info.id !== "bankje"
      ) {
        const tag = document.createElement("span");
        tag.className = "goose-tag";
        tag.textContent = info.label[0] || "";
        cell.appendChild(tag);
      }

      const here = state.players.filter((p) => (state.positions[p.id] ?? 0) === i);
      if (here.length) {
        const pawns = document.createElement("div");
        pawns.className = "goose-pawns";
        here.forEach((p) => {
          const idx = state.players.findIndex((pl) => pl.id === p.id);
          const wrapPawn = document.createElement("span");
          wrapPawn.className = "goose-pawn";
          wrapPawn.title = p.name;
          wrapPawn.innerHTML = goosePawnHtml(p.colors, idx, p.name);
          pawns.appendChild(wrapPawn);
        });
        cell.appendChild(pawns);
      }

      wrap.appendChild(cell);
    }

    this.boardTrack.appendChild(wrap);
  }
}
