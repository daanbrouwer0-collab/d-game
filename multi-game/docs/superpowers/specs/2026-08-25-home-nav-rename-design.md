# Home + nav rename — design

**Date:** 2026-08-25  
**Status:** approved  
**Approach:** UI-rename only (paths unchanged)

## Goal

Simplify the home page and bottom navigation for D-Game: clear brand, one multiplayer entry, single-device games below, three nav tabs.

## Home (`multi-game/index.html`)

Top to bottom:

1. Title: **D-Game** only
2. Tagline (exact copy): `geen acount geen server wel multi player games`
3. Card/button **Multi Player** → link to `lobby/`
4. Existing single-device game cards (hotseat/solo links from catalog)

Remove from home:

- “Room” panel / Start–join room / handleiding CTA
- “Mijn rooms” section
- pref-hint and room-continue banner
- `mountRoomStrip` (room strip between content and nav)

## Bottom nav (`js/shell/nav.js`)

Three tabs only:

| Visible label | Path (unchanged) | Internal id (may keep) |
|---------------|------------------|------------------------|
| Home | `index.html` / `./` | `games` |
| Rooms | `lobby/` | `lobby` |
| Me | `geheugen/` | `geheugen` |

Remove from nav: Friends, Netwerk.

Stop calling `mountRoomStrip` on all pages that currently use it (home, lobby, room, …). Function may remain in code unused, or callers removed only.

Friends page may remain on disk but is not linked from nav.

## Rooms page (`lobby/`)

- Visible title/header: **Rooms** (was Lobby)
- Content unchanged: recent rooms list, open/host
- Active nav tab: Rooms

## Me page (`geheugen/`)

- Visible title/header: **Me** (was Geheugen)
- Existing content kept (stats, profile, clear data)
- Add section/button **Netwerk** linking to `netwerk/`
- Netwerk page itself unchanged; only reachable via Me (and direct URL)

## Out of scope

- Renaming folders (`lobby/` → `rooms/`, etc.)
- Deleting friends/netwerk pages
- Changing P2P / room / game logic
- Hash-shell routing beyond tab labels/hrefs already driven by `mountShellNav`

## Success criteria

- Home shows brand, tagline, Multi Player → lobby, then solo game cards
- No room strip anywhere
- Nav shows Home / Rooms / Me only
- Lobby page reads as Rooms; Geheugen page reads as Me with Netwerk link
