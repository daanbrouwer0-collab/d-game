# Embedded games standard — design spec

Datum: 2026-08-24  
Status: **actueel** — framework in `js/bridge/`  
Scope: alle spellen in room shell (`?embedded=1`)

---

## Doel

Eén **standaard** om spellen aan de room shell toe te voegen. Geen per-spel P2P in embedded mode; sync loopt via bridge → session log.

Nieuw spel toevoegen = **catalog entry + `embedded.js` adapter** (dunne laag).

---

## Lagen

```
┌─────────────────────────────────────────────────────────┐
│  room/main.js                                           │
│  P2P · room log · iframe · game-bridge · session-host   │
└───────────────────────────┬─────────────────────────────┘
                            │ postMessage (BridgeMsg)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  js/bridge/embedded-bootstrap.js                        │
│  runEmbeddedGame(adapter) — gedeeld entrypoint            │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  {game}/embedded.js                                     │
│  EmbeddedGameAdapter — spel-specifiek                     │
└─────────────────────────────────────────────────────────┘
```

---

## Catalog manifest

Elk spel in `js/core/catalog.js`:

```js
{
  id: "tic-tac-toe",
  // …
  embedded: {
    entry: "embedded.js",           // relatief t.o.v. game path
    syncProfile: "event-log",       // "event-log" | "snapshot"
    roomReady: true,                // false = niet startbaar in room
  },
}
```

| Veld | Betekenis |
|------|-----------|
| `entry` | Module pad (default `embedded.js`) |
| `syncProfile` | Sync-model (bouwregel R3) |
| `roomReady` | Room mag dit spel starten na stemmen |

Room shell filtert stemmen/start op `roomReady === true`.

---

## EmbeddedGameAdapter (contract)

```js
/**
 * @typedef {Object} EmbeddedGameAdapter
 * @property {string} gameId
 * @property {() => void} [prepareUI] — verberg legacy lobby/P2P UI
 * @property {(ctx: EmbeddedContext) => void | Promise<void>} start
 */

/**
 * @typedef {Object} EmbeddedContext
 * @property {BridgeTransport} transport
 * @property {'host'|'guest'} role
 * @property {string} roomCode
 * @property {string} sessionId
 * @property {string} gameId
 * @property {string} playerId
 * @property {string} name
 * @property {{ playerId: string, name: string }[]} roster
 * @property {import('../sync/event-log.js').SyncPacket} log
 */
```

### Verplicht gedrag

1. **Geen PeerJS** in embedded mode.
2. **`prepareUI`** — verberg standalone multiplayer / session menu.
3. **`start`** — mount spel, bind `transport.onMessage`, bootstrap state uit `ctx.log` + `roster`.
4. **Einde sessie** — `notifySessionEnded(reason)` → room keert terug naar stemmen.
5. **Sync** — zie profiel hieronder; nooit room-events in game log.

---

## Sync profielen

### Profiel A: `event-log` (TTT, Ganzenbord)

| Richting | Wire |
|----------|------|
| Host → allen | `transport.send(SyncMsg.LOG, packet)` |
| Gast → host | `transport.send(SyncMsg.INTENT, intentPayload)` |
| ACK/reject | `SyncMsg.ACK` / `SyncMsg.REJECT` |

Session log = `appendEvent` keten; `replay(log)` = state.

**Nieuw spel:** engine met `bootstrapEmbedded({ role, log })` + bestaande host-commit.

### Profiel B: `snapshot` (RobotRun)

| Richting | Wire |
|----------|------|
| Host → allen | Tip-proven `SyncMsg.CHECKPOINT` (room: `SESSION_CHECKPOINT`); desk `start`/`snap` optioneel, niet live-merge |
| Gast → host | Intents via `SyncMsg.INTENT` (wrap `{ wireType: 'rr_…', … }`) |

Host blijft enige snapshot-bron. Geen volledige state van gast accepteren. Live pad is **zelfstandige tip-CHECKPOINT**, niet incrementele snap-LOG.

**Referentie:** [2026-08-26-robotrun-tip-checkpoint-sync-design.md](./2026-08-26-robotrun-tip-checkpoint-sync-design.md).

**Migratie RR:** bestaande `rr_*` handlers hergebruiken; transport = bridge i.p.v. PeerJS.

---

## Bridge protocol (ongewijzigd)

Zie `js/bridge/bridge-protocol.js`:

- Shell → iframe: `SESSION_INIT`, `GAME_IN`
- Iframe → shell: `READY`, `GAME_OUT`, `SESSION_ENDED`

---

## Nieuwe spel checklist

1. Catalog: `embedded: { syncProfile, roomReady }`
2. `index.html`: `loadEmbeddedIfPresent()` of handmatig `?embedded=1` → import entry
3. `{game}/embedded.js`:

```js
import { runEmbeddedGame, notifySessionEnded } from "../js/bridge/embedded-bootstrap.js";

runEmbeddedGame({
  gameId: "my-game",
  prepareUI() { /* hide lobby */ },
  start(ctx) { /* bootstrap engine */ },
});
```

4. Tests: handmatig 2 browsers via `#room/`
5. Zet `roomReady: true` pas als embedded echt speelbaar is

---

## Wat room shell **niet** doet

- Geen game-specifieke UI in room
- Geen chat in iframe
- Geen stoelen-lobby per spel (roster komt uit room log)

---

## Implementatiestatus

| Spel | Profiel | roomReady |
|------|---------|-----------|
| Tic-tac-toe | event-log | ja |
| Ganzenbord | event-log | ja (`embedded.js`) |
| RobotRun | snapshot (tip-CHECKPOINT) | ja |
