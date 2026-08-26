# RobotRun local Play + host truth — design

Datum: 2026-08-26  
Status: **geïmplementeerd** (live wire: zie tip-CHECKPOINT spec)  
Scope: `multi-game/robotrun` P2P/room sync + embedded scroll  
Aanpak: **lokale Play-animatie; host eind-waarheid**

**Sync-kanaal update:** live host→guest is niet langer incremental snap-LOG.
Zie [2026-08-26-robotrun-tip-checkpoint-sync-design.md](./2026-08-26-robotrun-tip-checkpoint-sync-design.md).

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
| Lobby / match ready / programming / ready / merge / upgrade intents | Intent → host; host publiceert **tip-CHECKPOINT** |
| **Play start** | Eén (liefst dubbele) CHECKPOINT: board, registers, `rngSeed`, `phase: executing` |
| **Tijdens executing** | **Frozen** rebroadcast van start-tip (~1s); geen mid-step export |
| **Ronde-einde** | Host alleen: `checkRoundEnd` → new round / upgrade / finished → **CHECKPOINT** = waarheid |
| Guests tijdens/na animatie | Lokale `advanceExecutionStep`; daarna host-CHECKPOINT overschrijft state |

---

## 3. Wie runt de engine

- **Host:** runt Play-timer + `advanceExecutionStep`. Bij einde: `checkRoundEnd`, daarna `publishSnapshot` → tip-CHECKPOINT.
- **Guest:** bij executing-start: `importGameState`, start **eigen** Play-timer. Guest mag **niet** authoritative `startNewRound` / `checkRoundEnd`: klaar → “Wachten op host…” tot CHECKPOINT.
- Determinisme: zelfde registers + `rngSeed` in start-CHECKPOINT. Host-eind blijft canoniek.

---

## 4. Autosnap / heartbeat

- **Niet** mid-executing.
- Wél tip-CHECKPOINT heartbeat in match/ready/programming/upgrade_choice.
- Onmiddellijk CHECKPOINT bij leave executing → programming | upgrade_choice | finished.

Play-start: `sendPlay` → `startExecution` → `publishSnapshot` (+ herhaal-tip).

---

## 5. UI

- Guest `syncExecutionTimer`: timer in `executing` met `allowFinalize: false`.
- Guest na lokale animatie: geen lokale `startNewRound`; wacht op host-CHECKPOINT.
- Host ongewijzigd voor afronden.

---

## 6. Scroll (PC)

Room play: één native scroller in de game-iframe (`#screen-play`). Geen touch/wheel-forward naar parent (dat concurreerde met scroll).

---

## 7. Buiten v1

- Late joiner mid-Play (wacht op volgende host-CHECKPOINT).
- Host-wissel mid-executing.
- Frame-perfecte animatiesync tussen devices.
- Intent ACK/REJECT.

---

## 8. Testchecklist

1. Room 2 devices: beide zien Play lokaal soepel; na ronde beide nieuwe handen.
2. Tijdens Play: geen storm van desk-snaps; wel start (+ herhaal) + eind CHECKPOINT.
3. Guest blijft niet hangen in executing zonder kaarten.
4. PC: scroll binnen game-iframe werkt.
5. Upgrade-keuze na ronde: host-CHECKPOINT → juiste speler ziet keuze.

