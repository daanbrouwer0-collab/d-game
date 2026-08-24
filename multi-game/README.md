# D-Game — multiplayer sandbox (`multi-game/`)

Statische HTML/JS/CSS. Geen database. **Sandbox** om simpele games te koppelen aan multiplayer: **P2P (PeerJS)**, hotseat op één apparaat, Matrix later.

> **Architectuur (Netlify-router ↔ GitHub, P2P):** zie de [README in de repo-root](../README.md).  
> Spelcode hoort **hier**. De map `multi-game-netlify/` is alleen de Netlify hash-shell en mag niet als plek voor features dienen.

## Live

Productie: [https://www.d-game.nl/#index.html](https://www.d-game.nl/#index.html)

Uitnodigingen gebruiken hash-routes, bijvoorbeeld:

`https://www.d-game.nl/#tic-tac-toe/index.html?room=AB7K2M`  
`https://www.d-game.nl/#ganzenbord/index.html?room=AB7K2M`

Na `git push` naar `main` laadt de shell deze map via jsDelivr (geen Netlify-herupload nodig voor game-wijzigingen).

## Starten (lokaal)

```bash
cd multi-game
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Lokaal blijven path-URL’s (`/tic-tac-toe/?room=…`) werken.

## Tabs

| Tab | Pad (lokaal) | Hash (d-game.nl) | Inhoud |
|-----|--------------|------------------|--------|
| Games | `/` | `#index.html` | Spelcatalogus |
| Lobby | `/lobby/` | `#lobby/index.html` | Recente rooms |
| Friends | `/friends/` | `#friends/index.html` | Lokale vrienden |
| Netwerk | `/netwerk/` | `#netwerk/index.html` | P2P-lab (host, QR-scan, echo) |
| Geheugen | `/geheugen/` | `#geheugen/index.html` | Profiel + wissen |

## Frame

```
js/core/room.js        createRoom({ gameId, transport })
js/core/prefs.js       preferred transport (P2P)
js/core/storage.js     naam, vrienden, rooms, event-logs
js/sync/event-log.js   append-only keten (host sync / QR)
js/transport/          local (hotseat) | p2p | qr | matrix(stub)
js/shell/nav.js        tab-navigatie
js/shell/site-url.js   hash-shell, share-URL’s, veilige navigatie
js/shell/qr-scanner.js camera QR-scan (P2P invite)
```

### P2P kort

1. Host: `createRoom({ gameId, transport: "p2p" })` → kamercode + QR + `#…?room=CODE`.
2. Gast opent deellink of joint met code; `hello`/`welcome` checken `gameId`.
3. Lobby-spellen (ganzenbord): host schrijft events in de log; peers **replayen** de log voor state.
4. Hotseat: `transport: "local"` — zelfde UI, geen PeerJS.

Uitgebreider: [../README.md](../README.md#p2p-in-games).

## Netwerk-lab

Op **Netwerk** test je echte P2P-multiplayer:

- **Host** — start room, toon invite-QR en deellink
- **Join** — kamercode of **Scan QR** (zelfde flow als spellen)
- **Echo** — ping/pong na `connected` (“P2P werkt”)
- **Matrix** — stub (verwacht “niet geïmplementeerd”)

Hotseat (“Op dit apparaat”) staat alleen in spellen, niet op Netwerk.

## Spellen

- **Tic Tac Toe:** Op dit apparaat · Start P2P · Scan QR
- **Ganzenbord:** Klassiek bord (63) · lobby tot 6 · P2P of hotseat · QR-deellink
- **RobotRun:** Hotseat / solo vs AI · P2P lobby (2–5 spelers, QR-deellink)

## Design

- [Sandbox shell](docs/superpowers/specs/2026-08-24-d-game-sandbox-shell-design.md)
- [Frame Room API](docs/superpowers/specs/2026-08-24-d-game-frame-design.md)
- [P2P event-log rooms](docs/superpowers/specs/2026-08-24-p2p-event-log-rooms.md)
