/**
 * Tiny QR helpers: render via CDN QRCode lib when loaded on window,
 * fallback to payload text only.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 */
export async function drawQr(canvas, text) {
  const QR = window.QRCode;
  if (QR && typeof QR.toCanvas === "function") {
    await QR.toCanvas(canvas, text, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    return true;
  }
  const ctx = canvas.getContext("2d");
  canvas.width = 220;
  canvas.height = 220;
  if (ctx) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 220, 220);
    ctx.fillStyle = "#111";
    ctx.font = "11px monospace";
    const lines = text.match(/.{1,28}/g) || [];
    lines.slice(0, 16).forEach((line, i) => {
      ctx.fillText(line, 8, 20 + i * 12);
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
