# RobotRun room sync — tip-CHECKPOINT canon

Datum: 2026-08-26  
Status: **actueel (productie-richting)**  
Scope: `multi-game/robotrun` + `multi-game/room` bridge  
Vervangt als live-pad: incremental `SESSION_LOG` snap-merge voor gasten

---

## 1. Probleem (waarom het vastliep)

RobotRun stuurde host-waarheid als **grote snapshots in een incrementele event-log**.

Dat brak joiners structureel:

1. **Strict chain** (`applySyncPacket`) — één gemist `seq` → permanente gap.  
2. **Room shell** adopteerde LOG stil; bij gap werd het pakket **niet** naar de iframe doorgestuurd → geen herstelsignaal.  
3. **`_wireFromSeq`** schoof door na lokale `postMessage`, niet na peer-apply.  
4. **Resync/timers/fullWire** waren symptoombestrijding; het kanaal bleef merge-fragiel.

Gevolg in de praktijk: vast op start-upgrade, countdown op 0, of na Play zonder nieuwe kaarten.

---

## 2. Canon-model (keuze vast)

| Kanaal | Rol |
|--------|-----|
| **`SyncMsg.CHECKPOINT` / `RoomMsg.SESSION_CHECKPOINT`** | **Live host→guest waarheid.** Zelfstandig: `{ tipSeq, tipEventId, boardData, gameState }`. Gast past toe via `applyGameSnapshot`. Geen merge-keten nodig. |
| **Guest `rr_intent_*`** | Alleen host past toe (seat-bound). Geen ACK in v1; UI ziet resultaat via volgende CHECKPOINT. |
| **Embedded event-log (`start` / `snap`)** | Desk / boot / restore. **Niet** het live guest-kanaal (`wire: false`). |
| **`SESSION_LOG`** | Boot/catch-up / andere spellen. Voor RobotRun live play **niet** de bron van waarheid. |

```
Host engine mutate
    → publishSnapshot({ persist? })
        → (optioneel) append snap aan desk-log
        → pushTruthCheckpoint  →  bridge CHECKPOINT
            → room SESSION_CHECKPOINT broadcast
                → guest iframe adoptTruthCheckpoint
                    → applyGameSnapshot (+ sanitize foreign hands)
```

Stale checkpoints: gast negeert `tipSeq < _truthTipSeq`.

---

## 3. Freeze-immuniteit (garantie-model)

**Doel:** één gemist CHECKPOINT mag nooit een permanente freeze veroorzaken.

| Laag | Gedrag |
|------|--------|
| **Zelfstandige tip** | Elke CHECKPOINT is toepasbaar zonder voorgaande pakketten |
| **Frozen heartbeat** | Host rebroadcast ~1×/s de **laatste gepubliceerde tip** in elke speelfase incl. `executing` (geen live mid-Play export) |
| **Same-tip skip** | Gast die tip al heeft past niet opnieuw toe (geen animatie-/UI-reset) |
| **Guest watchdog** | Geen tip ≥2,5s → `RESYNC` → host `rebroadcastLastTruth` |
| **Dubbele kritieke tip** | Play-start + countdown-eind: extra tip ~400ms |

**Niet gegarandeerd (buiten sync):** totale P2P-disconnect, host-tab dicht, intent zonder retry (speler moet opnieuw klikken). Bij werkende host↔guest link herstelt de tip ≤ ~2–3s.

---

## 4. Fase-heartbeat

Host rebroadcast frozen last tip ~1×/s zolang `lobby.status === playing` en `phase !== finished`.

`finished`: één exit-publish, geen heartbeat.

---

## 5. Kritieke punten (checklist)

Voor elk punt: *wie triggert → wire → wat de gast moet zien → drop-gedrag*.

### 5.1 Race start → `match_ready`

| | |
|--|--|
| Trigger | Host `startEmbeddedRace` |
| Wire | Desk `start` (geen live LOG); `CHECKPOINT` met `match_ready` + `matchUpgradeOffers` |
| Gast nodig | Bord + eigen upgrade-offers |
| Drop 1× | Heartbeat in `match_ready` heelt ≤1s |
| Refs | `room-embedded.js:startEmbeddedRace`, `robotrally-engine.js:beginMatchReady` |

### 5.2 Start-upgrade bevestigen

| | |
|--|--|
| Trigger | Host lokaal / gast `rr_intent_upgrade` |
| Wire | Intent → host `confirmMatchUpgrade` → `CHECKPOINT` |
| Gast nodig | `matchReadyRobotIds` + offers gewist voor die robot |
| Drop 1× | Intent: stil (opnieuw kiezen). CHECKPOINT: heartbeat heelt |
| Refs | `p2p-session.js:sendUpgrade`, `handleMessage` |

**Risico:** geen intent-ACK; verkeerde lokale seat (`localP2pRobotId`) toont host-offers — afgevangen door seat/`peerUserId`-resolve (geen `robots[0]`-fallback in P2P).

### 5.3 Iedereen klaar → `match_countdown`

| | |
|--|--|
| Trigger | Host engine laatste `setMatchReady` |
| Wire | Zelfde confirm-`CHECKPOINT` + heartbeat |
| Gast nodig | `phase: match_countdown`, `matchCountdownEndsAt` |
| Drop 1× | Heartbeat heelt |

### 5.4 Countdown einde → `programming`

| | |
|--|--|
| Trigger | Alleen host-timer (`maybeFinishMatchCountdown`) |
| Wire | `startMatchFromCountdown` → `CHECKPOINT` (+ korte herhaal-publish) |
| Gast nodig | `programming` + eigen hand (vreemde handen gestript) |
| Drop 1× | Heartbeat schakelt naar `programming` → heelt ≤1s |
| Refs | `robotrally-ui.js:syncMatchCountdown`, `p2p-session.js:maybeFinishMatchCountdown` |

### 5.5 Commit → `ready` / auto-Play

| | |
|--|--|
| Trigger | `rr_intent_commit` / host commit; host `maybeAutoStartExecution` |
| Wire | Intent → snap → eventueel `sendPlay` |
| Gast nodig | `committedRobotIds` / `ready`, daarna `executing` |
| Drop 1× | programming/ready heartbeat heelt commits; Play-start apart (5.6) |

### 5.6 Play start → `executing`

| | |
|--|--|
| Trigger | Host `sendPlay` alleen |
| Wire | `startExecution` + `CHECKPOINT` (+ herhaal ~400ms) + **frozen heartbeat** van start-tip |
| Gast nodig | `executing` + alle registers om lokaal te animeren |
| Drop 1× | Heartbeat ≤1s of watchdog RESYNC ≤~2,5s |
| Refs | `p2p-session.js:sendPlay`, `rebroadcastLastTruth` |

### 5.7 Executing einde → programming / upgrade / finished

| | |
|--|--|
| Trigger | Host finalize (`allowFinalize: true`); gast wacht op “Wachten op host…” |
| Wire | `prevPhase === executing` → immediate `CHECKPOINT` |
| Gast nodig | Volgende phase + canonieke robots/handen |
| Drop 1× | Heartbeat / watchdog heelt |

### 5.8 Mid-round `upgrade_choice`

| | |
|--|--|
| Trigger | Speler op upgrade-tegel; intent of host UI |
| Wire | Intent + `CHECKPOINT`; frozen heartbeat |
| Gast nodig | `currentUpgradeChoice` voor de juiste robot |
| Drop 1× | Heartbeat / watchdog heelt ≤~2,5s |

### 5.9 Late joiner / `SESSION_INIT`

| | |
|--|--|
| Trigger | Room mount / welcome |
| Wire | Init-LOG kan leeg/stale zijn. Live heal = host CHECKPOINT (boot, heartbeat, of RESYNC) |
| Drop 1× | Watchdog + host frozen tip |

---

## 6. Heartbeat-dekking

| Phase | Frozen tip ~1s |
|-------|----------------|
| `match_ready` | ja |
| `match_countdown` | ja |
| `programming` | ja |
| `ready` | ja |
| `upgrade_choice` | ja |
| `executing` | ja (start-tip, niet mid-step) |
| `finished` | nee (exit-publish) |

---

## 7. Bewuste non-goals (nu)

- Intent ACK/REJECT UI  
- Per-peer delivery receipts  
- Mid-Play micro-checkpoints  
- Host-wissel mid-race  
- Late joiner midden in `executing` met perfecte animatie (krijgt start-tip of eind-tip; animatie mag skippen)

---

## 8. Testchecklist (kritiek)

1. **Start-upgrade:** 2 devices; joiner kiest; overlay weg; host ziet ready-teller.  
2. **Countdown:** beide zien aftellen; na 0 beide in programming met hand.  
3. **Play:** joiner ziet executing-animatie (niet vast op ready); na ronde nieuwe hand.  
4. **Upgrade-tegel:** juiste speler ziet keuze; ander wacht; daarna programming.  
5. **Packet drop simulatie:** joiner tab throttle tijdens Play-start — binnen ~2–3s alsnog executing of volgende phase.  
6. **Geen LOG-gap freeze:** live UI hangt niet van incrementele snap-seq af.

---

## 9. Codekaart

| Stuk | Pad |
|------|-----|
| Checkpoint push/adopt + watchdog | `robotrun/js/room-embedded.js` |
| Publish + heartbeat + Play | `robotrun/js/p2p-session.js` |
| Room fan-out | `room/main.js` (`SESSION_CHECKPOINT`) |
| Msg type | `js/sync/room-msg.js`, `js/sync/sync-msg.js` |
| Lokale Play-regels | [2026-08-26-robotrun-local-play-host-truth-design.md](./2026-08-26-robotrun-local-play-host-truth-design.md) |
| Room boot / ronde-flow | [2026-08-25-robotrun-room-playable-design.md](./2026-08-25-robotrun-room-playable-design.md) |

---

## 10. Relatie tot andere sync-profielen

| Profiel | Spellen | Live waarheid |
|---------|---------|---------------|
| event-log | TTT, ganzenbord | Kleine LOG-events + tip-proven welcome checkpoint |
| **tip-CHECKPOINT (deze spec)** | RobotRun room | Grote state als zelfstandige tip; log = desk |
| (legacy) incremental snap-LOG | — | **Afgekeurd voor RobotRun live** |
