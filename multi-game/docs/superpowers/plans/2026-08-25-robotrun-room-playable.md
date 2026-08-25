# RobotRun Room-Playable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RobotRun playable in the room shell for 2–5 players: visible board + own hand, simultaneous programming, host Play, execution until win and `session_end`.

**Architecture:** Keep the existing RoboRally engine and snapshot sync profile. Fix embedded boot so `RobotRallyApp` loads before room bootstrap. Harden host intent handling (seat-bound commit/upgrade). Polish embedded chrome so the play surface is usable. Do not migrate to log-only.

**Tech Stack:** Vanilla JS (classic scripts + ES modules), room bridge (`BridgeTransport` / `SyncMsg.LOG` + `rr_*` intents), existing `RobotRallyEngine` / `P2pSessionController`.

**Spec:** [2026-08-25-robotrun-room-playable-design.md](../specs/2026-08-25-robotrun-room-playable-design.md)

## Global Constraints

- Keep full RoboRally rules (no simplified ruleset).
- Sync stays **snapshot** (`start` / `snap` in session log); no event-log-only migration.
- v1 success = room race start → finish → `SESSION_ENDED`; hotseat polish and mid-race reconnect are out of scope.
- Do not edit `multi-game-netlify/`.
- Do not commit `OUTDOOR DRINKS.html`.
- Commits only when the user asks, unless the executing agent was explicitly told to commit per task — then use the commit steps below.

## File map

| File | Responsibility |
|------|----------------|
| `robotrun/index.html` | Always load `js/main.js` so `RobotRallyApp` exists in embedded mode |
| `robotrun/js/embedded.js` | Init app + patch session + room bootstrap |
| `robotrun/js/room-embedded.js` | Host start race, LOG wire, guest adopt, intent dispatch |
| `robotrun/js/p2p-session.js` | Seat-bound commit/upgrade validation; snapshot apply/sanitize |
| `robotrun/js/intent-bind.js` | Pure helper: map intent → allowed `{ userId, robotId }` from seats |
| `robotrun/js/intent-bind.test.js` | Node ESM asserts for bind helper |
| `robotrun/css/embedded.css` | Force play layout in `html.dgame-embedded` (hide chrome, fill iframe) |
| `multi-game/README.md` | RobotRun room embedded = Ja |
| `multi-game/docs/p2p-multiplayer.md` | Same status update |

---

### Task 1: Fix embedded boot (black screen)

**Files:**
- Modify: `multi-game/robotrun/index.html` (script block near end)
- Modify: `multi-game/robotrun/js/embedded.js`
- Test: manual / console check (step below)

**Interfaces:**
- Consumes: classic scripts already in `index.html` (`config.js` … `robotrally-ui.js`, `p2p-session.js`)
- Produces: `window.RobotRallyApp` defined before `import("./js/embedded.js")`; `RobotRallyApp.init({ embedded: true })` runs in `prepareUI`

**Why:** Today `?embedded=1` only imports `embedded.js` and never loads `js/main.js`, so `window.RobotRallyApp` is missing → bootstrap throws / blank dark UI (`--bg-app: #050814`).

- [ ] **Step 1: Always load `main.js` as a classic script before the module bootstrap**

In `multi-game/robotrun/index.html`, after the classic game scripts and **before** the `<script type="module">` block, add:

```html
  <script src="js/main.js"></script>
  <script type="module">
    import { getUrlParams } from "../js/shell/site-url.js";
    import { redirectLegacyGameRoomToShell } from "../js/shell/room-only-multiplayer.js";
    if (getUrlParams().get("embedded") === "1") {
      await import("./js/embedded.js");
    } else if (!redirectLegacyGameRoomToShell()) {
      /* main.js already loaded; DOMContentLoaded will call RobotRallyApp.init() for non-embedded */
    }
  </script>
```

Remove the previous dynamic `document.createElement("script")` loader for `js/main.js` (non-embedded path) so `main.js` is not loaded twice.

Confirm `main.js` still guards embedded auto-init:

```js
document.addEventListener('DOMContentLoaded', () => {
  if (window.__DGAME_EMBEDDED) return;
  if (new URLSearchParams(location.search).get('embedded') === '1') return;
  window.RobotRallyApp.init();
});
```

- [ ] **Step 2: Make `embedded.js` fail loudly if boot is incomplete**

Replace `prepareUI` / `start` so init is mandatory:

```js
prepareUI() {
  stripEmbeddedChrome();
  hideEmbeddedLeaveButtons(".embedded-leave");
  if (!window.RobotRallyApp?.init) {
    throw new Error("RobotRun boot: RobotRallyApp ontbreekt (main.js niet geladen)");
  }
  if (!window.RobotRallyApp.engine) {
    window.RobotRallyApp.init({ embedded: true });
  }
  if (!window.P2pSessionController) {
    throw new Error("RobotRun boot: P2pSessionController ontbreekt");
  }
},
start(ctx) {
  applySpectatorMode(ctx.participation === "spectator");
  stripEmbeddedChrome();
  hideEmbeddedLeaveButtons(".embedded-leave");
  if (!window.RobotRallyApp?.engine) {
    throw new Error("RobotRun boot: engine niet geïnitialiseerd");
  }
  bootstrapRoomEmbedded(ctx);
},
```

Keep `patchP2pSessionForRoom()` at module top (needs `P2pSessionController` from classic `p2p-session.js`).

- [ ] **Step 3: Verify boot without full room (iframe smoke)**

Serve `multi-game` locally (whatever the repo already uses, e.g. static server). Open:

`/robotrun/index.html?embedded=1`

In DevTools console:

```js
typeof window.RobotRallyApp === "object" && !!window.RobotRallyApp.engine
```

Expected before room `SESSION_INIT`: still `false` for engine until bridge init — but **after** page load scripts:

```js
typeof window.RobotRallyApp?.init === "function"
```

Expected: `true` (no longer `undefined`).

Also confirm console has **no** `RobotRun niet geladen` / `RobotRallyApp ontbreekt` on load alone (READY may wait for parent).

- [ ] **Step 4: Commit** (only if user asked for commits)

```bash
git add multi-game/robotrun/index.html multi-game/robotrun/js/embedded.js
git commit -m "Fix RobotRun embedded boot by loading main.js."
```

---

### Task 2: Embedded play chrome (visible board, not empty shell)

**Files:**
- Create: `multi-game/robotrun/css/embedded.css`
- Modify: `multi-game/robotrun/index.html` (link stylesheet)
- Modify: `multi-game/robotrun/js/room-embedded.js` (`bootstrapRoomEmbedded` / `startEmbeddedRace`)

**Interfaces:**
- Consumes: `document.documentElement.classList` `dgame-embedded` from `stripEmbeddedChrome`
- Produces: play screen fills iframe; after race start, canvas resized and `#screen-play` active

- [ ] **Step 1: Add embedded layout CSS**

Create `multi-game/robotrun/css/embedded.css`:

```css
/* Room iframe: only the race UI matters */
html.dgame-embedded .bottom-nav,
html.dgame-embedded #menu-scrim,
html.dgame-embedded #menu-popup,
html.dgame-embedded #session-modal,
html.dgame-embedded #screen-courses,
html.dgame-embedded #screen-character,
html.dgame-embedded #screen-help,
html.dgame-embedded #screen-settings {
  display: none !important;
}

html.dgame-embedded #screen-play {
  display: flex !important;
  position: absolute;
  inset: 0;
  z-index: 1;
}

html.dgame-embedded #game-wrap {
  height: 100%;
  min-height: 0;
}

html.dgame-embedded #canvas-container {
  flex: 1 1 auto;
  min-height: 12rem;
}

html.dgame-embedded #board-canvas {
  display: block;
  max-width: 100%;
}
```

Link it in `index.html` after `board.css`:

```html
  <link rel="stylesheet" href="css/embedded.css">
```

- [ ] **Step 2: After race start / snapshot apply, force play tab + resize**

In `bootstrapRoomEmbedded` (end) and at the end of `startEmbeddedRace`, ensure:

```js
Nav.switchTab("play");
if (app.ui) {
  app.ui.resizeCanvas();
  app.ui.updateCardsUI();
  app.ui.render?.();
}
```

(`startEmbeddedRace` already does part of this — keep one clear call site; guests get the same via `applyGameSnapshot({ enterPlay: true })`.)

In `applyGameSnapshot` when `enterPlay` is true (already switches tab), also call `app.ui.render?.()` if missing.

- [ ] **Step 3: Manual check in room**

1. Host room with 2 browsers / profiles.
2. Start RobotRun.
3. Both iframes show a drawn board (tiles/robots), not a flat black rectangle.
4. Local hand / register slots visible under the board.

Expected: tiles visible; programming panel present.

- [ ] **Step 4: Commit** (only if user asked for commits)

```bash
git add multi-game/robotrun/css/embedded.css multi-game/robotrun/index.html multi-game/robotrun/js/room-embedded.js multi-game/robotrun/js/p2p-session.js
git commit -m "Show RobotRun play surface in room iframe."
```

---

### Task 3: Seat-bound intent validation (host)

**Files:**
- Create: `multi-game/robotrun/js/intent-bind.js`
- Create: `multi-game/robotrun/js/intent-bind.test.js` (Node runnable)
- Modify: `multi-game/robotrun/index.html` (script tag before `p2p-session.js`)
- Modify: `multi-game/robotrun/js/p2p-session.js` (`handleMessage` for `rr_intent_commit` / `rr_intent_upgrade`)

**Interfaces:**
- Produces:
  - `window.RobotRunIntentBind.resolveSeatAction(lobby, payload, fromPeerId, peerToPlayer) => { userId: string, robotId: string } | null`
- Consumes: `lobby.seats[]` with `{ userId, robotId }`; intent payload `{ userId?, robotId? }`

- [ ] **Step 1: Write failing Node test**

Create `multi-game/robotrun/js/intent-bind.test.js`:

```js
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
```

Run once before implementing Step 2 — expected: `Cannot find module` / require failure.

- [ ] **Step 2: Implement classic `intent-bind.js`**

```js
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
```

Add `<script src="js/intent-bind.js"></script>` later in Step 4 (before `p2p-session.js`).

- [ ] **Step 3: Run test — expect fail before file exists, pass after**

```bash
cd multi-game && node --input-type=module robotrun/js/intent-bind.test.js
```

Expected after implementation: `intent-bind ok`

- [ ] **Step 4: Wire host handlers in `p2p-session.js`**

Replace `rr_intent_commit` / `rr_intent_upgrade` host branches:

```js
if (type === "rr_intent_commit") {
  const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
    this.lobby,
    payload,
    msg.fromPeerId,
    this.peerToPlayer || {},
  );
  if (!bound) return;
  if (bound.userId === this.playerId) return;
  window.RobotRallyApp.engine.commitRegistersForRobot(
    bound.robotId,
    payload.registers,
  );
  this.publishSnapshot().catch(() => {});
  return;
}

if (type === "rr_intent_upgrade") {
  const bound = window.RobotRunIntentBind?.resolveSeatAction?.(
    this.lobby,
    payload,
    msg.fromPeerId,
    this.peerToPlayer || {},
  );
  if (!bound) return;
  if (bound.userId === this.playerId) return;
  const choice = window.RobotRallyApp.engine.currentUpgradeChoice;
  if (choice && choice.robotId === bound.robotId) {
    window.RobotRallyApp.engine.chooseUpgrade(payload.upgradeId);
    this.publishSnapshot().catch(() => {});
  }
}
```

Add `<script src="js/intent-bind.js"></script>` in `index.html` before `p2p-session.js`.

- [ ] **Step 5: Commit** (only if user asked for commits)

```bash
git add multi-game/robotrun/js/intent-bind.js multi-game/robotrun/js/intent-bind.test.js multi-game/robotrun/js/p2p-session.js multi-game/robotrun/index.html
git commit -m "Bind RobotRun commit intents to lobby seats."
```

---

### Task 4: Round-flow hardening (programming → ready → Play → execute)

**Files:**
- Modify: `multi-game/robotrun/js/room-embedded.js` (guest intent path / host message payload)
- Modify: `multi-game/robotrun/js/robotrally-ui.js` only if Play/confirm gates are wrong in embedded
- Modify: `multi-game/robotrun/js/p2p-session.js` (`sanitizeStateForLocalView` already hides secrets — verify guests keep own hand)

**Interfaces:**
- Consumes: `commitRegistersForRobot`, `startExecution`, `sendCommit`, `sendPlay`, `SyncMsg.LOG`
- Produces: reliable phase transitions as in the spec table

- [ ] **Step 1: Ensure guest SESSION_INTENT payload reaches engine fields**

In `handleTransportMessage` (host), when `msg.type` is `rr_intent_commit`, payload may include shell fields (`sessionId`, `gameId`, `wireType`). That is fine if `registers` / `robotId` / `userId` remain top-level (room `relayGameOut` spreads payload). Add a normalize helper in `room-embedded.js`:

```js
function normalizeIntentPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const { sessionId, gameId, wireType, ...rest } = payload;
  return rest;
}
```

Pass `normalizeIntentPayload(msg.payload)` into `ctrl.handleMessage`.

- [ ] **Step 2: Confirm UI gates (read + fix if broken)**

In `robotrally-ui.js` verify (and fix only if needed):

- Confirm button: visible in `programming` for local unlocked robot; hidden when `isRobotCommitted(local)`
- Play button: shown in `ready` only when `isP2pHost()`; guests see wait copy
- `runProgram` → `P2pSessionController.sendCommit`
- `startExecution` path → `P2pSessionController.sendPlay` for host

If guests can click Play, add:

```js
if (this.isP2pMode() && !this.isP2pHost()) return;
```

at the start of the Play click handler (already partially present — make definitive).

- [ ] **Step 3: Host auto-snapshot still fires on commit**

After all humans commit, engine phase becomes `ready`. Host `wireHostAutosnapshots` + explicit `publishSnapshot` after commit must push a `snap` so guests see ready overlay + Play (host only).

Add assert in manual test: guest `engine.phase === 'ready'` after both commits without host pressing Play yet.

- [ ] **Step 4: Secrets check**

During `programming`, on guest DevTools:

```js
RobotRallyApp.engine.robots.filter(r => r.id !== P2pSessionController.localRobotId()).every(r => !r.hand?.length)
```

Expected: `true`

- [ ] **Step 5: Commit** (only if user asked for commits)

```bash
git add multi-game/robotrun/js/room-embedded.js multi-game/robotrun/js/robotrally-ui.js multi-game/robotrun/js/p2p-session.js
git commit -m "Harden RobotRun simultaneous round flow in room."
```

---

### Task 5: Session end + docs status

**Files:**
- Modify: `multi-game/robotrun/js/room-embedded.js` (confirm `watchSessionEnd` still wired — adjust only if broken)
- Modify: `multi-game/README.md`
- Modify: `multi-game/docs/p2p-multiplayer.md`

**Interfaces:**
- Consumes: `notifySessionEnded` / `watchSessionEnd` from `embedded-bootstrap.js`
- Produces: room end overlay when `engine.phase === 'finished'`

- [ ] **Step 1: Verify finish → room**

`bootstrapRoomEmbedded` already wraps `engine.onStateChange` with `watchSessionEnd`. Ensure host snapshots on finish so guests also reach `finished` before/with session end.

If host finishes but guests stuck: force `publishSnapshot` when phase becomes `finished` (autosnapshot already debounced — set debounce 0 on finished or call `publishSnapshot` immediately in the state-change hook when `phase === 'finished'`).

```js
if (gameState.phase === "finished") {
  clearTimeout(this._snapTimer);
  this.publishSnapshot().catch(() => {});
}
```

inside host autosnapshot / publish path.

- [ ] **Step 2: Update docs tables**

In `multi-game/README.md` and `multi-game/docs/p2p-multiplayer.md`, change RobotRun **Room embedded** from Stub to **Ja** (same wording as Ganzenbord).

- [ ] **Step 3: Full manual checklist (spec §4)**

1. Room 2 spelers → RobotRun → beide zien bord + eigen hand (geen zwart)
2. Beide bevestigen → host Play → moves lopen
3. 3+ spelers: klaar-tellers kloppen; gast ziet geen Play
4. Hand van ander blijft leeg tijdens programming
5. Finish → room krijgt session end / end overlay

- [ ] **Step 4: Commit** (only if user asked for commits)

```bash
git add multi-game/README.md multi-game/docs/p2p-multiplayer.md multi-game/robotrun/js/room-embedded.js multi-game/robotrun/js/p2p-session.js
git commit -m "Mark RobotRun room-ready and ensure finish sync."
```

---

## Spec coverage (self-check)

| Spec requirement | Task |
|------------------|------|
| Fix black / empty room screen | Task 1 + 2 |
| Boot: load app before bootstrap | Task 1 |
| Snapshot sync unchanged | Tasks 1–4 (no log-only migration) |
| Simultaneous programming → ready → host Play → execute | Task 4 |
| Hide others’ hands/registers | Task 4 step 4 (existing sanitize) |
| Host seat-bound intents | Task 3 |
| Finish → SESSION_ENDED | Task 5 |
| Docs Stub → Ja | Task 5 |
| Out of scope: reconnect, hotseat polish, log-only | Not tasked |

## Placeholder scan

No TBD/TODO steps; commands and code included; commit steps gated on user request.
