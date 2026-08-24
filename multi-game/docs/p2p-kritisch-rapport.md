# Kritisch rapport: P2P multiplayer D-Game

**Datum:** 2026-08-24  
**Soort:** audit / oordeel (niet marketing)  
**Codebasis:** `multi-game/`  
**Gerelateerd:** [p2p-multiplayer.md](./p2p-multiplayer.md) (hoe het werkt) · [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) (hoe je moet bouwen)

---

## Samenvatting (oordeel)

Het systeem is **bruikbaar voor casual vriendenspellen**, niet **waterdicht**.

Er is een gedeelde Room API en een event-log-bibliotheek, maar **host-authority is een afspraak per spel**, geen afgedwongen protocol. Drie spellen (tic-tac-toe, ganzenbord, RobotRun) hebben **drie dialecten**. Bugs komen vooral door:

1. gaten in authorisatie (wie mag wat sturen),
2. duale timers,
3. “send gelukt ≠ zet geaccepteerd”,
4. sync die bij gap/fork stil faalt of de verkeerde kant kiest,
5. copy-paste van het ene spel naar het andere.

**Conclusie:** documentatie alleen maakt het niet waterdicht. Zolang regels niet in één gedeelde host-reducer + intent-validatie zitten, blijft elk nieuw spel dezelfde klassen bugs herintroduceren.

---

## Wat wél sterk is

| Sterkte | Waarom het telt |
|---------|-----------------|
| Ster-topologie, één host | Eenvoudig te redeneren; past bij static site zonder server |
| Room API i.p.v. ruwe PeerJS in UI | Spellen delen connectie/status |
| Append-only log + replay (TTT/GB) | Deterministische geschiedenis als payloads RNG bevatten |
| Stabiele `playerId` | Host-wissel kan stoelen behouden |
| STATE naast LOG | Praktische backup als merge hapert — **zie fundamenten-doc: dit is een zwakte, geen feature** |
| Gast auto-reconnect (TTT/GB) | Mobiele flaps worden deels opgevangen |
| Desk-persist per roomcode | Late host-resume mogelijk |

Deze bouwstenen zijn een **goede basis**, geen afgerond systeem.

---

## Ernstige bevindingen

### 1. Kritiek — Tic-tac-toe: host accepteert gast-`LOG`

In `tic-tac-toe/engine.js` wordt `GameMsg.LOG` **zonder host-check** geadopteerd. Ganzenbord weigert LOG op de host wél.

**Gevolg:** een gast die de keten-tip kent (die krijgt hij bij elke broadcast) kan events **aanplakken** en de host laten mergen. Host-authority is dan theatre: bord, seats, restart zijn forgebaar.

**Eis waterdicht:** host negeert altijd peer-`LOG`/`STATE`; alleen intents in, alleen host appendt.

---

### 2. Kritiek — Geen binding peer ↔ stoel op intents

| Spel | Wat er wordt gecheckt | Wat ontbreekt |
|------|----------------------|---------------|
| Ganzenbord `ROLL` | `playerId === huidige beurt` | `fromPeerId` moet die `playerId` bezitten |
| RobotRun commit/upgrade | “niet host zelf” | `userId`/`robotId` niet gebonden aan verbinding |
| Tic-tac-toe `MOVE` | mark ≠ host-mark, beurt | Geen peer-map (1v1 verbergt het probleem) |

`peerToPlayer` bestaat in ganzenbord/RobotRun maar wordt op acties **niet** afgedwongen.

**Gevolg (multi-guest):** elke gast kan de beurt/actie van een ander claimen door het juiste id in de payload te zetten.

---

### 3. Kritiek — Dubbele timers (by design)

TTT en ganzenbord: `canExpire` voor **host én** speler-aan-zet. Geen idempotency-key per beurt.

**Gevolg:** twee clocks → twee `TIMEOUT`-paden. Host past toe; tweede bericht kan de **volgende** beurt raken of race veroorzaken. Erger met background-tabs + `nudgeTurnTimer`.

**Eis:** één timer-eigenaar (bij voorkeur alleen host), of harde “deze turnKey is al opgelost”.

---

### 4. Hoog — `isConnected()` liegt bij multi-host

Voor `maxGuests > 1` telt status `hosting|connected` als connected, **ook zonder open datachannels**. UI en aannames (“we zijn live”) kloppen dan niet.

---

### 5. Hoog — Event-log sync is breekbaar en duur

- Elke broadcast stuurt vaak de **hele keten** (`fromSeq = 0`).
- Gap → hard fail, **geen** “stuur vanaf seq N”.
- Fork → `mergeLogs` houdt stil **preferred (lokaal)** — gast kan “winnen” van host-waarheid in edge cases; host die gast-LOG accepteert (TTT) is erger.
- Event-ids zijn `Date.now` + `Math.random`, geen cryptografische uniekheid.

---

### 6. Hoog — Stoel-/mark-races

- TTT `#claimSeat` kan via fallback `order[0]` een bezette mark overschrijven.
- Naam-match + `localStorage` mark-hints bij reconnect → X/O-wissel mogelijk.
- RobotRun: client kiest `userId` in seat-payloads.

---

### 7. Hoog — Live state ≠ log ≠ disk

STATE-snapshot als UI-fix terwijl LOG-merge faalt → bord klopt, replay later niet. Desk-log heeft meerdere writers (tabs). RobotRun: live = snapshots, desk-log = best-effort — resume mid-race is zwakker.

---

### 8. Medium — Geen ACK / stille drops

Gast `tryMove`/`tryRoll` geeft vaak `{ ok: true }` na `send()`. Host `break` bij invalid → gast denkt dat de zet landde. Weinig reject-kanalen (ganzenbord heeft `REJECT` voor join; zetten vaak stil).

---

### 9. Medium — Reconnect is herbouw, geen sessie

Elke reconnect = destroy + join/hostWithCode. Geen resume-token. HELLO/seat-races bij elke flap. RobotRun auto-reconnect zwakker dan TTT/GB.

---

## Waar bugs het snelst komen (hotspots)

| Hotspot | Typische bug | Waarom |
|---------|--------------|--------|
| Nieuw spel “kopieer TTT” | Host accepteert LOG; seats zwak | TTT 1v1 verbergt multi-player spoof |
| Nieuw spel “kopieer GB room” | Timer dual-fire; ROLL zonder peer-bind | Patterns zien er “af” uit |
| Timer + mobiel | Dubbele timeout, vast bord | Twee clocks + visibility |
| Einde partij / win | Gast vast, kan niet opnieuw | `connected` gate + gemiste LOG |
| Host-wissel | `unavailable-id` / lege log | PeerJS-id = room; disk stale |
| RNG in `apply*` i.p.v. payload | Desync bij replay | Classic determinism-bug |
| Alleen STATE syncen | Geen echte geschiedenis | RobotRun-pad vs log-pad door elkaar |
| “Optimistic UI” zonder ACK | Speler denkt gezet, host niet | send ≠ commit |
| Naam als identity | Stoeldiefstal | `playerId` vergeten |
| Full-log broadcast | Lag / drop late game | Payload groeit O(n) |

---

## Drie dialecten = structureel risico

| | Tic-tac-toe | Ganzenbord | RobotRun |
|--|-------------|------------|----------|
| Waarheid | Log + STATE | Log + STATE | Snapshots (+ lichte desk-log) |
| Host negeert peer-LOG | **Nee** | Ja | N/A |
| peer→stoel op actie | Nee | Map bestaat, ongebruikt | Map bestaat, ongebruikt |
| Timer | Dual, random zet | Dual, skip | Geen beurt-timer |
| Reject op intent | Deels STATE re-push | Join REJECT; roll stil | Stil |

Zolang er **geen shared `HostRoom` / intent-pipeline** is, blijft documentatie een checklist die mensen overslaan.

---

## Is “waterdicht multiplayer” haalbaar hier?

### Realistische definitie (sandbox / static / PeerJS)

Waterdicht **genoeg** betekent:

1. Host is enige writer van canonieke state/log (afgedwongen in code).
2. Elke gast-intent is gebonden aan de DataConnection die de stoel claimde.
3. Elke intent krijgt ACK of REJECT.
4. Timers: één eigenaar + idempotent per beurt.
5. Sync: incrementeel + expliciete resync; fork-policy = host wint, gast reset.
6. `isConnected` = echte open channels.
7. Zelfde pipeline voor elk spel (alleen rules/reducer verschillen).

### Wat dit stack **niet** hoeft te zijn

- Anti-cheat tegen gemodificeerde clients die **host** zijn (host is god — inherent aan P2P zonder server).
- End-to-end encryptie / accounts.
- 100% uptime als niemand de room host.

**Eerlijk:** tegen een meewerkende host en niet-kwaadaardige vrienden is het OK. Tegen een nieuwsgierige gast of racey timers is het **niet** waterdicht. De kritieke fixes (LOG-guard, peer-bind, timer-idempotency, ACK) zijn **klein in code, groot in correctheid** — daarna pas “gedeelde host-kernel” voor schaal.

---

## Prioriteit als je wél waterdicht wilt

| Prio | Actie | Effect |
|------|-------|--------|
| P0 | TTT: host negeert `LOG`/`STATE` van peers | Sluit forge-gat |
| P0 | Overal: `fromPeerId → seat` vóór intent-apply | Stopt stoel-spoof |
| P0 | Timeout idempotent per turnKey; bij voorkeur host-only clock | Stopt dual-fire |
| P1 | Intent ACK/REJECT verplicht | Geen stille UI-leugens |
| P1 | Incrementele LOG + `resync`-request | Minder lag, gap-herstel |
| P1 | Fork-policy: host canonical, gast hard reset | Geen stille preferred |
| P2 | Shared `AuthoritativeRoom` module | Voorkomt dialect-drift |
| P2 | `isConnected` + admission fencing | Eerlijke lobby/status |
| P3 | RobotRun op zelfde intent+ACK model | Minder snapshot-only uitzonderingen |

Zonder P0 is “goede documentatie” cosmetisch: de code spreekt die regels tegen.

---

## Documentatiestructuur (nu)

| Doc | Rol |
|-----|-----|
| [p2p-multiplayer.md](./p2p-multiplayer.md) | Beschrijvend: hoe het **nu** werkt |
| [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) | Normatief: wat je **moet** doen bij een nieuw spel |
| **Dit rapport** | Kritisch: wat kapot/zwak is en waarom “waterdicht” nog niet klopt |

Oude specs onder `superpowers/specs/` zijn deels historisch; bij conflict wint **code** + deze drie docs.
