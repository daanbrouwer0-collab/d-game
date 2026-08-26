# RobotRun local Play + host truth — design

Datum: 2026-08-26  
Status: **geïmplementeerd**  
Scope: `multi-game/robotrun` P2P/room sync + embedded scroll  
Aanpak: **lokale Play-animatie; host eind-snapshot = waarheid**

---

## 1. Probleem

1. **PC-scroll:** muiswiel scrollt de room-playkaart niet (alleen touch-pan).
2. **Traag / schokkerig Play:** elke micro-step triggert een volle state-snapshot (~200 ms debounce) via `wireHostAutosnapshots`.
3. **Guests vast na Play:** geen betrouwbare transitie terug naar `programming` → geen nieuwe kaarten.

Live gelijktijdige micro-sync is niet nodig; wel een host-waarheid aan het eind van de ronde.

---

## 2. Sync-model (keuze vast)

| Fase | Netwerk |
|------|---------|
| Lobby / match ready / programming / ready / merge / upgrade intents | Ongewijzigd (host snapshot of intent) |
| **Play start** | Eén snapshot (of play-event) met board, registers, `rngSeed`, `phase: executing` |
| **Tijdens executing** | **Geen** micro-snapshots |
| **Ronde-einde** | Host alleen: `checkRoundEnd` → `startNewRound` / upgrade / finished → **één** snapshot = waarheid |
| Guests tijdens/na animatie | Lokale `advanceExecutionStep`; daarna host-snap overschrijft state (hand, HP, locks, phase) |

---

## 3. Wie runt de engine

- **Host:** runt Play-timer + `advanceExecutionStep`. Bij einde van register 5 / `checkRoundEnd`: zoals nu new round / upgrade / finished, daarna `publishSnapshot()`.
- **Guest:** bij ontvangst van executing-start: `importGameState`, start **eigen** Play-timer (`advanceExecutionStep`). Guest mag **niet** `startNewRound` / `checkRoundEnd` als authoritative afronden: als lokale animatie klaar is en phase nog `executing`, wacht op host-snap (idle / “wachten op host…”).
- Determinisme: zelfde registers + `rngSeed` in start-snap. Host-eind-snap blijft de canonieke stand (RNG-drift of animatieverschil wordt gecorrigeerd).

---

## 4. Autosnap wijziging

In `wireHostAutosnapshots` (en embedded equivalent):

- **Niet** schedulen als `phase === 'executing'`.
- Wél onmiddellijk/snapshot bij: leave executing → programming | upgrade_choice | finished | ready (indien relevant), en bestaande non-executing events.

Play-start: bestaande `sendPlay` → `startExecution` → `publishSnapshot` blijft (één keer).

---

## 5. UI

- Guest `syncExecutionTimer`: **wél** timer starten in `executing` (niet meer host-only block voor advance).
- Guest na lokale ronde-animatie klaar zonder phase-change: geen lokale `startNewRound`; stop timer; toon wachten tot host-snap.
- Host ongewijzigd voor afronden.

---

## 6. Scroll (PC)

In `bindEmbeddedParentScroll`: `wheel`-listener → `panel-playing.scrollTop += deltaY` (passive: false alleen als we preventDefault nodig hebben op board; anders passive true). Behoud touch-pan.

---

## 7. Buiten v1

- Late joiner mid-Play (wacht op volgende host-snap).
- Host-wissel mid-executing.
- Frame-perfecte animatiesync tussen devices.

---

## 8. Testchecklist

1. Room 2 devices: beide zien Play lokaal soepel; na ronde beide nieuwe handen.
2. Tijdens Play: geen storm van `snap` events in log (hooguit start + eind).
3. Guest blijft niet hangen in executing zonder kaarten.
4. PC: muiswiel over bord scrollt de room-kaart.
5. Upgrade-keuze na ronde: host-snap → juiste speler ziet keuze.
