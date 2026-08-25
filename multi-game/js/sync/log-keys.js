export const ROOM_GAME_ID = "__room__";

export function roomLogKey(code) {
  const c = String(code || "").trim().toUpperCase();
  return `p2p:room:${c}`;
}

export function sessionLogKey(code, sessionId, gameId) {
  const c = String(code || "").trim().toUpperCase();
  return `p2p:session:${c}:${sessionId}:${gameId}`;
}
