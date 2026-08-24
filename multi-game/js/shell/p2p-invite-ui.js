import { drawQr } from "./qr-ui.js";

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * @param {HTMLElement | null | undefined} card
 * @param {HTMLElement | null | undefined} canvasOrHost
 * @returns {HTMLElement | null}
 */
function resolveQrTarget(card, canvasOrHost) {
  if (canvasOrHost?.isConnected) return canvasOrHost;
  const inCard = card?.querySelector("#invite-qr-host, .invite-qr-host");
  if (inCard) return inCard;
  return document.getElementById("invite-qr-host");
}

/**
 * Fill the shared host invite card: big QR, room code, link.
 * @param {{
 *   card?: HTMLElement | null,
 *   canvas?: HTMLElement | null,
 *   codeEl?: HTMLElement | null,
 *   urlEl?: HTMLAnchorElement | null,
 *   code: string,
 *   url: string,
 * }} opts
 */
export async function showHostInviteCard(opts) {
  const { card, codeEl, urlEl, code, url } = opts;
  const qrTarget = resolveQrTarget(card, opts.canvas);
  if (codeEl) codeEl.textContent = code;
  if (urlEl) {
    urlEl.textContent = url;
    urlEl.href = url || "#";
  }
  card?.classList.remove("hidden");
  await nextFrame();
  await nextFrame();
  if (qrTarget && url) {
    try {
      await drawQr(qrTarget, url, { width: 280 });
    } catch (err) {
      console.error("QR render failed", err);
      qrTarget.innerHTML = `<p class="qr-error">QR-code mislukt — gebruik de link hieronder.</p>`;
    }
  } else if (qrTarget && !url) {
    qrTarget.innerHTML = `<p class="qr-error">Geen deellink — gebruik de roomcode.</p>`;
  }
}
