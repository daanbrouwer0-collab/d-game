# Bouwregels: multiplayer-spel op D-Game

**Status:** normatief (moeten / niet doen)  
**Laatst bijgewerkt:** 2026-08-24  
**Lees ook:** [speler-handleiding.md](./speler-handleiding.md) · [p2p-multiplayer.md](./p2p-multiplayer.md) · [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md)

Dit zijn de regels voor een **correct** multiplayer-spel in deze sandbox.  
Waar de huidige code een regel schendt, is dat een **bekend defect** — kopieer die fout niet.

---

## 0. Mentale modellen (verplicht begrijpen)

1. **Host = enige schrijver** van canonieke waarheid (log of authoritative state).
2. **Gast = intenties sturen**, nooit “ik heb de nieuwe waarheid”.
3. **Stoel ≠ PeerJS-id ≠ host-rol.** Stoel = stabiele `playerId` (localStorage).
4. **Replay moet bit-gelijk** zijn op elke client als je een event-log gebruikt → alle random uitkomsten in het event-payload.
5. **`send()` succes ≠ zet geaccepteerd.** Zonder ACK is UI liegen.

Als je één van deze vijf niet volgt, krijg je desync, “vast” zitten, of cheatbare rooms.

---

## 1. Architectuurregels

### R1 — Geen ruwe PeerJS in spel-UI

Gebruik alleen `createRoom({ gameId, transport, maxGuests })` en de Room API (`send` / `broadcast` / `sendHello` / `sendWelcome` / status-callbacks).

### R2 — Eén `gameId` per spel, check in handshake

`hello` / `welcome` moeten `gameId` dragen. Mismatch → stoppen (`onGameMismatch`), geen gemengde state.

### R3 — Kies één sync-model en blijf erbij

| Model | Wanneer | Eis |
|-------|---------|-----|
| **A. Event-log + replay** | Beurten, dobbel, kleine state (TTT, GB) | Host appendt; gasten replayen; STATE alleen als cache |
| **B. Snapshot + intents** | Zware state (RobotRun-achtig) | Host is enige snapshot-bron; gasten sturen intents; desk-log optioneel voor resume |

**Verboden:** half log, half “gast stuurt volledige state die host overneemt”.

### R4 — Host negeert peer-`LOG` en peer-`STATE`

```text
if (role === "host" && (type === LOG || type === STATE)) ignore;
```

Alleen gasten mergen host-LOG / passen host-STATE toe.  
*(Huidige TTT schendt dit voor LOG — niet kopiëren.)*

### R5 — Gedeelde transport-envelope, game-types namespaced

Envelope: `{ type, seq, payload, ts }`.  
Game-types: kort en duidelijk (`move`, `roll`, `timeout`, …) of geprefixed (`rr_intent_commit`).

### R6 — Room shell vs session log

- **Room log** (`__room__`): leden, sessie-start/stop — nooit game-events.
- **Session log** (per spel-id): bestaande replay-keten — nooit `room.*` events.
- Embedded spellen (`?embedded=1`): **geen eigen P2P** — alleen bridge naar `room/`.
- Spelersflow: [speler-handleiding.md](./speler-handleiding.md).

### R6b — Embedded games standard

- Catalog: `embedded: { syncProfile, roomReady, entry }` — zie [embedded-games-standard-design.md](./superpowers/specs/2026-08-24-embedded-games-standard-design.md).
- Entry: `{game}/embedded.js` via `runEmbeddedGame(adapter)` uit `js/bridge/embedded-bootstrap.js`.
- `roomReady: false` → niet startbaar in room (stemkaart disabled).
- Profiel `event-log` → `SyncMsg.LOG` / `INTENT`; profiel `snapshot` → host snapshots + intents.
- Einde: `notifySessionEnded()` — room keert terug naar stemmen.

---

## 2. Identity & stoelen

### R7 — Claim seats via host, met `playerId`

- Gast stuurt in hello: `playerId`, `name`, optioneel cosmetics.
- Host wijst of herkent stoel; stuurt `youAre` (of seat-id) in welcome.
- **Nooit** een bezette stoel overschrijven met “fallback eerste vrije mark”.

### R8 — Bind verbinding → stoel

Houd `peerId → playerId` bij join.  
Bij elke intent:

```text
seat = peerToPlayer[fromPeerId]
assert payload.actorId === seat
assert seat mag deze actie nu
```

Zonder R8 is multi-player spoofbaar.

### R9 — Mid-game join beleid expliciet

Kies en documenteer in het spel:

- **A:** alleen bekende seats (ganzenbord-achtig), of  
- **B:** geen late joins, of  
- **C:** spectator.

Implementeer met `REJECT` + reden, niet stil `return`.

### R10 — Peer leave ≠ seat wissen

Markeer offline; houd stoel voor reconnect op zelfde `playerId`.

---

## 3. Beurten & acties

### R11 — Gast stuurt intent, host past rules toe

```text
Gast:  { type: "roll", playerId }     // geen dobbelsteen-waarde
Host:  value = rng(); append { type:"roll", playerId, value }; broadcast
```

### R12 — Alle RNG in het host-event-payload

Blocked cells, dobbel, timeout-cel, shuffle — alles in de log/snapshot van de host.  
Replay/clients **nooit** opnieuw `Math.random()` voor dezelfde gebeurtenis.

### R13 — Valideer beurt op de host alsof de gast liegt

Checks minimaal: fase, beurt, actor, cel/actie legaal, niet al beeindigd.  
Bij fail: **REJECT of STATE/LOG opnieuw**, geen stille drop zonder feedback.

### R14 — Timers: één eigenaar + idempotent

**Aanbevolen:** alleen de host laat de beurt-timer expireren.  
Als gast ook mag “nudgen”: host behandelt timeout met `turnKey`; tweede request = no-op + ACK.

Documenteer per spel wat timeout doet: **skip** vs **forced action**.

### R15 — Host mag door als gast offline is (optioneel)

Als je dat toelaat: host blijft zetten; gast synct bij reconnect.  
UI mag niet alle host-acties disablen alleen omdat `isConnected()` false is (1v1 flap).

---

## 4. Sync & persistatie

### R16 — Na elke commit: broadcast waarheid

Log-model: `LOG` (packet) + bij voorkeur `STATE` (snapshot backup).  
Snapshot-model: nieuwe snapshot na elke geaccepteerde intent / fasewissel.

### R17 — Incrementeel syncen (doel), full dump alleen bij welcome/resync

Ideaal: `encodeSyncPacket(log, peerTipSeq)`.  
Gap → host stuurt resync vanaf 0 of vanaf tip.  
*(Huidige code dump’t vaak alles — bij lange games plannen op resync.)*

### R18 — Fork-policy: host wint

Bij conflict: host-log is canoniek; gast reset naar host-welcome.  
Niet stil `mergeLogs` preferred=local op de gast laten “winnen” zonder UI-resync.

### R19 — Persist alleen host-commit

`saveRoomLog` na succesvolle append op de host.  
Gast mag cachen voor snelle UI, maar reconnect vertrouwt host-welcome.

### R20 — Desk / `?as=host`

Host-wissel: zelfde roomcode + geladen log.  
Bij `unavailable-id`: niet stiekem nieuwe code maken.

---

## 5. UI / UX-regels (voorkomen “vast”-bugs)

### R21 — Toon duidelijk wiens beurt

Naam + mark/stoel + “jouw beurt” vs “wacht op …”. Visuele state op het bord.

### R22 — Optimistic UI alleen met pending + timeout

Of: wacht op LOG/STATE.  
Nooit `{ ok: true }` alleen omdat `send()` true terugbracht zonder host-bevestiging.

### R23 — Reconnect zichtbaar en automatisch (gasten)

Max N pogingen; knop blijft beschikbaar; fouttekst op het **spelscherm**, niet alleen lobby.

### R24 — Einde partij: restart-pad voor host zonder guest-link

Host moet opnieuw kunnen starten als de gast even weg is.

---

## 6. Checklist nieuw multiplayer-spel

Gebruik dit vóór je “klaar” zegt:

### Transport & handshake

- [ ] Embedded: `BridgeTransport` + geen PeerJS in spel; legacy: `createRoom` + `gameId`
- [ ] hello/welcome met playerId, name; legacy ook gameId
- [ ] welcome bevat log en/of state + seat mapping
- [ ] mid-game join: REJECT of allow — getest

### Authority

- [ ] Host negeert peer LOG/STATE
- [ ] Alleen intents van gasten
- [ ] `fromPeerId → playerId` op elke intent
- [ ] RNG alleen in host-payload

### Beurten

- [ ] Rules puur in `game.js` (of equivalent) zonder netwerk
- [ ] Replay/snapshot produceert dezelfde state
- [ ] Timer: één eigenaar of idempotent turnKey
- [ ] Timeout-gedrag gedocumenteerd (skip / force)

### Sync

- [ ] Broadcast na elke commit
- [ ] Gast past alleen host-waarheid toe
- [ ] Stale intent → REJECT of resync
- [ ] Desk-persist op host

### Failure tests (handmatig)

- [ ] Gast airplane mode mid-turn → reconnect → zelfde stoel
- [ ] Host tab refresh + `?as=host` → zelfde voortgang
- [ ] Twee timers / slow phone → geen dubbele zet
- [ ] Ongeldige zet gast → zichtbare fout, geen desync
- [ ] Win/draw → beide zien einde; host kan rematch

---

## 7. Anti-patterns (doe dit niet)

| Anti-pattern | Waarom het breekt |
|--------------|-------------------|
| Gast stuurt “nieuwe volledige state” die host overneemt | Forge / desync |
| `Math.random()` in `applyRoll` zonder value in event | Replay wijkt af |
| Stoel = “wie het laatst hello stuurde” | Diefstal |
| Kopiëren van TTT LOG-handler naar multi-guest spel | Authority-gat |
| Alle cellen `disabled` als `!isConnected()` ook voor host | Valse freeze |
| Timer op host én gast zonder turnKey | Dubbele timeout |
| Alleen testen happy path op wifi | Mobiel/P2P-falen missen |
| Drie sync-modellen in één spel | Ononderhoudelijk |
| Documentatie schrijven i.p.v. host-guards | Bugs blijven |

---

## 8. Minimale “waterdichte” host-pipeline (doelarchitectuur)

Elk spel zou idealiter hetzelfde skelet delen:

```text
onMessage(msg):
  if host:
    if msg is LOG|STATE from peer → drop
    if msg is INTENT:
      seat = bind(fromPeerId)
      if !seat or !allowed(seat, msg) → REJECT(reason)
      result = reducer(state, msg, rngOutputs)
      if !result.ok → REJECT(reason)
      appendEvent / commit
      persist
      broadcast(LOG|SNAPSHOT)
      ACK(intentId)
  if guest:
    if msg is LOG|SNAPSHOT from host → adopt
    if msg is ACK|REJECT → unlock UI
```

Rules (`reducer`) blijven per spel; **netwerkdiscipline is gedeeld**.

Zolang die pipeline niet in `js/` als module bestaat, is elk spel verantwoordelijk om R1–R24 zelf te handhaven — en faalt dat in de praktijk (zie kritisch rapport).

---

## 9. Wat “waterdicht” wél en niet belooft

**Wel (na P0/P1 uit het rapport):**

- Geen gast die andermans beurt speelt
- Geen gast die de host-log herschrijft
- Geen dubbele timeout-acties op één beurt
- Gast weet of intent geaccepteerd is
- Reconnect herstelt stoel + stand vanaf host

**Niet (inherent P2P zonder server):**

- Kwaadwillende **host** die liegt over de log
- Spel door als niemand de room host
- Bescherming tegen gemodificeerde clients die host zijn

Voor vriendenspellen op d-game.nl is dat acceptabel; beloof geen anti-cheat-server.
