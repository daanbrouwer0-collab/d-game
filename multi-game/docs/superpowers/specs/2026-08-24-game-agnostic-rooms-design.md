# Game-agnostic rooms — design spec

Datum: 2026-08-24  
Status: **actueel** — geïmplementeerd in `room/` (TTT embedded; GB/RR stub)  
Scope: `multi-game/` — room ≠ game, game picker op spelersaantal, P2P blijft star/host-authority

---

## Doel

Spelers maken **één room** met een groep, kiezen daarna een spel uit de catalogus (gefilterd op aantal verbonden spelers), en kunnen na afloop terug naar de room-lobby voor een volgend spel — **zonder de P2P-verbinding te verbreken**.

---

## Architectuur (kort)

```
┌─────────────────────────────────────────────────────────────┐
│  room/  (shell — houdt PeerJS alive)                        │
│  ├─ Room P2P session (geen gameId)                          │
│  ├─ Room log (leden, sessies)                               │
│  ├─ Game picker (catalog filter)                            │
│  └─ iframe → spel (embedded mode, geen eigen P2P)           │
└─────────────────────────────────────────────────────────────┘
         │ postMessage bridge
         ▼
┌─────────────────────────────────────────────────────────────┐
│  tic-tac-toe / ganzenbord / robotrun                        │
│  ├─ Session log (bestaande game events, ongewijzigd)          │
│  └─ replay(log) — geen wijziging aan event types             │
└─────────────────────────────────────────────────────────────┘
```

**Room-shell (optie A)** is gekozen: P2P leeft in `room/`, spellen draaien embedded en praten via een bridge. Standalone P2P per spel blijft tijdelijk werken (legacy) tot migratie klaar is.

---

## Log-architectuur — twee lagen, één engine

### Principe: game logs blijven puur

Bestaande game replay (`replayTtt`, `replayGanzenbord`, RobotRun snapshots) blijft werken op logs met **alleen game-events**. Room-orkestratie komt in een **aparte room-log**. Nooit room-events mixen in een game-log.

| Laag | Doel | `gameId` veld | Storage key |
|------|------|---------------|-------------|
| **Room log** | Leden, ready, sessie-start/stop | `"__room__"` (sentinel) | `p2p:room:{CODE}` |
| **Session log** | Eén ronde van één spel | `"tic-tac-toe"` etc. | `p2p:session:{CODE}:{sessionId}:{gameId}` |

Beide gebruiken dezelfde `event-log.js` engine (`appendEvent`, `encodeSyncPacket`, `adoptHostPacket`). Het veld `gameId` op `EventLog` blijft bestaan voor backward compatibility; session logs gebruiken het echte spel-id.

### Uitbreiding EventLog (backward compatible)

```js
/**
 * @typedef {{
 *   gameId: string,           // "__room__" of "tic-tac-toe" / "ganzenbord" / "robotrun"
 *   events: GameEvent[],
 *   meta?: {
 *     scope: 'room' | 'session',
 *     roomCode?: string,
 *     sessionId?: string,
 *   },
 * }} EventLog
 */
```

Bestaande logs zonder `meta` blijven geldig (legacy standalone P2P).

### SyncPacket v2 (optioneel naast v1)

```js
/**
 * @typedef {{
 *   v: 1 | 2,
 *   gameId: string,
 *   fromSeq: number,
 *   events: GameEvent[],
 *   logKey?: string,          // v2: expliciete storage id
 *   scope?: 'room' | 'session',
 *   sessionId?: string,
 * }} SyncPacket
```

- v1 packets: alleen game sync (legacy + embedded session sync)
- v2 packets: room shell stuurt room-log met `logKey: "p2p:room:AB7K2M"`

`applySyncPacket` blijft `gameId` matchen; room-log packets hebben `gameId: "__room__"`.

---

## Room event types (namespaced)

Prefix `room.` voorkomt collision met game events (`seat`, `start`, …).

| Type | Wanneer | Payload |
|------|---------|---------|
| `room.created` | Host opent room | `{ hostPlayerId, maxPlayers, version: 1 }` |
| `room.member_join` | Peer joint + hello | `{ playerId, name }` |
| `room.member_leave` | Disconnect / leave | `{ playerId, reason?: 'disconnect'\|'left' }` |
| `room.member_ready` | Speler togglet ready | `{ playerId, ready: boolean }` |
| `room.session_start` | Host start spel | `{ sessionId, gameId, roster: [{ playerId, name }] }` |
| `room.session_end` | Terug naar lobby | `{ sessionId, gameId, reason: 'finished'\|'aborted'\|'back_to_lobby', summary?: string }` |

**Geen** game-events (`move`, `roll`, …) in de room-log.

### Session id

```js
function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
```

Uniek per gestart spel binnen dezelfde room. Oude session logs blijven bewaard (geschiedenis / desk).

---

## Replay room state

```js
function replayRoom(log) {
  // returns { members: Map<playerId, {name, ready}>, activeSession: null | { sessionId, gameId }, history: [] }
}
```

Regels:
- `member_join` voegt toe; latere join met zelfde `playerId` update naam
- `member_leave` verwijdert (of markeert offline — YAGNI: verwijderen)
- `session_start` zet `activeSession`
- `session_end` cleart `activeSession`, pusht naar `history`

---

## Game session lifecycle

```
1. Host kiest spel in picker (count filter OK)
2. Host commit: room.session_start → broadcast ROOM_LOG
3. Shell maakt lege session log: createEventLog(gameId)
4. Shell laadt iframe: #ganzenbord/index.html?embedded=1&session=...&room=...
5. Spel draait via bridge (intents ↑, LOG ↓) — zelfde host-commit pipeline
6. Spel klaar / "Terug naar lobby" → host commit room.session_end
7. Shell unmount iframe, toont picker opnieuw; P2P blijft open
```

### Stoelen: room roster → game seats

- **Room roster** = wie verbonden is (`member_join` events)
- **Game seats** = nog steeds game-specifieke `seat` events in **session log**
- Bij `session_start` stuurt shell `roster` mee; spel maakt initiale `seat` events (host) op basis van roster + spelregels (TTT: 2 spelers kiezen X/O; GB: volgorde join)

Games blijven verantwoordelijk voor hun eigen seat-model — room levert alleen de deelnemerslijst.

---

## Compatibiliteit per spel

| Spel | Sync model | Session log events | Aanpassing |
|------|------------|-------------------|------------|
| Tic-tac-toe | Event-log + replay | `seat`, `move`, `restart`, `timeout` | Embedded bridge; standalone P2P deprecated |
| Ganzenbord | Event-log + replay | `seat`, `start`, `roll`, `timeout`, `to_lobby` | Idem |
| RobotRun | Snapshot + intents | `seat`, `start`, `snap`, … | Bridge i.p.v. eigen `P2pSessionController` P2P |

**RobotRun:** session log blijft het model; geen verplichting om naar pure replay te migreren. Wel: snapshots alleen in session log, nooit in room log.

---

## P2P berichten (room shell)

Nieuwe constanten in `js/sync/room-msg.js`:

```js
export const RoomMsg = Object.freeze({
  ROOM_INTENT: "room_intent",
  ROOM_LOG: "room_log",
  ROOM_ACK: "room_ack",
  ROOM_REJECT: "room_reject",
  SESSION_LOG: "session_log",   // wraps SyncMsg.LOG with sessionId
  SESSION_INTENT: "session_intent",
  SESSION_ACK: "session_ack",
  SESSION_REJECT: "session_reject",
});
```

Envelope op wire (bestaande `{ type, seq, payload, ts }`):

```js
// session_log payload
{ sessionId, gameId, packet: SyncPacket }

// session_intent payload
{ sessionId, gameId, intentId, type, payload, actorPlayerId }
```

Games in embedded mode zien alleen berichten voor hun `sessionId`.

---

## URL & routing

| URL | Betekenis |
|-----|-----------|
| `#room/?room=AB7K2M` | Join room als gast |
| `#room/?room=AB7K2M&as=host` | Host hervat |
| `#room/` (geen room) | Nieuwe room starten |
| `#ganzenbord/?room=…` | Legacy — blijft werken tot verwijderd |

Share-link wordt altijd `#room/?room=CODE`.

---

## Desk / geheugen

Recent rooms entry wijzigt van `{ gameId, code, … }` naar `{ code, role, memberCount, activeGameId?, activeSessionId?, summary }`.

Legacy entries met `gameId` blijven leesbaar; `navigateDeskCard` opent `#room/?room=CODE`.

Opslag keys:
- `p2p:room:{CODE}` — room log
- `p2p:session:{CODE}:{sessionId}:{gameId}` — session logs
- Legacy: `p2p:{gameId}:{CODE}` — read-only fallback bij openen oude links

---

## Constraints

- Geen server; PeerJS star-topologie blijft
- Host authority voor room log én session logs
- `maxGuests = 5` (6 spelers — maximum uit catalogus)
- Geen wijziging aan `multi-game-netlify/` in fase 1
- Hotseat/local per spel blijft onafhankelijk van room shell

---

## Niet in scope (YAGNI)

- Stemmen op spelkeuze (host kiest; gasten volgen)
- Cross-room matchmaking
- Session logs mergen over rooms
- QR-sync voor room shell (later)
