# RobotRun room-playable (snapshot P2P) — design

Datum: 2026-08-25  
Status: approved for planning  
Context: `multi-game/robotrun` + room shell; inspiratie `D_games/D-robotrally`

---

## 1. Probleem & doel

**Probleem:** In de room opent RobotRun als zwart/leeg scherm. De engine en simultane P2P-logica bestaan grotendeels (port van D-robotrally), maar room-embedded start de app niet betrouwbaar. Waarschijnlijke boot-oorzaak: bij `?embedded=1` wordt `js/main.js` niet geladen, dus `window.RobotRallyApp` ontbreekt vóór `bootstrapRoomEmbedded`.

**Doel (v1):** 2–5 spelers in de room spelen één volledige race:

1. Bord + eigen hand zichtbaar (geen zwart scherm)
2. Iedereen programmeert tegelijk
3. Bevestigen → klaar-status zichtbaar
4. Als iedereen klaar is → host Play
5. Registers 1→5 uitvoeren → door tot winnaar → room krijgt `session_end`

**Keuze:** bestaande RoboRally-regels behouden; geen versimpelde ruleset. Focus = room boot + betrouwbare snapshot-ronde-flow.

**Buiten v1:**

- Hotseat-polish
- Reconnect / host-wissel mid-race
- Migratie naar event-log-only zoals tic-tac-toe / ganzenbord

---

## 2. Architectuur (boot + sync)

### Boot (fix zwart scherm)

Bij `?embedded=1` moet de volledige app geladen zijn vóór room-bootstrap:

1. Classic scripts (config, engine, UI, `p2p-session`, …) zoals in `index.html`
2. `RobotRallyApp.init({ embedded: true })` — geen standalone `SessionMenu`-flow
3. Daarna `bootstrapRoomEmbedded(ctx)`

Host start de race (board + seed + seats); gasten nemen de eerste snapshot / `start`-event over.

### Sync-model: snapshot (ongewijzigd catalog-profiel)

| Rol | Gedrag |
|-----|--------|
| Host | Canonieke engine-state; past intents toe; schrijft `start` / `snap` in session log; pusht LOG via bridge |
| Gast | Stuurt intents (`rr_intent_commit`, `rr_intent_upgrade`); adopteert host-LOG; mag geen canonieke state schrijven |
| Spectator | Alleen kijken; geen intents (bestaande embedded chrome) |

Tijdens `programming` / `ready` strippen gasten (en host-sanitize voor broadcast-view waar van toepassing) **andermans** `hand` en `registers` in de lokale weergave. Eigen hand blijft zichtbaar.

Bestaande touchpoints: `robotrun/js/room-embedded.js`, `robotrun/js/p2p-session.js`, `robotrun/js/embedded.js`, `robotrun/index.html`.

---

## 3. Ronde-flow (spelerervaring)

```
programming → ready → executing → (upgrade_choice?) → programming → … → finished
```

Dit wijkt bewust af van beurt-spellen (TTT / ganzenbord): **iedereen is tegelijk aan de beurt** tijdens programming; Play start pas als alle programmeerbare humans gecommit hebben.

| Fase | Wat de speler ziet | Actie |
|------|-------------------|--------|
| **programming** | Bord + eigen 5 registers + hand. Anderen: bezig/klaar-badge, geen kaarten | Kaarten leggen → **Bevestig** |
| **ready** | Overlay: iedereen klaar | Alleen **host** ziet/gebruikt **Play ▶** |
| **executing** | Bord animeert registers 1→5 (prioriteit per register) | Geen programmeren |
| **upgrade_choice** | Alleen de speler die mag kiezen (intent → host) | Upgrade kiezen |
| **finished** | Win-overlay → `SESSION_ENDED` naar room | Terug naar room picker |

**Behouden regels:**

- Geheime handen/registers tot Play (executie)
- Her-commit vóór Play mag (ready → programming unlock)
- Bots / shutdown skippen in “iedereen klaar”
- Host-only Play

**UI-eis na boot:** canvas met echt bord, programming-panel zichtbaar, Play alleen als `phase === 'ready'` én lokale rol = host.

---

## 4. Fouten, randen & documentatie

### Host-validatie

- Commit/upgrade alleen accepteren als `userId` / `robotId` bij de seat van die peer hoort
- Geen andermans registers zetten via intent
- Onbekende intents negeren (geen crash)

### Randen (v1)

- Minder dan 2 seats bij start → toast, geen race
- Snapshot zonder `boardData` / `gameState` → niet toepassen; host blijft bron
- Gast mid-programming: lokale register-selectie bewaren over inkomende snapshots (bestaand patroon in `applyGameSnapshot`)
- Tab-refresh mid-race: best-effort via session log; geen aparte reconnect-spec

### Docs na oplevering

- `multi-game/README.md` en `docs/p2p-multiplayer.md`: RobotRun room embedded = **Ja** (niet Stub), zodra speelbaar
- Catalog `roomReady: true` + `syncProfile: "snapshot"` blijft

### Handmatige testchecklist

1. Room 2 spelers → RobotRun → beide zien bord + eigen hand (geen zwart)
2. Beide bevestigen → host Play → moves lopen
3. 3+ spelers: klaar-tellers kloppen; gast ziet geen Play
4. Hand van ander blijft leeg tijdens programming
5. Finish → room krijgt session end

---

## 5. Aanpak (gekozen)

**Room boot repareren + bestaande snapshot-flow afmaken** — geen ruleset-snip, geen log-only migratie, geen tweede room-UI.

Succes = speelbare race van room-start tot `session_end` voor 2–5 spelers.
