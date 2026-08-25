import { BOARD_SIZE, isBlocked } from "./game.js";

/**
 * DOM helpers for lobby + board + share.
 */
export class UI {
  constructor() {
    this.lobby = document.getElementById("lobby");
    this.game = document.getElementById("game");
    this.hostInfo = document.getElementById("host-info");
    this.roomCodeEl = document.getElementById("room-code");
    this.shareUrlEl = document.getElementById("share-url");
    this.lobbyError = document.getElementById("lobby-error");
    this.lobbyHint = document.getElementById("lobby-hint");
    this.statusEl = document.getElementById("connection-status");
    this.roleLabel = document.getElementById("role-label");
    this.turnLabel = document.getElementById("turn-label");
    this.resultLabel = document.getElementById("result-label");
    this.boardEl = document.getElementById("board");
    this.timerEl = document.getElementById("turn-timer");
    this.timerFill = document.getElementById("turn-timer-fill");
    this.timerLabel = document.getElementById("turn-timer-label");
    this.btnLocal = document.getElementById("btn-local");
    this.btnHost = document.getElementById("btn-host");
    this.btnJoin = document.getElementById("btn-join");
    this.btnScanQr = document.getElementById("btn-scan-qr");
    this.inviteQrCanvas = document.getElementById("invite-qr-canvas");
    this.btnCopyLink = document.getElementById("btn-copy-link");
    this.btnShare = document.getElementById("btn-share");
    this.btnShareWhatsapp = document.getElementById("btn-share-whatsapp");
    this.btnRestart = document.getElementById("btn-restart");
    this.btnLeave = document.getElementById("btn-leave");
    this.btnReconnect = document.getElementById("btn-reconnect");
    this.joinCode = document.getElementById("join-code");
    this.nameInput = document.getElementById("player-name");

    /** @type {HTMLButtonElement[]} */
    this.cells = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._timerInterval = null;
    this._timerKey = "";
    this._timerDeadline = 0;
    /** @type {(() => void) | null} */
    this._onTimerExpire = null;
    this.#buildBoard();
  }

  #buildBoard() {
    this.boardEl.innerHTML = "";
    this.boardEl.classList.add("board-4");
    this.cells = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.dataset.index = String(i);
      btn.setAttribute("aria-label", `Vakje ${i + 1}`);
      this.boardEl.appendChild(btn);
      this.cells.push(btn);
    }
  }

  showLobby() {
    this.clearTurnTimer();
    this.lobby.classList.remove("hidden");
    this.game.classList.add("hidden");
    this.btnReconnect?.classList.add("hidden");
  }

  showGame() {
    this.lobby.classList.add("hidden");
    this.game.classList.remove("hidden");
  }

  /**
   * @param {string} code
   * @param {string} shareUrl
   */
  showHostInvite(code, shareUrl) {
    if (!this.hostInfo) return;
    this.hostInfo.classList.remove("hidden");
    if (this.roomCodeEl) this.roomCodeEl.textContent = code;
    if (this.shareUrlEl) {
      this.shareUrlEl.textContent = shareUrl;
      this.shareUrlEl.href = shareUrl;
    }
    if (this.lobbyHint) {
      this.lobbyHint.textContent =
        "Houd dit tabblad open. De ander scant jouw QR of opent de link.";
    }
  }

  hideHostInvite() {
    this.hostInfo?.classList.add("hidden");
    if (this.roomCodeEl) this.roomCodeEl.textContent = "";
    if (this.shareUrlEl) {
      this.shareUrlEl.textContent = "";
      this.shareUrlEl.removeAttribute("href");
    }
    if (this.lobbyHint) this.lobbyHint.textContent = "";
  }

  setLobbyError(message) {
    this.lobbyError.textContent = message || "";
  }

  /**
   * @param {string} status
   * @param {string} [detail]
   */
  setConnectionStatus(status, detail) {
    const labels = {
      idle: "Niet verbonden",
      hosting: "Wachten op speler…",
      connecting: "Verbinden…",
      connected: "Verbonden",
      disconnected: "Verbinding verbroken",
      error: "Fout",
    };
    this.statusEl.dataset.state = status;
    this.statusEl.textContent = detail
      ? `${labels[status] || status}: ${detail}`
      : labels[status] || status;

    if (status === "disconnected" || status === "error") {
      this.btnReconnect?.classList.remove("hidden");
    } else if (status === "connected") {
      this.btnReconnect?.classList.add("hidden");
    }
  }

  /**
   * @param {'X'|'O'|null} mark
   * @param {string} [name]
   */
  setRole(mark, name) {
    if (!mark) {
      this.roleLabel.textContent = "";
      return;
    }
    const label = String(name || "").trim();
    this.roleLabel.textContent = label
      ? `Jij speelt: ${mark} · ${label}`
      : `Jij speelt: ${mark}`;
  }

  clearTurnTimer() {
    if (this._timerInterval != null) {
      clearTimeout(this._timerInterval);
      this._timerInterval = null;
    }
    this._timerKey = "";
    this._timerDeadline = 0;
    this._onTimerExpire = null;
    this.timerEl?.classList.add("hidden");
    if (this.timerFill) this.timerFill.style.width = "100%";
    if (this.timerLabel) this.timerLabel.textContent = "";
  }

  nudgeTurnTimer() {
    if (!this._timerDeadline || !this._onTimerExpire) return;
    if (Date.now() < this._timerDeadline) return;
    if (this._timerInterval != null) {
      clearTimeout(this._timerInterval);
      this._timerInterval = null;
    }
    const expire = this._onTimerExpire;
    this._onTimerExpire = null;
    this._timerDeadline = 0;
    expire?.();
  }

  /**
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

    if (opts.key === this._timerKey && this._timerInterval != null) {
      return;
    }

    if (this._timerInterval != null) {
      clearTimeout(this._timerInterval);
      this._timerInterval = null;
    }

    this._timerKey = opts.key;
    const totalMs = Math.max(1, opts.seconds) * 1000;
    const deadline = Date.now() + totalMs;
    this._timerDeadline = deadline;

    const paint = (leftSec) => {
      const total = Math.max(1, opts.seconds);
      if (this.timerFill) {
        this.timerFill.style.width = `${(leftSec / total) * 100}%`;
      }
      if (this.timerLabel) {
        this.timerLabel.textContent = `${leftSec}s`;
      }
      this.timerEl?.classList.toggle("is-urgent", leftSec <= 5);
    };

    const finish = () => {
      if (this._timerInterval != null) {
        clearTimeout(this._timerInterval);
        this._timerInterval = null;
      }
      this._timerDeadline = 0;
      paint(0);
      const expire = this._onTimerExpire;
      this._onTimerExpire = null;
      expire?.();
    };
    const tick = () => {
      const leftMs = deadline - Date.now();
      const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
      paint(leftSec);
      if (leftMs <= 0) {
        finish();
        return;
      }
      this._timerInterval = setTimeout(tick, Math.min(250, leftMs));
    };

    tick();
  }

  /**
   * @param {ReturnType<import('./game.js').createInitialState>} state
   * @param {'X'|'O'|null} localMark
   * @param {boolean} connected
   * @param {{
   *   hotseat?: boolean,
   *   isHost?: boolean,
   *   seats?: { X?: { name?: string } | null, O?: { name?: string } | null },
   * }} [opts]
   */
  renderState(state, localMark, connected, opts = {}) {
    const hotseat = Boolean(opts.hotseat);
    const isHost = Boolean(opts.isHost);
    const seats = opts.seats || {};
    const winSet = new Set(state.winningLine || []);
    // Host may keep playing / restarting if the guest flaps offline.
    const linkOk = hotseat || connected || isHost;

    for (let i = 0; i < BOARD_SIZE; i++) {
      const mark = state.board[i];
      const cell = this.cells[i];
      const blocked = isBlocked(state, i);

      cell.classList.toggle("is-blocked", blocked);
      cell.classList.toggle("is-win", winSet.has(i));

      if (blocked) {
        cell.textContent = "";
        cell.dataset.blocked = "1";
        delete cell.dataset.mark;
        cell.disabled = true;
        cell.setAttribute("aria-label", `Vakje ${i + 1}, geblokkeerd`);
        continue;
      }

      delete cell.dataset.blocked;
      cell.textContent = mark || "";
      if (mark) cell.dataset.mark = mark;
      else delete cell.dataset.mark;
      cell.setAttribute("aria-label", `Vakje ${i + 1}`);

      const canPlay =
        linkOk &&
        state.status === "playing" &&
        mark === null &&
        (hotseat || (localMark && state.turn === localMark));

      cell.disabled = !canPlay;
    }

    const nameOf = (m) => {
      const n = seats[m]?.name?.trim();
      return n || m;
    };

    this.game?.classList.toggle(
      "is-my-turn",
      state.status === "playing" &&
        !hotseat &&
        Boolean(localMark && state.turn === localMark),
    );
    this.game?.classList.toggle("is-waiting-turn", 
      state.status === "playing" &&
        !hotseat &&
        Boolean(localMark && state.turn !== localMark),
    );

    if (state.status === "playing") {
      if (hotseat) {
        this.turnLabel.textContent = `Beurt: ${state.turn} (zelfde apparaat)`;
      } else {
        const yours = localMark && state.turn === localMark;
        const who = nameOf(state.turn);
        this.turnLabel.textContent = yours
          ? `Jouw beurt · ${who} (${state.turn})`
          : `Wacht op ${who} (${state.turn})`;
      }
      if (!connected && !hotseat) {
        this.resultLabel.textContent = isHost
          ? "Gast offline — jij kunt blijven spelen; zij synct bij reconnect."
          : "Verbinding weg — opnieuw verbinden…";
      } else {
        this.resultLabel.textContent = "";
      }
      this.btnRestart.disabled = true;
    } else if (state.status === "won") {
      this.turnLabel.textContent = "";
      const winnerName = nameOf(/** @type {'X'|'O'} */ (state.winner));
      if (hotseat) {
        this.resultLabel.textContent = `${winnerName} (${state.winner}) wint`;
      } else if (state.winner === localMark) {
        this.resultLabel.textContent = `Je hebt gewonnen! (${winnerName})`;
      } else {
        this.resultLabel.textContent = `${winnerName} (${state.winner}) wint`;
      }
      this.btnRestart.disabled = !(hotseat || isHost || connected);
    } else if (state.status === "draw") {
      this.turnLabel.textContent = "";
      this.resultLabel.textContent = "Gelijkspel";
      this.btnRestart.disabled = !(hotseat || isHost || connected);
    }
  }

  /**
   * @param {(index: number) => void} handler
   */
  onCellClick(handler) {
    this.cells.forEach((cell) => {
      let lastAt = 0;
      const fire = () => {
        if (cell.disabled) return;
        const now = Date.now();
        if (now - lastAt < 350) return;
        lastAt = now;
        handler(Number(cell.dataset.index));
      };
      cell.addEventListener("click", fire);
      cell.addEventListener("pointerup", (e) => {
        if (e.pointerType === "touch" || e.pointerType === "pen") fire();
      });
    });
  }
}
