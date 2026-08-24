/**
 * QR like OUTDOOR DRINKS / voorhoorn:
 * davidshimjs QRCode into a visible DIV (img/canvas/table), not npm toCanvas.
 */

const QRJS_SRC = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";

let qrJsLoading = null;

function isShimQr(fn) {
  return typeof fn === "function" && fn.CorrectLevel;
}

/**
 * @returns {Promise<typeof QRCode | null>}
 */
async function ensureQrCodeJs() {
  if (isShimQr(window.QRCode)) return window.QRCode;
  if (qrJsLoading) return qrJsLoading;

  qrJsLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = QRJS_SRC;
    script.onload = () => resolve(isShimQr(window.QRCode) ? window.QRCode : null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  }).finally(() => {
    qrJsLoading = null;
  });

  return qrJsLoading;
}

/**
 * @param {HTMLElement} target
 * @returns {HTMLElement}
 */
function qrHost(target) {
  if (target instanceof HTMLCanvasElement) {
    const wrap = target.parentElement;
    if (!wrap) return target;
    let box = wrap.querySelector(".invite-qr-host");
    if (!box) {
      box = document.createElement("div");
      box.className = "invite-qr-host";
      box.setAttribute("role", "img");
      box.setAttribute("aria-label", "QR-code");
      target.replaceWith(box);
    } else {
      target.remove();
    }
    return box;
  }
  return target;
}

/**
 * @param {HTMLElement} canvasOrBox
 * @param {string} text
 * @param {{ width?: number }} [opts]
 */
export async function drawQr(canvasOrBox, text, opts = {}) {
  const width = opts.width || 280;
  const payload = String(text || "");
  const host = qrHost(canvasOrBox);
  host.classList.add("invite-qr-host");
  host.innerHTML = "";

  if (!payload) {
    host.innerHTML = `<p class="qr-error">Geen deellink om in QR te zetten.</p>`;
    return false;
  }

  const QR = await ensureQrCodeJs();
  if (!QR) {
    host.innerHTML = `<p class="qr-error">QR-code kon niet worden geladen.</p>`;
    return false;
  }

  try {
    const options = {
      text: payload,
      width,
      height: width,
      colorDark: "#111111",
      colorLight: "#ffffff",
      correctLevel: QR.CorrectLevel.L,
    };
    try {
      new QR(host, { ...options, typeNumber: -1 });
    } catch {
      host.innerHTML = "";
      new QR(host, options);
    }
    if (!host.innerHTML.trim()) {
      throw new Error("QR bleef leeg");
    }
    return true;
  } catch (err) {
    console.error(err);
    host.innerHTML = `<p class="qr-error">QR-code mislukt.</p>`;
    return false;
  }
}

/**
 * @param {HTMLVideoElement} video
 * @returns {Promise<string | null>}
 */
export async function detectQrFromVideo(video) {
  const { detectQrFromVideo: detect } = await import("./qr-scanner.js");
  return detect(video);
}
