# Game-agnostic rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rooms zijn los van spellen — groep joint één room, kiest daarna spellen op basis van spelersaantal, en kan meerdere spellen spelen zonder P2P te verbreken.

**Architecture:** Twee-laags log (room log + session logs per spelronde), room-shell houdt PeerJS alive, spellen draaien embedded via postMessage-bridge. Bestaande game event types en replay-functies blijven ongewijzigd.

**Tech Stack:** Vanilla ES modules, PeerJS 1.5.4, bestaande `event-log.js` / `host-commit.js`, Node ESM smoke tests.

**Spec:** [2026-08-24-game-agnostic-rooms-design.md](../specs/2026-08-24-game-agnostic-rooms-design.md)

## Global Constraints

- Room log en session log delen `event-log.js`; game logs bevatten **geen** `room.*` events.
- Session log `gameId` blijft het echte spel-id (`tic-tac-toe`, `ganzenbord`, `robotrun`) zodat bestaande `replay*` werkt.
- Room log gebruikt sentinel `gameId: "__room__"`.
- Host authority voor room én session commits; gasten adopt host packets only.
- `maxGuests = 5` (6 spelers max, passend bij ganzenbord in catalogus).
- Standalone per-game P2P blijft werken tot Task 10 (legacy pad).
- Geen wijzigingen aan `multi-game-netlify/` in dit plan.
- Commits alleen wanneer de gebruiker dat vraagt.

## File map

| File | Responsibility |
|------|----------------|
| `js/sync/room-log.js` | Room event types, `createRoomLog`, `replayRoom`, session id factory |
| `js/sync/room-log.test.js` | Node tests replay + session lifecycle |
| `js/sync/room-msg.js` | Wire message constants (room + session scoped) |
| `js/sync/log-keys.js` | `roomLogKey`, `sessionLogKey`, legacy key helpers |
| `js/core/desk.js` | Load/save room + session logs; desk cards zonder verplicht gameId |
| `js/p2p/room-session.js` | Game-agnostic Session (geen gameId mismatch) |
| `js/transport/room-p2p.js` | Transport facade voor room shell |
| `js/core/room.js` | `createRoomSession()` naast bestaande `createRoom()` |
| `js/bridge/game-bridge.js` | postMessage protocol shell ↔ embedded game |
| `js/bridge/session-host.js` | Host-side session log commit + broadcast |
| `room/index.html` | Room shell UI |
| `room/main.js` | Host/join, roster, game picker, iframe mount |
| `room/room.css` | Room shell styles |
| `js/p2p/room-memory.js` | Recent rooms zonder gameId-first model |
| `lobby/main.js` | Cards tonen room-first |
| `js/shell/nav.js` | Room strip zonder game-titel primair |
| `js/shell/site-url.js` | `#room/?room=` routing |
| `js/core/catalog.js` | `gamesForPlayerCount(n)` helper |
| `tic-tac-toe/embedded.js` | Embedded mode entry (bridge) |
| `ganzenbord/embedded.js` | Idem |
| `robotrun/js/embedded.js` | Idem |
| `docs/p2p-multiplayer.md` | Documenteer room + session logs |

---

## Log design reference (implementatie-checklist)

Implementeer exact deze scheiding:

```
p2p:room:AB7K2M
  room.created
  room.member_join × N
  room.member_ready × N
  room.session_start { sessionId: s_abc, gameId: ganzenbord, roster }
  room.session_end   { sessionId: s_abc, reason: finished }
  room.session_start { sessionId: s_def, gameId: tic-tac-toe, roster }

p2p:session:AB7K2M:s_abc:ganzenbord
  seat, start, roll, …        ← ongewijzigd ganzenbord replay

p2p:session:AB7K2M:s_def:tic-tac-toe
  seat, move, restart, …      ← ongewijzigd TTT replay
```

---

### Task 1: Log keys + room log module

**Files:**
- Create: `multi-game/js/sync/log-keys.js`
- Create: `multi-game/js/sync/room-log.js`
- Create: `multi-game/js/sync/room-log.test.js`

**Interfaces:**
- Produces:
  - `ROOM_GAME_ID = '__room__'`
  - `roomLogKey(code) => string`
  - `sessionLogKey(code, sessionId, gameId) => string`
  - `legacyGameRoomKey(gameId, code) => string`
  - `createRoomLog(roomCode) => EventLog`
  - `createSessionLog(roomCode, sessionId, gameId) => EventLog`
  - `newSessionId() => string`
  - `RoomEvent` freeze object
  - `replayRoom(log) => { members, activeSession, history }`
  - `gamesForPlayerCount` lives in catalog (Task 2)

- [ ] **Step 1: Create `log-keys.js`**

```js
export const ROOM_GAME_ID = "__room__";

export function roomLogKey(code) {
  const c = String(code || "").trim().toUpperCase();
  return `p2p:room:${c}`;
}

export function sessionLogKey(code, sessionId, gameId) {
  const c = String(code || "").trim().toUpperCase();
  return `p2p:session:${c}:${sessionId}:${gameId}`;
}

/** @deprecated Legacy standalone P2P */
export function legacyGameRoomKey(gameId, code) {
  const c = String(code || "").trim().toUpperCase();
  return `p2p:${gameId}:${c}`;
}
```

- [ ] **Step 2: Create `room-log.js`**

```js
import { appendEvent, createEventLog } from "./event-log.js";
import { ROOM_GAME_ID } from "./log-keys.js";

export const RoomEvent = Object.freeze({
  CREATED: "room.created",
  MEMBER_JOIN: "room.member_join",
  MEMBER_LEAVE: "room.member_leave",
  MEMBER_READY: "room.member_ready",
  SESSION_START: "room.session_start",
  SESSION_END: "room.session_end",
});

export function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createRoomLog(roomCode) {
  const log = createEventLog(ROOM_GAME_ID);
  log.meta = { scope: "room", roomCode: String(roomCode || "").trim().toUpperCase() };
  return log;
}

export function createSessionLog(roomCode, sessionId, gameId) {
  const log = createEventLog(gameId);
  log.meta = { scope: "session", roomCode, sessionId };
  return log;
}

/**
 * @param {import('./event-log.js').EventLog} log
 */
export function replayRoom(log) {
  /** @type {Map<string, { playerId: string, name: string, ready: boolean }>} */
  const members = new Map();
  /** @type {{ sessionId: string, gameId: string } | null} */
  let activeSession = null;
  /** @type {{ sessionId: string, gameId: string, reason: string }[]} */
  const history = [];

  for (const ev of log?.events || []) {
    const p = /** @type {Record<string, unknown>} */ (ev.payload || {});
    switch (ev.type) {
      case RoomEvent.MEMBER_JOIN: {
        const playerId = String(p.playerId || "");
        const name = String(p.name || "").trim() || "Speler";
        if (!playerId) break;
        const prev = members.get(playerId);
        members.set(playerId, { playerId, name, ready: prev?.ready ?? false });
        break;
      }
      case RoomEvent.MEMBER_LEAVE: {
        members.delete(String(p.playerId || ""));
        break;
      }
      case RoomEvent.MEMBER_READY: {
        const playerId = String(p.playerId || "");
        const m = members.get(playerId);
        if (m) m.ready = !!p.ready;
        break;
      }
      case RoomEvent.SESSION_START: {
        activeSession = {
          sessionId: String(p.sessionId || ""),
          gameId: String(p.gameId || ""),
        };
        break;
      }
      case RoomEvent.SESSION_END: {
        history.push({
          sessionId: String(p.sessionId || ""),
          gameId: String(p.gameId || ""),
          reason: String(p.reason || "finished"),
        });
        if (activeSession?.sessionId === p.sessionId) activeSession = null;
        break;
      }
      default:
        break;
    }
  }
  return { members, activeSession, history };
}

export function commitRoomEvent(log, type, payload) {
  return appendEvent(log, type, payload);
}
```

- [ ] **Step 3: Write `room-log.test.js`**

```js
import { createRoomLog, RoomEvent, replayRoom, commitRoomEvent, newSessionId } from "./room-log.js";

let log = createRoomLog("ab7k2m");
log = commitRoomEvent(log, RoomEvent.CREATED, { hostPlayerId: "p1", maxPlayers: 6, version: 1 }).log;
log = commitRoomEvent(log, RoomEvent.MEMBER_JOIN, { playerId: "p1", name: "Alice" }).log;
log = commitRoomEvent(log, RoomEvent.MEMBER_JOIN, { playerId: "p2", name: "Bob" }).log;
const sid = newSessionId();
log = commitRoomEvent(log, RoomEvent.SESSION_START, { sessionId: sid, gameId: "tic-tac-toe", roster: [] }).log;
let state = replayRoom(log);
console.assert(state.members.size === 2);
console.assert(state.activeSession?.gameId === "tic-tac-toe");
log = commitRoomEvent(log, RoomEvent.SESSION_END, { sessionId: sid, gameId: "tic-tac-toe", reason: "finished" }).log;
state = replayRoom(log);
console.assert(state.activeSession === null);
console.assert(state.history.length === 1);
console.log("room-log ok");
```

- [ ] **Step 4: Run test**

Run:
```bash
cd multi-game && node js/sync/room-log.test.js
```
Expected: `room-log ok`

---

### Task 2: Catalog filter + room message types

**Files:**
- Modify: `multi-game/js/core/catalog.js`
- Create: `multi-game/js/sync/room-msg.js`

**Interfaces:**
- Produces: `gamesForPlayerCount(count) => GameEntry[]`
- Produces: `RoomMsg` freeze object

- [ ] **Step 1: Add to `catalog.js`**

```js
/**
 * @param {number} count
 * @returns {GameEntry[]}
 */
export function gamesForPlayerCount(count) {
  const n = Math.max(0, Math.floor(count));
  return GAMES.filter((g) => n >= g.minPlayers && n <= g.maxPlayers);
}
```

- [ ] **Step 2: Create `room-msg.js`**

```js
export const RoomMsg = Object.freeze({
  ROOM_INTENT: "room_intent",
  ROOM_LOG: "room_log",
  ROOM_ACK: "room_ack",
  ROOM_REJECT: "room_reject",
  SESSION_LOG: "session_log",
  SESSION_INTENT: "session_intent",
  SESSION_ACK: "session_ack",
  SESSION_REJECT: "session_reject",
});
```

- [ ] **Step 3: Smoke test**

```bash
cd multi-game && node --input-type=module <<'EOF'
import { gamesForPlayerCount } from './js/core/catalog.js';
import { RoomMsg } from './js/sync/room-msg.js';
console.assert(gamesForPlayerCount(2).length === 3);
console.assert(gamesForPlayerCount(6).length === 1);
console.assert(gamesForPlayerCount(6)[0].id === 'ganzenbord');
console.assert(RoomMsg.SESSION_LOG === 'session_log');
console.log('ok');
EOF
```
Expected: `ok`

---

### Task 3: Desk storage voor room + session logs

**Files:**
- Modify: `multi-game/js/core/storage.js` (if needed — reuse existing save/load)
- Modify: `multi-game/js/core/desk.js`

**Interfaces:**
- Consumes: `log-keys.js`, `room-log.js`, `event-log.js`
- Produces:
  - `loadRoomLogByCode(code) => EventLog`
  - `saveRoomLogByCode(code, log) => void`
  - `loadSessionLog(code, sessionId, gameId) => EventLog`
  - `saveSessionLog(code, sessionId, gameId, log) => void`
  - `touchDeskRoom({ code, role, memberCount?, activeGameId?, summary? })`

- [ ] **Step 1: Add load/save helpers in `desk.js`**

```js
import { roomLogKey, sessionLogKey, ROOM_GAME_ID } from "../sync/log-keys.js";
import { createRoomLog } from "../sync/room-log.js";

export function loadRoomLogByCode(code) {
  const raw = loadEventLog(roomLogKey(code));
  return coerceEventLog(raw, ROOM_GAME_ID) || createRoomLog(code);
}

export function saveRoomLogByCode(code, log) {
  saveEventLog(roomLogKey(code), log);
}

export function loadSessionLog(code, sessionId, gameId) {
  const raw = loadEventLog(sessionLogKey(code, sessionId, gameId));
  return coerceEventLog(raw, gameId) || createEventLog(gameId);
}

export function saveSessionLog(code, sessionId, gameId, log) {
  saveEventLog(sessionLogKey(code, sessionId, gameId), log);
}
```

- [ ] **Step 2: Extend `touchDeskRoom` to accept room-first shape**

```js
export function touchDeskRoom(room) {
  const code = String(room.code || "").trim().toUpperCase();
  if (!code) return;
  pushRecent({
    code,
    gameId: room.activeGameId || "",  // optional, backward compat field
    role: room.role,
    name: room.name || room.role,
    summary: room.summary || "",
    seq: room.seq ?? 0,
    memberCount: room.memberCount ?? 0,
    activeGameId: room.activeGameId || null,
    activeSessionId: room.activeSessionId || null,
  });
}
```

- [ ] **Step 3: Update `listDeskCards` to prefer room title when no active game**

Show `"Room AB7K2M · 3 spelers"` when `activeGameId` is null; else `"Ganzenbord · AB7K2M"`.

---

### Task 4: Game-agnostic P2P session

**Files:**
- Create: `multi-game/js/p2p/room-session.js`
- Create: `multi-game/js/transport/room-p2p.js`
- Modify: `multi-game/js/core/room.js`

**Interfaces:**
- Produces: `RoomSession` class — same surface as `Session` but:
  - `gameId` optional / omitted from handshake mismatch check
  - `hello`/`welcome` carry `roomCode`, `playerId`, `name`, optional `roomLog` tail
  - `writeRoomToUrl` uses `/room/` path
- Produces: `createRoomSession({ maxGuests })` in `room.js`

- [ ] **Step 1: Copy `session.js` → `room-session.js`, remove gameId mismatch**

Key change in message handler:
```js
// REMOVE onGameMismatch for gameId
// hello payload: { version, roomCode, playerId, name, tipSeq?, roomLog? }
// welcome payload: { youAre, roomLog, activeSession?, sessionLogPacket? }
```

- [ ] **Step 2: `room-p2p.js` transport wrapper** (mirror `p2p.js` but uses `RoomSession`)

- [ ] **Step 3: Add factory in `room.js`**

```js
export function createRoomSession({ transport = "p2p", maxGuests = 5 } = {}) {
  if (transport !== "p2p") throw new Error("Room session ondersteunt alleen p2p");
  return new RoomP2PTransport({ maxGuests });
}
```

- [ ] **Step 4: Update `site-url.js`**

```js
export const ROOM_PATH = "room/";

export function buildRoomShareUrl(code) {
  return buildShareUrl(`/${ROOM_PATH}`, code);
}

export function writeRoomCodeToUrl(code) {
  writeRoomToUrl(`/${ROOM_PATH}`, code);
}
```

---

### Task 5: Room host commit pipeline

**Files:**
- Create: `multi-game/js/sync/room-host.js`
- Create: `multi-game/js/sync/room-host.test.js`

**Interfaces:**
- Produces: `createRoomHostCommit()` — like `createHostCommit` but for `ROOM_GAME_ID`
- Handles: `member_join` on hello, `member_ready` intents, `session_start` / `session_end`

- [ ] **Step 1: Implement `room-host.js`**

```js
import { createHostCommit } from "./host-commit.js";
import { RoomEvent, commitRoomEvent } from "./room-log.js";
import { ROOM_GAME_ID } from "./log-keys.js";
import { encodeSyncPacket } from "./event-log.js";
import { RoomMsg } from "./room-msg.js";

export function createRoomHostCommit() {
  const commit = createHostCommit({ gameId: ROOM_GAME_ID });
  return {
    ...commit,
    joinMember(log, { playerId, name }) {
      const exists = log.events.some(
        (e) => e.type === RoomEvent.MEMBER_JOIN &&
          /** @type {{ playerId?: string }} */ (e.payload)?.playerId === playerId,
      );
      if (exists) return { ok: true, log };
      return commit.commit(log, RoomEvent.MEMBER_JOIN, { playerId, name });
    },
    setReady(log, playerId, ready) {
      return commit.commit(log, RoomEvent.MEMBER_READY, { playerId, ready });
    },
    startSession(log, { sessionId, gameId, roster }) {
      return commit.commit(log, RoomEvent.SESSION_START, { sessionId, gameId, roster });
    },
    endSession(log, { sessionId, gameId, reason, summary }) {
      return commit.commit(log, RoomEvent.SESSION_END, { sessionId, gameId, reason, summary });
    },
    encodeRoomLog(log, fromSeq = 0) {
      return { type: RoomMsg.ROOM_LOG, packet: encodeSyncPacket(log, fromSeq) };
    },
  };
}
```

- [ ] **Step 2: Test join + session start/end chain**

Run node test similar to Task 1.

---

### Task 6: Session host (embedded game sync)

**Files:**
- Create: `multi-game/js/bridge/session-host.js`
- Reuse: `js/sync/host-commit.js`, `SyncMsg` from `sync-msg.js`

**Interfaces:**
- Produces: `createSessionHost({ gameId, sessionId, roomCode })`
  - `handleIntent(fromPeerId, intent) => { ack|reject, sessionLog?, roomBroadcast? }`
  - `encodeSessionLog(log, fromSeq) => { type: RoomMsg.SESSION_LOG, sessionId, gameId, packet }`
- Consumes: game-specific `applyIntent(log, intent)` callback passed at construction

- [ ] **Step 1: Implement session-host wrapper**

Host binds peer→playerId (reuse host-commit). On valid intent:
1. `acceptBoundIntent` → append game event
2. `saveSessionLog(roomCode, sessionId, gameId, log)`
3. Broadcast `SESSION_LOG` to all peers

- [ ] **Step 2: Guest adopt path**

On `SESSION_LOG`: `adoptHostPacket(localSessionLog, packet)` then notify embedded iframe via bridge.

---

### Task 7: Game bridge (postMessage)

**Files:**
- Create: `multi-game/js/bridge/game-bridge.js`
- Create: `multi-game/js/bridge/bridge-protocol.js`

**Interfaces:**
- Produces message types:
  - Shell → game: `dgame:session-init`, `dgame:session-log`, `dgame:session-ack`, `dgame:session-reject`
  - Game → shell: `dgame:intent`, `dgame:session-ended`, `dgame:ready`

```js
// bridge-protocol.js
export const BridgeMsg = Object.freeze({
  SESSION_INIT: "dgame:session-init",
  SESSION_LOG: "dgame:session-log",
  INTENT: "dgame:intent",
  SESSION_ENDED: "dgame:session-ended",
  READY: "dgame:ready",
});
```

- [ ] **Step 1: `mountGameBridge(iframe, ctx)` in shell**
- [ ] **Step 2: `connectGameBridge()` in embedded entry** — games call on load when `?embedded=1`

Session init payload:
```js
{
  sessionId, gameId, roomCode, role, playerId,
  roster: [{ playerId, name }],
  log: EventLog | null,  // full session log on join
}
```

---

### Task 8: Room shell UI

**Files:**
- Create: `multi-game/room/index.html`
- Create: `multi-game/room/main.js`
- Create: `multi-game/room/room.css`
- Modify: `multi-game/js/shell/nav.js` — add Room tab or repurpose Lobby

**UI states:**

| State | Screen |
|-------|--------|
| `idle` | Start room / Join with code |
| `hosting` / `connected` | Roster + share QR + game picker |
| `playing` | iframe full width + "Terug naar lobby" (host) |
| `disconnected` | Reconnect banner |

- [ ] **Step 1: HTML scaffold** — roster list, game picker grid, iframe container `#game-frame`
- [ ] **Step 2: Host flow** — `createRoomSession()` → `host()` → `room.created` + host `member_join`
- [ ] **Step 3: Guest flow** — read `?room=` → join → hello → welcome merges room log
- [ ] **Step 4: Game picker** — `gamesForPlayerCount(members.size)`, disabled cards with tooltip
- [ ] **Step 5: Start game** — host `session_start`, create session log, set iframe src:

```js
iframe.src = buildGameEmbeddedUrl(game.path, { room, session, embedded: 1 });
```

- [ ] **Step 6: End game** — host `session_end`, remove iframe, show picker

---

### Task 9: Embedded mode — tic-tac-toe

**Files:**
- Create: `multi-game/tic-tac-toe/embedded.js`
- Modify: `multi-game/tic-tac-toe/main.js` — detect `embedded=1`, defer to embedded entry
- Modify: `multi-game/tic-tac-toe/engine.js` — accept external transport callbacks

- [ ] **Step 1: `embedded.js` listens for `SESSION_INIT`, mounts existing UI**
- [ ] **Step 2: Replace P2P `createRoom` path when embedded — intents via `postMessage`**
- [ ] **Step 3: On `SESSION_LOG`, call existing `adoptHostPacket` + `replayTtt` + render**
- [ ] **Step 4: Host timer stays in embedded host tab (same as now)**
- [ ] **Step 5: Manual test: 2 browsers, room → TTT → finish → back to picker**

---

### Task 10: Embedded mode — ganzenbord + robotrun

**Files:**
- Create: `multi-game/ganzenbord/embedded.js`
- Create: `multi-game/robotrun/js/embedded.js`
- Modify respective `main.js` / `p2p-lobby.js`

Same pattern as Task 9. RobotRun: disable `P2pSessionController` PeerJS when embedded; bridge replaces send/broadcast.

- [ ] **Step 1: Ganzenbord embedded**
- [ ] **Step 2: RobotRun embedded (snapshot model via SESSION_LOG)**
- [ ] **Step 3: Test 3-player ganzenbord via room**

---

### Task 11: Lobby, nav, home entry points

**Files:**
- Modify: `multi-game/index.html` — primary CTA "Start room" / "Join room"
- Modify: `multi-game/lobby/main.js`
- Modify: `multi-game/js/p2p/room-memory.js`
- Modify: `multi-game/js/shell/nav.js`

- [ ] **Step 1: Home page** — multiplayer CTA links to `#room/`
- [ ] **Step 2: Lobby cards** — room-first display; Open → `#room/?room=CODE`
- [ ] **Step 3: `room-memory.js`** — `loadRoom()` without gameId filter; recent list dedupe by `code` only
- [ ] **Step 4: Room strip** — show code + player count

---

### Task 12: Legacy compatibility + docs

**Files:**
- Modify: `multi-game/docs/p2p-multiplayer.md`
- Modify: `multi-game/docs/multiplayer-bouwregels.md` — add R6 room vs session logs
- Modify: `multi-game/js/core/desk.js` — `navigateDeskCard` routes legacy game+room to game page

- [ ] **Step 1: Document two-layer log in p2p-multiplayer.md § new section "Room shell"**
- [ ] **Step 2: Bouwregels — embedded games must not open own P2P when `embedded=1`**
- [ ] **Step 3: Legacy URL `#ganzenbord/?room=CODE` still opens ganzenbord standalone P2P (unchanged)**
- [ ] **Step 4: Optional migration helper: opening legacy link shows banner "Open in room?" → `#room/?room=CODE`**

---

## Test plan (handmatig)

| # | Scenario | Verwacht |
|---|----------|----------|
| 1 | Host start room, 2 gasten join | Roster 3, picker toont 3 spellen |
| 2 | 6 spelers | Alleen ganzenbord speelbaar |
| 3 | 2 spelers, start TTT, finish, terug | Zelfde P2P, picker opnieuw zichtbaar |
| 4 | Gast refresh mid-game | welcome stuurt room log + session log → replay correct |
| 5 | Host `?as=host` reconnect | PeerJS `hostWithCode`, room log intact |
| 6 | Legacy `#tic-tac-toe/?room=CODE` | Standalone P2P werkt nog |
| 7 | Geheugen tab | Toont `p2p:room:*` en `p2p:session:*` keys |

---

## Migration / rollout volgorde

1. Tasks 1–5 (log + P2P foundation) — geen UI breakage
2. Tasks 6–8 (bridge + room shell) — eerste speelbare room
3. Task 9 (TTT) — dunste spel, validate pipeline
4. Task 10 (GB + RR)
5. Tasks 11–12 (polish + docs)

---

## Risico's en mitigatie

| Risico | Mitigatie |
|--------|-----------|
| iframe + postMessage fragile on mobile | Same-origin (jsDelivr path); test iOS Safari early |
| RobotRun snapshot volume | SESSION_LOG incremental `fromSeq`; no room log pollution |
| Host switch mid-session | `?as=host` + session log in localStorage; welcome resync |
| Duplicate member_join | Host idempotent check in `room-host.joinMember` |

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Room ≠ game | 4, 8 |
| Game picker on player count | 2, 8 |
| Two-layer log | 1, 3, 5, 6 |
| Game replay unchanged | 9, 10 |
| P2P stays alive between games | 7, 8 |
| Share URL `#room/?room=` | 4, 8 |
| Legacy standalone P2P | 12 |
| Host authority | 5, 6 |
| maxGuests = 5 | 4 |

No placeholders remain in task steps.
