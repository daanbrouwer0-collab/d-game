/**
 * QR helpers: render via CDN QRCode lib (load on demand).
 * Always draw on an offscreen canvas first so hidden/0-size hosts
 * cannot produce a blank white square.
 */

let qrLibLoading = null;

/**
 * @returns {Promise<boolean>}
 */
async function ensureQrLib() {
  if (window.QRCode && typeof window.QRCode.toCanvas === "function") return true;
  if (qrLibLoading) return qrLibLoading;

  qrLibLoading = (async () => {
    const existing = document.querySelector(
      'script[src*="qrcode"][src$="qrcode.min.js"], script[src*="qrcode@"]',
    );
    if (existing) {
      const started = Date.now();
      while (Date.now() - started < 4000) {
        if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
          return true;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return Boolean(window.QRCode && typeof window.QRCode.toCanvas === "function");
  })().finally(() => {
    qrLibLoading = null;
  });

  return qrLibLoading;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {{ width?: number }} options
 * @returns {Promise<void>}
 */
function toCanvasSafe(canvas, text, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve();
    };

    try {
      const ret = window.QRCode.toCanvas(canvas, text, options, done);
      if (ret && typeof ret.then === "function") {
        ret.then(() => done(), done);
      }
    } catch (err) {
      done(err);
    }
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {{ width?: number }} [opts]
 */
export async function drawQr(canvas, text, opts = {}) {
  const width = opts.width || 280;
  const payload = String(text || "");
  canvas.style.background = "#ffffff";
  canvas.style.width = `${width}px`;
  canvas.style.height = `${width}px`;

  const ok = await ensureQrLib();
  if (ok && window.QRCode && typeof window.QRCode.toCanvas === "function" && payload) {
    const tmp = document.createElement("canvas");
    await toCanvasSafe(tmp, payload, {
      width,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    canvas.width = tmp.width;
    canvas.height = tmp.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tmp, 0, 0);
    }
    return true;
  }

  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, width);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, width - 16, width - 16);
    ctx.fillStyle = "#111111";
    ctx.font = "14px monospace";
    ctx.fillText("QR niet geladen", 24, 48);
    const lines = payload.match(/.{1,22}/g) || [];
    lines.slice(0, 12).forEach((line, i) => {
      ctx.fillText(line, 24, 80 + i * 16);
    });
  }
  return false;
}

/**
 * @param {HTMLVideoElement} video
 * @returns {Promise<string | null>}
 */
export async function detectQrFromVideo(video) {
  const { detectQrFromVideo: detect } = await import("./qr-scanner.js");
  return detect(video);
}
