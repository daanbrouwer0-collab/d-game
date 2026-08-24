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

Spellen praten niet rechtstreeks met PeerJS in de UI. Ze gebruiken een gemeenschappelijke **Room API** en optioneel een **event-log** (host-authoritative state).

### Transporten

`createRoom({ gameId, transport, maxGuests })` in `multi-game/js/core/room.js`:

| `transport` | Gebruik |
|-------------|---------|
| **`p2p`** | PeerJS WebRTC. Host opent een room; gasten joinen via kamercode / QR / deellink (`?room=CODE`). |
| **`local`** | Hotseat op één apparaat (geen netwerk). |
| **`qr`** | Event-log sync via QR (zwaarder; lab/legacy). |
| **`matrix`** | Stub / later. |

Voorkeur-transport voor “echte” multiplayer: **P2P**.

### Typische P2P-flow

1. Speler kiest **Maak room + toon QR** (host) of **Join** / scan QR (gast).
2. Host krijgt een PeerJS-id; de **kamercode** en share-URL (`#<game>/index.html?room=…`) worden getoond.
3. Gast opent die URL (of typt de code). De shell laadt het spel; het spel leest `room` uit de hash-query.
4. Handshake: `hello` / `welcome` met **`gameId`** (bijv. `"ganzenbord"`). Verkeerd spel → duidelijke fout, geen gemengde state.
5. Verdere berichten zijn game-specifiek (`roll`, `start`, …) of log-sync (`LOG` / event-log packet).

### Host + event-log (ganzenbord e.d.)

Voor lobby-spellen met meerdere zetten:

- De **host** is authoritative: rolls/starts worden op de host toegepast en als events in een **append-only log** gezet.
- Die log wordt naar peers gebroadcast / gemerged (`js/sync/event-log.js`).
- State = **replay van de log** (niet “laatste snapshot wint”). Zo blijven stoelen en voortgang stabiel bij reconnect / late join.
- Desk / “recente rooms” op het apparaat onthouden code + rol; openen gaat weer via de hash-shell (`navigateInShell`), niet via jsDelivr-`<base>` links.

### Wat P2P wél en niet is

- **Wel:** browser-to-browser via PeerJS-broker + WebRTC data channels; deellink/QR; host mag tabblad open houden.
- **Niet:** centrale gameserver die zetten bewaart; geen account-database in deze sandbox.
- Offline host → gasten kunnen niet doorzetten tot er weer een host is (of iemand host overneemt, waar het spel dat ondersteunt).

### Belangrijke bestanden

```
multi-game/js/core/room.js       createRoom / transportFromUrl
multi-game/js/transport/p2p.js   PeerJS-transport
multi-game/js/p2p/session.js     share-URL, hello/welcome, ping
multi-game/js/sync/event-log.js  append-only keten + merge
multi-game/js/shell/site-url.js  hash-shell navigatie, share-URL’s, QR-safe clicks
multi-game/<spel>/               game.js (regels) · room.js · main.js · ui.js
```

Test P2P zonder volledig spel: tab **Netwerk** (`#netwerk/index.html`) — host, join, echo.

---

## Lokaal werken

```bash
cd multi-game
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).  
Meer detail over tabs en spellen: [multi-game/README.md](multi-game/README.md).

## Design-docs

Onder `multi-game/docs/superpowers/specs/` (frame, sandbox shell, P2P event-log, enz.).
