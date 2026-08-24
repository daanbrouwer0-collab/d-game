# Game integration guide — nieuw spel in D-Game

Datum: 2026-08-24  
Status: **actueel** — praktische gids voor ontwikkelaars  
Lees ook: [multiplayer-bouwregels.md](../../multiplayer-bouwregels.md) · [embedded-games-standard-design.md](./2026-08-24-embedded-games-standard-design.md) · [game-agnostic-rooms-design.md](./2026-08-24-game-agnostic-rooms-design.md)

---

## Doel

Eén pad om een spel toe te voegen aan de **overkoepelende room-app** (`room/`), zonder per spel nieuwe P2P- of room-logica. Het spel kiest een **sync-profiel**; de shell blijft hetzelfde.

---

## Architectuur (wat waar hoort)

```text
room/main.js          → P2P, roster, chat, stemmen, iframe, session relay
js/bridge/            → postMessage, runEmbeddedGame, notifySessionEnded
js/sync/              → event-log, host-commit, room-log (gedeeld)
{game}/embedded.js    → dunne adapter (~100 regels)
{game}/game.js        → pure spelregels / reducer (geen transport)
{game}/log.js         → replay(log) → state (event-log spellen)
```

**Twee logs, nooit mixen:**

| Log | Key | Inhoud |
|-----|-----|--------|
| Room | `p2p:room:{CODE}` | leden, votes, chat, `session_start` / `session_end` |
| Session | `p2p:session:{CODE}:{sid}:{gameId}` | alleen game-events van één ronde |

Embedded spellen: **geen eigen PeerJS** — sync loopt via bridge → room shell → session log.

---

## Stap 1 — Kies sync-profiel

```text
                    Nieuw spel
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   Turn-based      Zware engine      Solo / geen sync
   kleine events   fase-machine      in room nodig
        │               │               │
        ▼               ▼               ▼
   event-log        snapshot        local-only*
   (TTT, GB)        (RobotRun)      (optioneel later)

* local-only: nog geen room-embedded; wel catalog + standalone.
```

| Profiel | Wanneer | Host sync | Gast sync | Voorbeeld |
|---------|---------|-----------|-----------|-----------|
| **event-log** | Discrete zetten, replay = state | `appendEvent` → `SyncMsg.LOG` | `SyncMsg.INTENT` → host commit | Tic-tac-toe, Ganzenbord |
| **snapshot** | Grote state, engine-driven | Snapshot + monotoon `stateRev` | Intents (`wireType: rr_*`) | RobotRun |
| **local-only** | Geen multiplayer in room | — | — | Puzzels (toekomst) |

**Regel:** kies één profiel per spel ([R3](../../multiplayer-bouwregels.md)). Geen half log + half gast-state.

**Twijfel?** Begin met event-log. Migreer naar snapshot als replay te zwaar of te omslachtig wordt.

---

## Stap 2 — Catalog entry

In `js/core/catalog.js`:

```js
{
  id: "my-game",
  title: "My Game",
  path: "my-game/",
  minPlayers: 2,
  maxPlayers: 4,
  blurb: "...",
  embedded: {
    entry: "embedded.js",           // of "js/embedded.js"
    syncProfile: "event-log",       // | "snapshot"
    roomReady: false,               // true pas na handmatige 2-browser test
  },
}
```

- `roomReady: false` → stemkaart disabled, host kan niet starten.
- Filter in room: `roomReadyGames(count)` — alleen speelbare spellen tellen mee voor winnaar-stem.

---

## Stap 3 — Embedded adapter

`index.html` — laad embedded entry bij `?embedded=1` (zie TTT/Ganzenbord).

`embedded.js` — minimaal:

```js
import { runEmbeddedGame, notifySessionEnded } from "../js/bridge/embedded-bootstrap.js";

runEmbeddedGame({
  gameId: "my-game",
  prepareUI() {
    // Verberg setup/lobby/nav — room levert roster
  },
  start(ctx) {
    // ctx: transport, role, playerId, name, roster, log, sessionId, roomCode
    // Bootstrap engine; geen createRoom/PeerJS
    // Einde: notifySessionEnded({ reason: "finished" | "left" | "back_to_lobby" })
  },
});
```

**Referentie-implementaties:**

| Profiel | Bestand |
|---------|---------|
| event-log | `tic-tac-toe/embedded.js`, `ganzenbord/embedded.js` |
| snapshot (stub) | `robotrun/js/embedded.js` |

---

## Stap 4 — Sync per profiel

### event-log

1. Host: `#appendAndBroadcast(type, payload)` of gedeelde `hostCommit.commit`.
2. Bridge: `transport.send(SyncMsg.LOG, packet)` — room relayed als `SESSION_LOG`.
3. Gast: intent via `transport.send(SyncMsg.INTENT, …)` of game-type (`roll`, `move`).
4. Game-specifieke types: room stuurt `SESSION_INTENT { wireType: "roll", … }` door naar host-iframe.
5. State altijd: `replay(log)` — geen parallel STATE-kanaal.

### snapshot

1. Host: enige snapshot-bron na elke fase/commit.
2. Gast: intents met `wireType` (bijv. `rr_intent_commit`); nooit volledige state pushen.
3. Snapshot in session log of als LOG-payload met `stateRev`.
4. Hergebruik bestaande engine-handlers; vervang alleen transport (PeerJS → `BridgeTransport`).

---

## Stap 5 — Session-einde gedrag

Expliciet kiezen per spel:

| Gedrag | Wanneer | API |
|--------|---------|-----|
| **Auto** | Korte spellen, direct terug stemmen | `watchSessionEnd(isFinished, reason)` in sync-loop |
| **Handmatig** | Rematch / terug-naar-lobby knoppen | Alleen `notifySessionEnded()` op knoppen |

| Spel | Keuze |
|------|-------|
| Tic-tac-toe | Auto bij win/draw |
| Ganzenbord | Handmatig (rematch blijft in sessie) |
| RobotRun | Handmatig na race (verwacht) |

---

## Checklist — klaar voor `roomReady: true`

### Catalog & entry

- [ ] `embedded.syncProfile` correct
- [ ] `embedded.entry` pad klopt
- [ ] `minPlayers` / `maxPlayers` kloppen
- [ ] `index.html` laadt `embedded.js` bij `?embedded=1`

### Room-gedrag

- [ ] Geen eigen P2P in embedded mode
- [ ] Roster uit `ctx.roster` → stoelen (niet eigen lobby)
- [ ] Setup/lobby/nav verborgen in `prepareUI()`
- [ ] `notifySessionEnded()` op verlaten / terug naar room

### Sync (2+ browsers via `/room/`)

- [ ] Host start na stemmen; guests zien hetzelfde bord
- [ ] Beurt/intents alleen voor juiste speler
- [ ] Host-only timer (indien van toepassing)
- [ ] Reconnect / late join: guest krijgt session log via welcome
- [ ] Geen room-events in game-log

### Docs

- [ ] `README.md` embedded-tabel bijgewerkt
- [ ] `p2p-multiplayer.md` embedded-tabel bijgewerkt

### Tests

- [ ] Handmatig: 2 browsers, volledige ronde + terug naar stemmen
- [ ] Optioneel: unit tests voor replay / bootstrap (`node …test.js`)

---

## Wat de shell **niet** doet (niet in spel bouwen)

- Geen game-specifieke UI in `room/`
- Geen chat in iframe (room chat blijft in shell)
- Geen per-spel stoelen-lobby (roster = room log)
- Geen `if (gameId === …)` in `room/main.js` — alles via catalog + bridge wire types

---

## Snelle bestandskaart

| Taak | Bestand |
|------|---------|
| Spel toevoegen aan picker | `js/core/catalog.js` |
| Room shell | `room/main.js` |
| Bridge API | `js/bridge/embedded-bootstrap.js`, `embedded-contract.js` |
| Event-log canon | `js/sync/host-commit.js`, `js/sync/event-log.js` |
| Bouwregels R1–R24 | `docs/multiplayer-bouwregels.md` |

---

## Implementatiestatus

| Spel | Profiel | roomReady |
|------|---------|-----------|
| Tic-tac-toe | event-log | ja |
| Ganzenbord | event-log | ja |
| RobotRun | snapshot | nee (stub) |
