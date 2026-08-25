# Game end screen — design

**Date:** 2026-08-25  
**Status:** approved  
**Approach:** Room-shell overlay over frozen iframe

## Goal

When a room game finishes, everyone sees an end screen with the game still visible underneath and the winner (or draw), then each person returns to voting on their own.

## Flow

1. Game ends → iframe stays mounted (board/state frozen).
2. Room shows overlay: winner or “Gelijkspel” + button **Terug naar stemmen**.
3. Each player dismisses independently → that client returns to voting lobby.
4. Host abort / leave / all-left do **not** use this screen (existing `endGame` path).

## Protocol

`BridgeMsg.SESSION_ENDED` payload:

```js
{
  reason: "finished" | "draw" | "left" | …,
  winnerName?: string,
  winnerId?: string,
  summary?: string,
}
```

Room shell:

- On `finished` / `draw` → show overlay (do not call `endGame` yet).
- On other reasons → existing `endGame` behaviour.
- Dismiss button → local `returnToVoting` / `endGame` as appropriate so session can end when host dismisses or via existing host session_end.

## UI

Overlay over playing panel / iframe:

- Semi-transparent scrim so game remains visible
- Large winner / draw title
- Optional summary line
- Primary button: Terug naar stemmen

## Game adapters (first pass)

- **tic-tac-toe:** send winner name / draw via `notifySessionEnded`
- **robotrun:** send winner if available
- Others: overlay shows “Spel afgelopen” until they pass winner data

## Out of scope

- Rematch button
- Auto-dismiss timer
- Screenshot capture (use frozen iframe instead)
