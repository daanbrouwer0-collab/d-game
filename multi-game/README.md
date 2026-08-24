# D-Game — multiplayer sandbox

Static HTML/JS/CSS. Geen database. **Sandbox** om simpele games te koppelen aan multiplayer-communicatie: P2P (PeerJS), hotseat op één apparaat in spellen, Matrix later.

## Starten

```bash
cd multi-game
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Tabs

| Tab | Pad | Inhoud |
|-----|-----|--------|
| Games | `/` | Spelcatalogus |
| Lobby | `/lobby/` | Recente rooms |
| Friends | `/friends/` | Lokale vrienden |
| Netwerk | `/netwerk/` | P2P-lab (host, QR-scan, echo) |
| Geheugen | `/geheugen/` | Profiel + wissen |

## Frame

```
js/core/room.js        createRoom({ gameId, transport })
js/core/prefs.js       preferred transport (P2P)
js/core/storage.js     naam, vrienden, rooms, event-logs
js/sync/event-log.js   append-only keten (QR transport, intern)
js/transport/          local (hotseat) | p2p | qr | matrix(stub)
js/shell/nav.js        tab-navigatie
js/shell/qr-scanner.js camera QR-scan (P2P invite)
```

## Netwerk-lab

Op **Netwerk** test je echte P2P-multiplayer:

- **Host** — start room, toon invite-QR en deellink
- **Join** — kamercode of **Scan QR** (zelfde flow als spellen)
- **Echo** — ping/pong na `connected` (“P2P werkt”)
- **Matrix** — stub (verwacht “niet geïmplementeerd”)

Hotseat (“Op dit apparaat”) staat alleen in spellen, niet op Netwerk.

## Spellen

- **Tic Tac Toe:** Op dit apparaat · Start P2P · Scan QR
- **Ganzenbord:** Op dit apparaat · Start P2P · Scan QR
- **RobotRun:** Hotseat / solo vs AI · P2P lobby (2–5 spelers, QR-deellink)

## Design

- [Sandbox shell](docs/superpowers/specs/2026-08-24-d-game-sandbox-shell-design.md)
- [Frame Room API](docs/superpowers/specs/2026-08-24-d-game-frame-design.md)
