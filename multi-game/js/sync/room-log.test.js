import {
  createRoomLog,
  RoomEvent,
  replayRoom,
  commitRoomEvent,
  newSessionId,
} from "./room-log.js";

let log = createRoomLog("ab7k2m");
log = commitRoomEvent(log, RoomEvent.CREATED, {
  hostPlayerId: "p1",
  maxPlayers: 6,
  version: 1,
}).log;
log = commitRoomEvent(log, RoomEvent.MEMBER_JOIN, {
  playerId: "p1",
  name: "Alice",
}).log;
log = commitRoomEvent(log, RoomEvent.MEMBER_JOIN, {
  playerId: "p2",
  name: "Bob",
}).log;
log = commitRoomEvent(log, RoomEvent.GAME_VOTE, {
  playerId: "p1",
  gameId: "tic-tac-toe",
}).log;
log = commitRoomEvent(log, RoomEvent.GAME_VOTE, {
  playerId: "p2",
  gameId: "ganzenbord",
}).log;
log = commitRoomEvent(log, RoomEvent.CHAT_MESSAGE, {
  messageId: "m1",
  playerId: "p1",
  name: "Alice",
  text: "Hoi!",
  ts: Date.now(),
}).log;
log = commitRoomEvent(log, RoomEvent.CHAT_MESSAGE, {
  messageId: "m2",
  playerId: "p2",
  name: "Bob",
  text: "Yo",
  ts: Date.now(),
}).log;
let state = replayRoom(log);
console.assert(state.chat.length === 2);
console.assert(state.chat[0].text === "Hoi!");
console.assert(state.chatSeq > 0);
console.assert(state.votes.get("p1") === "tic-tac-toe");
console.assert(state.votes.get("p2") === "ganzenbord");
const sid = newSessionId();
log = commitRoomEvent(log, RoomEvent.SESSION_START, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  roster: [],
}).log;
state = replayRoom(log);
console.assert(state.members.size === 2);
console.assert(state.activeSession?.gameId === "tic-tac-toe");
console.assert(state.votes.size === 0, "votes cleared on session start");
console.assert(state.chat.length === 2, "chat blijft na session_start");
log = commitRoomEvent(log, RoomEvent.SESSION_END, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  reason: "finished",
}).log;
state = replayRoom(log);
console.assert(state.activeSession === null);
console.assert(state.history.length === 1);
console.assert(state.votes.size === 0, "votes cleared on session end");
console.assert(state.chat.length === 2, "chat blijft na session_end");
console.log("room-log ok");
