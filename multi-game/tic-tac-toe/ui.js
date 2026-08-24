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
    this.#buildBoard();
  }

  #buildBoard() {
    this.boardEl.innerHTML = "";
    this.cells = [];
    for (let i = 0; i < 9; i++) {
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
    this.lobby.classList.remove("hidden");
    this.game.classList.add("hidden");
    this.btnReconnect.classList.add("hidden");
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
    this.hostInfo.classList.remove("hidden");
    this.roomCodeEl.textContent = code;
    this.shareUrlEl.textContent = shareUrl;
    this.shareUrlEl.href = shareUrl;
    this.lobbyHint.textContent =
      "Houd dit tabblad open. De ander scant jouw QR of opent de link.";
  }

  hideHostInvite() {
    this.hostInfo.classList.add("hidden");
    this.roomCodeEl.textContent = "";
    this.shareUrlEl.textContent = "";
    this.shareUrlEl.removeAttribute("href");
    this.lobbyHint.textContent = "";
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
      this.btnReconnect.classList.remove("hidden");
    } else if (status === "connected") {
      this.btnReconnect.classList.add("hidden");
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

  /**
   * @param {ReturnType<import('./game.js').createInitialState>} state
   * @param {'X'|'O'|null} localMark
   * @param {boolean} connected
   * @param {{ hotseat?: boolean }} [opts]
   */
  renderState(state, localMark, connected, opts = {}) {
    const hotseat = Boolean(opts.hotseat);

    for (let i = 0; i < 9; i++) {
      const mark = state.board[i];
      const cell = this.cells[i];
      cell.textContent = mark || "";
      if (mark) cell.dataset.mark = mark;
      else delete cell.dataset.mark;

      const canPlay =
        connected &&
        state.status === "playing" &&
        mark === null &&
        (hotseat || (localMark && state.turn === localMark));

      cell.disabled = !canPlay;
    }

    if (state.status === "playing") {
      if (hotseat) {
        this.turnLabel.textContent = `Beurt: ${state.turn} (zelfde apparaat)`;
      } else {
        const yours = localMark && state.turn === localMark;
        this.turnLabel.textContent = yours
          ? "Jouw beurt"
          : `Beurt: ${state.turn}`;
      }
      this.resultLabel.textContent = "";
      this.btnRestart.disabled = true;
    } else if (state.status === "won") {
      this.turnLabel.textContent = "";
      if (hotseat) {
        this.resultLabel.textContent = `${state.winner} wint`;
      } else {
        this.resultLabel.textContent =
          state.winner === localMark
            ? "Je hebt gewonnen!"
            : `${state.winner} wint`;
      }
      this.btnRestart.disabled = !connected;
    } else if (state.status === "draw") {
      this.turnLabel.textContent = "";
      this.resultLabel.textContent = "Gelijkspel";
      this.btnRestart.disabled = !connected;
    }
  }

  /**
   * @param {(index: number) => void} handler
   */
  onCellClick(handler) {
    this.cells.forEach((cell) => {
      cell.addEventListener("click", () => {
        handler(Number(cell.dataset.index));
      });
    });
  }
}
