import { isRoomPlayable, SyncProfile } from "./embedded-contract.js";
import { stubEmbeddedAdapter } from "./embedded-bootstrap.js";

console.assert(isRoomPlayable({ syncProfile: SyncProfile.EVENT_LOG, roomReady: true }));
console.assert(!isRoomPlayable({ syncProfile: SyncProfile.EVENT_LOG, roomReady: false }));
console.assert(!isRoomPlayable(undefined));

const stub = stubEmbeddedAdapter({ gameId: "test", title: "Test" });
console.assert(stub.gameId === "test");
console.assert(typeof stub.start === "function");

console.log("embedded-bootstrap ok");
