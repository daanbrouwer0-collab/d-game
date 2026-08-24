# P2P multiplayer — hoe D-Game werkt

**Status:** levend referentiedocument (code = waarheid)  
**Laatst bijgewerkt:** 2026-08-24  
**Scope:** `multi-game/` — PeerJS-rooms, event-log, beurten, reconnect, per spel

**Documentatieset P2P:**

| Doc | Rol |
|-----|-----|
| **Dit bestand** | Beschrijvend: hoe het nu werkt |
| [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) | Normatief: regels voor nieuwe spellen |
| [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md) | Kritisch: gaten, bug-hotspots |
| [p2p-fundamenten.md](./p2p-fundamenten.md) | Fundamenten: rangschikking, overbodigheid, echte keuzes (geen fallbacks) |

Dit document beschrijft het **huidige** systeem zoals het in de code staat — niet een toekomstplan.  
Oudere ontwerpnotities (o.a. “eigen room per speler / gossip”) staan in `docs/superpowers/specs/` en wijken soms af van de implementatie.

---

## 1. Kernidee in één alinea

Elk spel praat met PeerJS via een gedeelde **Room API** (`createRoom`). Topologie is een **ster**: één **host-tab** is de autoriteit. Gasten sturen **intenties** (zet, worp, timeout); de host **valideert**, schrijft een **append-only event-log**, en stuurt **LOG + STATE** terug. State op elk apparaat is de **replay** van die log (plus snapshot als backup). Stoelen hangen aan een stabiele **`playerId` in localStorage**, niet aan “wie nu host is”.

```
  [Gast A] ──intent──► [HOST] ──LOG + STATE──► [Gast A]
  [Gast B] ──intent──►   │    ──LOG + STATE──► [Gast B]
                         │
                    event-log (desk/localStorage)
                    replay → game state
```

---

## 2. Lagen (bestandskaart)

| Laag | Pad | Rol |
|------|-----|-----|
| Factory | `js/core/room.js` | `createRoom({ gameId, transport, maxGuests })` |
| P2P facade | `js/transport/p2p.js` | Wrap rond `Session` |
| Session | `js/p2p/session.js` | hello/welcome, ping, send/broadcast |
| Net | `js/p2p/net.js` | PeerJS Peer + DataConnection, roomcode = peer-id |
| Protocol | `js/p2p/protocol.js` | Envelope `{ type, seq, payload, ts }` |
| Event-log | `js/sync/event-log.js` | `appendEvent`, `encodeSyncPacket`, `mergeLogs` |
| Desk | `js/core/desk.js` | Persist log per `p2p:gameId:CODE` |
| Identity | `js/core/storage.js` | `getPlayerId()`, display name |
| URLs | `js/shell/site-url.js`, `p2p-invite.js` | `?room=`, `?as=host`, hash-shell |

Transportvarianten: `local` (hotseat), `p2p`, `qr` (log via QR), `matrix` (stub, gooit).

---

## 3. Connectie: statussen en situaties

### Statussen

`idle` → `connecting` → `hosting` (host alleen) of `connected` → `disconnected` / `error`

| Situatie | Wat er gebeurt |
|----------|----------------|
| Host start room | PeerJS peer-id = kamercode (6 chars). Status `hosting` tot 1e gast (1v1) of blijft `hosting` bij multi-lobby. |
| Gast joint | Random peer → `connect(roomCode, { reliable: true })` → `connected`. |
| Gast data-channel dicht | **1,2s debounce** (mobiel flap) → daarna pas `disconnected`. |
| PeerJS-signaling weg, data nog open | Stil `peer.reconnect()`; spel blijft “connected”. |
| Keepalive (elke 5s) | `ping`/`pong`. Gast: mislukte `send(PING)` → `markDisconnected`. |
| Lobby vol | Host stuurt `room_full`, sluit verbinding. |
| Verkeerd `gameId` in hello/welcome | `onGameMismatch` — bericht niet doorgestuurd naar het spel. |
| Soft reconnect | Zelfde rol: host `hostWithCode(code)`, gast `join(code)`. |
| Host-wissel | Andere tab opent `?room=CODE&as=host` → `hostWithCode`. Als PeerJS `unavailable-id`: iemand host nog — geen nieuwe code minten. |

### Handshake (na data-open)

1. **Gast** → `hello` `{ version, gameId, playerId, name, log?, … }`
2. **Host** merget eventueel gast-log, claimt/bevestigt stoelen, stuurt **welcome** `{ youAre, log, state, seats, … }`
3. Verder: game-berichten of `LOG` / `STATE`

---

## 4. Data-overdracht

### Envelope

Elk bericht: `{ type, seq, payload, ts }` (`createMessage` / `parseMessage`).

### Twee sync-modellen

| Model | Waarheid | Gebruik |
|-------|----------|---------|
| **Event-log + replay** | Append-only keten (`id`, `prevId`, `seq`, `type`, `payload`) | Tic-tac-toe, ganzenbord |
| **Snapshots + intents** | Volledige game-state van de host | RobotRun (live); desk-log lichter voor resume |

**Log-spellen** sturen na elke host-commit:

1. `LOG` — sync packet (incrementeel of full bij welcome/resync)
2. Optioneel bij welcome: **checkpoint** `{ tipSeq, tipEventId, state }` — alleen geldig als tip klopt

Gast: `adoptHostPacket` / `replaceFromHostPacket` → `replay(log)`.  
Onbewezen STATE wordt **niet** meer als waarheid gebruikt. Bij gap: `resync`.

### Event-keten regels (`event-log.js`)

- Volgende event: `seq === last.seq + 1` en `prevId === last.id`
- Gap → apply faalt (`Gap in keten…`)
- Fork → `mergeLogs` houdt de **preferred** (lokale) keten als beide niet veilig te mergen zijn
- Duplicate `id` → skip

RNG (dobbelsteen, geblokkeerde vakjes, timeout-cel) hoort in het **payload van het host-event**, nooit opnieuw lokaal gerandomiseerd bij replay.

### Persistatie

| Key | Inhoud |
|-----|--------|
| `dgame.playerId` | Stabiele speler-id |
| `dgame.eventLogs` → `p2p:gameId:CODE` | Room-log |
| `dgame.rooms.recent` | Lobby-kaarten (desk) |
| `dgame.ttt.mark.CODE` | Laatste X/O voor die room |

---

## 5. Beurten — gemeenschappelijk patroon

```
  Mag ik? ──► Gast: stuur intent          Host: valideer
                    │                           │
                    │                           ├─ nee → negeer / stuur STATE opnieuw
                    │                           └─ ja  → appendEvent → broadcast LOG+STATE
                    ▼
              UI volgt via onState / replay
```

| Regel | Betekenis |
|-------|-----------|
| Alleen de host **wijzigt** de canonieke log | Gasten muteren niet “stiekem” state als waarheid |
| Beurt = veld in state (`turn`, `turnIndex`) | Afgeleid uit de log |
| Timer (indien aanwezig) | Host **en/of** speler-aan-zet mag expire fireen; host past toe |
| Hotseat / `local` | Geen PeerJS; host-logica lokaal of directe state-mutatie |

---

## 6. Situatiecatalogus (alle spellen)

### A. Verbinding

| # | Situatie | Afhandeling |
|---|----------|-------------|
| A1 | Host maakt room | Code = PeerJS-id; QR/deellink; log leeg of uit desk geladen |
| A2 | Gast joint lege lobby | hello → seat claim → welcome |
| A3 | Gast joint mid-game (bekende id) | Stoel herstellen; full log/state in welcome |
| A4 | Gast joint mid-game (onbekende id) | **Ganzenbord/RobotRun:** REJECT. **TTT:** 2e stoel (1v1) of conflict |
| A5 | Lobby vol | `room_full` / REJECT |
| A6 | Korte disconnect (mobiel) | Debounce 1,2s; TTT/GB gast: auto-reconnect ≤6× |
| A7 | Host-tab dicht | Spel “dood” tot iemand `?as=host` met zelfde code + desk-log |
| A8 | Twee tabs hosten zelfde code | Tweede krijgt `unavailable-id` |
| A9 | Verkeerd spel in link | gameId-mismatch → foutmelding |
| A10 | Gast mist LOG na zet | STATE-snapshot herstelt bord; bij reconnect opnieuw welcome |

### B. Beurten & data

| # | Situatie | Afhandeling |
|---|----------|-------------|
| B1 | Speler doet geldige zet/worp | Host append + broadcast |
| B2 | Speler zet terwijl niet aan de beurt | Host weigert; TTT stuurt STATE/LOG terug |
| B3 | Timer loopt af | Zie per spel (C/D) |
| B4 | Dubbele timer (host + speler) | Host serialiseert op huidige beurt; 2e timeout is no-op |
| B5 | Host speelt door terwijl gast offline | TTT: host mag blijven zetten/opnieuw; gast synct bij reconnect |
| B6 | Stale intent na einde partij | Host negeert / pusht waarheid |

### C. Tic-tac-toe (`tic-tac-toe/`)

**Model:** 4×4, 3 geblokkeerde vakjes per partij, 3 op rij/kolom (geen diagonaal), 1v1.

| Event | Payload | Wie schrijft |
|-------|---------|--------------|
| `seat` | `{ mark, playerId, name }` | Host |
| `restart` | `{ blocked: [i,j,k] }` | Host (ook eerste board-setup) |
| `move` | `{ index, mark }` | Host |
| `timeout` | `{ index, mark }` | Host (random vrij vakje) |

| Situatie | Afhandeling |
|----------|-------------|
| Beurt | Alleen `state.turn` (X of O) |
| Timer 20s | Alleen P2P (niet hotseat). Expire → **random lege zet**, geen skip |
| Gast klikt | `MOVE` → host `applyMove` |
| Opnieuw | Nieuw `restart` + nieuwe blocked |
| Win/draw | `status` in state; restart host of via gast-request |
| Hotseat | Lokale `pickBlocked`, geen timer, geen log-persist |

### D. Ganzenbord (`ganzenbord/`)

**Model:** tot 6 spelers, zigzag-bord, host dobbelt.

| Event | Payload | Wie schrijft |
|-------|---------|--------------|
| `seat` | `{ playerId, name, colors }` | Host |
| `start` | — | Host (lobby/finished → playing) |
| `roll` | `{ playerId, value }` | Host (waarde lokaal gerold) |
| `timeout` | `{ playerId }` | Host → **beurt overslaan** |
| `to_lobby` | — | Host |

| Situatie | Afhandeling |
|----------|-------------|
| Beurt | `players[turnIndex]` |
| Timer 20s | Host of speler-aan-zet (of local); expire → skip, geen worp |
| Gast gooit | `ROLL` → host `rollDice` + append |
| Peer leave | Stoel blijft; `onlineIds` markeert offline |
| Rematch | Host `start` opnieuw; `championId` = vorige winnaar (kroon) |
| Terug lobby | `to_lobby`; seats + champion bewaard |
| Late join mid-game | Alleen bekende `playerId` |

### E. RobotRun (`robotrun/`)

**Model:** snapshot-first; geen klassieke beurt-timer.

| Live bericht | Richting | Rol |
|--------------|----------|-----|
| `rr_lobby` / seat intents | host ↔ gast | Lobby |
| `rr_game_start` | host → allen | Board + startstate |
| `rr_state_snapshot` | host → allen | Volledige state |
| `rr_intent_commit` / `upgrade` | gast → host | Programma / upgrade |

| Situatie | Afhandeling |
|----------|-------------|
| “Beurt” | Gelijktijdig programmeren; host drukt alleen **Play** |
| Uitvoering | Alleen host simuleert; gasten volgen snapshots |
| Mid-race nieuwe speler | Afgewezen |
| Reconnect | Zwakker dan TTT/GB (resume active room / handmatig) |

---

## 7. Beurt- en dataflow (diagrammen)

### Tic-tac-toe — gast zet

```
Gast UI click
  → tryMove → send(MOVE, { index, mark })
Host
  → applyMove (turn/mark/cell checks)
  → append "move"
  → broadcast LOG + STATE
Gast
  → mergeLogs → replayTtt → render
```

### Ganzenbord — gast gooit

```
Gast UI
  → tryRoll → send(ROLL, { playerId })
Host
  → if current player: value = rollDice()
  → append "roll" { playerId, value }
  → broadcast LOG + STATE
Allen
  → replayGanzenbord → posities / beurt / win
```

### Timer (P2P)

```
UI syncTurnTimer(key = beurt+bord)
  → deadline wall-clock
  → onExpire: tryTimeout()
      Host: pas toe + append timeout/move
      Gast: stuur TIMEOUT-intent
```

---

## 8. Lokale hotseat vs P2P

| | `local` / hotseat | `p2p` |
|--|-------------------|-------|
| Netwerk | Nee | PeerJS |
| Authority | Zelfde codepad, geen broadcast | Host-tab |
| Persist log | Meestal niet | Desk `p2p:…` |
| Timer TTT | Uit | Aan (20s → random zet) |
| Timer GB | Aan (skip) | Aan (skip) |
| Seats | Synthetisch / lokaal | Via hello + seat-events |

---

## 9. Bekende zwaktes (bewust)

1. **Host is single point of failure** zolang niemand de room opnieuw host met dezelfde code + log.
2. **Volledige LOG** bij elke zet kan zwaar worden bij lange partijen (mitigatie: STATE-snapshot).
3. **RobotRun-reconnect** is minder gehardend dan TTT/ganzenbord.
4. **Matrix-transport** bestaat alleen als stub.
5. Spec `2026-08-24-p2p-event-log-rooms.md` beschrijft een **gossip / eigen-room-per-speler** model dat **niet** zo is geïmplementeerd — dit document is leidend voor “hoe het nu werkt”.

---

## 10. Gerelateerde docs

| Document | Rol |
|----------|-----|
| [README root — P2P kort](../../README.md#p2p-in-games) | Snelle intro + Netlify-router |
| [multi-game/README.md](../README.md) | Sandbox-tabs, starten |
| [2026-08-24-p2p-event-log-rooms.md](superpowers/specs/2026-08-24-p2p-event-log-rooms.md) | Historisch / toekomstverkenning (niet = productie) |
| [2026-08-24-ganzenbord-robotrun-p2p-stable-seats-design.md](superpowers/specs/2026-08-24-ganzenbord-robotrun-p2p-stable-seats-design.md) | Stoelen + host-wissel ontwerp |
| [2026-08-23-multi-game-p2p-static-design.md](superpowers/specs/2026-08-23-multi-game-p2p-static-design.md) | Vroege P2P static-site design |

---

## 11. Checklist voor een nieuw multiplayer-spel

1. `createRoom({ gameId, transport, maxGuests })` — geen ruwe PeerJS in UI.
2. Stabiele `playerId` voor seats; host-rol ≠ stoel.
3. Gast stuurt intents; host append events met **alle RNG in payload**.
4. Na host-actie: `LOG` + `STATE` broadcasten.
5. `replay(log)` moet deterministisch dezelfde state geven.
6. hello/welcome met `gameId` + log; mid-game join-beleid expliciet (reject of allow).
7. Gast auto-reconnect + host `?as=host` pad testen.
8. Timer: documenteer skip vs forced action; alleen host kiest random uitkomsten.
