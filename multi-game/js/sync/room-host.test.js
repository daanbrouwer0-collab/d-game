import { createRoomHostCommit } from "./room-host.js";
import {
  createRoomLog,
  RoomEvent,
  replayRoom,
  commitRoomEvent,
  newSessionId,
} from "./room-log.js";

const host = createRoomHostCommit();
let log = createRoomLog("test");
log = commitRoomEvent(log, RoomEvent.CREATED, {
  hostPlayerId: "p1",
  maxPlayers: 6,
  version: 1,
}).log;
const joined = host.joinMember(log, { playerId: "p2", name: "Bob" });
console.assert(joined.ok);
log = joined.log;
const dup = host.joinMember(log, { playerId: "p2", name: "Bob" });
console.assert(dup.ok && dup.log.events.length === log.events.length);
const sid = newSessionId();
const started = host.startSession(log, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  roster: [{ playerId: "p1", name: "Alice" }],
});
console.assert(started.ok);
log = started.log;
let state = replayRoom(log);
console.assert(state.activeSession?.sessionId === sid);
const ended = host.endSession(log, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  reason: "finished",
});
console.assert(ended.ok);
state = replayRoom(ended.log);
console.assert(state.activeSession === null);
const wire = host.encodeRoomLog(ended.log);
console.assert(wire.type === "room_log");
console.assert(wire.packet.gameId === "__room__");

const chat1 = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "Hallo room",
});
console.assert(chat1.ok);
log = chat1.log;

const empty = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "   ",
});
console.assert(!empty.ok && empty.reason === "empty");

const long = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "x".repeat(501),
});
console.assert(!long.ok && long.reason === "too_long");

let rateLog = log;
for (let i = 0; i < 10; i++) {
  const r = host.postChat(rateLog, {
    playerId: "p9",
    name: "Spammer",
    text: `msg ${i}`,
  });
  console.assert(r.ok, `rate msg ${i}`);
  rateLog = r.log;
}
const over = host.postChat(rateLog, {
  playerId: "p9",
  name: "Spammer",
  text: "one too many",
});
console.assert(!over.ok && over.reason === "rate_limit");

console.log("room-host ok");
