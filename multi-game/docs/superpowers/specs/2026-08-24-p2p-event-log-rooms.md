# P2P game-sync: eigen rooms, event-log en “up to date” na connect

Datum: 2026-08-24  
Context: D-Game (static site, geen database, PeerJS / WebRTC)  
Status: verkenning / ontwerpnotitie — nog niet geïmplementeerd

## Doel

Spelers willen:

1. **Elk een eigen room** (eigen PeerJS-peer / bereikbaar adres).
2. Voor een game **connecten met één (of meer) van die rooms**.
3. Een **gedeelde geschiedenis van de game** (“blockchain-achtig”), zodat je na connect **up to date** bent.
4. **Geen encryptie / geen crypto-blockchain** — wel een manier waarop spelers elkaar de stand vertellen.

Dit document beschrijft hoe dat kan, en wat de voor- en nadelen zijn ten opzichte van het huidige **host-hub**-model.

---

## Huidige situatie (D-Game v1)

| Onderdeel | Gedrag |
|-----------|--------|
| Topologie | Ster: 1 host, gasten verbinden alleen met de host |
| Room | = PeerJS peer-id van de host |
| Authority | Host valideert zetten en broadcast state |
| Sync | Laatste `state` (of welkomstbericht); geen lange geschiedenis |
| Discovery | Deellink / code; recente rooms op dit apparaat |

**Sterkte:** eenvoudig, voorspelbaar, past bij static hosting.  
**Zwakte:** host-tab weg → lobby/spel valt om; geen “inhaalslag” via een andere speler die de stand nog heeft.

---

## Gewenst model (samenvatting)

```text
  [Speler A room]     [Speler B room]     [Speler C room]
        │                   │                   │
        └──── connect ──────┴──── sync ─────────┘
                         │
              gedeelde game event-log
              (zelfde gameId)
```

- **Room van een speler** = “waar vind ik jou?” (transport / visitekaartje).
- **Game** = `gameId` + **event-log** (de “waarheid” over zetten).
- **Connect** = WebRTC-sessie + **sync van ontbrekende events** → afgeleide state opnieuw opbouwen.

Dit is **geen** blockchain met mining, wallets of encryptie. Wel: **append-only log + replicatie tussen peers** (gossip / state sync).

---

## Drie bouwstenen

### 1. Persoonlijke room (per speler)

Elke speler houdt (idealiter) een stabiel peer-id / room-code bij, bv. in `localStorage`.

- Anderen openen `…/ganzenbord/?peer=ABC123` of een game-link met jouw id.
- Jouw tab moet online zijn om *jouw* room te bereiken (PeerJS-eigenschap), tenzij later een relay/directory bestaat.

**Room ≠ unieke game-waarheid.** Room is een **ingang** naar sync.

### 2. Event-log (“lichte chain”)

Elke actie is een event, bijvoorbeeld:

```json
{
  "id": "e_9f3a",
  "gameId": "gb-2026-…",
  "prevId": "e_8c21",
  "seq": 14,
  "playerId": "p_sam",
  "type": "roll",
  "payload": { "value": 4 },
  "ts": 1740000000000
}
```

- Lokaal bewaart elke client de lijst events + **afgeleide state** (bord, beurt, winnaar).
- Bij connect wisselen peers uit: laatste `id` / `seq` / korte hash van de keten.
- Ontbrekende events worden opgestuurd; daarna **replay** → zelfde stand.

Varianten:

| Aanpak | Idee | Wanneer |
|--------|------|---------|
| **Event-log** | Geschiedenis + replay | Aanbevolen voor “up to date na connect” |
| **State dump** | Alleen `{ board, turn, … }` | Simpeler; slecht bij conflicten |
| **Hybride** | Log + periodieke snapshot | Minder bandbreedte bij lange games |

### 3. Connect-strategie

| Model | Beschrijving |
|-------|----------------|
| **Connect met één peer** | Open Sams room → sync met Sam → klaar (minimale stap) |
| **Ster + log** | Nog steeds één “actieve” hub, maar state = log die anderen kunnen doorgeven |
| **Mesh / gossip** | A↔B, B↔C: events lopen door; zwaarder voor WebRTC |

“Meerdere rooms gebruiken” betekent in de praktijk: **meerdere sync-ingangen naar dezelfde `gameId`-log**, niet meerdere parallelle waarheden (tenzij er een fork is).

---

## Sync-protocol (schets)

1. **Hello:** `{ gameId, tipId, seq, playerId, name }`
2. **Need:** `{ fromSeq }` of `{ missingIds: […] }`
3. **Supply:** batch events in volgorde
4. **Ack / tip:** nieuwe tip na merge
5. **Play:** lokale UI volgt afgeleide state; nieuwe zetten = nieuwe events naar verbonden peers

Optioneel later: peers sturen events door naar *hun* andere connections (gossip).

---

## Conflicten en vertrouwen

Zonder centrale server moet je kiezen:

| Probleem | Opties |
|----------|--------|
| Twee geldige zetten “tegelijk” (fork) | Langste keten; laagste event-id; “eerste gezien wint”; host-stem voor deze game |
| Ongeldige zet | Bij replay weigeren (regels in code) |
| Valse state (“ik win”) | Onder vrienden vaak acceptabel risico; anders signatures of host-authority houden |
| Cheaten | Event-log maakt manipulatie zichtbaar, stopt het niet zonder rules + peer review |

**Encryptie** is hier geen vereiste. **Authenticiteit** (wie stuurde wat) is een apart onderwerp en kan later.

Voor turn-based ganzenbord met 2–6 vrienden is vaak genoeg:

- strikte beurtregels bij replay;
- één lineaire keten per `gameId`;
- bij twijfel: sync met de peer die de hoogste geldige `seq` heeft.

---

## Voor- en nadelen

### Voordelen t.o.v. pure host-hub

- Host weg ≠ meteen alles weg **als** minstens één andere speler de log nog heeft en bereikbaar is.
- Spelers kunnen later terugkomen en **inhalen** via wie dan ook die online is en de keten kent.
- Past bij “iedereen vertelt iedereen de stand”.
- Rooms per speler maken **herconnect / bookmarken** van personen natuurlijker.

### Nadelen / kosten

- Meer complexiteit: log, sync, forks, UI (“bezig met sync…”, “conflict”).
- WebRTC-mesh = meer connections, meer NAT/ICE-falen, lastiger debuggen.
- Geen globale “alle live rooms”-lijst zonder directory-server (static P2P blijft links/codes/recente peers).
- Zonder authority is state te vervalsen door een peer.
- Meer CPU/bandbreedte dan één host die `state` broadcast.

---

## Wat wél / niet “blockchain” is

| Term | In dit ontwerp |
|------|----------------|
| Append-only geschiedenis | Ja (event-log) |
| Sync zodat je bijblijft | Ja |
| Mining / tokens / encryptie | Nee |
| Globale immutable consensus | Nee (lokale regels + peer-afspraken) |
| Doorgeven van kopieën van de waarheid | Ja (replicatie) |

Beter label: **replicated event log** of **gossip sync**, niet “blockchain” in producttekst — voorkomt verkeerde verwachtingen.

---

## Fasering (aanbevolen)

### Fase 0 — Nu (reeds grotendeels)

- Host-hub, deellinks, recente rooms op dit device.
- Reconnect naar dezelfde room-code.

### Fase 1 — Event-log + sync-bij-connect (kleine stap)

- Zetten als events; host mag nog steeds first writer / validator zijn.
- Gast die reconnect krijgt **missing events** of snapshot+log-tail.
- Nog steeds: connect via **één** room/link.

### Fase 2 — Persoonlijke peer-id + “connect met speler X”

- Elke speler heeft een vaste room.
- Game heeft `gameId`; link kan `?game=…&via=PEER` zijn.
- Sync haalt je bij via die peer.

### Fase 3 — Lichte multi-peer sync (optioneel)

- Na join: ook verbinden met 1–2 andere spelers uit de lobby-lijst.
- Events gossipen; beter tegen single-host-dropout.

### Bewust niet (tenzij eisen veranderen)

- Publieke room-directory zonder server.
- Proof-of-work blockchain.
- End-to-end encryptie als harde eis (kan later los).

---

## Relatie tot huidige code

| Pad | Rol nu |
|-----|--------|
| `js/p2p/net.js` | PeerJS host/join; multi-guest star |
| `js/p2p/session.js` | Share-URL, hello/welcome, ping |
| `js/p2p/room-memory.js` | Actieve room + recente rooms (lokaal) |
| `ganzenbord/` | Lobby + host-authority state |

Een event-log zou logischerwijs landen als iets als `js/p2p/event-log.js` + sync-berichten (`tip`, `need`, `supply`), gebruikt door games die `gameId` delen.

---

## Beslispunten voor later

1. Blijft er een **host** die mag starten / illegale events weigert, of pure peer-equality?
2. Alleen **sync met één peer**, of meteen **2+ peers**?
3. Fork-beleid: langste keten vs host-beslis vs handmatige UI?
4. Bewaartermijn log: alleen huidige game, of hervatten na dagen?

---

## Conclusie

Ja: **eigen rooms + connect + gedeelde event-geschiedenis** past bij static P2P, zolang je “blockchain” leest als **gerepliceerde event-log**, niet als crypto-netwerk.

Het grootste winstpunt is **robuustere sync en inhalen**. De grootste kosten zijn **protocolcomplexiteit** en **conflictregels**. Voor D-Game is de verstandige route: eerst event-log + sync-bij-één-connect (fase 1), daarna persoonlijke rooms en optioneel gossip (fase 2–3).
