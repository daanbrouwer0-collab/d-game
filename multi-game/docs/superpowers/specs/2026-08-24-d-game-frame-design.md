# D-Game frame — design

Date: 2026-08-24  
Status: approved for implementation

## Goal

Static multi-game site (no app server, no DB) with one **Room API** for all games. Transports: **local** and **p2p** now; **matrix** later behind the same interface. No Single Device / Multi Device hub buttons — the player opens a game and either plays here or shares a link.

Product shell: `multi-game/`. Legacy content: `D_games/` (migrate gradually).

## Architecture

```
Game (rules + UI)
      ↓
js/core/room.js          createRoom({ gameId, transport, maxGuests })
      ↓
js/transport/{local,p2p,matrix}.js
      ↓
localStorage / sessionStorage (js/core/storage.js)
```

Games must not import PeerJS or Matrix. They only use `createRoom` / Room methods.

## Room API

`createRoom({ gameId, transport: 'local'|'p2p'|'matrix', maxGuests? })` returns a room with:

| Method / property | Behavior |
|-------------------|----------|
| `transport` | `'local' \| 'p2p' \| 'matrix'` |
| `gameId` | string |
| `role` | `'host' \| 'guest' \| null` |
| `roomCode` | string \| null (`LOCAL` for local) |
| `status` | idle / hosting / connecting / connected / disconnected / error |
| `host()` / `hostWithCode(code)` / `join(code)` / `reconnect()` / `destroy()` | lifecycle |
| `send` / `sendTo` / `broadcast` / `sendHello` / `sendWelcome` | messages |
| `isConnected()` / `guestCount()` | status helpers |
| `buildShareUrl` / `readRoomFromUrl` / `writeRoomToUrl` / `clearRoomFromUrl` | URL helpers (no-op / null for local share) |
| `onStatus` / `onMessage` / `onError` / `onGameMismatch` / `onPeerJoin` / `onPeerLeave` / `onRoomFull` | callbacks |

Envelope: same as `js/p2p/protocol.js` (`type`, `seq`, `payload`, `ts`).

### Implicit transport choice

| Player action | Transport |
|---------------|-----------|
| Speel hier / hotseat | `local` |
| Uitnodigen / `?room=` | `p2p` |
| Later: Matrix invite | `matrix` |

## Storage (`js/core/storage.js`)

- `displayName` (localStorage)
- optional character colors
- recent rooms (wraps existing room-memory keys)
- active room in sessionStorage

## Catalog (`js/core/catalog.js`)

Registry fields: `id`, `title`, `path`, `minPlayers`, `maxPlayers`, `blurb`, `tags`. No `mode` / `modes`.

## Folder layout

```
multi-game/
  index.html
  css/site.css
  js/core/{catalog,storage,room}.js
  js/transport/{local,p2p,matrix}.js
  js/p2p/                 # PeerJS Session (used only by transport/p2p.js)
  tic-tac-toe/
  ganzenbord/
```

Flat game folders + `?room=` URLs (unchanged from P2P design).

## Matrix stekker

`js/transport/matrix.js` exports the same class shape but throws `not implemented` until a later iteration. Future work can reuse ideas from `D_games/matrix-client.js` without changing game code.

## Migration

1. Frame + tic-tac-toe + ganzenbord on Room API.  
2. Port small turn-based titles from `D_games`.  
3. Hotseat boardgames via `local`, then P2P.  
4. Pure single-player: catalog entry + copy; Room optional.  
5. MD-* Matrix games only after real `matrix` transport.

## Out of scope (this iteration)

- Real Matrix login/rooms  
- Own PeerServer / TURN  
- Event-log / mesh sync  
- Full `D_games` hub rewrite  

## Success criteria

- Static serve of `multi-game/` works.  
- Homepage lists games without mode tabs.  
- Tic-tac-toe and ganzenbord support local and P2P.  
- New game = folder + catalog row + `createRoom`; no PeerJS in game code.  
- Matrix stub present.
