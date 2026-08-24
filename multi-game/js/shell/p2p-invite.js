/**
 * Parse P2P invite from scanned QR text (URL or room code).
 * @param {string} raw
 * @returns {{ code: string, url: string | null } | null}
 */
export function parseP2pInvite(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    const room = url.searchParams.get("room");
    if (room && room.trim()) {
      return {
        code: room.trim().toUpperCase(),
        url: url.toString(),
      };
    }
  } catch {
    /* not a URL */
  }

  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length >= 4 && code.length <= 12) {
    return { code, url: null };
  }
  return null;
}

/**
 * @param {string} gamePath e.g. "/tic-tac-toe/"
 * @param {string} code
 */
export function buildP2pInviteUrl(gamePath, code) {
  const path = gamePath.endsWith("/") ? gamePath : `${gamePath}/`;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("room", code);
  return url.toString();
}
