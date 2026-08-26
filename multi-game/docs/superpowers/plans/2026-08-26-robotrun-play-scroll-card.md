# RobotRun play scroll card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline.

**Goal:** One scrollable room play card (game + chat), board-finger scroll, Replay under Power Down, remove ← Lobby.

**Architecture:** Room `#panel-playing` owns vertical scroll. RobotRun posts content height; room sets iframe height. Chat stays under iframe in flow. Canvas `touch-action: pan-y`. Replay button relocated; board-tap replay removed.

**Tech Stack:** Vanilla JS, postMessage bridge, CSS.

**Spec:** [2026-08-26-robotrun-play-scroll-card-design.md](../specs/2026-08-26-robotrun-play-scroll-card-design.md)

## Global Constraints

- Commits only when user asks.
- Do not remove Stop or Verlaat game.
- Chat data path unchanged (`room.chat_message`).

## Tasks

### Task 1: Room scroll card + hide Lobby + iframe height
- Modify `room/index.html`, `room/room.css`, `room/main.js`, `js/bridge/game-bridge.js` or room listener
- Iframe height from game `dgame:content-height` (or existing pattern)
- `#btn-leave-game` hidden; panel scrolls; chat in flow

### Task 2: RobotRun touch scroll + height report
- Modify `robotrun/css/board.css`, `embedded.css`, `robotrally-ui.js` / `embedded.js`
- `touch-action: pan-y` on canvas; report height to parent

### Task 3: Replay under Power Down, no board tap
- Modify `robotrun/index.html`, `robotrally-ui.js`, CSS
- Remove onBoardTap replay prompt; show Replay under Power Down when replay exists

### Task 4: Docs status
- Mark spec implemented; plans README if needed
