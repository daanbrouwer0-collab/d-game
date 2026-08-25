import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveSeatAction } = require("./intent-bind.js");

const lobby = {
  seats: [
    { userId: "host-a", robotId: "player_1" },
    { userId: "guest-b", robotId: "player_2" },
  ],
};

assert.deepEqual(
  resolveSeatAction(lobby, { userId: "guest-b", robotId: "player_2" }, null, {}),
  { userId: "guest-b", robotId: "player_2" },
);

assert.equal(
  resolveSeatAction(lobby, { userId: "guest-b", robotId: "player_1" }, null, {}),
  null,
);

assert.deepEqual(
  resolveSeatAction(
    lobby,
    { userId: "spoof", robotId: "player_2" },
    "peer-1",
    { "peer-1": "guest-b" },
  ),
  { userId: "guest-b", robotId: "player_2" },
);

assert.equal(
  resolveSeatAction(lobby, { userId: "nobody", robotId: "player_9" }, null, {}),
  null,
);

console.log("intent-bind ok");
