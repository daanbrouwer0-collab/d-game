import { LocalTransport } from "../transport/local.js";
import { P2PTransport } from "../transport/p2p.js";
import { MatrixTransport } from "../transport/matrix.js";
import { QrTransport } from "../transport/qr.js";
import { TransportType } from "../p2p/protocol.js";

/**
 * @typedef {'local'|'p2p'|'matrix'|'qr'} TransportKind
 *
 * @typedef {{
 *   gameId: string,
 *   transport?: TransportKind,
 *   maxGuests?: number,
 * }} CreateRoomOptions
 */

/**
 * Factory: games call this instead of PeerJS / Matrix / QR directly.
 * @param {CreateRoomOptions} options
 * @returns {LocalTransport | P2PTransport | MatrixTransport | QrTransport}
 */
export function createRoom({ gameId, transport = "p2p", maxGuests = 1 }) {
  if (!gameId) throw new Error("gameId is verplicht");

  switch (transport) {
    case "local":
      return new LocalTransport({ gameId, maxGuests });
    case "p2p":
      return new P2PTransport({ gameId, maxGuests });
    case "qr":
      return new QrTransport({ gameId, maxGuests });
    case "matrix":
      return new MatrixTransport({ gameId, maxGuests });
    default:
      throw new Error(`Onbekend transport: ${transport}`);
  }
}

/**
 * @param {string} [search]
 * @returns {'p2p'|'qr'|null}
 */
export function transportFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const room = params.get("room");
  if (!room || !room.trim()) return null;
  if (params.get("via") === "qr") return "qr";
  return "p2p";
}

export { TransportType };
