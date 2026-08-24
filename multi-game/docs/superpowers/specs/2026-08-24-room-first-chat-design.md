# Room-first UX + room chat — design spec

Datum: 2026-08-24  
Status: **geïmplementeerd** — plan: [../plans/2026-08-24-room-first-chat.md](../plans/2026-08-24-room-first-chat.md)  
Scope: `multi-game/` — room shell, navigatie, chat, P2P/log  
Voortbouwt op: [2026-08-24-game-agnostic-rooms-design.md](./2026-08-24-game-agnostic-rooms-design.md)

---

## Doel

1. **Room-first:** de site wordt ervaren vanuit de room — groep, roster, chat en spelkeuze horen bij één context (`#room/?room=CODE`).
2. **Room chat:** tekstberichten tussen spelers, gesynchroniseerd via P2P, zichtbaar over meerdere spelrondes heen.
3. **Chat tijdens spel (keuze C):** chat is **ingeklapt** tijdens een actieve spelronde; een **badge** toont ongelezen berichten. In lobby/stem-fase staat chat **open**.

---

## UX — room als hub

### Navigatiemodel

| Context | Gedrag |
|---------|--------|
| Geen actieve room | Home → start/join room; spellen alleen voor solo/hotseat |
| Actieve room (`sessionStorage`) | Home toont “Ga verder in room **CODE**” |
| In room (`room/`) | Shell-nav waarschuwt bij verlaten: “Room verlaten?” — P2P valt anders weg |
| Legacy `#tic-tac-toe/?room=` | Blijft werken; niet gepromoot in UI |

### Room chrome (altijd zichtbaar in room)

```
┌────────────────────────────────────────────────────────────┐
│ Room AB7K2M · verbonden · 3/6                              │
├────────────────────────────────────────────────────────────┤
│ Roster: [Alice (jij)] [Bob · host] [Carol]                 │
├───────────────────────────────────────┬────────────────────┤
│                                       │ 💬 Chat (3)  [▼]   │  ← ingeklapt + badge
│  Lobby: stemkaarten                   │                    │
│  of                                   │                    │
│  Game iframe                          │                    │
└───────────────────────────────────────┴────────────────────┘
```

**Lobby / stemmen:** chat-panel **open** (standaard), volle hoogte naast of onder roster.

**Tijdens spel:** chat-panel **ingeklapt** tot één regel (“💬 Chat” + badge). Klik opent drawer/expand boven het spel (overlay of slide-in), zonder iframe te unmounten.

**Na session_end:** chat blijft; panel keert terug naar **open** in lobby.

### Chat UI states

| State | Wanneer | Weergave |
|-------|---------|----------|
| `open` | Geen `activeSession` | Berichten + invoerveld zichtbaar |
| `collapsed` | `activeSession` actief | Alleen header + badge |
| `expanded` | Speler opent chat tijdens spel | Overlay/drawer met berichten + invoer |

**Badge:** aantal berichten ontvangen sinds laatste keer dat chat open was (`lastReadSeq` lokaal, niet in log).

**Auto-collapse:** bij `session_start` → `collapsed`. Bij `session_end` → `open`, badge reset.

---

## Data — room chat in room-log

### Principe

Chat hoort bij **room-niveau**, niet bij session/game logs. Zelfde host-authority als stemmen en leden.

```
Room log (__room__)
  ├ room.member_join
  ├ room.game_vote
  ├ room.chat_message      ← nieuw
  ├ room.session_start
  └ room.session_end

Session log (tic-tac-toe / …)
  └ alleen game events — geen chat
```

### Nieuw event type

| Type | Payload |
|------|---------|
| `room.chat_message` | `{ messageId, playerId, name, text, ts }` |

- `messageId`: uniek id (host genereert bij commit: `m_${seq}` of uuid)
- `text`: plain text, max 500 tekens (host trim/reject)
- `ts`: ISO string of ms (host timestamp bij commit)
- **Geen** edit/delete in v1 (YAGNI)

### Replay

`replayRoom(log)` uitbreiden:

```js
// returns { …, chat: ChatMessage[], chatSeq: number }
```

- `chat`: alle `room.chat_message` events in volgorde
- **Live UI trim:** toon laatste **100** berichten; oudere events blijven in desk/log voor geschiedenis
- Chat wordt **niet** gewist bij `session_start` / `session_end` (anders dan stemmen)

### Host commit

```js
roomHost.postChat(log, { playerId, name, text })
// → commit room.chat_message
```

Validatie (host):
- `text` niet leeg na trim
- lengte ≤ 500
- rate limit: max **10 berichten / 60s** per `playerId` (host-side sliding window)
- reject → `ROOM_REJECT` `{ kind: 'chat', reason }` (optioneel; anders stil negeren)

---

## P2P — berichtenflow

Topologie **ongewijzigd**: star, host = autoriteit, PeerJS in `room/main.js`.

### Gast stuurt chat

```
Gast → ROOM_INTENT { kind: 'chat', playerId, text }
Host → commit room.chat_message
Host → broadcast ROOM_LOG (fromSeq)
Allen → replayRoom → UI update
```

Zelfde pad als `kind: 'game_vote'`.

### Host stuurt chat

Host commit lokaal + broadcast — geen intent nodig.

### Reconnect / late join

`WELCOME` bevat volledige room-log (inclusief chat). Gast ziet historie direct.

### Wat chat **niet** doet

- Geen berichten via game bridge / iframe
- Geen `SESSION_INTENT` / session-log
- Geen ephemeral direct-to-peer (geen dubbele waarheid)
- Geen wijziging PeerJS topologie

---

## Game data — grenzen

| Vraag | Antwoord |
|-------|----------|
| Chat in session-log? | **Nee** |
| Game events in room-log? | **Nee** (ongewijzigd) |
| Chat beïnvloedt replayTtt/GB/RR? | **Nee** |
| Session lifecycle | Chat doorloopt `session_start` / `session_end` |
| Embedded spel | Geen chat-awareness; shell owns chat UI |
| Desk | Zelfde key `p2p:room:{CODE}`; log groeit met chat events |

---

## Room-first site-wijzigingen

### Home (`index.html`)

- Als `loadActiveRoom()` → banner: “Je zit in room **CODE** — [Ga verder]”
- Game-lijst: blurb “Multiplayer via room” i.p.v. per-spel P2P hints
- Primaire CTA blijft “Start / join room”

### Shell-nav (`nav.js`)

- Functie `guardRoomNavigation(onLeave)` — bij actieve room + P2P connected: confirm dialog
- Optioneel: tab “Room” i.p.v. alleen lobby strip wanneer in room shell

### Room strip / desk

- Room cards tonen laatste chat-snippet in summary (optioneel, YAGNI fase 2)
- `isRoomShell: true` blijft leidend voor navigatie naar `#room/?room=`

---

## Componenten (nieuw / uitbreiding)

| Module | Rol |
|--------|-----|
| `js/sync/room-log.js` | `RoomEvent.CHAT_MESSAGE`, `replayRoom` → `chat[]` |
| `js/sync/room-host.js` | `postChat(log, opts)` + rate limit helper |
| `js/shell/room-roster.js` | Bestaand — roster bar |
| `js/shell/room-chat.js` | **Nieuw** — render chat, collapse/expand, badge, send |
| `room/main.js` | Wire chat, `ROOM_INTENT` chat, panel states |
| `room/room.css` | Chat drawer, collapsed header, badge |

---

## Foutafhandeling

| Situatie | Gedrag |
|----------|--------|
| Gast stuurt te snel | Host negeert; optioneel reject toast |
| Tekst te lang | Host truncate of reject |
| Host offline | Geen nieuwe chat (bestaand P2P gedrag) |
| Log adopt conflict | Bestaande `adoptHostPacket` — chat events idempotent op seq |
| Speler leave | Berichten blijven; naam uit roster weg |

---

## Tests

- `room-log.test.js`: chat events in replay, niet gewist bij session start/end
- `room-host.test.js`: postChat commit, rate limit reject
- Handmatig: chat lobby → start spel → collapse + badge → expand → berichten zichtbaar → session end → open

---

## Niet in scope (YAGNI)

- Rich text, emoji picker, afbeeldingen
- Chat edit/delete
- Privéberichten (DM)
- Push-notifications buiten tab
- Shared Worker voor P2P over tabs
- Chat in legacy per-spel P2P

---

## Implementatie-volgorde (voor plan)

1. Log + host: `CHAT_MESSAGE`, `postChat`, tests
2. `room-chat.js` UI component (open/collapsed/expanded + badge)
3. Wire in `room/main.js` (intent, sync, session lifecycle hooks)
4. Room-first home + nav guard
5. Docs: `p2p-multiplayer.md`, `speler-handleiding.md`

---

## Beslissingen (vastgelegd)

| Onderwerp | Keuze |
|-----------|-------|
| Chat opslag | Room-log event `room.chat_message` |
| Sync | Host commit + `ROOM_LOG` (zelfde als stemmen) |
| Tijdens spel | **C — ingeklapt + badge** |
| Lobby | Chat open |
| Game data | Onaangeroerd; session logs puur |
| P2P topologie | Ongewijzigd |
