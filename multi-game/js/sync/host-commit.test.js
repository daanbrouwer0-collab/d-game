import { createEventLog, tipSeq } from "./event-log.js";
import { createHostCommit } from "./host-commit.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

const hc = createHostCommit({ gameId: "tic-tac-toe" });
hc.bindPeer("peer1", "pA");
assert(hc.playerForPeer("peer1") === "pA");

let log = createEventLog("tic-tac-toe");
const denied = hc.acceptBoundIntent({
  log,
  fromPeerId: "peer1",
  intentId: "i1",
  actorPlayerId: "pB",
  apply: () => ({ ok: true, log }),
});
assert(!denied.ok && denied.reason === "actor");

const allowedApply = hc.acceptBoundIntent({
  log,
  fromPeerId: "peer1",
  intentId: "i2",
  actorPlayerId: "pA",
  apply: (l) => hc.commit(l, "move", { index: 0, mark: "X" }),
});
assert(allowedApply.ok);
assert(tipSeq(allowedApply.log) === 1);

hc.markTurnKeyDone("t1");
assert(hc.isTurnKeyDone("t1"));
assert(!hc.isTurnKeyDone("t2"));

console.log("host-commit tests ok");
