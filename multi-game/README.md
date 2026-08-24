# D-Game — multiplayer sandbox (`multi-game/`)

Statische HTML/JS/CSS. Geen database. **Sandbox** voor simpele games met multiplayer via **P2P (PeerJS)**, hotseat, en (later) Matrix.

> **Architectuur (Netlify ↔ GitHub):** [README repo-root](../README.md)  
> Spelcode hoort **hier**. `multi-game-netlify/` is alleen de hash-shell.

## Live

[https://www.d-game.nl/#index.html](https://www.d-game.nl/#index.html)

**Multiplayer (voorkeur):**  
`https://www.d-game.nl/#room/?room=AB7K2M`

**Legacy per spel:**  
`https://www.d-game.nl/#tic-tac-toe/index.html?room=AB7K2M`

Na `git push` naar `main` laadt jsDelivr de nieuwe commit (geen Netlify-herupload voor game-wijzigingen).

## Starten (lokaal)

```bash
cd multi-game
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Tabs

| Tab | Pad | Inhoud |
|-----|-----|--------|
| Games | `/` | Catalogus + link naar room |
| **Handleiding** | `/handleiding/` | Multiplayer uitleg voor spelers |
| **Room** | `/room/` | **Multiplayer: start/join, picker, embedded spellen** |
| Lobby | `/lobby/` | Recente rooms (hervatten) |
| Friends | `/friends/` | Lokale vrienden |
| Netwerk | `/netwerk/` | P2P-lab (echo, QR) |
| Geheugen | `/geheugen/` | Profiel, logs wissen |

## Multiplayer — twee paden

| Pad | Wanneer |
|-----|---------|
| **`room/`** | Groep, meerdere spellen, één link — **voorkeur** |
| **Per-spel P2P** | Legacy; `#tic-tac-toe/?room=` etc. — wordt uitgefaseerd |
| **`local` hotseat** | Eén apparaat, geen netwerk |

### Room flow (kort)

1. Host: `#room/` → Start room → deel link/QR  
2. Gasten joinen → roster  
3. Host kiest spel (filter op aantal spelers)  
4. Spel in iframe; P2P blijft in room-shell  
5. Terug naar picker voor volgend spel  

**Spelers:** [handleiding/index.html](../handleiding/index.html) · [docs/speler-handleiding.md](docs/speler-handleiding.md)

## Frame (code)

```
room/main.js              Room shell UI + P2P alive
js/p2p/room-session.js    Game-agnostische P2P
js/sync/room-log.js       Room log (room.* events)
js/sync/event-log.js      Session / legacy game logs
js/bridge/                Embedded spel ↔ shell
js/core/room.js           createRoomSession() + createRoom() legacy
js/shell/site-url.js      #room/?room=, embedded URLs
```

## Spellen

| Spel | Room embedded | Standalone P2P | Hotseat |
|------|---------------|----------------|---------|
| Tic-tac-toe | Ja | Ja | Ja |
| Ganzenbord | Ja (`embedded.js`) | Ja | Ja |
| RobotRun | Stub | Ja | Ja |

## Documentatie

| Doc | |
|-----|--|
| [docs/README.md](docs/README.md) | **Start hier** — index |
| [Spelerhandleiding](docs/speler-handleiding.md) | Room gebruiken |
| [P2P multiplayer](docs/p2p-multiplayer.md) | Technisch: log, sync, transport |
| [Bouwregels](docs/multiplayer-bouwregels.md) | Nieuw spel toevoegen |
| [Kritisch rapport](docs/p2p-kritisch-rapport.md) | Bekende gaten |
| [Fundamenten](docs/p2p-fundamenten.md) | Canon & keuzes |
| [Specs index](docs/superpowers/specs/README.md) | Actueel vs historisch |

## Netwerk-lab

Tab **Netwerk**: host, join, QR, echo — P2P testen zonder spel.
