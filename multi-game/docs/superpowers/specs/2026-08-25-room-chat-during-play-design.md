# Room chat open onder het spel — design spec

Datum: 2026-08-25  
Status: **geïmplementeerd** — plan: [../plans/2026-08-25-room-chat-during-play.md](../plans/2026-08-25-room-chat-during-play.md)  
Scope: `multi-game/room/` + `js/shell/room-chat.js`  
Wijzigt: [2026-08-24-room-first-chat-design.md](./2026-08-24-room-first-chat-design.md) (chat tijdens spel: C → A)

---

## Doel

Tijdens een actieve game-session blijft de **room chat open en zichtbaar onderaan**, onder de game-iframe: berichtenlijst + invoerveld. Geen collapse/badge meer nodig tijdens spelen.

Lobby/stemmen blijft zoals nu: chat open in room-chrome (bij roster).

---

## UX

### Tijdens spel (`#panel-playing` zichtbaar)

```
┌─────────────────────────────┐
│ ← Lobby          [Stop]     │  playing-bar
├─────────────────────────────┤
│                             │
│      game iframe            │  flex: 1 (rest van viewport)
│                             │
├─────────────────────────────┤
│ Chat                        │
│ [berichten…]                │  vast open (~25–35% / max ~12rem messages)
│ [Bericht…]        [Stuur]   │
└─────────────────────────────┘
```

- Chat is **mode `open`** (niet collapsed / expanded drawer).
- Toggle-knop mag verborgen of neutraal blijven (geen collapse-gedrag tijdens play).
- Roster/header/shell-nav blijven verborgen tijdens play (ongewijzigd).

### Lobby

Ongewijzigd: chat in `#room-chrome` naast/onder roster, mode `open`.

### Transitie

| Event | Chat-locatie | Mode |
|-------|--------------|------|
| Lobby / stemmen | `#room-chrome` → `#room-chat-root` | `open` |
| Session start / playing | `#panel-playing` onder iframe | `open` |
| Session end → lobby | terug naar `#room-chrome` | `open` |

Eén chat-instance (`mountRoomChat`); DOM-node verhuizen, niet opnieuw mounten (behoudt berichten/scroll/input).

---

## Aanpak (keuze 1)

1. In `room/index.html`: vaste slot `#room-chat-play-slot` onder `#game-frame` in `#panel-playing`.
2. In `syncChatMode` / layout-helper: als playing → append `#room-chat-root` in play-slot; anders terug in chrome.
3. CSS: playing-layout flex column; iframe `flex: 1; min-height: 0`; chat-root `flex-shrink: 0` met begrensde message-hoogte.
4. `syncChatMode`: altijd `open` tijdens play (vervang collapsed).
5. Docs: `p2p-multiplayer.md` + oude chat-spec “tijdens spel = C” bijwerken naar A.

---

## Non-goals

- Chat in game-iframe (RobotRun e.d.)
- Tweede chat-instance / aparte sync
- Collapse/badge/drawer tijdens play
- Wijziging aan `room.chat_message` / host authority

---

## Success criteria

1. In lobby: chat zichtbaar bij roster, berichten syncen.
2. Na start spel: chat zichtbaar **onder** iframe, open, sturen werkt.
3. Nieuwe berichten scrollen bij; geen duplicate UI.
4. Na terug naar lobby: chat weer in chrome, historie intact.
5. Mobiel: spel + chat delen viewport zonder dat chat de hele iframe bedekt.

---

## Beslissingen

| Onderwerp | Keuze |
|-----------|-------|
| Tijdens spel | **A — open onder iframe** |
| Implementatie | DOM-move van bestaande `#room-chat-root` |
| Data/sync | Ongewijzigd (`room.chat_message`) |
