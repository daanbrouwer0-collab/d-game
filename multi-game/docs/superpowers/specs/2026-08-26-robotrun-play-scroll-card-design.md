# RobotRun room play scroll card + replay placement — design

Datum: 2026-08-26  
Status: **geïmplementeerd** — plan: [../plans/2026-08-26-robotrun-play-scroll-card.md](../plans/2026-08-26-robotrun-play-scroll-card.md)  
Scope: `multi-game/room/` + `multi-game/robotrun/`  
Voortbouwt op: room chat during play (open onder iframe)

---

## Doel

1. **Eén speelkaart:** spel (iframe) + room chat in dezelfde scrollflow; chat scrollt mee (niet sticky vast onderaan de viewport).
2. **Scroll:** omhoog/omlaag ook als de vinger op het bord ligt.
3. **Replay:** niet meer bij tik op het bord; knop vast **onder Power Down**.
4. **← Lobby** weg uit de playing-bar (Stop / Verlaat game blijven).

---

## UX

```
┌─────────────────────────────┐  ← één scrollbare speelkaart (room)
│ [Stop]                      │  playing-bar (geen ← Lobby)
├─────────────────────────────┤
│  RobotRun iframe            │  hoogte = inhoud (bord + UI)
│  … bord …                   │
│  … registers / kaarten …    │
│  Power Down                 │
│  Replay                     │  ← onder Power Down; geen board-tap
│  Verlaat game (optioneel)   │
├─────────────────────────────┤
│  Chat (open)                │  mee in dezelfde scroll
└─────────────────────────────┘
```

---

## Aanpak (keuze 1)

### Room shell
- `#panel-playing`: één kolom, `overflow-y: auto` (de speelkaart scrollt).
- Iframe: niet meer `flex: 1` die de viewport vult met interne scroll; hoogte volgt van content via **resize bridge** (`postMessage` content height → parent zet `iframe.style.height`).
- Chat-slot blijft onder de iframe in de flow (`#room-chat-play-slot`).
- Verberg `#btn-leave-game` (← Lobby) tijdens play (CSS en/of HTML/JS).

### RobotRun iframe
- Canvas / board: `touch-action: pan-y` (of equivalent) zodat verticale pan naar page-scroll gaat; geen `touch-action: none` op het bord.
- Interne page-scroll minimaliseren als de room de scroll owner is; content mag groeien.
- Verwijder board-tap → replay prompt (`onBoardTap` / overlay op canvas).
- Zet `#btn-board-replay` (of nieuwe knop) in `#programming-panel` **onder** `#btn-power-down`; toon alleen als er een `lastRoundReplay` is.

### Non-goals
- Chat in iframe (aparte bridge)
- Stop-knop of Verlaat game verwijderen
- Wijziging chat sync (`room.chat_message`)

---

## Success criteria

1. Scrollen op het bord beweegt de speelkaart (bord + chat mee).
2. Chat zit visueel onder het spel op dezelfde kaart, niet vastgeplakt los van de content.
3. Tik op bord toont geen Replay; Replay staat onder Power Down wanneer beschikbaar.
4. ← Lobby is weg; Stop blijft voor de host.

---

## Beslissingen

| Onderwerp | Keuze |
|-----------|-------|
| Chat + spel | Eén room-scrollkaart; iframe height sync |
| Lobby-knop | Alleen **← Lobby** weg (A) |
| Replay | Vast onder Power Down |
