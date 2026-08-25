(function (root) {
  /**
   * @param {{ seats?: Array<{ userId: string, robotId: string }> }} lobby
   * @param {{ userId?: string, robotId?: string }} payload
   * @param {string|null|undefined} fromPeerId
   * @param {Record<string, string>} [peerToPlayer]
   * @returns {{ userId: string, robotId: string } | null}
   */
  function resolveSeatAction(lobby, payload, fromPeerId, peerToPlayer) {
    const seats = Array.isArray(lobby?.seats) ? lobby.seats : [];
    const map = peerToPlayer && typeof peerToPlayer === "object" ? peerToPlayer : {};
    const claimedUserId = String(payload?.userId || "");
    const claimedRobotId = String(payload?.robotId || "");
    const boundUserId =
      fromPeerId && map[fromPeerId] ? String(map[fromPeerId]) : claimedUserId;
    if (!boundUserId) return null;
    const seat = seats.find((s) => s && String(s.userId) === boundUserId);
    if (!seat) return null;
    const robotId = String(seat.robotId || "");
    if (!robotId) return null;
    if (claimedRobotId && claimedRobotId !== robotId) return null;
    return { userId: String(seat.userId), robotId };
  }

  root.RobotRunIntentBind = { resolveSeatAction };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { resolveSeatAction };
  }
})(typeof window !== "undefined" ? window : globalThis);
