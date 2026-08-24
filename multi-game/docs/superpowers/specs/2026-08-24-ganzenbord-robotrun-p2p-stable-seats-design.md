# Ganzenbord & RobotRun: stabiele P2P-stoelen + mid-game host-wissel

Datum: 2026-08-24  
Context: D-Game (static, PeerJS, event-log zoals tic-tac-toe)  
Status: goedgekeurd ontwerp — klaar voor implementatieplan

## Doel

Zelfde speelbaarheid als tic-tac-toe na host-wissel, plus mid-game herstel:

1. Spelers houden hun **stoel / naam / voortgang** als een andere speler de room opnieuw host.
2. Alleen de speler **aan de beurt** hoeft online te zijn; anderen mogen later joinen en **syncen via de log**.
3. **Goede P2P-GUI**: naam, QR/share, desk (“Mijn rooms”), reconnect, duidelijke “jij / beurt / offline”.

Succescriterium (ganzenbord): partij starten → zetten doen → beide weg → andere host opnieuw → joiner(s) terug → zelfde stoelen, posities en beurt; late joiner krijgt de actuele tip via log-merge.

## Volgorde

1. **Fase 1 — Ganzenbord** (eerst; eenvoudige staat).
2. **Fase 2 — RobotRun** (zelfde patronen; complexere state).

## Keuzes (vastgelegd)

| Onderwerp | Keuze |
|-----------|--------|
| Scope speelbaarheid | C: stabiele stoelen + GUI + mid-game herstel na host-wissel |
| Sync-model | Append-only **event-log** (TTT-patroon), niet pure snapshot |
| Offline tijdens partij | Alleen de speler aan de beurt moet online zijn om te handelen; rest sync later |
| Host ≠ stoel | Transport-host is los van speler-id / stoel |

## Architectuur (gedeeld met tic-tac-toe)

- Room-code = PeerJS-id van de **actieve** host.
- Host is autoriteit voor nieuwe events; clients bewaren dezelfde log in localStorage (`desk` / `loadRoomLog` / `saveRoomLog`).
- Stabiele id: `getPlayerId()` + weergavenaam (`playerLabel` / `setDisplayName`).
- Host-wissel: desk **Host opnieuw** / URL `?as=host` → `hostWithCode` (geen nieuwe code bij `unavailable-id`).
- HELLO: `{ log, playerId, name }` → host merget → WELCOME `{ youAre, log, … }`.
- Broadcast: `LOG` (encoded sync packet), niet alleen full-state wipe.

```text
[Host tab]  --append roll/start/seat-->  event-log  --LOG/WELCOME-->  [Guests]
     ^                                      |
     +---- hostWithCode + loadRoomLog ------+   (andere speler claimt host)
```

## Fase 1 — Ganzenbord

### Events

| type | payload (richtlijn) | effect bij replay |
|------|---------------------|-------------------|
| `seat` | `{ playerId, name }` | Voeg/update stoel; volgorde = eerste seat-volgorde |
| `start` | `null` of `{}` | Lobby → playing; posities init |
| `roll` | `{ playerId, value }` | Pas dobbelsteen toe; volgende beurt / finish |

Geen stoel-verwijdering mid-game bij disconnect: peer offline markeren in runtime; stoel blijft in de log.

### Runtime-regels

- Dobbelen alleen als `turn.playerId === localPlayerId` én die peer (of local host) verbonden is.
- Andere stoelen mogen offline; UI toont offline.
- Late join: merge log → replay → zelfde posities/beurt.
- `beginAsHost` / resume **wist niet** meer de log; altijd `loadPersisted(code)` eerst.
- Speler-id `"host"` en ephemeral `p_*` per sessie verdwijnen als seat-key.

### GUI

- Naamveld (gedeelde display name).
- Lobby: QR + code + kopieer/WhatsApp/share (bestaande invite-helpers).
- Stoelenlijst met online/offline.
- Spel: label “Jij · naam”, beurt, reconnect.
- `mountRoomStrip` + `watchShellRoute` / `readHostIntentFromUrl` zoals TTT.

### Aan te passen bestanden (indicatief)

- `multi-game/ganzenbord/room.js` — identity, log, HELLO/WELCOME, geen wipe
- `multi-game/ganzenbord/game.js` — replay-vriendelijke mutaties; host-flag los van id
- `multi-game/ganzenbord/main.js` — resumeAsHost, desk, reconnect
- `multi-game/ganzenbord/ui.js` + `index.html` — status/offline/reconnect
- Hergebruik: `js/sync/event-log.js`, `js/core/desk.js`, `js/core/storage.js`

Optioneel nieuw: `ganzenbord/log.js` (replay + seatsFromLog-achtig).

## Fase 2 — RobotRun

Zelfde principes, toegepast op bestaande `P2pSessionController` / lobby:

- `seat.userId` = `getPlayerId()` (niet PeerJS-id / room-code).
- Host-rol ≠ seat-id; `onPeerLeave` mid-race: offline houden, **niet** renumberen/droppen.
- Persist seats + game-voortgang via event-log (en waar nodig gecontroleerde snapshot-events voor handen/bord, nog steeds in dezelfde keten).
- URL host-intent + desk reclaim; late join sync.
- GUI: QR/share/WhatsApp, reconnect, duidelijke jij/ready/host; naam via karakter of display name.

Touchpoints: `robotrun/js/p2p-session.js`, `p2p-lobby.js`, `menu.js`, `p2p-bridge.js`, `index.html`.

## Foutgedrag

| Situatie | Gedrag |
|----------|--------|
| Code bezet (`unavailable-id`) | Fout: join of wacht; geen stille nieuwe code |
| Peer niet gevonden | Duidelijke fout; host moet open staan |
| Log-fork / gap | Voorkeursketen van actieve host (bestaande `mergeLogs`) |
| Actie terwijl niet aan de beurt / offline | Reject; geen event |

## Buiten scope

- Geen server / directory
- Geen crypto-blockchain of encryptie-keten
- Geen mesh zonder host
- Geen AI voor offline spelers
- Geen Netlify-upload voor gamefixes (GitHub → jsDelivr)

## Testplan (fase 1)

1. Twee (of meer) spelers met namen; room hosten; starten; minstens één roll.
2. Beide tabs dicht; andere speler **Host opnieuw**; eerste joinen.
3. Zelfde stoelen, posities, beurt; dobbelen werkt voor wie aan de beurt is.
4. Derde/late joiner: ziet actuele stand na sync.
5. Speler niet aan de beurt offline: partij gaat door wanneer de beurt-speler online is.
6. Desk-kaarten: Open / Host opnieuw / Join.

## Relatie tot eerdere specs

Bouwt voort op `2026-08-24-p2p-event-log-rooms.md` en de TTT-implementatie (`tic-tac-toe/engine.js`, `log.js`, desk). Dit document legt vast wat ganzenbord/robotrun concreet moeten doen voor **stabiele stoelen + mid-game host-wissel**.
