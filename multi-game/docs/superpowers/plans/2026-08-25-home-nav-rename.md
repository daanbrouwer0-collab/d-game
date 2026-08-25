# Home + nav rename Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restructure home page and rename bottom nav to Home / Rooms / Me; put Netwerk behind Me.

**Architecture:** UI-only. Keep URL paths (`lobby/`, `geheugen/`, `netwerk/`). Change labels, home markup, remove room-strip callers, add Netwerk link on Me.

**Tech Stack:** Static HTML + ES modules in `multi-game/`, shared `js/shell/nav.js`, `css/site.css`.

## Global Constraints

- Tagline exact: `geen acount geen server wel multi player games`
- Paths unchanged; labels only
- No Friends / Netwerk in bottom nav
- No `mountRoomStrip` calls

---

### Task 1: Bottom nav labels + tabs

**Files:** `multi-game/js/shell/nav.js`

- [ ] Tabs array: only Home (`games`), Rooms (`lobby`), Me (`geheugen`)
- [ ] Labels: Home / Rooms / Me
- [ ] Keep `TAB_PATHS` entries for removed tabs if needed for deep links, or trim to three
- [ ] Leave `mountRoomStrip` exported but unused (or keep as-is)

### Task 2: Home page

**Files:** `multi-game/index.html`

- [ ] Header: brand D-Game + new tagline
- [ ] Multi Player card → `lobby/`
- [ ] Keep game list (hotseat/solo only)
- [ ] Remove Room panel, Mijn rooms, pref-hint, continue banner, room-strip mount
- [ ] Simplify script imports

### Task 3: Rooms + Me pages

**Files:** `multi-game/lobby/index.html`, `multi-game/lobby/main.js`, `multi-game/geheugen/index.html`, `multi-game/room/main.js`

- [ ] Lobby title → Rooms; drop `mountRoomStrip`
- [ ] Geheugen title → Me; add Netwerk link section → `../netwerk/`
- [ ] Room page: drop `mountRoomStrip` import/call

### Task 4: Verify

- [ ] Spot-check home / lobby / geheugen / nav in browser or by reading markup
- [ ] Commit implementation
