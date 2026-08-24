# Fundamenten P2P: sterkte, zwakte, rangschikking, keuzes

**Datum:** 2026-08-24  
**Doel:** geen “fallback-therapie”, wel: wat is structureel sterk/zwak, hoe data & beurten geordend zijn, wat overbodig is, welke **echte** oplossingen er zijn.  
**Documentatieset P2P:**

| Doc | Rol |
|-----|-----|
| [speler-handleiding.md](./speler-handleiding.md) | Spelers: room, link, host |
| [p2p-multiplayer.md](./p2p-multiplayer.md) | Beschrijvend: transport, log, room shell |
| [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) | Normatief: R1–R24 |
| **Dit bestand** | Fundamenten: canon, geen fallbacks |
| [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md) | Gaten, P0–P3 |
| [README.md](./README.md) | Documentatie-index |

---

## 1. Uitgangspunt (jullie eis)

| Eis | Betekenis |
|-----|-----------|
| Geen nutteloze fallback | Als LOG faalt, mag STATE dat niet “stil goedpraten” terwijl log en UI uit elkaar lopen |
| Beurten + gamedata gelijk | Op elk moment: zelfde `seq`/commit → zelfde beurt → zelfde bord/state |
| Waterdicht genoeg voor sandbox | Host is god; gasten kunnen niet liegen over stoel/beurt/log |

**Regel:** één canonieke bron. Al het andere is afgeleid of transport.  
Tweede kanaal dat dezelfde waarheid “redt” zonder die bron te herstellen = **symptoombehandeling**.

---

## 2. Wat is het fundament vandaag?

```text
┌─────────────────────────────────────────────────────────┐
│  STERK (blijft bruikbaar)                               │
│  • Ster: 1 host, N gasten (PeerJS roomcode = host-id)   │
│  • Room API (createRoom) i.p.v. PeerJS in elke UI       │
│  • Append-only event met seq + prevId                   │
│  • Stabiele playerId ≠ host-rol                         │
│  • Pure rules (game.js) + replay(log) → state           │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZWAK (hier knapt gelijkloop)                           │
│  • Authority niet afgedwongen (per spel DIY)            │
│  • Twee “waarheden” tegelijk: LOG én STATE              │
│  • Intent zonder peer→stoel binding                     │
│  • Geen commit-ACK → UI en host uit fase                │
│  • Twee timers → twee commits mogelijk                  │
│  • Drie dialecten (TTT / GB / RobotRun)                 │
└─────────────────────────────────────────────────────────┘
```

### Sterk — waarom bewaren

| Fundament | Waarom het goed is |
|-----------|-------------------|
| **Single-writer host** | Totale ordening zonder consensus-algoritme; past bij static site |
| **Event-log als geschiedenis** | Beurten en zetten zijn *genummerd*; reconnect = inhalen, niet gokken |
| **playerId** | Host mag wisselen; stoelen blijven van personen |
| **Rules zonder netwerk** | Testbaar; zelfde reducer op host en bij replay |

### Zwak — waarom het nu niet gelijkloopt

| Zwakte | Effect op beurten/data |
|--------|-------------------------|
| **STATE naast LOG als “backup”** | Gast kan STATE tonen die **niet** uit dezelfde log-tip komt → beurt/UI ≠ replaybare geschiedenis |
| **Host accepteert peer-LOG (TTT)** | Gast kan de “totale ordening” vervalsen |
| **Intent zonder bind** | Actie van speler B namens A → beurtvolgorde semantisch corrupt |
| **Dual timer** | Twee commits voor “één beurt-einde” |
| **send() zonder ACK** | Gast denkt beurt voorbij; host niet (of omgekeerd) |
| **mergeLogs preferred=local** | Bij fork kiest client lokaal i.p.v. host-tip |
| **RobotRun snapshot-only live** | Andere ordeningsregels dan TTT/GB → geen gedeeld fundament |

---

## 3. Hoe worden beurten en data gerangschikt / genormaliseerd?

### 3.1 Wat “rangschikking” hier betekent

In een multiplayer-game moet er een **totale volgorde** van betekenisvolle gebeurtenissen zijn:

```text
… → commit n → commit n+1 → …
         ↓
   stateₙ = fold(rules, events[1..n])
   turnₙ  = afgeleid uit stateₙ
```

Alles wat geen commit is (UI-klik, timer-tick, “ik stuurde een packet”) hoort **niet** in die keten tot de host hem heeft geaccepteerd.

### 3.2 Huidige normalisatie (log-spellen)

| Laag | Wat | Ordinaal? |
|------|-----|-----------|
| Transport `seq` in envelope | Per-zender teller | **Nee** — niet gevalideerd, niet de game-orde |
| Event-log `seq` + `prevId` | Globale keten op host | **Ja — dit hoort de enige orde te zijn** |
| `turn` / `turnIndex` in state | Afgeleid uit replay | Ja, maar alleen als state = fold(log) |
| STATE-snapshot | Volledige state-blob | **Geen eigen orde** — mag alleen `tipSeq` claimen |
| Wall-clock timer | Lokaal | Geen game-orde tot timeout-**commit** |

**Normalisatie vandaag (bedoeling):**

```text
intent → host validate → appendEvent (seq++) → broadcast LOG
                                              → replay → state/turn
```

**Normalisatie vandaag (praktijk):**

```text
intent → host validate → appendEvent → broadcast LOG
                                       broadcast STATE   ← parallel “waarheid”
gast: merge LOG  óf  overwrite STATE   ← twee paden
```

Zodra STATE wint zonder dat LOG dezelfde tip heeft, is **beurt en data niet meer genormaliseerd** op één as.

### 3.3 Wat wél de canonieke sleutel moet zijn

Voor gelijkloop moet elk apparaat het eens zijn over:

```text
canonicalKey = (gameId, roomCode, tipSeq, tipEventId)
state        = replay(log[1..tipSeq])   // of snapshot mét bewijs tipSeq+tipEventId
turn         = state.turn / turnIndex
```

Zonder `tipSeq` op elke sync-boodschap is “gelijk” niet checkbaar.

### 3.4 Beurt ≠ netwerkbeurt

| Begrip | Definitie |
|--------|-----------|
| **Game-beurt** | Wie mag de *volgende commit* veroorzaken (afgeleid uit state) |
| **Intent** | Voorstel van een peer (“ik wil rollen”) — nog geen commit |
| **Commit** | Host-append (of host-eigen zet) met `seq` |

Timers mogen alleen een **intent** of een **host-lokale commit** triggeren — nooit een tweede parallelle waarheid.

---

## 4. Overbodigheid: wat te veel is?

| Ding | Nuttig? | Oordeel |
|------|---------|---------|
| LOG + STATE **beide** als waarheid | Nee | **Overbodig en schadelijk** als STATE zonder tip-check LOG mag overrulen |
| Full-log bij elke zet (`fromSeq=0`) | Noodverband | Werkt bij korte games; schaalt slecht; maskeert ontbrekende incrementele sync |
| `mergeLogs` bidirectional + preferred | Te slim | Gast mag geen fork “winnen”; host-tip is genoeg |
| Transport `seq` ongebruikt | Dood gewicht | Of gebruiken (idempotency) of weglaten uit denken |
| Drie sync-dialecten | Ja schadelijk | Eén host-pipeline; spel = alleen reducer |
| peerToPlayer zonder enforce | Dode code | Of binden of verwijderen |
| Auto-reconnect + handmatige reconnect + STATE-repush bij stale | Band-aids | Nodig tot sync/ACK klopt; daarna vereenvoudigen |
| Hello log merge op host van gast-log | Gevaarlijk | Host mag gast-log alleen gebruiken om *eigen tip te delen*, nooit om gast-events te adopteren als die de keten verlengen zonder host-origin |

**Conclusie overbodigheid:** het systeem is niet “te weinig features”, het heeft **te veel parallelle waarheidspaden**. Opschonen = minder kanalen, hardere regels.

---

## 5. Fallback ≠ oplossing (expliciet)

| Fallback-achtig gedrag | Waarom het geen oplossing is |
|------------------------|------------------------------|
| STATE sturen “omdat LOG soms faalt” | Lost falen niet op; creëert tweede waarheid |
| Gast én host laten timeout’en “voor zekerheid” | Creëert dubbele commits |
| `mergeLogs` preferred local bij conflict | Kiest willekeurig wie “gelijk” is |
| UI disablen bij disconnect i.p.v. sync herstellen | Verbergt desync; speelbaarheid ≠ correctheid |
| Full dump elke keer i.p.v. tip-sync | Dekt gaps toe met brute force; niet correct bij fork |

**Echte oplossing** = falend mechanisme repareren of vervangen, niet een tweede pad ernaast.

---

## 6. Zijn fundamentele veranderingen nodig?

**Ja — op de sync/authority-laag. Nee — niet per se PeerJS of ster-topologie vervangen.**

| Laag | Fundamenteel wijzigen? | Keuze |
|------|------------------------|-------|
| PeerJS ster + roomcode=host | **Nee** | Behouden: past bij static hosting |
| Room API | **Nee** | Behouden |
| playerId seats | **Nee** | Behouden; wél binden aan peer |
| Event-log + replay | **Versterken, niet weggooien** | Totale orde zit hier |
| LOG+STATE dual-truth | **Ja, fundamenteel opschonen** | Eén canon + optioneel bewezen snapshot |
| Per-spel host DIY | **Ja** | Gedeelde intent→commit pipeline |
| RobotRun snapshot-live | **Keuze** | Of in zelfde commit-model, of bewust apart documenteren als uitzondering |

Ster + log is een **goed fundament**. Wat ontbreekt is **discipline in één pipeline**, niet een andere netwerktechnologie.

---

## 7. Architectuurkeuzes (echt, met trade-offs)

### Keuze A — **Log-only canon** (aanbevolen voor TTT + ganzenbord)

```text
Commit = appendEvent
Sync   = incremental LOG sinds peer.tipSeq
State  = altijd replay(log)
Snapshot mag mee in welcome/resync, maar ALLEEN met { tipSeq, tipEventId }
          en gast weigert snapshot als tip ≠ verwacht
ACK    = { intentId, tipSeq } of REJECT
Timer  = host-only → één timeout-commit per turnKey
```

| Voor | Tegen |
|------|-------|
| Eén normalisatie-as | Replay kost CPU bij hele lange logs (mitigeer: snapshot *checkpoint* met tip-bewijs) |
| Beurt altijd afleidbaar | RobotRun zware state past minder |
| Geen dual-truth | Incrementele sync + resync moet gebouwd |

**Checkpoint (wél oké):** periodiek of bij welcome een snapshot die zegt “dit is state na seq N”. Dat is **compressie van de log**, geen tweede waarheid. Gast: `if snap.tipSeq !== appliedTip → negeer of vraag resync`.

### Keuze B — **Snapshot-only canon** (RobotRun-achtig overal)

```text
Commit = host produceert nieuwe state + monotoon stateRev
Sync   = broadcast { stateRev, state }
Intent = gast voorstel; host ACK met stateRev
```

| Voor | Tegen |
|------|-------|
| Eenvoudig voor zware engines | Geschiedenis/host-wissel zwakker zonder apart loggen |
| Geen replay-CPU | Debug/“wat gebeurde er?” moeilijker |

Dan moet je **stateRev** net zo serieus nemen als `seq`. Geen tweede kanaal.

### Keuze C — **Hybride dialecten houden** (status quo + patches)

P0-bugs dichtplakken per spel, STATE laten bestaan als backup.

| Voor | Tegen |
|------|-------|
| Snel | Blijft fundamenteel fragiel; jullie eis “geen fallback” faalt |

**Aanbeveling:** **A voor TTT/GB** (en toekomstige beurtspellen). RobotRun bewust **B** met `stateRev`, of later migreren. **C afwijzen** als doelarchitectuur.

---

## 8. Oplossingen per kritiek punt (zonder fallback)

| Kritiek | Echte oplossing | Niet doen |
|---------|-----------------|-----------|
| Gast forge LOG | Host **drop** peer-LOG/STATE altijd | “We mergen voorzichtig” |
| Stoel-spoof | `actor = peerToPlayer[from]`; payload actor moet matchen | Alleen `playerId === turn` checken |
| Dual timer | **Host-only** clock; gast stuurt hooguit “nudge” die host idempotent maakt op `turnKey` | Beide laten firen “voor zekerheid” |
| Desync LOG/STATE | **Eén canon** (A of B); snapshot alleen met tip-bewijs | STATE als redder bij gap |
| Gap in keten | Gast stuurt `resync(fromSeq)` of `tipSeq`; host antwoordt incrementeel of checkpoint+tail | Stil preferred local |
| Fork | Policy: **host tip wint**; gast hard `replaceLog(hostPacket)` | mergeLogs preferred |
| send ≠ accept | Elke intent heeft `intentId`; host `ACK(intentId, tipSeq)` / `REJECT` | Optimistic ok:true op send |
| Full dump | `encodeSyncPacket(log, peerTip)`; welcome = checkpoint of full één keer | Elke zet hele geschiedenis “omdat het werkt” |
| isConnected liegt | Connected = open datachannel(s) die je nodig hebt | status-string als proxy |
| Drie dialecten | Gedeelde `HostCommit` module; spel levert alleen `reducer` + intent-schema | Elk spel opnieuw host-logica |

---

## 9. Doelbeeld: genormaliseerde gelijkloop

```text
                    ┌──────────────┐
   intent(id,…) ──►│ HOST commit  │── append seq=n ──► persist
                    │ bind peer    │
                    │ reducer      │
                    └──────┬───────┘
                           │
              ACK(id, n) ──┼── LOG since tip / of checkpoint@n + tail
                           │
                    ┌──────▼───────┐
                    │ GAST         │
                    │ apply only   │
                    │ if n=tip+1   │
                    │ else resync  │
                    │ state=replay │
                    │ UI unlock    │
                    └──────────────┘
```

**Gelijkloop-invariant (testbaar):**

> Na verwerken van host-tip `n` op alle peers:  
> `hash(state) === hash(replay(log[1..n]))` en `turn` gelijk.

Alles wat die invariant breekt is een defect — geen “edge case voor fallback”.

---

## 10. Wat behouden vs wat weg

**Behouden**

- Ster / PeerJS / roomcode  
- `createRoom`  
- `playerId`  
- `appendEvent` + `seq`/`prevId`  
- Pure `game.js` reducers  
- Desk-persist van de **host-log**

**Weg of degraderen**

- STATE als ongecontroleerde tweede waarheid  
- Host die gast-LOG adopteert  
- Dual expire zonder turnKey-idempotency  
- Stille drops zonder ACK/REJECT  
- Bidirectionele merge als “smart sync”

**Toevoegen (minimaal voor A)**

- Host-only commit pipeline (shared)  
- peer→stoel bind  
- intentId + ACK/REJECT  
- tipSeq tracking per peer + incremental sync + resync  
- Host-only timer of idempotent timeout-commit  
- Snapshot alleen als checkpoint met tip-bewijs (optioneel)

---

## 11. Beslissing

**Gekozen (2026-08-24): A — Log-only canon + optionele checkpoints** voor beurtspellen (tic-tac-toe, ganzenbord, toekomstige turn-based games).

- Canonieke waarheid = event-log (`seq` / `prevId`).
- State/beurt = altijd `replay(log)` (of checkpoint bewezen tot `tipSeq`).
- Geen STATE als tweede ongecontroleerde waarheid.
- RobotRun blijft voorlopig snapshot-model (B); migratie is apart traject.

Zie ontwerp: [2026-08-24-p2p-log-only-canon-design.md](./superpowers/specs/2026-08-24-p2p-log-only-canon-design.md).
