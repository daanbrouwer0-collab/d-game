# RobotRun rejoin + tip-ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Joiner leave/rejoin no longer shows a fake full countdown or stale Play state; guest boots ask for live tip immediately; optional thin tip-ack at race-start without blocking forever.

**Architecture:** Keep tip-CHECKPOINT + local Play. Fix rejoin by (1) never displaying countdown without `matchCountdownEndsAt`, (2) guest `RESYNC` on every embedded boot, (3) optional `rr_tip_ack` after adopt for match_ready sync UX with 3s host timeout. Do not reintroduce mid-Play micro-snapshots.

**Tech Stack:** Vanilla JS (`room-embedded.js`, `p2p-session.js`, `robotrally-ui.js`), existing `SyncMsg.RESYNC` / `CHECKPOINT`, room intent relay.

**Spec:** [2026-08-26-robotrun-rejoin-tip-ready-design.md](../specs/2026-08-26-robotrun-rejoin-tip-ready-design.md)

## Global Constraints

- No mid-Play frame resume in this plan (rejoin may restart local animation from start-tip).
- No continuous ping/RTT layer.
- No permanent wait on tip-ack (max ~3s then proceed).
- Host alone finishes countdown / Play finalize.
- Commits only when the user asks (unless explicitly told per task).
- Do not edit `multi-game-netlify/`.

## File map

| File | Responsibility |
|------|----------------|
| `robotrun/js/robotrally-ui.js` | Countdown display: sync copy when `endsAt` missing; never fake full seconds |
| `robotrun/js/room-embedded.js` | Guest boot RESYNC; tip_ack after adopt; host handle ack; optional sync-wait gate |
| `robotrun/js/p2p-session.js` | Host `rr_tip_ack` handling if routed via `handleMessage`; expose synced helpers if needed |
| `docs/superpowers/specs/README.md` | Index new spec |
| `docs/superpowers/specs/2026-08-26-robotrun-tip-checkpoint-sync-design.md` | Cross-link rejoin section |

---

### Task 1: Countdown UI — never fake a full timer

**Files:**
- Modify: `multi-game/robotrun/js/robotrally-ui.js` (`renderPlaybackOverlay` match_countdown branch ~2307–2315)
- Test: manual / small node assert on pure helper if extracted

**Interfaces:**
- Consumes: `engine.phase`, `engine.matchCountdownEndsAt`, `Date.now()`
- Produces: overlay text `"Synchroniseren…"` | `"N"` | `"Start laden…"`

- [ ] **Step 1: Locate the fallback**

Confirm this pattern exists:

```js
const leftSec = endsAt != null
  ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  : (CONFIG.MATCH_COUNTDOWN_SECONDS || 10);
```

- [ ] **Step 2: Replace fallback with sync copy**

```js
if (matchCountdownPhase) {
  const endsAt = this.engine.matchCountdownEndsAt;
  if (this.playbackTitle) this.playbackTitle.textContent = 'Iedereen is klaar';
  if (this.playbackText) {
    if (endsAt == null || !Number.isFinite(Number(endsAt))) {
      this.playbackText.textContent = 'Synchroniseren…';
    } else {
      const leftSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      this.playbackText.textContent = leftSec > 0 ? String(leftSec) : 'Start laden…';
    }
  }
}
```

- [ ] **Step 3: Smoke-check locally**

Open RobotRun embedded or room: with `phase = match_countdown` and `matchCountdownEndsAt = null`, overlay must say Synchroniseren…, not `10`.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add multi-game/robotrun/js/robotrally-ui.js
git commit -m "Show sync copy instead of a fake RobotRun countdown when endsAt is missing."
```

---

### Task 2: Guest boot / rejoin always RESYNC

**Files:**
- Modify: `multi-game/robotrun/js/room-embedded.js` (`bootstrapRoomEmbedded` guest branch)

**Interfaces:**
- Consumes: `ctrl.requestLogResync`, existing RESYNC → `rebroadcastLastTruth`
- Produces: live tip shortly after every guest iframe mount

- [ ] **Step 1: On guest bootstrap, after transport wired**

In the `else` (guest) branch of `bootstrapRoomEmbedded`, after `syncFromEmbeddedLog` / profile update / watchdog start:

```js
// Desk log is boot-only; demand live tip immediately (rejoin + first join).
ctrl.requestLogResync?.();
```

- [ ] **Step 2: Optional — defer treating desk gameState as authoritative**

If `syncFromEmbeddedLog` applies a desk `snap` with `match_countdown` but you still see flicker: clear guest `matchCountdownEndsAt` when adopting from desk-only restore, **or** skip applying desk `gameState` when `lobby.status === 'playing'` and wait for CHECKPOINT only (seats from desk OK). Prefer minimal change: RESYNC first; only strip desk apply if flicker remains.

- [ ] **Step 3: Manual test**

Room 2 players: joiner leaves mid-countdown (note remaining seconds), rejoins → within ~3s sees remaining (or Synchroniseren… then remaining), **not** a fresh 10.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git commit -m "Request live tip on every RobotRun guest boot for leave/rejoin."
```

---

### Task 3: Thin tip-ack at race-start

**Files:**
- Modify: `multi-game/robotrun/js/room-embedded.js` (`adoptTruthCheckpoint`, `handleTransportMessage`)
- Modify: `multi-game/robotrun/js/p2p-session.js` if acks go through `handleMessage`
- Modify: `multi-game/robotrun/js/robotrally-ui.js` only if showing “Spelers laden…” (keep minimal)

**Interfaces:**
- Consumes: adopted `{ tipSeq, tipEventId, gameState.phase }`
- Produces: guest `send('rr_tip_ack', { tipSeq, tipEventId, userId })`; host `Set` of synced userIds for tip; timeout 3000ms

- [ ] **Step 1: Guest send ack after successful adopt**

In `adoptTruthCheckpoint`, after apply, if guest and phase is `match_ready` (and optionally first tip after boot):

```js
if (!ctrl.isHost()) {
  const gs = payload.gameState;
  if (gs?.phase === 'match_ready') {
    ctrl.send?.('rr_tip_ack', {
      tipSeq: tip,
      tipEventId: tipId,
      userId: ctrl.playerId,
    });
  }
}
```

Dedup: only send if `(tip, tipId) !== ctrl._lastAckedTipKey`.

- [ ] **Step 2: Host accept ack**

In `handleTransportMessage` / `handleMessage`:

```js
if (type === 'rr_tip_ack' && ctrl.isHost()) {
  // seat-bind via peerToPlayer / RobotRunIntentBind
  // if tipSeq matches ctrl._truthTipSeq → add userId to ctrl._tipAckedUserIds
  return;
}
```

- [ ] **Step 3: Soft gate (optional UI)**

On host after publishing first `match_ready` tip: set `ctrl._awaitingTipAcksUntil = Date.now() + 3000`.  
UI may show “Spelers laden…” while `Date.now() < until` && not all human seats in `_tipAckedUserIds`.  
**Never** block upgrade confirm or countdown start after timeout.

- [ ] **Step 4: Manual test**

Slow joiner network: host sees brief laden-state ≤3s; race continues. Fast path: negligible delay.

- [ ] **Step 5: Commit** (only if user asked)

```bash
git commit -m "Add thin RobotRun tip-ack so race-start waits briefly for guest sync."
```

---

### Task 4: Docs cross-links

**Files:**
- Modify: `multi-game/docs/superpowers/specs/README.md`
- Modify: `multi-game/docs/superpowers/specs/2026-08-26-robotrun-tip-checkpoint-sync-design.md` (short “rejoin” pointer)
- Spec already: `2026-08-26-robotrun-rejoin-tip-ready-design.md`

- [ ] **Step 1: Index the new spec under Actueel**
- [ ] **Step 2: In tip-CHECKPOINT §3, link rejoin design**
- [ ] **Step 3: Commit** (only if user asked)

---

### Task 5: End-to-end verification

- [ ] **Step 1: Countdown rejoin (joiner)** — leave at ~6s, rejoin, remaining ≈ correct  
- [ ] **Step 2: First join** — both see start-upgrade; no stuck overlay  
- [ ] **Step 3: Play rejoin** — animation may restart; after host end both in programming  
- [ ] **Step 4: Regression** — normal race without leave still smooth; no freeze on Play start  

---

## Why this order

1. UI fallback fix → immediate user-visible “fake 10” gone even before RESYNC.  
2. RESYNC on boot → structural live tip on rejoin.  
3. Tip-ack → polish for first start only.  
4. Docs + E2E.

## Out of scope (do not implement here)

- Mid-Play `execStep` resume  
- Intent ACK/REJECT for commit/upgrade  
- Host leave/rejoin authority transfer  
- Reverting local Play to micro-snapshots  
