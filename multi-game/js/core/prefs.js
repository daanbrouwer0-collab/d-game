/**
 * Global sandbox preferences (localStorage).
 */

const PREFERRED_KEY = "dgame.preferredTransport";

/** @typedef {'p2p'} PreferredTransport */

const ALLOWED = new Set(["p2p"]);

/**
 * @returns {PreferredTransport}
 */
export function getPreferredTransport() {
  try {
    const v = localStorage.getItem(PREFERRED_KEY);
    if (v && ALLOWED.has(v)) return /** @type {PreferredTransport} */ (v);
    if (v === "local" || v === "qr") {
      localStorage.setItem(PREFERRED_KEY, "p2p");
    }
  } catch {
    /* ignore */
  }
  return "p2p";
}

/**
 * @param {PreferredTransport} transport
 */
export function setPreferredTransport(transport) {
  if (!ALLOWED.has(transport)) {
    throw new Error(`Ongeldige voorkeur: ${transport}`);
  }
  try {
    localStorage.setItem(PREFERRED_KEY, transport);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ id: string, label: string, status: string, blurb: string }[]}
 */
export function listTransportMeta() {
  return [
    {
      id: "p2p",
      label: "P2P",
      status: "ready",
      blurb: "Live via PeerJS/WebRTC. Deellink of QR-scan om te joinen.",
    },
    {
      id: "matrix",
      label: "Matrix",
      status: "stub",
      blurb: "Zelfde Room API; login/homeserver komt later.",
    },
  ];
}
