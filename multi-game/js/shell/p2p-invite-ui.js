import { drawQr } from "./qr-ui.js";

/**
 * Fill the shared host invite card: big QR, room code, link.
 * @param {{
 *   card?: HTMLElement | null,
 *   canvas?: HTMLCanvasElement | null,
 *   codeEl?: HTMLElement | null,
 *   urlEl?: HTMLAnchorElement | null,
 *   code: string,
 *   url: string,
 * }} opts
 */
export async function showHostInviteCard(opts) {
  const { card, canvas, codeEl, urlEl, code, url } = opts;
  if (codeEl) codeEl.textContent = code;
  if (urlEl) {
    urlEl.textContent = url;
    urlEl.href = url;
  }
  card?.classList.remove("hidden");
  if (canvas && url) {
    try {
      await drawQr(canvas, url, { width: 280 });
    } catch (err) {
      console.error("QR render failed", err);
    }
  }
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
}
