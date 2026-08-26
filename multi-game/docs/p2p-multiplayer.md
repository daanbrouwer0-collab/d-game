# P2P multiplayer — hoe D-Game werkt

**Status:** levend referentiedocument (code = waarheid)  
**Laatst bijgewerkt:** 2026-08-24  
**Scope:** `multi-game/` — PeerJS, event-log, room shell, spellen

**Documentatieset:**

| Doc | Rol |
|-----|-----|
| [speler-handleiding.md](./speler-handleiding.md) | **Spelers:** room starten, link delen, spel kiezen |
| **Dit bestand** | **Ontwikkelaars:** transport, log, sync, situaties |
| [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) | Normatief: regels voor nieuwe spellen |
| [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md) | Kritisch: gaten, bug-hotspots |
| [p2p-fundamenten.md](./p2p-fundamenten.md) | Fundamenten: canon, geen dubbele waarheid |
| [README.md](./README.md) | Index + diagram |
| [superpowers/specs/README.md](./superpowers/specs/README.md) | Welke specs actueel vs historisch zijn |

Oudere specs (gossip, vroege frames) staan onder `superpowers/specs/` — zie index.  
Bij conflict: **code** → dit document.

---

## 1. Kernidee

**Ster-topologie:** één **host-tab** is autoriteit. Gasten sturen **intenties**; de host **valideert**, **append** aan een event-log, en broadcast **LOG**. State = **`replay(log)`** (niet omgekeerd).

**Twee multiplayer-paden:**

| Pad | URL | P2P waar | Log |
|-----|-----|----------|-----|
| **Room shell (voorkeur)** | `#room/?room=CODE` | `room/main.js` houdt PeerJS alive | Room log + session log per spelronde |
| **Legacy per spel** | `#tic-tac-toe/?room=CODE` | In het spel zelf | `p2p:{gameId}:{CODE}` |

```
  [Gast A] ──intent──► [HOST] ──LOG──► [Gast A]
  [Gast B] ──intent──►   │    ──LOG──► [Gast B]
                         │
              event-log → replay → state
```

Stoelen = stabiele **`playerId`** (localStorage), niet PeerJS-id of host-rol.

---

## 2. Lagen (bestandskaart)

### Transport & sync (gedeeld)

| Laag | Pad | Rol |
|------|-----|-----|
| Event-log | `js/sync/event-log.js` | `appendEvent`, `encodeSyncPacket`, `adoptHostPacket` |
| Host commit | `js/sync/host-commit.js` | Peer bind, intent → commit, turnKey |
| Sync berichten | `js/sync/sync-msg.js` | `intent`, `ack`, `reject`, `log`, `resync` |
| Room log | `js/sync/room-log.js` | `room.*` events, `replayRoom` |
| Room host | `js/sync/room-host.js` | Commits op room log |
| Log keys | `js/sync/log-keys.js` | Storage key helpers |
| Net | `js/p2p/net.js` | PeerJS Peer + DataConnection |
| Protocol | `js/p2p/protocol.js` | Envelope `{ type, seq, payload, ts }` |
| Desk | `js/core/desk.js` | Load/save room + session + legacy logs |
| Identity | `js/core/storage.js` | `getPlayerId()`, display name |
| URLs | `js/shell/site-url.js` | Hash-shell, `#room/?room=`, embedded URLs |
| Bridge | `js/bridge/` | postMessage shell ↔ embedded spel |

### Room shell (game-agnostisch)

| Laag | Pad | Rol |
|------|-----|-----|
| UI | `room/main.js` | Host/join, roster, game picker, iframe |
| Session | `js/p2p/room-session.js` | P2P zonder `gameId`-mismatch |
| Transport | `js/transport/room-p2p.js` | Facade |
| Factory | `js/core/room.js` | `createRoomSession({ maxGuests: 5 })` |

### Legacy per spel

| Laag | Path | Rol |
|------|------|-----|
| Factory | `js/core/room.js` | `createRoom({ gameId, transport, maxGuests })` |
| Session | `js/p2p/session.js` | hello/welcome + `gameId` check |
| Transport | `js/transport/p2p.js` | Wrap Session |

Transportvarianten: `local` (hotseat), `p2p`, `qr`, `matrix` (stub).

---

## 3. Connectie (PeerJS)

### Statussen

`idle` → `connecting` → `hosting` (host) of `connected` → `disconnected` / `error`

| Situatie | Gedrag |
|----------|--------|
| Host start room | PeerJS peer-id = roomcode (~6 tekens) |
| Gast joint | `connect(roomCode, { reliable: true })` |
| Signaling weg, data open | Stil `peer.reconnect()` |
| Keepalive (5s) | `ping` / `pong` |
| Lobby vol | `room_full` (max 6 spelers in room shell) |
| Soft reconnect | Host: `hostWithCode(code)`; gast: `join(code)` |
| Host-wissel | `?room=CODE&as=host` → `hostWithCode` |

### Handshake — legacy per spel

1. Gast → `hello` `{ gameId, playerId, name, … }`
2. Host → `welcome` `{ youAre, log, seats, … }`
3. `gameId` mismatch → `onGameMismatch` (geen gemengde state)

### Handshake — room shell

1. Gast → `hello` `{ roomCode, playerId, name }`
2. Host → `welcome` `{ roomLog, activeSession?, sessionLog? }`
3. Geen `gameId` op transport — spelkeuze via room log (`room.session_start`)

---

## 4. Data-overdracht & log

### Envelope

`{ type, seq, payload, ts }` via `createMessage` / `parseMessage`.

### Drie log-soorten (opslag)

| Soort | Storage key | `gameId` in log | Events |
|-------|-------------|-----------------|--------|
| **Room log** | `p2p:room:{CODE}` | `__room__` | `room.created`, `room.member_join`, `room.game_vote`, `room.chat_message`, `room.session_start`, `room.session_end`, … |
| **Session log** | `p2p:session:{CODE}:{sessionId}:{gameId}` | echt spel-id | `seat`, `move`, `roll`, … (ongewijzigd per spel) |
| **Legacy game room** | `p2p:{gameId}:{CODE}` | spel-id | Zelfde game-events; standalone P2P |

Room-events **nooit** in session log. Game-events **nooit** in room log.

### Sync-modellen per spel

| Model | Spellen | Canon |
|-------|---------|-------|
| Event-log + replay | Tic-tac-toe, ganzenbord | Append-only keten; `replay(log)` |
| Tip-CHECKPOINT + intents | RobotRun (room) | Live: `SyncMsg.CHECKPOINT` / `SESSION_CHECKPOINT` met tip-bewijs; desk-log `start`/`snap` apart; gasten sturen intents |

**Doel (log-only canon, beurtspellen):** na host-commit alleen **LOG** broadcasten; gast adopt via `adoptHostPacket`.  
**RobotRun room:** live waarheid = tip-CHECKPOINT (geen incrementele snap-LOG). Spec: [2026-08-26-robotrun-tip-checkpoint-sync-design.md](./superpowers/specs/2026-08-26-robotrun-tip-checkpoint-sync-design.md).  
**Huidige code:** sommige beurtspellen sturen nog **STATE** als backup; zie [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md).

### Event-keten (`event-log.js`)

- `seq` monotoon; `prevId` chain
- Gap → apply faalt → **resync** nodig
- RNG in **host payload** (dobbel, blocked cells, timeout-cel)
- Gast: `adoptHostPacket` — host wint bij conflict (doel R17)

### Overige persistatie

| Key | Inhoud |
|-----|--------|
| `dgame.playerId` | Stabiele speler-id |
| `dgame.rooms.recent` | Lobby-kaarten |
| `dgame.room` (session) | Actieve room deze tab |
| `dgame.ttt.mark.{CODE}` | Laatste X/O (legacy TTT) |

---

## 5. Room shell — flow

```
1. Host: createRoomSession() → room.created + member_join (host)
2. Gasten: hello → host member_join → welcome (roomLog)
3. Host: game picker → room.session_start { sessionId, gameId, roster }
4. iframe: ?embedded=1&room=&session=
5. Bridge: SESSION_INIT → spel bootstrapEmbedded / bridge transport
6. Spel: intent ↑ shell ↑ P2P → host iframe → LOG (beurtspellen) of CHECKPOINT (RobotRun) ↓ gasten
7. Einde: room.session_end → terug naar picker (P2P blijft open)
```

**Embedded spellen (2026-08-24):**

| Spel | Room embedded | Legacy standalone P2P |
|------|---------------|------------------------|
| Tic-tac-toe | Ja (`embedded.js`) | Ja |
| Ganzenbord | Ja (`embedded.js`) | Ja |
| RobotRun | Ja (`embedded.js`) | Ja |

Wire types room shell: `js/sync/room-msg.js` (`room_log`, `session_intent`, `session_log`, `session_checkpoint`, …).

Spec: [2026-08-24-game-agnostic-rooms-design.md](./superpowers/specs/2026-08-24-game-agnostic-rooms-design.md)

### Room chat

| Event | Payload |
|-------|---------|
| `room.chat_message` | `{ messageId, playerId, name, text, ts }` |

- Gast → `ROOM_INTENT { kind: 'chat', playerId, text }` → host `postChat` → `ROOM_LOG`
- Chat blijft over spelrondes (niet gewist bij `session_start` / `session_end`)
- UI in room shell: open in lobby; **open onder de game-iframe** tijdens spel
- Spec (tijdens spel): [2026-08-25-room-chat-during-play-design.md](./superpowers/specs/2026-08-25-room-chat-during-play-design.md)
- Rate limit host-side: 10 berichten / 60s per speler; max 500 tekens
- **Niet** in session logs; embedded spellen zien chat niet

Spec: [2026-08-24-room-first-chat-design.md](./superpowers/specs/2026-08-24-room-first-chat-design.md)

---

## 6. Beurten — patroon

```
  Gast: intent ──► Host: validate ──► appendEvent ──► broadcast LOG
  Gast: adoptHostPacket ──► replay ──► UI
```

| Regel | Betekenis |
|-------|-----------|
| Alleen host append canonieke log | Gasten mergen host-LOG, schrijven niet |
| Beurt = afgeleid uit state | `turn`, `turnIndex` na replay |
| Timer | Doel: host-only + idempotent turnKey (zie rapport) |
| ACK/REJECT | Doel: na elke intent (zie rapport) |

---

## 7. Situatiecatalogus (kort)

### Verbinding

| # | Situatie | Afhandeling |
|---|----------|-------------|
| A1 | Host maakt room | Code + QR; room log + session logs in desk |
| A2 | Gast joint lobby | hello → member_join → welcome |
| A3 | Host tab dicht | Spel stil tot `?as=host` + zelfde code + logs |
| A4 | Verkeerd legacy spel-link | gameId-mismatch (legacy) of open `#room/?room=` |

### Per spel

Zie §8–10 in eerdere versies — ongewijzigde game-regels:

- **TTT:** 1v1, `seat`/`move`/`restart`/`timeout`, timer 20s → random zet
- **Ganzenbord:** 2–6, `roll` host-rolled, timeout = skip
- **RobotRun:** tip-CHECKPOINT + intents, gelijktijdige programming, lokale Play + host eind-waarheid

---

## 8. Hotseat vs P2P

| | `local` / hotseat | Room shell P2P | Legacy per-spel P2P |
|--|-------------------|----------------|---------------------|
| Netwerk | Nee | PeerJS in `room/` | PeerJS in spel |
| Multi-spel avond | Nee | Ja (picker) | Nee (1 spel per link) |
| Log | Meestal geen | Room + session | `p2p:gameId:CODE` |

---

## 9. Bekende zwaktes & roadmap

Zie [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md) voor P0–P3. Samenvatting:

1. **Host single point of failure** — inherent P2P zonder server
2. **P0 nog open:** TTT host accepteert soms peer-LOG; peer↔seat bind niet overal; ACK/timer
3. **Room shell:** TTT/GB/RR embedded speelbaar; legacy dubbele P2P-paden blijven parallel
4. **RobotRun:** geen intent-ACK; mid-`executing` geen heartbeat (dubbele start-CHECKPOINT mitigatie) — zie tip-CHECKPOINT spec
5. **Gossip / mesh** — niet geïmplementeerd (historische spec)

---

## 10. Checklist nieuw multiplayer-spel

### In room shell (voorkeur)

- [ ] `embedded.js` + `?embedded=1` in index.html
- [ ] Geen eigen PeerJS wanneer embedded — `BridgeTransport` + bridge
- [ ] Session log alleen game-events; replay bestaand `log.js`
- [ ] `gamesForPlayerCount` in catalogus (`minPlayers` / `maxPlayers`)

### Sync (legacy + embedded)

- [ ] `createHostCommit({ gameId })` — geen ruwe PeerJS in UI
- [ ] Gast: intents; host: append + broadcast LOG
- [ ] Host negeert peer LOG/STATE
- [ ] `fromPeerId → playerId` op intents (multi-guest)
- [ ] RNG in host payload; `replay(log)` deterministisch
- [ ] Mid-game join beleid expliciet + getest
- [ ] Reconnect + `?as=host` getest

### Documentatie

- [ ] Event types in dit doc § spellen (of spel-README)
- [ ] Timeout-gedrag (skip vs force) gedocumenteerd

---

## 11. Gerelateerde links

| Link | |
|------|--|
| [Spelerhandleiding](./speler-handleiding.md) | Room gebruiken |
| [multi-game/README.md](../README.md) | Sandbox starten |
| [Root README P2P](../../README.md#p2p-in-games) | Repo-overzicht |
| [Specs index](./superpowers/specs/README.md) | Actueel vs historisch |
