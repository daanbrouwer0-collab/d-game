# Design: P2P log-only canon (keuze A)

Datum: 2026-08-24  
Status: geïmplementeerd op branch `feature/p2p-log-only-canon` (v1 TTT + ganzenbord)  
Context: D-Game beurtspellen (tic-tac-toe, ganzenbord); RobotRun buiten v1  
Gerelateerd: [p2p-fundamenten.md](../../p2p-fundamenten.md) · plan [../plans/2026-08-24-p2p-log-only-canon.md](../plans/2026-08-24-p2p-log-only-canon.md)

---

## Doel

Eén canonieke waarheid voor beurten en gamedata: de **host event-log**.  
State en beurt zijn altijd `replay(log)` (of een checkpoint die dezelfde tip bewijst).  
Geen tweede ongecontroleerde STATE-waarheid, geen dual-timer-commits, geen peer-LOG op de host.

---

## Non-goals (v1)

- RobotRun migreren naar log-canon
- Matrix / QR-herontwerp
- Anti-cheat tegen kwaadwillende host
- Gossip / eigen-room-per-speler (oude verkenning)

---

## Beslissingen (vast)

| Onderwerp | Keuze |
|-----------|--------|
| Canon | **A — log-only** + optionele checkpoints |
| Writer | Alleen host append’t |
| Gast | Intents + resync; past alleen host-LOG toe |
| Snapshot | Alleen checkpoint met `{ tipSeq, tipEventId, state }` |
| Timer | Host-only clock; idempotent per `turnKey` |
| Scope | Shared helper in `js/` + migratie TTT + ganzenbord |

---

## 1. Canon & commit-pipeline

```text
intent(intentId, kind, …)
  → host: bind peerId → playerId
  → validate (fase, beurt, actor, legaal)
  → appendEvent → tipSeq++
  → persist
  → ACK(intentId, tipSeq, tipEventId) + LOG since peer.tip
     of REJECT(intentId, reason)

Host eigen actie gebruikt hetzelfde append-pad (zonder remote intent).
```

**Invariant:** na tip `n` op elke peer:  
`state === replay(log[1..n])` en dezelfde afgeleide beurt.

Gast bij gap: `resync({ haveTipSeq })` — geen STATE-overwrite.

---

## 2. Berichtenprotocol

### Gast → host

| Type | Payload | Rol |
|------|---------|-----|
| `intent` | `{ intentId, kind, … }` | Voorstel (geen RNG-uitkomst) |
| `resync` | `{ haveTipSeq, haveTipEventId? }` | Vraag missing events / welcome-replace |

`kind` voorbeelden: `move`, `roll`, `timeout`, `restart`, `start`, `to_lobby` (spel-specifiek).

### Host → gast

| Type | Payload | Rol |
|------|---------|-----|
| `ack` | `{ intentId, tipSeq, tipEventId }` | Intent geaccepteerd |
| `reject` | `{ intentId?, reason }` | Geweigerd / unbound / illegal |
| `log` | `{ gameId, fromSeq, events[] }` | Incrementeel of full (welcome) |
| `checkpoint` | `{ tipSeq, tipEventId, state }` | Alleen welcome / resync / lange keten |

### Harde regels

1. Host negeert peer-`log`, peer-`checkpoint`, en legacy peer-`state`.
2. Gast past `log` toe iff aansluitend op lokale tip, anders `resync`.
3. Checkpoint alleen accepteren als tip overeenkomt met log-claim; anders droppen + resync.
4. Geen parallelle “STATE als waarheid”-broadcast na elke commit.

Transport-envelope (`type`, `seq`, `payload`, `ts`) blijft; game-orde = event-log `seq`, niet envelope-seq.

---

## 3. Stoelen, beurten, timer

### Stoelen

- Hello: `playerId`, `name`, cosmetics; host claimt/herstelt seat.
- Host map: `peerId → playerId` (bij open/close bijwerken).
- Intent: actor = gebonden seat; payload-actor moet matchen.
- Leave: seat blijft, markeer offline; mid-game unknown id → `reject`.

### Beurten

- Afgeleid uitsluitend uit `replay(log)` (`turn` / `turnIndex` / fase).
- Geen UI-beurt die voorloopt op tip zonder pending-intent + ACK.

### Timer

- Eén clock-eigenaar: **host**.
- Expire → max één commit per `turnKey` (bijv. `turnIndex + tipSeq` of bord-hash + beurt).
- Gast-nudge optioneel: host no-op als `turnKey` al opgelost.
- Semantiek per spel ongewijzigd in betekenis:
  - TTT: timeout-event met gekozen `index` + `mark` in payload
  - GB: timeout-event met `playerId` (skip)

---

## 4. Shared module (v1)

Nieuwe (of uitgebreide) helper onder `multi-game/js/`, bijv. `js/sync/host-commit.js` + tip-tracking:

Verantwoordelijkheden:

- `bindPeer(peerId, playerId)` / `unbindPeer`
- `acceptIntent({ fromPeerId, intent, apply })` → append + tip + ack payload
- `encodeLogSince(tipSeq)` / handle `resync`
- `assertHostIgnoresPeerTruth(type)`
- optioneel: `makeCheckpoint(state)`

Spelen blijven eigen `game.js` reducer + `log.js` replay; ze pluggen intents in deze pipeline i.p.v. DIY broadcast.

Bestaande `event-log.js`: behouden `appendEvent` / `encodeSyncPacket(fromSeq)` / strengere adopt op gast (replace-from-host, geen preferred-local fork-win).

---

## 5. Migratie per spel

### Tic-tac-toe

- Verwijder host-pad dat peer-`LOG` adopteert.
- Verwijder STATE-broadcast-als-waarheid; welcome mag checkpoint+log.
- `MOVE`/`TIMEOUT`/`RESTART` → `intent` + ACK; UI pending tot ACK/REJECT.
- Host-only timer; timeout idempotent.
- Peer-bind (1v1: nog steeds afdwingen).

### Ganzenbord

- Zelfde pipeline; `ROLL`/`TIMEOUT` intents gebonden aan `peerToPlayer`.
- STATE-broadcast weg; LOG incrementeel + resync.
- Host-only timer; bestaande skip-semantiek in timeout-event.
- Mid-game reject unknown blijft.

### RobotRun

- Geen migratie in v1. Documenteer als snapshot-canon (model B) tot apart traject.

---

## 6. Error / recovery (zonder fallback-waarheid)

| Situatie | Gedrag |
|----------|--------|
| Gap | Gast `resync`; host stuurt log sinds tip of full+checkpoint |
| Stale intent | `reject`; UI unlocked |
| Disconnect | Reconnect → hello → welcome tip; geen lokale “verzin state” |
| Fork | Host tip wint; gast **replace** log van host, geen merge-preferred-local |
| Timer dubbel | Tweede expire zelfde `turnKey` = no-op |

---

## 7. Testplan (acceptatie)

- [ ] Twee clients: na elke ACK dezelfde `tipSeq`, dezelfde beurt,zelfde bord/posities
- [ ] Gast stuurt LOG → host ongewijzigd
- [ ] Gast spoof andere `playerId` → reject
- [ ] Dual expire / nudge → precies één timeout-commit
- [ ] Kill guest mid-turn → reconnect →zelfde tip/stoel
- [ ] Host `?as=host` resume → zelfde log-tip
- [ ] Lange sessie: incremental sync (niet per se full dump elke zet)
- [ ] TTT timeout forced cell staat in event; replay identiek
- [ ] GB timeout skip; replay identiek
- [ ] Geen UI “ok” alleen op `send()` zonder ACK

---

## 8. Risico’s

| Risico | Mitigatie |
|--------|-----------|
| Breaking oude rooms in localStorage | Welcome full replace; oude STATE-messages negeren |
| Grotere refactors TTT/GB | Shared helper eerst; spel-voor-spel migreren |
| RobotRun inconsistent met docs | Expliciet “buiten v1” in README/fundamenten |

---

## 9. Implementatievolgorde (na goedkeuring van dit bestand)

1. `writing-plans` → concreet plan met taken
2. Shared tip/commit/resync helpers + event-log adopt-policy
3. Tic-tac-toe migratie
4. Ganzenbord migratie
5. Docs bijwerken (p2p-multiplayer = beschrijving na migratie)
6. Handmatige testchecklist hierboven

---

## Goedkeuring

Secties 1–3 mondeling akkoord (2026-08-24).  

**Review dit bestand** en geef aan of er wijzigingen nodig zijn vóór het implementatieplan.
