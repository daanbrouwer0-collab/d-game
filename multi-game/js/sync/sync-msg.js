/** Shared P2P game-sync message types (log-only canon). */
export const SyncMsg = Object.freeze({
  INTENT: "intent",
  ACK: "ack",
  REJECT: "reject",
  RESYNC: "resync",
  LOG: "log",
  CHECKPOINT: "checkpoint",
});
