import { listTransportMeta } from "../js/core/prefs.js";
import { createRoom } from "../js/core/room.js";
import { mountShellNav } from "../js/shell/nav.js";
import { parseP2pInvite } from "../js/shell/p2p-invite.js";
import { openQrScanner } from "../js/shell/qr-scanner.js";
import { drawQr } from "../js/shell/qr-ui.js";

mountShellNav({ active: "netwerk", base: "../" });

const LAB_GAME_ID = "lab-p2p";
const LAB_PATH = "/netwerk/";

const listEl = document.getElementById("transport-list");
const p2pStatus = document.getElementById("p2p-status");
const p2pHostInfo = document.getElementById("p2p-host-info");
const p2pResult = document.getElementById("lab-p2p-result");
const echoResult = document.getElementById("lab-echo-result");
const matrixResult = document.getElementById("lab-matrix-result");
const inviteWrap = document.getElementById("invite-wrap");
const inviteCanvas = document.getElementById("invite-qr-canvas");
const hostActions = document.getElementById("host-actions");
const btnStop = document.getElementById("btn-p2p-stop");
const btnEcho = document.getElementById("btn-echo");
const joinInput = document.getElementById("p2p-join-code");

/** @type {ReturnType<typeof createRoom> | null} */
let session = null;
/** @type {string | null} */
let shareUrl = null;
/** @type {number | null} */
let lastPingTs = null;

function renderTransports() {
  listEl.innerHTML = listTransportMeta()
    .map(
      (t) => `
      <li class="transport-card" data-id="${t.id}">
        <div class="transport-card-head">
          <strong>${t.label}</strong>
          <span class="transport-status" data-status="${t.status}">${t.status}</span>
        </div>
        <p class="hint">${t.blurb}</p>
      </li>`,
    )
    .join("");
}

function setP2pStatus(status, detail) {
  const labels = {
    idle: "Niet verbonden",
    hosting: "Wachten op speler…",
    connecting: "Verbinden…",
    connected: "Verbonden",
    disconnected: "Verbinding verbroken",
    error: "Fout",
  };
  p2pStatus.dataset.state = status;
  p2pStatus.textContent = detail
    ? `${labels[status] || status}: ${detail}`
    : labels[status] || status;
  btnEcho.disabled = status !== "connected";
}

function bindSession(s) {
  session = s;
  s.onMessage = (msg) => {
    if (msg.type === "lab_ping") {
      s.send("lab_pong", {
        t: /** @type {{ t?: number }} */ (msg.payload || {}).t,
        role: s.role,
      });
    }
    if (msg.type === "lab_pong") {
      const sent = /** @type {{ t?: number }} */ (msg.payload || {}).t;
      if (sent && lastPingTs) {
        const ms = Date.now() - lastPingTs;
        echoResult.className = "lab-result ok";
        echoResult.textContent = `Pong ontvangen (${ms} ms) — P2P werkt.`;
      }
    }
  };
  s.onStatus = (status, detail) => {
    setP2pStatus(status, detail);
    if (status === "connected") {
      p2pResult.className = "lab-result ok";
      p2pResult.textContent = "Verbonden. Probeer de echo-test.";
    }
    if (status === "disconnected" || status === "error") {
      echoResult.className = "lab-result bad";
      echoResult.textContent = detail || "Verbinding verbroken.";
    }
  };
  s.onError = (err) => {
    p2pResult.className = "lab-result bad";
    p2pResult.textContent = err instanceof Error ? err.message : String(err);
  };
}

async function teardown() {
  if (session) await session.destroy();
  session = null;
  shareUrl = null;
  inviteWrap.classList.add("hidden");
  hostActions.classList.add("hidden");
  btnStop.classList.add("hidden");
  p2pHostInfo.textContent = "";
  setP2pStatus("idle");
}

document.getElementById("btn-p2p-host").addEventListener("click", async () => {
  p2pResult.className = "lab-result";
  p2pResult.textContent = "Host starten…";
  try {
    await teardown();
    p2pHostInfo.textContent = "Kamer wordt aangemaakt…";
    inviteWrap.classList.remove("hidden");
    const s = createRoom({ gameId: LAB_GAME_ID, transport: "p2p", maxGuests: 1 });
    bindSession(s);
    const code = await s.host();
    shareUrl = s.buildShareUrl(LAB_PATH, code);
    p2pHostInfo.textContent = `Code: ${code}`;
    await drawQr(inviteCanvas, shareUrl);
    inviteWrap.classList.remove("hidden");
    hostActions.classList.remove("hidden");
    btnStop.classList.remove("hidden");
    p2pResult.className = "lab-result ok";
    p2pResult.textContent = "Host actief. Laat de ander scannen of joinen met code.";
  } catch (err) {
    p2pResult.className = "lab-result bad";
    p2pResult.textContent = err instanceof Error ? err.message : String(err);
  }
});

btnStop.addEventListener("click", () => teardown());

document.getElementById("btn-copy-link").addEventListener("click", async () => {
  if (!shareUrl) return;
  try {
    await navigator.clipboard.writeText(shareUrl);
    p2pResult.className = "lab-result ok";
    p2pResult.textContent = "Link gekopieerd.";
  } catch {
    p2pResult.textContent = shareUrl;
  }
});

document.getElementById("btn-p2p-join").addEventListener("click", () => {
  joinRoom(joinInput.value);
});

document.getElementById("btn-scan-qr").addEventListener("click", () => {
  p2pResult.className = "lab-result";
  p2pResult.textContent = "";
  openQrScanner({
    hint: "Richt op de P2P-QR van de host",
    onScan: async (raw) => {
      const invite = parseP2pInvite(raw);
      if (!invite) {
        p2pResult.className = "lab-result bad";
        p2pResult.textContent = "Geen geldige P2P-uitnodiging in deze QR.";
        return;
      }
      joinInput.value = invite.code;
      await joinRoom(invite.code);
    },
    onError: () => {
      p2pResult.className = "lab-result bad";
      p2pResult.textContent = "Camera kon niet starten.";
    },
  });
});

joinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    joinRoom(joinInput.value);
  }
});

/**
 * @param {string} code
 */
async function joinRoom(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    p2pResult.className = "lab-result bad";
    p2pResult.textContent = "Vul een code in of scan een QR.";
    return;
  }
  p2pResult.className = "lab-result";
  p2pResult.textContent = "Verbinden…";
  try {
    await teardown();
    const s = createRoom({ gameId: LAB_GAME_ID, transport: "p2p", maxGuests: 1 });
    bindSession(s);
    await s.join(normalized);
  } catch (err) {
    p2pResult.className = "lab-result bad";
    p2pResult.textContent = `${humanizePeerError(err)} De host moet online zijn.`;
  }
}

btnEcho.addEventListener("click", () => {
  if (!session || !session.isConnected()) {
    echoResult.className = "lab-result bad";
    echoResult.textContent = "Niet verbonden.";
    return;
  }
  lastPingTs = Date.now();
  const ok = session.send("lab_ping", { t: lastPingTs });
  if (!ok) {
    echoResult.className = "lab-result bad";
    echoResult.textContent = "Ping kon niet worden verstuurd.";
    return;
  }
  echoResult.className = "lab-result";
  echoResult.textContent = "Ping verstuurd…";
});

document.getElementById("btn-matrix-try").addEventListener("click", () => {
  try {
    createRoom({ gameId: "lab-matrix", transport: "matrix" });
    matrixResult.className = "lab-result bad";
    matrixResult.textContent = "Onverwacht: matrix zou moeten falen.";
  } catch (err) {
    matrixResult.className = "lab-result ok";
    matrixResult.textContent = `Stub OK: ${err instanceof Error ? err.message : String(err)}`;
  }
});

/**
 * @param {unknown} err
 */
function humanizePeerError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const type =
    err && typeof err === "object" && "type" in err
      ? /** @type {{ type?: string }} */ (err).type
      : null;
  if (type === "peer-unavailable" || /Could not connect to peer/i.test(message)) {
    return "Peer niet gevonden.";
  }
  if (type === "unavailable-id") return "Code is al in gebruik.";
  if (type === "network") return "Geen verbinding met PeerJS.";
  return message || "Onbekende fout";
}

renderTransports();
