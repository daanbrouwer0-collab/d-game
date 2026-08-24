# Multi-game P2P static site — design

Date: 2026-08-23  
Status: approved for planning

## Goal

Reusable WebRTC P2P layer for multiple browser games on a **static site** (no database), hosted later at `www.d-game.nl`. First game remains tic-tac-toe. Hosts share a WhatsApp-friendly link that includes the room code so guests join in one tap.

## Constraints

- Static hosting only (HTML/JS/CSS files). No backend app, no DB.
- PeerJS public cloud for signaling (optional own PeerServer later; URLs unchanged).
- Plain JS modules, no bundler required.
- Host tab must stay open (or reconnect with same code); room existence is not stored on a server.

## URL model (chosen)

Physical folders per game + `?room=` query:

- Home: `https://www.d-game.nl/`
- Game: `https://www.d-game.nl/tic-tac-toe/`
- Invite: `https://www.d-game.nl/tic-tac-toe/?room=AB7K2M`

Local equivalent: `http://localhost:8080/tic-tac-toe/?room=AB7K2M`.

Rejected alternatives: hash-routing SPA; single homepage with `?game=` for all titles.

## Architecture

```
/
  index.html                 # game picker
  css/site.css               # shared site styles (optional)
  js/p2p/
    net.js                   # PeerJS host/join/reconnect/send
    protocol.js              # message envelope
    session.js               # share URLs, room-from-URL, handshake transport
  tic-tac-toe/
    index.html
    main.js
    game.js                  # pure rules (rename from games/tic-tac-toe.js)
    ui.js
    styles.css               # or reuse shared CSS
```

### Layer responsibilities

| Layer | Does | Does not |
|-------|------|----------|
| `js/p2p/*` | peers, room code, connection status, send/receive, share URL helpers, hello/welcome/ping | board rules, marks, win detection, game UI |
| `tic-tac-toe/*` | rules, UI, move/state/restart semantics | PeerJS wiring details |
| `/` homepage | links to games | networking |

### Authority

Host is authoritative: validates actions, broadcasts `state`. Guest proposes actions (e.g. `move`). Prevents desync without a server.

## Session API

`js/p2p/session.js` wraps net + protocol:

- `host()` → `Promise<code>`
- `join(code)` → `Promise<void>`
- `reconnect()`
- `send(type, payload)` / raw message helpers
- `destroy()`
- `onStatus(cb)` — `idle` \| `hosting` \| `connecting` \| `connected` \| `disconnected` \| `error`
- `onMessage(cb)` — parsed `{ type, seq, payload }`
- `buildShareUrl(gamePath, code)` — absolute URL with `?room=`
- `readRoomFromUrl()` — `string | null`

Transport-level messages: `hello`, `welcome`, `ping`, `pong`.  
Game-level messages (tic-tac-toe): `move`, `state`, `restart`. Unknown types ignored.

`hello` / `welcome` include `gameId` (e.g. `"tic-tac-toe"`). Mismatch → clear error, no play.

## Share / WhatsApp flow

1. Host creates room → UI shows code + **Copy link** + **Share** (Web Share API when available; else clipboard).
2. Share text example: `Speel tic-tac-toe met me: https://www.d-game.nl/tic-tac-toe/?room=AB7K2M`
3. Guest opens link → page reads `?room=` → auto-join.
4. If host offline / bad code → error + manual join / retry. Short copy explains host must have the tab open.

`origin` for share URLs comes from `window.location.origin` so local and production both work without hardcoding (optional config override for preview domains later).

## Adding a new game

1. Create `/my-game/` with `index.html`, `main.js`, `game.js`, `ui.js`.
2. Import `../js/p2p/session.js` (adjust relative path).
3. On load: if `readRoomFromUrl()` then auto-join; else lobby.
4. After host: show `buildShareUrl('/my-game/', code)` and share controls.
5. Add link on homepage.
6. Use unique `gameId` in handshake.

No changes to `net.js` required for a new turn-based 1v1 game that fits host-authority + state broadcast.

## Robustness

- Connection status visible in UI.
- Reconnect with same room code; host re-sends `welcome` + latest `state`.
- Invalid moves rejected by host; guests wait for `state`.
- Only one guest connection at a time for v1 (extra connections closed).

## Migration from current layout

Move current root tic-tac-toe app into `/tic-tac-toe/`. Extract generic pieces into `js/p2p/`. Add root homepage. Keep PeerJS CDN. Update README for folder URLs and share links.

## Out of scope (this iteration)

- Building a second game
- Own PeerServer / TURN
- Accounts, matchmaking, chat, voice
- More than 2 players

## Success criteria

- Static site serves home + `/tic-tac-toe/` with no backend.
- Host can copy/share invite URL; guest auto-joins via `?room=`.
- Tic-tac-toe playable to win/draw over P2P.
- Disconnect visible; reconnect/rejoin works.
- New game can be added as a new folder using `js/p2p` without rewriting the network layer.
