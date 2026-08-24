import { buildShareUrl, parseInviteFromText } from "./site-url.js";

/**
 * Parse P2P invite from scanned QR text (URL or room code).
 * Supports classic path URLs and d-game.nl hash URLs:
 *   https://www.d-game.nl/#tic-tac-toe/index.html?room=AB7K2M
 * @param {string} raw
 * @returns {{ code: string, url: string | null } | null}
 */
export function parseP2pInvite(raw) {
  const invite = parseInviteFromText(raw);
  if (!invite) return null;
  return { code: invite.code, url: invite.url || null };
}

/**
 * @param {string} gamePath e.g. "/tic-tac-toe/"
 * @param {string} code
 */
export function buildP2pInviteUrl(gamePath, code) {
  return buildShareUrl(gamePath, code);
}
