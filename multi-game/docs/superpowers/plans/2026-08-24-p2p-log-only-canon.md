# P2P log-only canon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tic-tac-toe and ganzenbord use a single log-only canon (intent → host commit → ACK + incremental LOG), with no dual STATE-truth, peer-bound seats, and host-only timers.

**Architecture:** Shared helpers in `multi-game/js/sync/` (`host-commit.js`, tip/adopt APIs on `event-log.js`). Games keep pure reducers in `game.js` / replay in `log.js`, but all network commits go through the host pipeline. Checkpoints are optional and tip-proven only.

**Tech Stack:** Vanilla ES modules, PeerJS Room API, existing `event-log.js`, Node ESM smoke tests (`node --input-type=module`).

**Spec:** [2026-08-24-p2p-log-only-canon-design.md](../specs/2026-08-24-p2p-log-only-canon-design.md)

## Global Constraints

- Canon = host event-log only; state = `replay(log)` (or tip-proven checkpoint).
- Host never adopts peer `log` / `checkpoint` / legacy `state`.
- No STATE broadcast as second truth after commits.
- RobotRun out of scope for this plan.
- Do not edit `multi-game-netlify/`.
- Do not commit `OUTDOOR DRINKS.html`.
- Commits only when the user asks, unless the executing agent was explicitly told to commit per task — then use the commit steps below.

## File map

| File | Responsibility |
|------|----------------|
| `js/sync/event-log.js` | Keep append/encode; add `tipEventId`, `adoptHostPacket`, stop guest fork-wins |
| `js/sync/sync-msg.js` | Shared message type strings: `intent`, `ack`, `reject`, `resync`, `log`, `checkpoint` |
| `js/sync/host-commit.js` | Peer bind, turnKey idempotency, acceptIntent / hostCommit, encode since tip |
| `js/sync/host-commit.test.js` | Node ESM tests for bind + commit + adopt |
| `tic-tac-toe/engine.js` | Wire TTT through host-commit; remove peer-LOG adopt + STATE truth |
| `tic-tac-toe/main.js` | Host-only timer; pending intent UI |
| `tic-tac-toe/game.js` | `GameMsg` align with sync-msg (re-export or map) |
| `ganzenbord/room.js` | Same pipeline; bind on ROLL/TIMEOUT |
| `ganzenbord/main.js` | Host-only timer |
| `docs/p2p-multiplayer.md` | Describe post-migration behavior |

---

### Task 1: Sync message constants + tip helpers

**Files:**
- Create: `multi-game/js/sync/sync-msg.js`
- Modify: `multi-game/js/sync/event-log.js`
- Test: inline Node assert (step below)

**Interfaces:**
- Produces: `SyncMsg` freeze object; `tipEventId(log) => string|null`; keep `tipSeq(log)`

- [ ] **Step 1: Add `sync-msg.js`**

```js
/** Shared P2P game-sync message types (log-only canon). */
export const SyncMsg = Object.freeze({
  INTENT: "intent",
  ACK: "ack",
  REJECT: "reject",
  RESYNC: "resync",
  LOG: "log",
  CHECKPOINT: "checkpoint",
});
```

- [ ] **Step 2: Add `tipEventId` next to `tipSeq` in `event-log.js`**

```js
export function tipEventId(log) {
  const last = log.events[log.events.length - 1];
  return last ? last.id : null;
}
```

- [ ] **Step 3: Verify tip helpers**

Run:

```bash
cd multi-game && node --input-type=module <<'EOF'
import { createEventLog, appendEvent, tipSeq, tipEventId } from './js/sync/event-log.js';
import { SyncMsg } from './js/sync/sync-msg.js';
let log = createEventLog('t');
log = appendEvent(log, 'seat', {}).log;
console.assert(tipSeq(log) === 1);
console.assert(typeof tipEventId(log) === 'string');
console.assert(SyncMsg.INTENT === 'intent');
console.log('ok');
EOF
```

Expected: `ok`

- [ ] **Step 4: Commit** (only if user asked for commits)

```bash
git add multi-game/js/sync/sync-msg.js multi-game/js/sync/event-log.js
git commit -m "Add sync message types and tipEventId for log-only canon."
```

---

### Task 2: Guest adopt host log (no preferred-local fork win)

**Files:**
- Modify: `multi-game/js/sync/event-log.js`
- Test: Node script in step 3

**Interfaces:**
- Consumes: `applySyncPacket`, `encodeSyncPacket`, `createEventLog`, `tipSeq`
- Produces:
  - `adoptHostPacket(localLog, packet) => { ok, log, reason? }`
  - Behavior: empty local → apply full; contiguous → apply; gap → `{ ok:false, reason:'gap' }`; never keep local over longer host chain on conflict

- [ ] **Step 1: Implement `adoptHostPacket`**

```js
/**
 * Guest adopts host truth. Never "preferred local" on fork.
 * @param {EventLog} localLog
 * @param {SyncPacket} packet
 */
export function adoptHostPacket(localLog, packet) {
  if (!packet || packet.gameId !== localLog.gameId) {
    return { ok: false, reason: "gameId", log: localLog };
  }
  if (!localLog.events.length) {
    const applied = applySyncPacket(createEventLog(localLog.gameId), {
      v: 1,
      gameId: packet.gameId,
      fromSeq: 0,
      events: packet.events,
    });
    return applied.ok
      ? { ok: true, log: applied.log }
      : { ok: false, reason: applied.reason, log: localLog };
  }
  const applied = applySyncPacket(localLog, packet);
  if (applied.ok) return { ok: true, log: applied.log };
  // Gap or mismatch: caller must resync (full replace), do not keep silent local win.
  return { ok: false, reason: applied.reason || "gap", log: localLog };
}

/**
 * Full replace from host welcome / resync response.
 * @param {string} gameId
 * @param {SyncPacket} packet
 */
export function replaceFromHostPacket(gameId, packet) {
  if (!packet || packet.gameId !== gameId) {
    return { ok: false, reason: "gameId", log: createEventLog(gameId) };
  }
  return applySyncPacket(createEventLog(gameId), {
    v: 1,
    gameId,
    fromSeq: 0,
    events: packet.events,
  });
}
```

- [ ] **Step 2: Document that `mergeLogs` is legacy**

Add comment above `mergeLogs`:

```js
/**
 * @deprecated Prefer adoptHostPacket / replaceFromHostPacket for P2P guests.
 * Bidirectional merge can prefer local on fork — unsafe for log-only canon.
 */
```

Do not delete yet (QR/other callers); games must stop using it for guest adopt.

- [ ] **Step 3: Test adopt + gap**

```bash
cd multi-game && node --input-type=module <<'EOF'
import {
  createEventLog, appendEvent, encodeSyncPacket,
  adoptHostPacket, replaceFromHostPacket, tipSeq,
} from './js/sync/event-log.js';

let host = createEventLog('g');
host = appendEvent(host, 'a', 1).log;
host = appendEvent(host, 'b', 2).log;
const full = encodeSyncPacket(host, 0);

let guest = createEventLog('g');
let r = adoptHostPacket(guest, full);
console.assert(r.ok && tipSeq(r.log) === 2);

// gap: guest empty tip, packet only event 2
const tail = { v:1, gameId:'g', fromSeq:1, events: host.events.slice(1) };
r = adoptHostPacket(createEventLog('g'), tail);
console.assert(!r.ok, r.reason);

r = replaceFromHostPacket('g', full);
console.assert(r.ok && tipSeq(r.log) === 2);
console.log('ok');
EOF
```

Expected: `ok`

- [ ] **Step 4: Commit** (if requested)

```bash
git add multi-game/js/sync/event-log.js
git commit -m "Add host-truth adopt/replace helpers; deprecate mergeLogs for guests."
```

---

### Task 3: `HostCommit` peer bind + commit + turnKey

**Files:**
- Create: `multi-game/js/sync/host-commit.js`
- Create: `multi-game/js/sync/host-commit.test.js` (run via node)

**Interfaces:**
- Produces class/API:

```js
export function createHostCommit({ gameId }) {
  return {
    bindPeer(peerId, playerId),
    unbindPeer(peerId),
    playerForPeer(peerId) => string|null,
    /** @returns {{ ok:true, log, tipSeq, tipEventId, event } | { ok:false, reason }} */
    commit(log, type, payload),
    /**
     * @param {{ log, fromPeerId, intentId, actorPlayerId, turnKey?, apply: (log)=> {ok, log?, reason?} }}
     */
    acceptBoundIntent(opts),
    markTurnKeyDone(turnKey),
    isTurnKeyDone(turnKey) => boolean,
    encodeSince(log, fromSeq),
  };
}
```

- [ ] **Step 1: Write failing test file `host-commit.test.js`**

```js
import {
  createEventLog,
  tipSeq,
  tipEventId,
} from "./event-log.js";
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
  actorPlayerId: "pB", // spoof
  apply: () => ({ ok: true, log }),
});
assert(!denied.ok && denied.reason === "actor");

const allowedApply = hc.acceptBoundIntent({
  log,
  fromPeerId: "peer1",
  intentId: "i2",
  actorPlayerId: "pA",
  apply: (l) => {
    // simulate append inside apply via commit helper pattern:
    return hc.commit(l, "move", { index: 0, mark: "X" });
  },
});
assert(allowedApply.ok);
assert(tipSeq(allowedApply.log) === 1);

hc.markTurnKeyDone("t1");
assert(hc.isTurnKeyDone("t1"));
assert(!hc.isTurnKeyDone("t2"));

console.log("host-commit tests ok");
```

- [ ] **Step 2: Run test — expect fail (module missing)**

```bash
cd multi-game/js/sync && node host-commit.test.js
```

Expected: `Cannot find module` / ERR_MODULE_NOT_FOUND for `host-commit.js`

- [ ] **Step 3: Implement `host-commit.js`**

```js
import {
  appendEvent,
  encodeSyncPacket,
  tipEventId,
  tipSeq,
} from "./event-log.js";

/**
 * Host-side commit helpers for log-only canon.
 * @param {{ gameId: string }} opts
 */
export function createHostCommit({ gameId }) {
  /** @type {Map<string, string>} */
  const peerToPlayer = new Map();
  /** @type {Set<string>} */
  const doneTurnKeys = new Set();

  return {
    bindPeer(peerId, playerId) {
      const p = String(peerId || "");
      const id = String(playerId || "");
      if (!p || !id) return;
      peerToPlayer.set(p, id);
    },
    unbindPeer(peerId) {
      peerToPlayer.delete(String(peerId || ""));
    },
    playerForPeer(peerId) {
      return peerToPlayer.get(String(peerId || "")) || null;
    },
    commit(log, type, payload) {
      if (log.gameId !== gameId) {
        return { ok: false, reason: "gameId" };
      }
      const added = appendEvent(log, type, payload);
      if (!added.ok) return { ok: false, reason: added.reason };
      return {
        ok: true,
        log: added.log,
        tipSeq: tipSeq(added.log),
        tipEventId: tipEventId(added.log),
        event: added.event,
      };
    },
    acceptBoundIntent({
      log,
      fromPeerId,
      intentId,
      actorPlayerId,
      turnKey,
      apply,
    }) {
      const bound = peerToPlayer.get(String(fromPeerId || ""));
      if (!bound) return { ok: false, reason: "unbound" };
      if (String(actorPlayerId || "") !== bound) {
        return { ok: false, reason: "actor" };
      }
      if (turnKey && doneTurnKeys.has(String(turnKey))) {
        return { ok: false, reason: "turnKey" };
      }
      const result = apply(log);
      if (!result?.ok) {
        return { ok: false, reason: result?.reason || "apply" };
      }
      if (turnKey) doneTurnKeys.add(String(turnKey));
      return {
        ok: true,
        log: result.log,
        tipSeq: tipSeq(result.log),
        tipEventId: tipEventId(result.log),
        intentId,
      };
    },
    markTurnKeyDone(turnKey) {
      if (turnKey) doneTurnKeys.add(String(turnKey));
    },
    isTurnKeyDone(turnKey) {
      return doneTurnKeys.has(String(turnKey));
    },
    clearTurnKeys() {
      doneTurnKeys.clear();
    },
    encodeSince(log, fromSeq = 0) {
      return encodeSyncPacket(log, fromSeq);
    },
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd multi-game/js/sync && node host-commit.test.js
```

Expected: `host-commit tests ok`

- [ ] **Step 5: Commit** (if requested)

```bash
git add multi-game/js/sync/host-commit.js multi-game/js/sync/host-commit.test.js
git commit -m "Add HostCommit bind/commit helpers for log-only P2P."
```

---

### Task 4: Tic-tac-toe engine — host ignores peer truth + intent path

**Files:**
- Modify: `multi-game/tic-tac-toe/game.js` (`GameMsg` add INTENT/ACK/REJECT/RESYNC/CHECKPOINT; keep LOG)
- Modify: `multi-game/tic-tac-toe/engine.js`
- Modify: `multi-game/tic-tac-toe/log.js` only if needed (no RNG in replay — already OK)

**Interfaces:**
- Consumes: `createHostCommit`, `SyncMsg`, `adoptHostPacket`, `replaceFromHostPacket`, `tipSeq`
- Produces: engine behavior per spec §5 TTT

- [ ] **Step 1: Extend `GameMsg` in `game.js`**

```js
export const GameMsg = Object.freeze({
  MOVE: "move", // legacy intent kind still used inside intent.kind during transition
  STATE: "state", // legacy — host must ignore from peers; stop broadcasting as truth
  RESTART: "restart",
  LOG: "log",
  TIMEOUT: "timeout",
  INTENT: "intent",
  ACK: "ack",
  REJECT: "reject",
  RESYNC: "resync",
  CHECKPOINT: "checkpoint",
});
```

- [ ] **Step 2: In `GameEngine` constructor, create host commit helper**

```js
this.hostCommit = createHostCommit({ gameId: GAME_ID });
/** @type {string|null} */
this._pendingIntentId = null;
```

On HELLO (host): after claiming guest seat, `this.hostCommit.bindPeer(msg.fromPeerId, guestPlayerId)`.

On peer leave (if session exposes it): `unbindPeer`.

- [ ] **Step 3: Replace `#appendAndBroadcast`**

```js
#appendAndBroadcast(type, payload) {
  const committed = this.hostCommit.commit(this.log, type, payload);
  if (!committed.ok) return;
  this.log = committed.log;
  this.#replay();
  this.#persist();
  if (this.hotseat) return;
  // LOG only — no STATE truth broadcast
  this.session.broadcast(GameMsg.LOG, this.hostCommit.encodeSince(this.log, 0));
  // TODO Task 5: incremental encodeSince(this.log, peerTip) once tips tracked per peer
}
```

- [ ] **Step 4: Host message handler — ignore peer LOG/STATE**

```js
case GameMsg.LOG:
case GameMsg.STATE:
case GameMsg.CHECKPOINT:
  if (this.session.role === "host") break;
  // guest path in next steps
  break;
```

Remove the old host-open `GameMsg.LOG: this.#adoptRemoteLog` path entirely.

- [ ] **Step 5: Guest MOVE → INTENT; host handles INTENT**

Guest `tryMove`:

```js
const intentId = `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
this._pendingIntentId = intentId;
const sent = this.session.send(GameMsg.INTENT, {
  intentId,
  kind: "move",
  index,
  mark: this.localMark,
  actorPlayerId: this.playerId,
});
if (!sent) {
  this._pendingIntentId = null;
  return { ok: false, reason: "Niet verbonden" };
}
return { ok: true, pending: true };
```

Host on `INTENT` with `kind==="move"`:

```js
const bound = this.hostCommit.acceptBoundIntent({
  log: this.log,
  fromPeerId: msg.fromPeerId,
  intentId: payload.intentId,
  actorPlayerId: payload.actorPlayerId,
  apply: (log) => {
    // replay current state from log, applyMove, then commit move event
    const state = replayTtt(log);
    const mark = payload.mark;
    const result = applyMove(state, payload.index, mark);
    if (!result.ok) return { ok: false, reason: result.reason };
    // commit event that replay will re-apply: only append move, don't double-apply state
    return this.hostCommit.commit(log, "move", {
      index: payload.index,
      mark,
    });
  },
});
if (!bound.ok) {
  this.session.sendTo(msg.fromPeerId, GameMsg.REJECT, {
    intentId: payload.intentId,
    reason: bound.reason,
  });
  break;
}
this.log = bound.log;
this.#replay();
this.#persist();
this.session.sendTo(msg.fromPeerId, GameMsg.ACK, {
  intentId: payload.intentId,
  tipSeq: bound.tipSeq,
  tipEventId: bound.tipEventId,
});
this.session.broadcast(GameMsg.LOG, this.hostCommit.encodeSince(this.log, 0));
this.onState?.(cloneState(this.state));
```

Note: do **not** call `applyMove` then also expect replay to differ — commit only the event; `#replay` derives state.

- [ ] **Step 6: Guest LOG handler uses `adoptHostPacket`**

```js
case GameMsg.LOG: {
  if (this.session.role === "host") break;
  const packet = parseSyncPacket(msg.payload);
  if (!packet) break;
  const adopted = adoptHostPacket(this.log, packet);
  if (!adopted.ok) {
    this.session.send(GameMsg.RESYNC, { haveTipSeq: tipSeq(this.log) });
    break;
  }
  this.log = adopted.log;
  this.#replay();
  this.#persist();
  this.onState?.(cloneState(this.state));
  break;
}
```

- [ ] **Step 7: Smoke test replay still works**

```bash
cd multi-game/tic-tac-toe && node --input-type=module <<'EOF'
import { createEventLog, appendEvent } from '../js/sync/event-log.js';
import { replayTtt } from './log.js';
let log = createEventLog('tic-tac-toe');
log = appendEvent(log, 'restart', { blocked: [1,2,3] }).log;
log = appendEvent(log, 'move', { index: 0, mark: 'X' }).log;
const s = replayTtt(log);
console.assert(s.board[0]==='X' && s.turn==='O');
console.log('ok');
EOF
```

Expected: `ok`

- [ ] **Step 8: Commit** (if requested)

```bash
git add multi-game/tic-tac-toe/game.js multi-game/tic-tac-toe/engine.js
git commit -m "Migrate tic-tac-toe toward log-only intents and host LOG guard."
```

---

### Task 5: Tic-tac-toe — timeout host-only + ACK UI + welcome checkpoint

**Files:**
- Modify: `multi-game/tic-tac-toe/engine.js` (`tryTimeout`, INTENT timeout kind)
- Modify: `multi-game/tic-tac-toe/main.js` (`syncTurnTimer` canExpire host-only)
- Modify: `multi-game/tic-tac-toe/ui.js` (optional: show reject reason; disable double-click while pending)

- [ ] **Step 1: `syncTurnTimer` — only host expires**

In `main.js`:

```js
canExpire: Boolean(session.role === "host"),
onExpire: () => {
  engine?.tryTimeout();
  queueMicrotask(() => syncTurnTimer());
},
```

Remove guest `myTurn` from `canExpire`. Guests still **see** the timer UI.

- [ ] **Step 2: `tryTimeout` host path uses turnKey**

```js
const turnKey = `timeout:${this.state.turn}:${tipSeq(this.log)}`;
if (this.hostCommit.isTurnKeyDone(turnKey)) {
  return { ok: false, reason: "already" };
}
// pick index, commit timeout event, markTurnKeyDone(turnKey), broadcast LOG
```

Guest `tryTimeout` may send INTENT `{ kind:'timeout', actorPlayerId }` as **nudge only**; host accepts only if turnKey open and bound actor matches current turn mark’s player — or simpler v1: **guest tryTimeout is no-op** (host-only). Prefer no-op for YAGNI.

- [ ] **Step 3: Welcome includes log packet; optional checkpoint**

```js
#sendLogWelcome(peerId, youAre = null) {
  const tip = tipSeq(this.log);
  this.session.sendWelcome(
    {
      youAre,
      log: encodeSyncPacket(this.log, 0),
      checkpoint: {
        tipSeq: tip,
        tipEventId: tipEventId(this.log),
        state: cloneState(this.state),
      },
      seats: seatsFromLog(this.log),
    },
    peerId,
  );
}
```

Guest WELCOME: `replaceFromHostPacket` from `log`; use checkpoint **only if** `checkpoint.tipSeq === tipSeq(log) && checkpoint.tipEventId === tipEventId(log)` — else ignore checkpoint and trust replay.

- [ ] **Step 4: On ACK clear pending; on REJECT show reason**

In engine `#handleMessage` ACK/REJECT for guest; `onState` + clear `_pendingIntentId`.

- [ ] **Step 5: Manual test checklist** (document results in PR/commit message later)

1. Two browsers: moves ACK and both boards match tip  
2. Guest cannot forge by sending LOG  
3. After win both see finished; rematch works  
4. Only one timeout commit per turn  

- [ ] **Step 6: Commit** (if requested)

```bash
git add multi-game/tic-tac-toe/engine.js multi-game/tic-tac-toe/main.js multi-game/tic-tac-toe/ui.js
git commit -m "Finish TTT log-only timer, welcome checkpoint, and ACK handling."
```

---

### Task 6: Ganzenbord — HostCommit + ignore peer LOG/STATE + bound ROLL

**Files:**
- Modify: `multi-game/ganzenbord/game.js` (`Msg` add INTENT/ACK/REJECT/RESYNC/CHECKPOINT)
- Modify: `multi-game/ganzenbord/room.js`

- [ ] **Step 1: Add Msg constants** matching SyncMsg names used by room.

- [ ] **Step 2: `createHostCommit` on Room; bind on HELLO**

After successful seat claim:

```js
this.hostCommit.bindPeer(from, youAre /* playerId */);
```

On `#onPeerLeave`: `unbindPeer(peerId)`.

- [ ] **Step 3: Replace `#appendAndBroadcast` — LOG only**

Remove `broadcast(Msg.STATE, …)`.

- [ ] **Step 4: Host ignores peer LOG/STATE** (already ignores LOG — keep; ensure STATE ignored).

- [ ] **Step 5: ROLL via bound intent**

Keep wire type `ROLL` **or** migrate to `INTENT kind:roll`. Minimal change: keep `ROLL` but validate:

```js
const bound = this.hostCommit.playerForPeer(from);
if (!bound || bound !== payload.playerId) break;
```

Then roll + `hostCommit.commit(this.log, "roll", { playerId, value })` + broadcast LOG + ACK if using intentId.

Prefer adding `intentId` on ROLL payload for ACK symmetry:

```js
// guest tryRoll
send(Msg.ROLL, { playerId: this.localId, intentId })
```

- [ ] **Step 6: Guest LOG → `adoptHostPacket` / resync**

Same pattern as TTT.

- [ ] **Step 7: Smoke replay**

```bash
cd multi-game/ganzenbord && node --input-type=module <<'EOF'
import { createEventLog, appendEvent } from '../js/sync/event-log.js';
import { replayGanzenbord } from './log.js';
let log = createEventLog('ganzenbord');
log = appendEvent(log, 'seat', { playerId:'a', name:'A' }).log;
log = appendEvent(log, 'seat', { playerId:'b', name:'B' }).log;
log = appendEvent(log, 'start', null).log;
log = appendEvent(log, 'roll', { playerId:'a', value: 3 }).log;
const s = replayGanzenbord(log);
console.assert(s.phase==='playing' && s.positions.a === 3);
console.log('ok');
EOF
```

Expected: `ok`

- [ ] **Step 8: Commit** (if requested)

```bash
git add multi-game/ganzenbord/game.js multi-game/ganzenbord/room.js
git commit -m "Migrate ganzenbord to log-only commits and peer-bound rolls."
```

---

### Task 7: Ganzenbord host-only timer + timeout turnKey

**Files:**
- Modify: `multi-game/ganzenbord/main.js`
- Modify: `multi-game/ganzenbord/room.js` (`tryTimeout`)

- [ ] **Step 1: `syncTurnTimer` canExpire only if `session.role === "host"`** (or local hotseat host).

- [ ] **Step 2: `tryTimeout` idempotent**

```js
const current = this.state.players[this.state.turnIndex];
const turnKey = `timeout:${current.id}:${tipSeq(this.log)}`;
if (this.hostCommit.isTurnKeyDone(turnKey)) return { ok: false, reason: "already" };
// applyTimeout + commit + markTurnKeyDone
```

Guest: do not send TIMEOUT in v1 (host-only), or send nudge that host ignores if turnKey done — prefer **no guest TIMEOUT send** to avoid dual path.

- [ ] **Step 3: Manual multi-player test**

1. 3 players local/P2P: turns advance once per timeout  
2. Spoofed roll playerId from wrong peer rejected  
3. Rematch + champion still works via log replay  

- [ ] **Step 4: Commit** (if requested)

```bash
git add multi-game/ganzenbord/main.js multi-game/ganzenbord/room.js
git commit -m "Make ganzenbord turn timer host-only and idempotent."
```

---

### Task 8: Docs — describe new canon (no STATE fallback story)

**Files:**
- Modify: `multi-game/docs/p2p-multiplayer.md`
- Modify: `multi-game/docs/p2p-fundamenten.md` (mark migration in progress/done)
- Modify: `multi-game/docs/superpowers/specs/2026-08-24-p2p-log-only-canon-design.md` status → implemented when done

- [ ] **Step 1: Update p2p-multiplayer § data-overdracht**

Replace “LOG + STATE backup” with:

- Commit broadcasts **LOG** (incremental when tips tracked).
- Welcome may include **checkpoint** with tip proof.
- Guests **resync** on gap; never overwrite from unproven STATE.

- [ ] **Step 2: Note RobotRun still snapshot-model**

- [ ] **Step 3: Commit** (if requested)

```bash
git add multi-game/docs
git commit -m "Document log-only P2P canon after TTT and ganzenbord migration."
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Log-only canon | 4–7 |
| Host ignores peer log/state | 4, 6 |
| Intent + ACK/REJECT | 4, 5, 6 |
| peer → playerId bind | 3, 4, 6 |
| Incremental / adoptHost / resync | 2, 4, 6 |
| Checkpoint tip-proven | 5 |
| Host-only timer + turnKey | 5, 7 |
| TTT + GB migration | 4–7 |
| RobotRun out of scope | Global + Task 8 |
| Shared helper | 1–3 |
| Docs | 8 |

## Placeholder scan

No TBD steps; test commands are concrete; RobotRun explicitly excluded.

## Type consistency

- `SyncMsg` / `GameMsg` / `Msg` share string values `intent|ack|reject|resync|log|checkpoint`
- `createHostCommit` API used identically in TTT and GB
- `adoptHostPacket` / `replaceFromHostPacket` for all guests

---

## Execution handoff

Plan saved to `multi-game/docs/superpowers/plans/2026-08-24-p2p-log-only-canon.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?
