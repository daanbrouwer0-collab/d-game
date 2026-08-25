import { BridgeTransport } from "./bridge-transport.js";

const t = new BridgeTransport();
/** @type {{ inGame?: string[] }[]} */
const seen = [];
t.deliverPresence({ inGame: ["a"] });
t.setPresenceHandler((p) => seen.push(p));
console.assert(seen.length === 1 && seen[0].inGame?.[0] === "a", "buffers last presence");
t.deliverPresence({ inGame: ["a", "b"] });
console.assert(seen.length === 2 && seen[1].inGame?.length === 2, "forwards live presence");
console.log("bridge-transport presence ok");
