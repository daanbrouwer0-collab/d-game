/**
 * Lobby UI for P2P RobotRun (host invite QR / guest join / ready / start).
 */
const P2pLobbyUi = {
  init() {
    document.getElementById("btn-p2p-ready")?.addEventListener("click", () => this.onReadyToggle());
    document.getElementById("btn-p2p-start")?.addEventListener("click", () => this.onStart());
    document.getElementById("btn-p2p-share-copy")?.addEventListener("click", () => this.onShareCopy());
    document.getElementById("btn-p2p-share-whatsapp")?.addEventListener("click", () => this.onShareWhatsApp());
    document.getElementById("btn-p2p-share")?.addEventListener("click", () => this.onShareNative());
    document.getElementById("btn-p2p-scan-join")?.addEventListener("click", () => this.onScanJoin());
    document.getElementById("btn-p2p-join-code")?.addEventListener("click", () => this.onJoinCode());
    document.getElementById("btn-p2p-rejoin")?.addEventListener("click", () => this.onRejoin());
    document.getElementById("btn-p2p-leave-lobby")?.addEventListener("click", () => {
      P2pSessionController.stop();
      SessionMenu.showView("new");
    });
  },

  async onRejoin() {
    try {
      const code =
        P2pSessionController.lobby?.roomCode ||
        P2pSessionController.loadPersistedRoom()?.roomCode;
      if (!code) {
        const ok = await P2pSessionController.tryResumeActiveRoom();
        if (!ok) Toast.show("Geen actieve P2P-lobby om te hervatten");
        else SessionMenu.showView("p2p-lobby");
        return;
      }
      if (P2pSessionController.isHost()) {
        await P2pSessionController.session?.hostWithCode?.(code);
      } else {
        await P2pSessionController.joinRoom(code);
      }
      if (P2pSessionController.isHost()) {
        P2pSessionController.wireHostAutosnapshots();
      }
      Toast.show("Opnieuw verbonden");
    } catch (err) {
      Toast.show(err.message || "Opnieuw verbinden mislukt");
    }
  },

  refreshShareLink() {
    const input = document.getElementById("p2p-share-link");
    if (!input) return;
    try {
      input.value = P2pSessionController.buildShareUrl() || "";
    } catch {
      input.value = "";
    }
  },

  async refreshInviteQr() {
    const canvas = document.getElementById("p2p-invite-qr");
    const url = P2pSessionController.buildShareUrl();
    if (!canvas || !url || !window.RobotRunP2P?.drawQr) return;
    const codeEl = document.getElementById("p2p-room-code");
    if (window.RobotRunP2P?.showHostInviteCard) {
      await window.RobotRunP2P.showHostInviteCard({
        card: document.getElementById("p2p-host-controls"),
        canvas,
        codeEl,
        urlEl: null,
        code: P2pSessionController.lobby?.roomCode || "",
        url,
      });
      return;
    }
    if (codeEl) codeEl.textContent = P2pSessionController.lobby?.roomCode || "";
    await window.RobotRunP2P.drawQr(canvas, url, { width: 280 });
  },

  async onShareCopy() {
    const url = P2pSessionController.buildShareUrl();
    if (!url) {
      Toast.show("Geen actieve lobby");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.refreshShareLink();
      Toast.show("Link gekopieerd");
    } catch {
      this.refreshShareLink();
      Toast.show(url);
    }
  },

  onShareWhatsApp() {
    const url = P2pSessionController.buildShareUrl();
    if (!url) {
      Toast.show("Geen actieve lobby");
      return;
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`Speel RobotRun met me: ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  },

  async onShareNative() {
    const url = P2pSessionController.buildShareUrl();
    if (!url) {
      Toast.show("Geen actieve lobby");
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "RobotRun",
          text: "Speel RobotRun met me",
          url,
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    this.onShareWhatsApp();
  },

  async onScanJoin() {
    if (!window.RobotRunP2P?.openQrScanner) return;
    window.RobotRunP2P.openQrScanner({
      hint: "Richt op de P2P-QR van de host",
      onScan: async (raw) => {
        const invite = window.RobotRunP2P.parseP2pInvite(raw);
        if (!invite) {
          Toast.show("Geen geldige P2P-uitnodiging");
          return;
        }
        const input = document.getElementById("p2p-join-input");
        if (input) input.value = invite.code;
        try {
          await P2pSessionController.joinRoom(invite.code);
          SessionMenu.showView("p2p-lobby");
          Toast.show("Lobby gejoined");
        } catch (err) {
          Toast.show(err.message || "Joinen mislukt");
        }
      },
      onError: () => Toast.show("Camera kon niet starten"),
    });
  },

  async onJoinCode() {
    const input = document.getElementById("p2p-join-input");
    const code = input?.value?.trim();
    if (!code) {
      Toast.show("Vul een kamercode in");
      return;
    }
    try {
      await P2pSessionController.joinRoom(code);
      SessionMenu.showView("p2p-lobby");
      Toast.show("Lobby gejoined");
    } catch (err) {
      Toast.show(err.message || "Joinen mislukt");
    }
  },

  render(controller = P2pSessionController) {
    const lobbyPanel = document.getElementById("p2p-lobby-panel");
    const joinPanel = document.getElementById("p2p-join-panel");
    lobbyPanel?.classList.toggle("hidden", !controller.isActive());
    joinPanel?.classList.toggle("hidden", controller.isActive());

    const conn = document.getElementById("p2p-conn-status");
    if (conn) {
      const status = controller.connectionStatus || "idle";
      conn.classList.remove("is-online", "is-warn", "is-error");
      if (status === "online") {
        conn.textContent = controller.isHost()
          ? "Verbonden · jij bent host (blijf online)"
          : "Verbonden · host online";
        conn.classList.add("is-online");
      } else if (status === "connecting") {
        conn.textContent = "Verbinden…";
        conn.classList.add("is-warn");
      } else if (status === "error") {
        conn.textContent = controller.lastError || "Verbindingsfout";
        conn.classList.add("is-error");
      } else {
        conn.textContent = "Nog geen actieve P2P-lobby";
      }
    }

    if (!controller.isActive() || !controller.lobby) return;

    const you = document.getElementById("p2p-lobby-you");
    if (you) {
      const seat = controller.localSeat();
      const nm = seat?.name || "Speler";
      you.textContent = controller.isHost()
        ? `Kamer ${controller.lobby.roomCode} · jij host · ${nm}`
        : `Kamer ${controller.lobby.roomCode} · ${nm}`;
    }

    const counts = document.getElementById("p2p-lobby-counts");
    if (counts) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.P2P?.MIN_PLAYERS || 2;
      const readyCount = seats.filter((s) => s.ready).length;
      const onlineCount = seats.filter((s) =>
        controller.isSeatOnline?.(s.userId),
      ).length;
      counts.textContent = `Spelers ${seats.length}/${CONFIG.P2P?.MAX_PLAYERS || 5} · Online ${onlineCount} · Ready ${readyCount}/${seats.length} · Min. ${minPlayers}`;
    }

    const seatsEl = document.getElementById("p2p-seat-list");
    if (seatsEl) {
      seatsEl.innerHTML = "";
      (controller.lobby.seats || []).forEach((seat) => {
        const li = document.createElement("li");
        li.className = "matrix-lobby-item";
        const isYou = seat.userId === controller.playerId;
        const isHostSeat =
          controller.isHost() && seat.userId === controller.playerId;
        const hostTag = isHostSeat ? " · host" : "";
        const online = controller.isSeatOnline?.(seat.userId) !== false;
        const offlineTag = online ? "" : " · offline";
        if (!online) li.classList.add("is-offline");
        li.innerHTML = `
          <div class="matrix-lobby-meta">
            <strong style="color:${seat.color || "#0ff"}">${seat.name}${isYou ? " (jij)" : ""}</strong>
            <span>${seat.robotId || ""}${hostTag}${offlineTag} · ${seat.ready ? "READY" : "wacht…"}</span>
          </div>
        `;
        seatsEl.appendChild(li);
      });
    }

    const readyBtn = document.getElementById("btn-p2p-ready");
    const seat = controller.localSeat();
    if (readyBtn && seat) {
      readyBtn.textContent = seat.ready ? "Ready annuleren" : "Ready";
      readyBtn.classList.toggle("success", !seat.ready);
      readyBtn.classList.toggle("alt", !!seat.ready);
    }

    const hostOnly = document.getElementById("p2p-host-controls");
    hostOnly?.classList.toggle("hidden", !controller.isHost());
    this.refreshShareLink();
    this.refreshInviteQr();

    const startBtn = document.getElementById("btn-p2p-start");
    if (startBtn) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.P2P?.MIN_PLAYERS || 2;
      const readyCount = seats.filter((s) => s.ready).length;
      const enoughPeople = seats.length >= minPlayers;
      const allReady = enoughPeople && seats.every((s) => s.ready);
      const canStart =
        controller.isHost() && allReady && controller.lobby.status === "lobby";
      startBtn.disabled = !canStart;
      if (controller.lobby.status === "playing") {
        startBtn.textContent = "Race bezig";
      } else if (!enoughPeople) {
        startBtn.textContent = `Nog ${minPlayers - seats.length} speler(s) nodig`;
      } else if (!allReady) {
        startBtn.textContent = `Wacht op ready (${readyCount}/${seats.length})`;
      } else {
        startBtn.textContent = `Start race (${seats.length} spelers)`;
      }
    }

    const status = document.getElementById("p2p-lobby-status");
    if (status) {
      const seats = controller.lobby.seats || [];
      const minPlayers = CONFIG.P2P?.MIN_PLAYERS || 2;
      if (controller.lobby.status === "playing") {
        status.textContent = "Race is gestart — ga naar Speel.";
      } else if (controller.isHost()) {
        status.textContent =
          seats.length < minPlayers
            ? `Deel de QR of link. Minimaal ${minPlayers} spelers nodig.`
            : "Genoeg spelers. Start zodra iedereen Ready is.";
      } else {
        status.textContent =
          "Stel je robot in bij Karakter, druk Ready, wacht tot de host start.";
      }
    }
  },

  async onReadyToggle() {
    try {
      const seat = P2pSessionController.localSeat();
      await P2pSessionController.setReady(!seat?.ready);
    } catch (err) {
      Toast.show(err.message || "Ready mislukt");
    }
  },

  async onStart() {
    try {
      P2pSessionController.wireHostAutosnapshots();
      await P2pSessionController.startRace();
    } catch (err) {
      Toast.show(err.message || "Start mislukt");
    }
  },
};

window.P2pLobbyUi = P2pLobbyUi;
