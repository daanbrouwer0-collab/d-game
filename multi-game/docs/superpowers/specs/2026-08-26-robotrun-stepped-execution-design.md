# RobotRun stepped play/replay execution — design

Datum: 2026-08-26  
Status: **geïmplementeerd**  
Scope: `multi-game/robotrun` engine + UI (+ snapshot fields)  
Keuze volgorde: **B** klassiek RoboRally

---

## Doel

1. Play/replay in **zichtbare micro-stappen** (niet alles per register in één tik).
2. Per register: moves één-voor-één (hoogste priority eerst) → banden/draaischijven → lasers.
3. Lasers weer zichtbaar; **double laser** = twee stralen naast elkaar.
4. Engine voert echte kaart-moves uit (geen fake UI-only animatie).

---

## Executie-model

Vervang “één `executeNextRegister` doet alles” door **`advanceExecutionStep()`**:

```
registerIndex 0..4
  phase moves:  play next robot card (sorted by priority desc)
  phase board:  activateBoardElements() once
  phase lasers: activateBoardLasers + activateRobotLasers once (bursts for UI)
→ next register / checkRoundEnd
```

State (export/import / snapshot):
- `registerIndex`
- `execPhase`: `'moves' | 'board' | 'lasers' | null`
- `execMoveIndex`: index into sorted actions for current register
- `execActionQueue`: optional snapshot of `{ robotId, card }` for current register (or rebuild from registers each time)
- `lastLaserBursts` (kept until next laser step / cleared at start of next laser step)
- `activeRegisterCards` / `execFocus` for UI headline

Timer (host): call `advanceExecutionStep` ~900–1200ms; guests follow snapshots.

Replay: capture a frame after each micro-step (not only per register).

---

## Lasers

- Board + robot lasers in laser-fase; beams in `lastLaserBursts` voor UI (~0.8s+).
- `doubleLaser`: fire **two** parallel beams offset perpendicular to facing (e.g. ±0.22 tile); damage **1 per beam** (totaal 2 als beide raken) — of 1 damage each hit on same target once? Prefer: two beams, each deals 1; same target can take 2 if both hit (same as current double damage).

---

## UI

- Headline: huidige stap (`Alice Move 2 (840)` / `Banden & draaischijven` / `Lasers`).
- `drawLaserEffects`: support offset beams; keep bursts visible across step.
- Replay button uses finer frames.

---

## Non-goals

- Changing RoboRally rules beyond step visibility / double-laser visuals.
- Rewriting sync to event-log-only.

---

## Success criteria

1. During Play you see robots move one by one in priority order.
2. Then conveyors/gears animate as a step; then lasers flash.
3. Double laser shows two beams; lasers visible again.
4. Pushes match priority order; guests see same via snapshots.
