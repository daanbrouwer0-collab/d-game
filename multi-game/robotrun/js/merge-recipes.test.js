import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configSrc = readFileSync(join(__dirname, "config.js"), "utf8");
const ctx = { console };
vm.runInNewContext(`${configSrc}\nthis.CONFIG = CONFIG;`, ctx);
globalThis.CONFIG = ctx.CONFIG;

const require = createRequire(import.meta.url);
const {
  resolveMergeRecipe,
  buildMergedCard,
  sortedTypes,
} = require("./merge-recipes.js");

assert.deepEqual(sortedTypes(["move2", "move1", "move1"]), ["move1", "move1", "move2"]);

const robot = { upgrades: [] };
assert.equal(
  resolveMergeRecipe([{ type: "move1" }, { type: "move1" }, { type: "move1" }], robot).output,
  "move2",
);
assert.equal(
  resolveMergeRecipe([{ type: "move1" }, null, { type: "move1" }], robot),
  null,
);
assert.equal(
  resolveMergeRecipe([{ type: "uturn" }, { type: "uturn" }, { type: "uturn" }], robot).output,
  "wait",
);
assert.equal(
  resolveMergeRecipe([{ type: "move1" }, { type: "turnL" }, null], robot),
  null,
);
assert.equal(
  resolveMergeRecipe(
    [{ type: "move1" }, { type: "turnL" }, null],
    { upgrades: [{ id: "crabWalk" }] },
  ).output,
  "strafeL",
);
assert.equal(
  resolveMergeRecipe(
    [{ type: "move2" }, { type: "move2" }, null],
    { upgrades: [{ id: "fourthGear" }] },
  ).output,
  "move4",
);
assert.equal(
  resolveMergeRecipe([{ type: "move2" }, { type: "move2" }, null], robot),
  null,
);
assert.equal(
  resolveMergeRecipe([{ type: "move1" }, null, null], robot),
  null,
);

const out = buildMergedCard(
  [
    { type: "move1", priority: 500 },
    { type: "move1", priority: 510 },
    { type: "move1", priority: 520 },
  ],
  "move2",
);
assert.equal(out.type, "move2");
assert.equal(out.label, "MOVE 2");
assert.equal(out.priority, 510);
assert.ok(out.id && String(out.id).startsWith("card_"));

assert.equal(
  resolveMergeRecipe(
    [{ type: "move2" }, { type: "uturn" }, null],
    { upgrades: [{ id: "jumpJets" }] },
  ).output,
  "jump",
);
assert.equal(
  resolveMergeRecipe([{ type: "move2" }, { type: "uturn" }, null], robot),
  null,
);

console.log("merge-recipes ok");
