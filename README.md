# D-Game

Multiplayer sandbox: statische games, geen backend-database. Productie:
[https://www.d-game.nl](https://www.d-game.nl/#index.html)

## Mapstructuur (belangrijk)

| Map / bestand | Rol |
|---------------|-----|
| **`multi-game-netlify/`** | **Alleen de Netlify-router.** Dunne shell die op Netlify staat. Laadt game-HTML/JS/CSS vanaf GitHub (jsDelivr). **Niet gebruiken voor spelcode of features.** Alleen wijzigen als de router zelf moet veranderen (repo-pad, branch, hash-routing). |
| **`multi-game/`** | **De echte site en spellen.** Dit is wat je pusht naar GitHub; productie pakt het vanaf daar. Hier horen games, P2P, CSS, shell-helpers. |
| **`index.html`** (repo-root) | Kopie / spiegel van dezelfde hash-shell (zelfde idee als `multi-game-netlify/`). Productie-deploy is de Netlify-map. |
| **`D_games/`** | Oudere / aparte experimenten — niet het d-game.nl hash-shell pad. |

**Regel:** features, bugs in spellen, P2P, UI → altijd in `multi-game/`.  
`multi-game-netlify/` blijft een stabiele router naar GitHub.

---

## Netlify-index als router

`multi-game-netlify/` wordt **eenmalig** (of zelden) op Netlify gezet. Daarna:

1. Bezoeker opent `https://www.d-game.nl/` → Netlify serveert `multi-game-netlify/index.html`.
2. Die pagina is een **hash-shell**: hij leest `location.hash` (bijv. `#ganzenbord/index.html?room=AB7K2M`).
3. De shell haalt de bijbehorende pagina op via **jsDelivr** uit de GitHub-repo:

   `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<sha|main>/multi-game/<pad>`

4. De HTML wordt in een **iframe (`srcdoc`)** gezet, met `<base href="…cdn…/multi-game/…">` zodat relative assets (CSS/JS) vanaf GitHub laden.
5. `_redirects` stuurt alle paden naar die ene `index.html` (SPA-fallback). Games zitten **niet** in Netlify-paden, maar in de **hash**.

```
Browser  →  Netlify (multi-game-netlify/index.html)
                ↓  hash: #ganzenbord/index.html?room=…
             jsDelivr / GitHub  →  multi-game/ganzenbord/…
                ↓
             iframe toont het spel
```

### Gevolgen voor ontwikkelen

- **Push naar `main`** → jsDelivr volgt (na cache) de nieuwe commit → site update **zonder** Netlify opnieuw te uploaden.
- Wijzigingen alleen in `multi-game-netlify/` raken de live site pas na opnieuw deployen van die map op Netlify.
- Deellinks / QR gebruiken altijd hash-URL’s, bijvoorbeeld:

  `https://www.d-game.nl/#ganzenbord/index.html?room=AB7K2M`

Lokaal (zonder shell): `cd multi-game && python3 -m http.server 8080` — dan werken path-URL’s (`/ganzenbord/?room=…`).

Config in de shell (niet lichtzinnig wijzigen): `repo`, `branch`, `subpath: "multi-game"`.

---

## P2P in games

Spellen praten niet rechtstreeks met PeerJS in de UI. Ze gebruiken een **Room API**, een **event-log** (host-authoritative), en sinds 2026-08-24 een **room shell** voor game-agnostische multiplayer.

**Documentatie (start):** [`multi-game/docs/README.md`](multi-game/docs/README.md)

| Doc | Voor wie |
|-----|----------|
| [`speler-handleiding.md`](multi-game/docs/speler-handleiding.md) | Spelers |
| [`p2p-multiplayer.md`](multi-game/docs/p2p-multiplayer.md) | Ontwikkelaars |
| [`multiplayer-bouwregels.md`](multi-game/docs/multiplayer-bouwregels.md) | Nieuw spel |
| [`p2p-kritisch-rapport.md`](multi-game/docs/p2p-kritisch-rapport.md) | Audit / P0–P3 |

### Multiplayer-paden

| Pad | URL | Beschrijving |
|-----|-----|--------------|
| **Room shell (voorkeur)** | `#room/?room=CODE` | Eén link per groep; host kiest spel; P2P blijft open |
| **Legacy per spel** | `#tic-tac-toe/?room=CODE` | Oud: P2P + log per spel in de game-lobby |
| **Hotseat** | Spel → “Op dit apparaat” | Geen netwerk |

Deellink voorbeeld (room):  
`https://www.d-game.nl/#room/?room=AB7K2M`

### Transporten

`createRoom({ gameId, transport, maxGuests })` — legacy per spel.  
`createRoomSession({ maxGuests: 5 })` — room shell.

| `transport` | Gebruik |
|-------------|---------|
| **`p2p`** | PeerJS WebRTC (ster: host + gasten) |
| **`local`** | Hotseat op één apparaat |
| **`qr`** | Log via QR (lab) |
| **`matrix`** | Stub |

### Log (twee lagen in room shell)

| Laag | Key | Inhoud |
|------|-----|--------|
| Room | `p2p:room:CODE` | Leden, welk spel actief |
| Session | `p2p:session:CODE:sid:gameId` | Zetten, worpen, … → `replay(log)` |
| Legacy | `p2p:gameId:CODE` | Standalone per-spel P2P |

Host append events; gasten **adoptHostPacket** + replay. Stoelen = **`playerId`** in localStorage.

### Wat P2P wél en niet is

- **Wel:** browser-to-browser; één deellink per avond (room); host-tab open houden
- **Niet:** gameserver; accounts; anti-cheat tegen kwaadaardige host

### Belangrijke bestanden

```
multi-game/room/                 Room shell (voorkeur multiplayer)
multi-game/js/p2p/room-session.js
multi-game/js/sync/room-log.js
multi-game/js/sync/event-log.js
multi-game/js/bridge/
multi-game/js/core/room.js       createRoomSession + createRoom
multi-game/js/shell/site-url.js
multi-game/<spel>/embedded.js    Spel in room-iframe
```

Test P2P zonder spel: tab **Netwerk** (`#netwerk/index.html`).

---

## Lokaal werken

```bash
cd multi-game
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).  
Meer detail over tabs en spellen: [multi-game/README.md](multi-game/README.md).

## Design-docs

- **Index:** [`multi-game/docs/README.md`](multi-game/docs/README.md)
- **Spelers:** [`multi-game/docs/speler-handleiding.md`](multi-game/docs/speler-handleiding.md)
- **P2P werking:** [`multi-game/docs/p2p-multiplayer.md`](multi-game/docs/p2p-multiplayer.md)
- **Bouwregels:** [`multi-game/docs/multiplayer-bouwregels.md`](multi-game/docs/multiplayer-bouwregels.md)
- **Kritisch rapport:** [`multi-game/docs/p2p-kritisch-rapport.md`](multi-game/docs/p2p-kritisch-rapport.md)
- Specs (actueel vs historisch): [`multi-game/docs/superpowers/specs/README.md`](multi-game/docs/superpowers/specs/README.md)
