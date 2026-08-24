# D-Game sandbox shell — design

Date: 2026-08-24  
Status: approved for implementation

## Goal

Turn `multi-game/` into a **static multiplayer communication sandbox**: simple games, multiple transports (and later combinations), with an app shell of five tabs.

## Tabs

| Tab | Path | Role |
|-----|------|------|
| Games | `/` | Catalog of demo games |
| Lobby | `/lobby/` | Recent rooms from local memory |
| Friends | `/friends/` | Local friends list (CRUD) |
| Netwerk | `/netwerk/` | P2P lab (host, invite QR, scan-to-join, echo) |
| Geheugen | `/geheugen/` | Profile, counts, clear storage |

Shared nav: `js/shell/nav.js` injects a bottom tab bar (shell + game pages).

## Transports

| Id | Status | Notes |
|----|--------|-------|
| `local` | ready | Hotseat in games only — not on Netwerk tab |
| `p2p` | ready | PeerJS WebRTC; invite via deellink or QR scan |
| `qr` | internal | Event-log sync transport (Room API); not exposed on Netwerk |
| `matrix` | stub | Same Room API; not implemented |

Preferred transport in `js/core/prefs.js`: **P2P only** (`p2p`). Legacy `local`/`qr` prefs migrate to `p2p`.

## Netwerk tab (P2P-first)

- Host → room code + invite QR (`js/shell/qr-ui.js`) + copy link
- Join → code entry or camera scan (`js/shell/qr-scanner.js`, `js/shell/p2p-invite.js`)
- Connected → `lab_ping` / `lab_pong` echo test
- Matrix stub button proves expected failure

## QR in the product

**P2P invite QR** (scan link/code to join) is used in Netwerk and games.  
**QR event-sync** (`js/sync/event-log.js`, `js/transport/qr.js`) remains in the Room API for future use but is not a Netwerk lab mode.

## Out of scope

Bluetooth, real Matrix login, full `D_games` migration, mesh gossip.
