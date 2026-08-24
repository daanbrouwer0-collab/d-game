# D-Game — documentatie

**Laatst bijgewerkt:** 2026-08-24

---

## Waar begin je?

| Wie | Document |
|-----|----------|
| **Spelers (web)** | [handleiding/index.html](../handleiding/index.html) · [speler-handleiding.md](./speler-handleiding.md) (volledig) |
| **Ontwikkelaar — hoe het werkt** | [p2p-multiplayer.md](./p2p-multiplayer.md) |
| **Ontwikkelaar — regels nieuw spel** | [multiplayer-bouwregels.md](./multiplayer-bouwregels.md) |
| **Ontwikkelaar — spel toevoegen aan room** | [game-integration-guide](./superpowers/specs/2026-08-24-game-integration-guide.md) |
| **Audit / bekende gaten** | [p2p-kritisch-rapport.md](./p2p-kritisch-rapport.md) |
| **Fundamenten & keuzes** | [p2p-fundamenten.md](./p2p-fundamenten.md) |

Bij conflict tussen docs en code: **code wint**, daarna `p2p-multiplayer.md`.

---

## Documentatieset P2P (actueel)

```
speler-handleiding.md     → gebruikersflow (room, link, host)
p2p-multiplayer.md        → beschrijvend: transport, log, spellen, room shell
multiplayer-bouwregels.md → normatief: R1–R24
p2p-kritisch-rapport.md   → wat nog niet waterdicht is (P0–P3)
p2p-fundamenten.md        → waarom log-only, geen dubbele waarheid
```

---

## Architectuur in één diagram

```
Speler
  │
  ▼
room/  ── P2P (PeerJS ster) ── room log (p2p:room:CODE)
  │         host authority
  │         room.member_join, room.session_start, …
  │
  ├── game picker (filter op aantal spelers)
  │
  └── iframe embedded spel (?embedded=1)
        │
        └── session log (p2p:session:CODE:sid:gameId)
              move, roll, seat, …  →  replay(log) = state
```

**Legacy pad:** per-spel `#tic-tac-toe/?room=CODE` — eigen P2P + log `p2p:{gameId}:{CODE}`.  
Wordt uitgefaseerd ten gunste van `room/`.

---

## Specs & plannen

| Map | Rol |
|-----|-----|
| [superpowers/specs/](./superpowers/specs/README.md) | Ontwerpnotities — zie README voor actueel vs historisch |
| [superpowers/plans/](./superpowers/plans/) | Implementatieplannen ( uitvoering ) |

---

## Snelle bestandskaart (code)

| Onderdeel | Pad |
|-----------|-----|
| Room shell UI | `room/main.js` |
| Game-agnostische P2P | `js/p2p/room-session.js`, `js/transport/room-p2p.js` |
| Per-spel P2P (legacy) | `js/p2p/session.js`, `js/transport/p2p.js` |
| Event-log engine | `js/sync/event-log.js` |
| Room log | `js/sync/room-log.js` |
| Host commit | `js/sync/host-commit.js`, `js/sync/room-host.js` |
| Embedded bridge | `js/bridge/` |
| Persist | `js/core/desk.js`, `js/core/storage.js` |
