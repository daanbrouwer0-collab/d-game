# Room chat open under game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep room chat open and visible under the game iframe during play; move the same chat root between lobby chrome and the playing panel.

**Architecture:** One `mountRoomChat` instance on `#room-chat-root`. A layout helper appends that root into `#room-chat-play-slot` while `#panel-playing` is active, otherwise back into `#room-chrome`. Mode stays `open` in both places. Sync/data unchanged (`room.chat_message`).

**Tech Stack:** Vanilla JS (ES modules), existing `room/main.js` + `room-chat.js`, CSS in `room/room.css`.

**Spec:** [2026-08-25-room-chat-during-play-design.md](../specs/2026-08-25-room-chat-during-play-design.md)

## Global Constraints

- Single chat instance — DOM-move `#room-chat-root`, do not remount.
- Chat stays in room shell — never inside game iframe.
- During play: mode **`open`** (no collapsed / badge / drawer).
- Lobby: chat remains in room-chrome, mode `open`.
- Do not edit `multi-game-netlify/`.
- Commits only when the user asks.

## File map

| File | Responsibility |
|------|----------------|
| `room/index.html` | Add `#room-chat-play-slot` under iframe |
| `room/main.js` | `placeRoomChat()` + `syncChatMode()` always open |
| `room/room.css` | Playing layout: iframe flex + open chat dock |
| `js/shell/room-chat.js` | Optional: hide toggle while play-docked via `data-dock` |
| `docs/p2p-multiplayer.md` | Chat UX note: open under game |
| `docs/superpowers/specs/2026-08-24-room-first-chat-design.md` | Point “tijdens spel” to new spec (A) |
| `docs/superpowers/specs/2026-08-25-room-chat-during-play-design.md` | Status → approved / implemented |

---

### Task 1: Markup slot + place chat during play

**Files:**
- Modify: `multi-game/room/index.html`
- Modify: `multi-game/room/main.js`
- Test: manual (lobby ↔ play) + console assert parent of `#room-chat-root`

**Interfaces:**
- Consumes: existing `roomChat`, `syncChatMode()`, `showPanel()`
- Produces: `placeRoomChat(playing: boolean)` — moves `#room-chat-root` between chrome and play slot

- [x] **Step 1: Add play slot in HTML**
- [x] **Step 2: Add `placeRoomChat` and call from `syncChatMode`**
- [x] **Step 3: Verify parent moves**

---

### Task 2: Playing layout CSS (iframe + open chat dock)

**Files:**
- Modify: `multi-game/room/room.css`
- Modify: `multi-game/js/shell/room-chat.js` (optional toggle hide when `data-dock="play"`)
- Test: visual — mobile + desktop viewport split

**Interfaces:**
- Consumes: `#room-chat-play-slot`, `#room-chat-root[data-dock="play"]`
- Produces: flex column so iframe shrinks; chat ~fixed open height

- [x] **Step 1: Dock styles**
- [x] **Step 2: Visual check**

---

### Task 3: Docs + spec status

**Files:**
- Modify: `multi-game/docs/p2p-multiplayer.md` (Room chat section)
- Modify: `multi-game/docs/superpowers/specs/2026-08-24-room-first-chat-design.md` (tijdens spel → A + link)
- Modify: `multi-game/docs/superpowers/specs/2026-08-25-room-chat-during-play-design.md` (status implemented)
- Modify: `multi-game/docs/superpowers/plans/README.md` if it lists plans

**Interfaces:**
- Consumes: implemented Task 1–2 behavior
- Produces: docs match UX A

- [x] **Step 1: Update p2p-multiplayer chat bullet**
- [x] **Step 2: Amend room-first chat design note**
- [x] **Step 3: Mark new spec implemented**

---

## Self-review

1. **Spec coverage:** open under iframe ✓ Task 1–2; lobby unchanged ✓; single instance DOM-move ✓; no iframe chat ✓; docs ✓ Task 3.
2. **Placeholders:** none.
3. **Consistency:** `placeRoomChat` / `data-dock` / `#room-chat-play-slot` names align across tasks.
