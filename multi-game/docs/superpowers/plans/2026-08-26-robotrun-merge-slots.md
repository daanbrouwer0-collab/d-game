# RobotRun slot-tabs + Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Program/Merge slot tabs so players can combine 2–3 hand cards into one new card via config recipes (including upgrade-gated Crab Walk / Fourth Gear), with STIL (`wait`) from 3× U-TURN.

**Architecture:** Pure merge resolver in `merge-recipes.js` (unit-tested). Engine owns `mergeHandCards` + `wait` execution. UI tabs switch Program (5 registers) vs Merge (3 inputs + output preview). P2P: `rr_intent_merge` seat-bound on host, then snapshot. Merge UI state is local until merge commits to the hand.

**Tech Stack:** Vanilla JS (classic scripts), Node assert tests (same style as `intent-bind.test.js`), CSS in `board.css`.

**Spec:** [2026-08-26-robotrun-merge-slots-design.md](../specs/2026-08-26-robotrun-merge-slots-design.md)

## Global Constraints

- Commits only when the user asks (do not auto-commit unless requested).
- Do not change schade-lock / stepped-execution behavior except where merge touches the hand.
- `wait` must not appear in the normal draw pool (`generateProgramCard` / `getCardPoolForRobot`).
- Merge only in `phase === 'programming'`.
- Cards already placed in Program registers cannot be used as merge inputs.
- Output goes back into the hand; unlimited merges per round.
- Recipe match = multiset of types (order irrelevant); 2 or 3 inputs only.

## File map

| File | Responsibility |
|------|----------------|
| `robotrun/js/config.js` | `wait` card def + `MERGE_RECIPES` + helpers to find card type defs |
| `robotrun/js/merge-recipes.js` | Pure: normalize inputs, resolve recipe, build output card fields |
| `robotrun/js/merge-recipes.test.js` | Unit tests for recipes |
| `robotrun/js/robotrally-engine.js` | `resolveMergeRecipe`, `mergeHandCards`, `wait` in `executeCardAction` |
| `robotrun/index.html` | Slot tabs + merge row markup |
| `robotrun/css/board.css` | Tab + merge slot styles |
| `robotrun/js/robotrally-ui.js` | Tab state, fill/clear merge slots, preview, confirm merge |
| `robotrun/js/p2p-session.js` | `sendMerge` + host `rr_intent_merge` |
| `robotrun/index.html` (scripts) | Load `merge-recipes.js` before engine |
| Help copy (optional small) | One line under Uitleg about Merge |

---

### Task 1: Config — `wait` + `MERGE_RECIPES` + card lookup

**Files:**
- Modify: `multi-game/robotrun/js/config.js`
- Test: covered indirectly by Task 2

**Interfaces:**
- Produces: `CONFIG.CARD_TYPES` includes `wait`; `CONFIG.MERGE_RECIPES` array; `CONFIG.getCardTypeDef(type)` returning `{ type, label, icon, priorityBase }` from CARD_TYPES ∪ all UPGRADE_CARD_TYPES values (so `move4` / `strafeL` / `backup2` resolve without owning the upgrade for *definition* lookup — upgrade gate stays on the recipe).

- [ ] **Step 1: Add `wait` to CARD_TYPES**

```js
{ type: 'wait', label: 'STIL', icon: '⏸', priorityBase: 50 }
```

Place after `uturn` in `CARD_TYPES`.

- [ ] **Step 2: Add MERGE_RECIPES**

```js
MERGE_RECIPES: [
  { inputs: ['move1', 'move1', 'move1'], output: 'move2' },
  { inputs: ['move2', 'move2', 'move2'], output: 'move3' },
  { inputs: ['backup', 'backup', 'backup'], output: 'backup2' },
  { inputs: ['turnL', 'turnL', 'turnL'], output: 'uturn' },
  { inputs: ['turnR', 'turnR', 'turnR'], output: 'uturn' },
  { inputs: ['uturn', 'uturn', 'uturn'], output: 'wait' },
  { inputs: ['move1', 'turnL'], output: 'strafeL', requiresUpgrade: 'crabWalk' },
  { inputs: ['move1', 'turnR'], output: 'strafeR', requiresUpgrade: 'crabWalk' },
  { inputs: ['move3', 'move1'], output: 'move4', requiresUpgrade: 'fourthGear' },
  { inputs: ['move2', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
  { inputs: ['move1', 'move1', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
  { inputs: ['move3', 'move2'], output: 'move4', requiresUpgrade: 'fourthGear' },
],
```

- [ ] **Step 3: Add getCardTypeDef**

```js
getCardTypeDef(type) {
  const fromBase = (this.CARD_TYPES || []).find((c) => c.type === type);
  if (fromBase) return fromBase;
  const upgrades = this.UPGRADE_CARD_TYPES || {};
  for (const list of Object.values(upgrades)) {
    const hit = (list || []).find((c) => c.type === type);
    if (hit) return hit;
  }
  return null;
},
```

Attach on `CONFIG` object (same file pattern as other CONFIG fields).

- [ ] **Step 4: Sanity check in node**

Run:

```bash
node -e "global.CONFIG=null; /* load via fs eval or skip if classic */"
```

Prefer verifying via Task 2 tests once `merge-recipes` imports CONFIG through a small require/bootstrap. If `config.js` is classic-script-only, Task 2 will inject CONFIG in the test file (same as engine tests pattern below).

---

### Task 2: Pure merge resolver + unit tests (TDD)

**Files:**
- Create: `multi-game/robotrun/js/merge-recipes.js`
- Create: `multi-game/robotrun/js/merge-recipes.test.js`

**Interfaces:**
- Consumes: `CONFIG.MERGE_RECIPES`, `CONFIG.getCardTypeDef`
- Produces:
  - `sortedTypes(types: string[]): string[]`
  - `resolveMergeRecipe(cards: Array<{type:string}|null|undefined>, robot: {upgrades?: Array<{id:string}>}|null): { inputs: string[], output: string, requiresUpgrade?: string } | null`
  - `buildMergedCard(inputCards: Array<{type,priority}>, outputType: string): { id, type, label, icon, priority } | null`

- [ ] **Step 1: Write failing tests**

Create `merge-recipes.test.js`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load classic CONFIG into global
const configSrc = readFileSync(join(__dirname, "config.js"), "utf8");
const configSandbox = { CONFIG: null };
(new Function("exports", "module", "window", configSrc + "\n;this.CONFIG = CONFIG;")).call(configSandbox);
globalThis.CONFIG = configSandbox.CONFIG || (typeof CONFIG !== "undefined" ? CONFIG : null);

// If config.js only assigns const CONFIG in outer scope, eval differently:
if (!globalThis.CONFIG) {
  // Fallback: vm-run config as script with var injection
  const vm = await import("node:vm");
  const ctx = { console };
  vm.runInNewContext(configSrc + "\nthis.CONFIG = CONFIG;", ctx);
  globalThis.CONFIG = ctx.CONFIG;
}

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
); // only 2 move1 — no recipe
assert.equal(
  resolveMergeRecipe([{ type: "uturn" }, { type: "uturn" }, { type: "uturn" }], robot).output,
  "wait",
);
assert.equal(
  resolveMergeRecipe([{ type: "move1" }, { type: "turnL" }, null], robot),
  null,
); // needs crabWalk
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
); // single card

const out = buildMergedCard(
  [{ type: "move1", priority: 500 }, { type: "move1", priority: 510 }, { type: "move1", priority: 520 }],
  "move2",
);
assert.equal(out.type, "move2");
assert.equal(out.label, "MOVE 2");
assert.equal(out.priority, 510);
assert.ok(out.id && out.id.startsWith("card_"));

console.log("merge-recipes ok");
```

If `config.js` cannot load cleanly under `vm`, duplicate the minimal `MERGE_RECIPES` + `getCardTypeDef` stubs inside the test file for isolation — but prefer loading real CONFIG.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd multi-game/robotrun/js && node merge-recipes.test.js
```

Expected: `Cannot find module './merge-recipes.js'` or missing exports.

- [ ] **Step 3: Implement `merge-recipes.js`**

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(typeof CONFIG !== "undefined" ? CONFIG : globalThis.CONFIG);
  } else {
    root.MergeRecipes = factory(root.CONFIG);
  }
})(typeof self !== "undefined" ? self : this, function (CONFIG) {
  function sortedTypes(types) {
    return [...types].filter(Boolean).map(String).sort();
  }

  function recipeKey(inputs) {
    return sortedTypes(inputs).join("|");
  }

  function robotHasUpgrade(robot, upgradeId) {
    if (!upgradeId) return true;
    return (robot?.upgrades || []).some((u) => (u && u.id ? u.id : u) === upgradeId);
  }

  function resolveMergeRecipe(cards, robot) {
    const filled = (cards || []).filter(Boolean);
    if (filled.length < 2 || filled.length > 3) return null;
    const types = filled.map((c) => c.type);
    const key = recipeKey(types);
    const recipes = (CONFIG && CONFIG.MERGE_RECIPES) || [];
    for (const recipe of recipes) {
      if (recipeKey(recipe.inputs) !== key) continue;
      if (!robotHasUpgrade(robot, recipe.requiresUpgrade)) continue;
      return recipe;
    }
    return null;
  }

  function buildMergedCard(inputCards, outputType) {
    const def = CONFIG.getCardTypeDef
      ? CONFIG.getCardTypeDef(outputType)
      : (CONFIG.CARD_TYPES || []).find((c) => c.type === outputType);
    if (!def) return null;
    const prios = (inputCards || []).filter(Boolean).map((c) => Number(c.priority) || 0);
    const priority = prios.length
      ? Math.round(prios.reduce((a, b) => a + b, 0) / prios.length)
      : def.priorityBase;
    const idRoll = Math.random().toString(36).slice(2, 10);
    return {
      id: `card_${idRoll}`,
      type: def.type,
      label: def.label,
      icon: def.icon,
      priority,
    };
  }

  return { sortedTypes, resolveMergeRecipe, buildMergedCard, recipeKey };
});
```

Note: engine may later pass an optional `rng` into `buildMergedCard` for P2P determinism — if so, add `buildMergedCard(inputs, outputType, rngFn)` and use `rngFn()` instead of `Math.random` when provided.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd multi-game/robotrun/js && node merge-recipes.test.js
```

Expected: `merge-recipes ok`

- [ ] **Step 5: Load script in `index.html`**

Before `robotrally-engine.js`:

```html
<script src="js/merge-recipes.js"></script>
```

---

### Task 3: Engine — mergeHandCards + wait execution + exclude wait from draw

**Files:**
- Modify: `multi-game/robotrun/js/robotrally-engine.js`
- Test: extend `merge-recipes.test.js` OR add a thin engine smoke if feasible; minimum: keep pure tests green and manual checklist later

**Interfaces:**
- Consumes: `MergeRecipes.resolveMergeRecipe`, `MergeRecipes.buildMergedCard`
- Produces:
  - `engine.resolveMergeRecipe(cards, robot)` → recipe|null (delegate)
  - `engine.mergeHandCards(robotId, cardIds: string[]): boolean`
  - `executeCardAction` handles `wait`

- [ ] **Step 1: Exclude `wait` from draw pool**

In `getCardPoolForRobot`, start from `CONFIG.CARD_TYPES.filter(c => c.type !== 'wait')` then add upgrade cards as now.

- [ ] **Step 2: Add resolveMergeRecipe + mergeHandCards**

```js
resolveMergeRecipe(cards, robot) {
  const api = typeof MergeRecipes !== "undefined" ? MergeRecipes : null;
  if (!api) return null;
  return api.resolveMergeRecipe(cards, robot);
}

mergeHandCards(robotId, cardIds) {
  if (this.phase !== "programming") return false;
  const robot = this.robots.find((r) => r.id === robotId);
  if (!robot || !this.isRobotInGame(robot) || robot.shutdownActive) return false;

  const ids = (cardIds || []).filter(Boolean);
  if (ids.length < 2 || ids.length > 3) return false;
  if (new Set(ids).size !== ids.length) return false;

  const registerIds = new Set(
    (robot.registers || []).filter(Boolean).map((c) => c.id),
  );
  const cards = [];
  for (const id of ids) {
    if (registerIds.has(id)) return false;
    const card = (robot.hand || []).find((c) => c.id === id);
    if (!card) return false;
    cards.push(card);
  }

  const recipe = this.resolveMergeRecipe(cards, robot);
  if (!recipe) return false;

  const api = MergeRecipes;
  const rng = this.isP2pMode() ? () => this.rng() : Math.random;
  const merged = api.buildMergedCard(cards, recipe.output, rng);
  // If buildMergedCard does not accept rng yet, patch it in Task 2 follow-up.
  if (!merged) return false;

  robot.hand = robot.hand.filter((c) => !ids.includes(c.id));
  robot.hand.push(merged);
  robot.hand.sort((a, b) => b.priority - a.priority);
  this.pushLog(`${robot.name} merged → ${merged.label}.`);
  this.emitStateChange();
  return true;
}
```

Update `buildMergedCard` to accept optional third arg `rngFn`:

```js
function buildMergedCard(inputCards, outputType, rngFn) {
  const roll = typeof rngFn === "function" ? rngFn() : Math.random();
  const idRoll = roll.toString(36).slice(2, 10);
  // ...
}
```

- [ ] **Step 3: Handle `wait` in executeCardAction**

```js
case 'wait':
  this.pushLog(`${robot.name} blijft stil.`);
  break;
```

(Or rely on the existing play log line only — either way, no movement.)

- [ ] **Step 4: Quick node syntax check**

```bash
node --check multi-game/robotrun/js/robotrally-engine.js
node multi-game/robotrun/js/merge-recipes.test.js
```

Expected: OK / `merge-recipes ok`

---

### Task 4: HTML + CSS — tabs and merge slots

**Files:**
- Modify: `multi-game/robotrun/index.html` (programming-panel registers area)
- Modify: `multi-game/robotrun/css/board.css`

**Interfaces:**
- Produces DOM:
  - `#slot-tabs` with buttons `data-slot-tab="program"|"merge"`
  - `#registers-row-program` wrapping existing 5 `.register-slot`
  - `#registers-row-merge` with 3 `.merge-input-slot` + 1 `.merge-output-slot` + optional `#btn-merge-cards`

- [ ] **Step 1: Replace registers-row markup**

```html
<div id="slot-tabs" class="slot-tabs" role="tablist">
  <button type="button" class="slot-tab active" data-slot-tab="program" role="tab">Program</button>
  <button type="button" class="slot-tab" data-slot-tab="merge" role="tab">Merge</button>
</div>

<div id="registers-row-program" class="registers-row" data-slot-panel="program">
  <div class="register-slot" data-index="0"><span class="register-num">1</span></div>
  <div class="register-slot" data-index="1"><span class="register-num">2</span></div>
  <div class="register-slot" data-index="2"><span class="register-num">3</span></div>
  <div class="register-slot" data-index="3"><span class="register-num">4</span></div>
  <div class="register-slot" data-index="4"><span class="register-num">5</span></div>
</div>

<div id="registers-row-merge" class="registers-row merge-row hidden" data-slot-panel="merge">
  <div class="merge-input-slot register-slot" data-merge-index="0"><span class="register-num">A</span></div>
  <div class="merge-input-slot register-slot" data-merge-index="1"><span class="register-num">B</span></div>
  <div class="merge-input-slot register-slot" data-merge-index="2"><span class="register-num">C</span></div>
  <div class="merge-arrow" aria-hidden="true">→</div>
  <div class="merge-output-slot register-slot" id="merge-output-slot"><span class="register-num">OUT</span></div>
</div>
<button id="btn-merge-cards" class="btn success below-cards-action hidden" type="button">Merge</button>
```

Keep `#btn-confirm-program` after hand as now; place `#btn-merge-cards` near confirm or under merge row — UI should show Merge button only on merge tab during programming.

- [ ] **Step 2: CSS**

Add to `board.css`:

```css
.slot-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.slot-tab {
  flex: 1;
  /* match existing btn alt look */
}
.slot-tab.active {
  /* highlight */
}
.merge-row {
  align-items: center;
}
.merge-arrow {
  opacity: 0.7;
  font-weight: 700;
}
.merge-output-slot {
  outline: 1px dashed rgba(56, 189, 248, 0.55);
}
.merge-output-slot.is-ready {
  outline-color: #4ade80;
}
```

Reuse `.register-slot` / `.filled` / `.locked-register` classes where possible.

- [ ] **Step 3: Visual check**

Open RobotRun locally, confirm both rows exist; merge row hidden by default.

---

### Task 5: UI wiring — tabs, hand fill, merge confirm

**Files:**
- Modify: `multi-game/robotrun/js/robotrally-ui.js`

**Interfaces:**
- Consumes: `engine.resolveMergeRecipe`, `engine.mergeHandCards`, DOM from Task 4
- Produces: `slotTab`, `mergeInputs[3]`, `setSlotTab`, `renderMergeSlots`, `confirmMerge`

- [ ] **Step 1: State + constructors**

```js
this.slotTab = 'program';
this.mergeInputs = [null, null, null];
this.slotTabsEl = document.getElementById('slot-tabs');
this.programSlotsRow = document.getElementById('registers-row-program');
this.mergeSlotsRow = document.getElementById('registers-row-merge');
this.btnMergeCards = document.getElementById('btn-merge-cards');
```

- [ ] **Step 2: Tab switching**

```js
setSlotTab(tab) {
  this.slotTab = tab === 'merge' ? 'merge' : 'program';
  this.slotTabsEl?.querySelectorAll('.slot-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.slotTab === this.slotTab);
  });
  this.programSlotsRow?.classList.toggle('hidden', this.slotTab !== 'program');
  this.mergeSlotsRow?.classList.toggle('hidden', this.slotTab !== 'merge');
  this.updateCardsUI();
}
```

Bind click on `.slot-tab`.

- [ ] **Step 3: Hand click routing**

When placing a hand card:
- If `slotTab === 'program'`: existing empty unlocked register logic.
- If `slotTab === 'merge'`: first empty `mergeInputs[i]`; skip cards already in `selectedRegisters` or `mergeInputs`; card must be in hand.

When clearing: merge-input click clears that slot.

`isUsed` for hand highlighting: used in `selectedRegisters` **or** `mergeInputs`.

- [ ] **Step 4: renderMergeSlots + preview**

```js
renderMergeSlots() {
  const robot = this.getProgrammingRobot();
  const recipe = this.engine.resolveMergeRecipe(this.mergeInputs, robot);
  // paint 3 inputs like register slots
  // output: if recipe, show CONFIG.getCardTypeDef(recipe.output) label/icon (preview, no id yet)
  this.btnMergeCards?.classList.toggle('hidden', !(this.slotTab === 'merge' && recipe && this.engine.phase === 'programming'));
}
```

Call from `updateCardsUI` / `renderRegisterSlots`.

- [ ] **Step 5: confirmMerge**

```js
confirmMerge() {
  if (this.engine.phase !== 'programming') return;
  const robot = this.getProgrammingRobot();
  if (!robot) return;
  const ids = this.mergeInputs.filter(Boolean).map((c) => c.id);
  if (this.isP2pMode() && P2pSessionController?.isActive?.()) {
    P2pSessionController.sendMerge(ids).then(() => {
      this.mergeInputs = [null, null, null];
      this.updateCardsUI();
    }).catch((err) => Toast.show(err.message || 'Merge mislukt'));
    return;
  }
  if (!this.engine.mergeHandCards(robot.id, ids)) {
    Toast.show('Geen geldige merge');
    return;
  }
  this.mergeInputs = [null, null, null];
  this.updateCardsUI();
}
```

Bind `#btn-merge-cards` and click on `#merge-output-slot` when recipe ready.

- [ ] **Step 6: Reset mergeInputs on new round / commit / robot switch**

Clear `mergeInputs` when `programmingRegistersKey` changes, on commit, and when leaving programming phase.

- [ ] **Step 7: Manual smoke**

Hotseat: 3× MOVE 1 on Merge tab → Merge → MOVE 2 in hand.

---

### Task 6: P2P — `rr_intent_merge`

**Files:**
- Modify: `multi-game/robotrun/js/p2p-session.js`

**Interfaces:**
- Consumes: `engine.mergeHandCards`, `RobotRunIntentBind.resolveSeatAction`
- Produces: `sendMerge(cardIds)`, host handler for `rr_intent_merge`

- [ ] **Step 1: sendMerge**

```js
async sendMerge(cardIds) {
  const robotId = this.localRobotId();
  if (!robotId) throw new Error("Geen robot");
  if (this.isHost()) {
    const ok = window.RobotRallyApp.engine.mergeHandCards(robotId, cardIds);
    if (!ok) throw new Error("Merge mislukt");
    await this.publishSnapshot();
    return;
  }
  this.send("rr_intent_merge", {
    userId: this.playerId,
    robotId,
    cardIds: (cardIds || []).filter(Boolean),
  });
  // Host will snapshot; guest applies via existing snap path
},
```

If guest needs ACK UX, follow existing commit pattern (fire-and-wait for snap). Mirror whatever `sendCommit` does for guest feedback.

- [ ] **Step 2: Host handler**

Next to other intents:

```js
if (type === "rr_intent_merge") {
  const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
    this.lobby, payload, msg.fromPeerId, this.peerToPlayer || {},
  );
  if (!bound) return;
  if (bound.userId === this.playerId) return;
  window.RobotRallyApp.engine.mergeHandCards(bound.robotId, payload.cardIds);
  this.publishSnapshot().catch(() => {});
  return;
}
```

- [ ] **Step 3: Manual P2P check**

Two browsers: guest merges 3× MOVE 1 → both see MOVE 2 in that guest’s hand after snap.

---

### Task 7: Docs polish

**Files:**
- Modify: `multi-game/docs/superpowers/specs/2026-08-26-robotrun-merge-slots-design.md` (status → geïmplementeerd when done)
- Modify: `multi-game/docs/superpowers/plans/README.md` (link this plan)
- Optional: one help bullet in `robotrun/index.html` Uitleg about Merge tab

- [ ] **Step 1: Add plan to plans README**

```md
| [2026-08-26-robotrun-merge-slots.md](./2026-08-26-robotrun-merge-slots.md) | Slot-tabs + Merge | Plan |
```

- [ ] **Step 2: After implementation, set spec status to geïmplementeerd**

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Program / Merge tabs | 4, 5 |
| 3 inputs + output preview | 4, 5 |
| Output → hand | 3, 5 |
| Unlimited merges | 3, 5 |
| 2 or 3 inputs | 2, 3 |
| Standard recipes + STIL | 1, 2, 3 |
| Crab / Fourth Gear recipes | 1, 2 |
| wait not in draw pool | 3 |
| wait no-op on Play | 3 |
| Cards in registers blocked | 3, 5 |
| P2P intent | 6 |
| Average priority | 2 |

## Manual test checklist (from spec)

1. Tabs Program ↔ Merge; hand fills active slots.  
2. 3× MOVE 1 → MOVE 2 in hand.  
3. MOVE 1 + TURN L without Crab → no merge; with Crab → KRAB L.  
4. Fourth Gear recipes → MOVE 4.  
5. 3× U-TURN → STIL; STIL does nothing on Play.  
6. Card in register cannot enter merge.  
7. P2P guest merge syncs.  
8. Multiple merges one round.
