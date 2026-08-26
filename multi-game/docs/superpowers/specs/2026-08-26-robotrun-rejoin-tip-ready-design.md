# RobotRun rejoin + tip-ready check — design

Datum: 2026-08-26  
Status: **geïmplementeerd** (code) / plan uitgevoerd  
Scope: joiner leave/rejoin, countdown-UI, dunne tip-ack bij race-start  
Bouwt op: [tip-CHECKPOINT sync](./2026-08-26-robotrun-tip-checkpoint-sync-design.md), [local Play + host truth](./2026-08-26-robotrun-local-play-host-truth-design.md)

---

## 0. Waarom lokale Play sync moeilijker maakte

### Wat er misging met “alles via snapshot”

Tijdens `executing` verandert de engine **tientallen keren per seconde** (registers, lasers, conveyors). Elke micro-step als volledige snapshot over P2P:

- was **zwaar** (grote payloads, jank);
- was **fragiel** op incremental LOG (één gemist pakket → gap → freeze);
- gaf alsnog geen mooie animatie (late/out-of-order snaps).

### Wat lokale Play oplost

Elke client animeert Play **lokaal** vanaf één start-tip (registers + `rngSeed`). Host stuurt aan het **eind** de canonieke stand. Gevoel: soepel. Bandbreedte: laag.

### Wat daardoor lastiger werd

| Gevolg | Waarom |
|--------|--------|
| **Twee klokken** | Host én joiner hebben een Play-timer; alleen host mag afronden (`allowFinalize: false` bij gast) |
| **Geen mid-Play waarheid** | Heartbeat mag geen live mid-step exporteren (zou animatie resetten) → frozen **start-tip** |
| **Rejoin mid-Play** | Joiner krijgt opnieuw de start-tip → animatie vanaf begin (geen frame-resume) |
| **“Wachten op host…”** | Gast klaar met lokale animatie vóór host-eind-tip → bewust wachten |
| **Extra kritieke overgang** | Play-start tip is een single point: missen = vast op `ready` tot heal |

**Conclusie:** lokale Play was nodig voor speelbaarheid; tip-CHECKPOINT + frozen heartbeat + watchdog maken het robuust. Wat nog ontbreekt is vooral **rejoin/boot zonder stale UI** — niet opnieuw micro-snapshots.

---

## 1. Probleem (nu)

1. **Joiner leave → rejoin** tijdens countdown: UI toont soms opnieuw de volle countdown (fallback naar `MATCH_COUNTDOWN_SECONDS` als `endsAt` ontbreekt), terwijl de host-deadline gewoon doorloopt.
2. Rejoin boot via **desk SESSION_INIT-log** (vaak stale; live snaps wriren niet naar LOG) vóór de eerste live tip.
3. Race-start mist nog een **dunne “heb tip X”-check** (niet strikt nodig door heartbeat, wel rustiger voor UX).

---

## 2. Doel (magere scope)

| In | Out |
|----|-----|
| Joiner rejoin: meteen `RESYNC`, stale desk niet als live countdown/Play-waarheid | Continu ping/RTT |
| Countdown-UI: nooit volle 10 tonen zonder `endsAt` → “Synchroniseren…” | Play-barrière elke ronde |
| Optioneel: `rr_tip_ack` na adopt van race-start tip; host korte “wacht op sync” (max ~3s) | Mid-Play frame-resume |
| Docs: waarom lokale Play + deze fix | Intent-ACK overal |

Succes: joiner verlaat tijdens countdown en komt terug → ziet **resterende** seconden (of “Synchroniseren…” tot tip), nooit een verse 10-teller terwijl de race al bezig is.

---

## 3. Gedrag

### 3.1 Joiner boot / rejoin

```
iframe READY → SESSION_INIT (desk log, best-effort seats only)
  → guest: requestLogResync() onmiddellijk
  → host: rebroadcastLastTruth (of publishSnapshot)
  → guest: adoptTruthCheckpoint → UI
```

Regels:

- Zolang geen tip met geldige speel-state: **geen** countdown-cijfer, geen Play alsof je synchroon bent.
- Desk-log mag seats/boot helpen; **live phase/timers** komen alleen uit tip-CHECKPOINT.

### 3.2 Countdown-UI

```text
phase === match_countdown && endsAt == null  →  "Synchroniseren…"
phase === match_countdown && endsAt set       →  ceil((endsAt - now) / 1000)
nooit: fallback naar MATCH_COUNTDOWN_SECONDS als weergave van “tijd over”
```

Host blijft enige die `maybeFinishMatchCountdown` triggert op basis van **host**-`endsAt`.

### 3.3 Tip-ack (dun, race-start)

- Gast na adopt van tip terwijl `phase === match_ready` (of eerste tip na boot): stuur `rr_tip_ack { tipSeq, tipEventId, userId }`.
- Host markeert seat synced voor die tip.
- UI (optioneel, host of allen): “Spelers laden…” tot alle human seats ACK’t hebben **of** timeout 3s → door (geen permanente hang).
- Geen ack-vereiste voor Play / programming (heartbeat + watchdog blijven genoeg).

### 3.4 Play rejoin (expliciet non-goal voor v1)

Mid-Play rejoin mag opnieuw vanaf start-tip animeren. Documenteer als known limitation. Latere verbetering (optioneel): `execStep` in tip — **niet** in deze scope.

---

## 4. Wire

| Richting | Type | Payload |
|----------|------|---------|
| Guest → host | `rr_tip_ack` (via bestaande intent-relay) | `{ tipSeq, tipEventId, userId }` |
| Guest → host | `SyncMsg.RESYNC` (bestaand) | `{ haveTipSeq, haveTipEventId }` |
| Host → guest | `CHECKPOINT` (bestaand) | frozen last truth |

Seat-bind: zelfde `RobotRunIntentBind` / `peerToPlayer` als andere intents.

---

## 5. Codekaart

| Stuk | Pad |
|------|-----|
| Guest boot RESYNC + tip_ack na adopt | `robotrun/js/room-embedded.js` |
| Host handle `rr_tip_ack`, synced set | `robotrun/js/p2p-session.js` / room-embedded handleTransport |
| Countdown UI zonder valse 10 | `robotrun/js/robotrally-ui.js` |
| Specs index / tip-CHECKPOINT link | `docs/superpowers/specs/…` |

---

## 6. Testchecklist

1. Joiner leave tijdens countdown (bijv. 6s over) → rejoin → binnen ≤3s resterende ~tijd (niet opnieuw 10).  
2. Joiner leave vóór eerste tip → “Synchroniseren…” / start-upgrade na tip, geen valse countdown.  
3. Normale race zonder leave: ongewijzigd gevoel; tip-ack timeout mag niet merkbaar vertragen (>3s nooit blokkeren).  
4. Play rejoin: mag opnieuw animeren; na host-eind weer programming met hand.  
5. Host blijft enige die countdown→programming triggert.

---

## 7. Relatie tot eerdere keuzes

Lokale Play blijft. Deze spec **compenseert** de rejoin/boot-randen die lokale Play + tip-CHECKPOINT openlieten, zonder terug te gaan naar micro-snapshots.
