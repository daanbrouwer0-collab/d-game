# Room-first UX + room chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De site voelt room-first (multiplayer via één room-hub) en heeft gesynchroniseerde room-chat via P2P — ingeklapt met badge tijdens spel, open in lobby.

**Architecture:** Chat = `room.chat_message` events in de bestaande room-log (host authority, zelfde pad als stemmen). UI-component `room-chat.js` in room chrome; session/game logs blijven onaangeroerd. Home + shell-nav worden room-aware.

**Tech Stack:** Vanilla ES modules, PeerJS 1.5.4, bestaande `event-log.js` / `room-host.js`, Node ESM smoke tests (`node *.test.js`).

**Spec:** [2026-08-24-room-first-chat-design.md](../specs/2026-08-24-room-first-chat-design.md)

## Global Constraints

- Chat events alleen in room-log (`gameId: "__room__"`); **nooit** in session/game logs.
- Host authority: gast → `ROOM_INTENT { kind: 'chat' }` → host commit → `ROOM_LOG`.
- Chat max **500** tekens; rate limit **10 berichten / 60s** per `playerId` (host-side).
- Live UI toont laatste **100** chat-berichten; oudere blijven in log/desk.
- Chat **niet** wissen bij `session_start` / `session_end` (anders dan stemmen).
- Tijdens spel: chat **collapsed** + badge; klik → **expanded** drawer (keuze C).
- P2P topologie ongewijzigd; geen chat via game bridge / iframe.
- `maxGuests = 5` (6 spelers max).
- Geen wijzigingen aan `multi-game-netlify/`.
- Commits alleen wanneer de gebruiker dat vraagt.

## File map

| File | Responsibility |
|------|----------------|
| `js/sync/room-log.js` | `RoomEvent.CHAT_MESSAGE`, `replayRoom` → `chat[]`, `chatSeq` |
| `js/sync/room-log.test.js` | Replay chat + persistence over session lifecycle |
| `js/sync/room-host.js` | `postChat(log, opts)` + rate limit |
| `js/sync/room-host.test.js` | postChat commit + rate limit reject |
| `js/shell/room-chat.js` | **Nieuw** — mount, render, collapse/expand, badge, send callback |
| `room/index.html` | Chat panel markup in room chrome |
| `room/room.css` | Chat layout, collapsed header, drawer overlay, badge |
| `room/main.js` | Wire chat intents, lifecycle hooks, `lastReadSeq` |
| `index.html` | “Ga verder in room” banner |
| `js/shell/nav.js` | `guardRoomNavigation()` confirm bij actieve room |
| `js/p2p/room-memory.js` | `loadActiveRoom()` al aanwezig — hergebruiken |
| `docs/p2p-multiplayer.md` | Room chat sectie |
| `docs/speler-handleiding.md` | Chat uitleg voor spelers |

---

### Task 1: Room log — `CHAT_MESSAGE` + replay

**Files:**
- Modify: `multi-game/js/sync/room-log.js`
- Modify: `multi-game/js/sync/room-log.test.js`

**Interfaces:**
- Produces:
  - `RoomEvent.CHAT_MESSAGE = "room.chat_message"`
  - `replayRoom(log) => { members, activeSession, history, votes, hostPlayerId, chat, chatSeq }`
  - `chat`: `{ messageId, playerId, name, text, ts, seq }[]` (seq = event seq in log)
  - `chatSeq`: number — hoogste seq van chat events (0 als geen chat)

- [ ] **Step 1: Extend `RoomEvent` in `room-log.js`**

```js
export const RoomEvent = Object.freeze({
  // … bestaand …
  CHAT_MESSAGE: "room.chat_message",
});
```

- [ ] **Step 2: Extend `replayRoom` — chat array + chatSeq**

Voeg toe in de replay-loop:

```js
/** @type {{ messageId: string, playerId: string, name: string, text: string, ts: number, seq: number }[]} */
const chat = [];
let chatSeq = 0;

// in switch:
case RoomEvent.CHAT_MESSAGE: {
  const messageId = String(p.messageId || "");
  const playerId = String(p.playerId || "");
  const name = String(p.name || "").trim() || "Speler";
  const text = String(p.text || "");
  const ts = Number(p.ts) || 0;
  if (!messageId || !playerId || !text) break;
  chat.push({ messageId, playerId, name, text, ts, seq: ev.seq });
  chatSeq = ev.seq;
  break;
}

// return:
return { members, activeSession, history, votes, hostPlayerId, chat, chatSeq };
```

Zorg dat `SESSION_START` / `SESSION_END` **geen** `chat.clear()` doen (stemmen wel clearen — ongewijzigd).

- [ ] **Step 3: Add failing tests in `room-log.test.js`**

```js
log = commitRoomEvent(log, RoomEvent.CHAT_MESSAGE, {
  messageId: "m1",
  playerId: "p1",
  name: "Alice",
  text: "Hoi!",
  ts: Date.now(),
}).log;
log = commitRoomEvent(log, RoomEvent.CHAT_MESSAGE, {
  messageId: "m2",
  playerId: "p2",
  name: "Bob",
  text: "Yo",
  ts: Date.now(),
}).log;
state = replayRoom(log);
console.assert(state.chat.length === 2);
console.assert(state.chat[0].text === "Hoi!");
console.assert(state.chatSeq > 0);

// chat blijft na session start/end:
log = commitRoomEvent(log, RoomEvent.SESSION_START, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  roster: [],
}).log;
state = replayRoom(log);
console.assert(state.chat.length === 2, "chat blijft na session_start");

log = commitRoomEvent(log, RoomEvent.SESSION_END, {
  sessionId: sid,
  gameId: "tic-tac-toe",
  reason: "finished",
}).log;
state = replayRoom(log);
console.assert(state.chat.length === 2, "chat blijft na session_end");
```

- [ ] **Step 4: Run tests**

Run: `cd multi-game && node js/sync/room-log.test.js`  
Expected: `room-log ok`

---

### Task 2: Room host — `postChat` + rate limit

**Files:**
- Modify: `multi-game/js/sync/room-host.js`
- Modify: `multi-game/js/sync/room-host.test.js`

**Interfaces:**
- Produces:
  - `createRoomHostCommit()` uitbreiding:
  - `postChat(log, { playerId, name, text }) => { ok: boolean, log?, reason? }`
  - Bij success: commit `room.chat_message` met `{ messageId, playerId, name, text, ts }`
  - `messageId`: `m_${tipSeq(log)+1}` na commit (of van `result.tipEventId` indien beschikbaar)
  - Rate limit: scan laatste chat events in log voor `playerId`; max 10 in rolling 60s window

- [ ] **Step 1: Add rate limit helper bovenaan `room-host.js`**

```js
const CHAT_MAX_LEN = 500;
const CHAT_RATE_MAX = 10;
const CHAT_RATE_WINDOW_MS = 60_000;

/**
 * @param {import("./event-log.js").EventLog} log
 * @param {string} playerId
 * @returns {boolean}
 */
function chatRateOk(log, playerId) {
  const now = Date.now();
  const cutoff = now - CHAT_RATE_WINDOW_MS;
  let count = 0;
  for (let i = log.events.length - 1; i >= 0; i--) {
    const ev = log.events[i];
    if (ev.type !== RoomEvent.CHAT_MESSAGE) continue;
    const p = /** @type {{ playerId?: string, ts?: number }} */ (ev.payload || {});
    if (String(p.playerId || "") !== playerId) continue;
    const ts = Number(p.ts) || 0;
    if (ts < cutoff) break;
    count++;
    if (count >= CHAT_RATE_MAX) return false;
  }
  return true;
}
```

- [ ] **Step 2: Add `postChat` method**

```js
/**
 * @param {import("./event-log.js").EventLog} log
 * @param {{ playerId: string, name: string, text: string }} opts
 */
postChat(log, { playerId, name, text }) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > CHAT_MAX_LEN) {
    return { ok: false, reason: "too_long" };
  }
  if (!chatRateOk(log, playerId)) {
    return { ok: false, reason: "rate_limit" };
  }
  const ts = Date.now();
  const messageId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  return commit.commit(log, RoomEvent.CHAT_MESSAGE, {
    messageId,
    playerId,
    name: String(name || "").trim() || "Speler",
    text: trimmed,
    ts,
  });
},
```

- [ ] **Step 3: Add tests in `room-host.test.js`**

```js
const chat1 = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "Hallo room",
});
console.assert(chat1.ok);
log = chat1.log;

const empty = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "   ",
});
console.assert(!empty.ok && empty.reason === "empty");

const long = host.postChat(log, {
  playerId: "p2",
  name: "Bob",
  text: "x".repeat(501),
});
console.assert(!long.ok && long.reason === "too_long");

// rate limit: 10 ok, 11e reject
let rateLog = log;
for (let i = 0; i < 10; i++) {
  const r = host.postChat(rateLog, {
    playerId: "p9",
    name: "Spammer",
    text: `msg ${i}`,
  });
  console.assert(r.ok, `rate msg ${i}`);
  rateLog = r.log;
}
const over = host.postChat(rateLog, {
  playerId: "p9",
  name: "Spammer",
  text: "one too many",
});
console.assert(!over.ok && over.reason === "rate_limit");
```

- [ ] **Step 4: Run tests**

Run: `cd multi-game && node js/sync/room-host.test.js && node js/sync/room-log.test.js`  
Expected: `room-host ok` + `room-log ok`

---

### Task 3: `room-chat.js` UI component

**Files:**
- Create: `multi-game/js/shell/room-chat.js`

**Interfaces:**
- Produces:
  - `mountRoomChat(rootEl, opts) => { render, setMode, markRead, destroy }`
  - `opts.onSend(text: string) => void` — room/main.js bindt host commit of ROOM_INTENT
  - `opts.maxVisible?: number` default 100
  - `setMode('open' | 'collapsed' | 'expanded')`
  - `render({ messages, localPlayerId, unreadCount })`
  - `markRead(chatSeq: number)` — zet lokale lastRead, badge cleared

- [ ] **Step 1: Create `room-chat.js` skeleton**

```js
/**
 * Room chat panel — open / collapsed / expanded (spec keuze C).
 * @param {HTMLElement} rootEl
 * @param {{ onSend: (text: string) => void, maxVisible?: number }} opts
 */
export function mountRoomChat(rootEl, opts) {
  const maxVisible = opts.maxVisible ?? 100;
  /** @type {'open'|'collapsed'|'expanded'} */
  let mode = "open";
  /** @type {number} */
  let lastReadSeq = 0;

  rootEl.innerHTML = `
    <div class="room-chat" data-mode="open">
      <button type="button" class="room-chat-toggle" aria-expanded="true">
        <span class="room-chat-label">Chat</span>
        <span class="room-chat-badge hidden" aria-label="Ongelezen">0</span>
      </button>
      <div class="room-chat-body">
        <ul class="room-chat-messages" aria-live="polite"></ul>
        <form class="room-chat-form">
          <input type="text" class="room-chat-input" maxlength="500" autocomplete="off" placeholder="Bericht…" />
          <button type="submit" class="btn btn-primary room-chat-send">Stuur</button>
        </form>
      </div>
    </div>`;

  const shell = rootEl.querySelector(".room-chat");
  const toggle = rootEl.querySelector(".room-chat-toggle");
  const badge = rootEl.querySelector(".room-chat-badge");
  const body = rootEl.querySelector(".room-chat-body");
  const list = rootEl.querySelector(".room-chat-messages");
  const form = rootEl.querySelector(".room-chat-form");
  const input = /** @type {HTMLInputElement} */ (rootEl.querySelector(".room-chat-input"));

  function applyMode() {
    shell.dataset.mode = mode;
    toggle.setAttribute("aria-expanded", mode !== "collapsed" ? "true" : "false");
    body.classList.toggle("hidden", mode === "collapsed");
    body.classList.toggle("is-drawer", mode === "expanded");
  }

  toggle.addEventListener("click", () => {
    if (mode === "collapsed") {
      mode = "expanded";
      applyMode();
      markRead(Number(shell.dataset.chatSeq || 0));
    } else if (mode === "expanded") {
      mode = "collapsed";
      applyMode();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    opts.onSend(text);
    input.value = "";
  });

  return {
    setMode(next) {
      mode = next;
      applyMode();
    },
    markRead(chatSeq) {
      lastReadSeq = Math.max(lastReadSeq, chatSeq);
    },
    render({ messages, localPlayerId, chatSeq }) {
      shell.dataset.chatSeq = String(chatSeq || 0);
      const visible = messages.slice(-maxVisible);
      list.innerHTML = visible
        .map((m) => {
          const mine = m.playerId === localPlayerId ? " is-mine" : "";
          return `<li class="room-chat-msg${mine}"><strong>${esc(m.name)}</strong><span>${esc(m.text)}</span></li>`;
        })
        .join("");
      list.scrollTop = list.scrollHeight;

      const unread = Math.max(0, (chatSeq || 0) - lastReadSeq);
      if (mode === "open" || mode === "expanded") {
        lastReadSeq = Math.max(lastReadSeq, chatSeq || 0);
      }
      const showBadge = mode === "collapsed" && unread > 0;
      badge.classList.toggle("hidden", !showBadge);
      badge.textContent = String(unread);
    },
    destroy() {
      rootEl.innerHTML = "";
    },
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

- [ ] **Step 2: Handmatig smoke test (later in Task 4 na HTML markup)**

Tijdelijk: import in browser console na Task 4.

---

### Task 4: Room shell — HTML, CSS, wiring

**Files:**
- Modify: `multi-game/room/index.html`
- Modify: `multi-game/room/room.css`
- Modify: `multi-game/room/main.js`

**Interfaces:**
- Consumes: Task 1 `replayRoom().chat`, Task 2 `postChat`, Task 3 `mountRoomChat`
- Produces: end-to-end chat in room shell

- [ ] **Step 1: Add chat container in `room/index.html`**

In `#room-chrome`, onder roster-bar:

```html
<div id="room-chat-root" class="room-chat-root"></div>
```

Pas layout aan: `#room-chrome` bevat roster + chat; main panels blijven eronder.

- [ ] **Step 2: Add CSS in `room/room.css`**

```css
.room-chat-root {
  margin-top: 0.5rem;
}

.room-chat[data-mode="collapsed"] .room-chat-body {
  display: none;
}

.room-chat[data-mode="expanded"] .room-chat-body.is-drawer {
  position: fixed;
  inset: auto 0 0 0;
  max-height: 45vh;
  z-index: 20;
  background: var(--cell, #fff);
  border-top: 1px solid var(--border, #ddd);
  box-shadow: 0 -4px 24px rgb(0 0 0 / 12%);
  padding: 0.75rem 1rem;
}

.room-chat-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--line, #ddd);
  border-radius: 8px;
  background: var(--cell, #fff);
  font: inherit;
  cursor: pointer;
}

.room-chat-badge {
  min-width: 1.25rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--accent, #2563eb);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
}

.room-chat-badge.hidden {
  display: none;
}

.room-chat-messages {
  list-style: none;
  margin: 0.5rem 0;
  padding: 0;
  max-height: 12rem;
  overflow-y: auto;
}

.room-chat[data-mode="open"] .room-chat-messages {
  max-height: 10rem;
}

.room-chat-msg {
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
}

.room-chat-msg.is-mine strong {
  color: var(--accent, #2563eb);
}

.room-chat-form {
  display: flex;
  gap: 0.5rem;
}

.room-chat-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border, #ccc);
}
```

- [ ] **Step 3: Wire chat in `room/main.js`**

Imports:

```js
import { mountRoomChat } from "../js/shell/room-chat.js";
```

State + mount na `bindSession`:

```js
/** @type {ReturnType<typeof mountRoomChat> | null} */
let roomChat = null;

function initRoomChat() {
  const root = document.getElementById("room-chat-root");
  if (!root || roomChat) return;
  roomChat = mountRoomChat(root, {
    onSend(text) {
      sendChat(text);
    },
  });
}

function sendChat(text) {
  if (!session || !roomLog || !roomHost) return;
  if (session.role === "host") {
    const posted = roomHost.postChat(roomLog, {
      playerId,
      name: playerLabel(),
      text,
    });
    if (!posted.ok) {
      if (posted.reason === "rate_limit") setError("Te veel berichten — even wachten.");
      return;
    }
    roomLog = posted.log;
    saveRoomLogByCode(session.roomCode, roomLog);
    broadcastRoomLog(tipSeq(roomLog) - 1);
    renderChat();
    return;
  }
  session.send(RoomMsg.ROOM_INTENT, {
    kind: "chat",
    playerId,
    text,
  });
}

function renderChat() {
  if (!roomChat) return;
  const state = roomState();
  roomChat.render({
    messages: state.chat,
    localPlayerId: playerId,
    chatSeq: state.chatSeq,
  });
}

function syncChatMode() {
  if (!roomChat) return;
  const playing = !!roomState().activeSession || !!activeSession;
  roomChat.setMode(playing ? "collapsed" : "open");
  if (!playing) roomChat.markRead(roomState().chatSeq);
}
```

Extend `handleRoomIntent`:

```js
if (p.kind === "chat") {
  const pid = String(p.playerId || "");
  const text = String(p.text || "");
  if (!pid || !text) return;
  if (fromPeerId && peerToPlayer.get(fromPeerId) !== pid) return;
  const posted = roomHost.postChat(roomLog, {
    playerId: pid,
    name: rosterArray().find((m) => m.playerId === pid)?.name || "Speler",
    text,
  });
  if (!posted.ok) return;
  roomLog = posted.log;
  saveRoomLogByCode(session.roomCode, roomLog);
  broadcastRoomLog(tipSeq(roomLog) - 1);
  renderRoster(); // renderRoster roept renderChat aan — zie step 4
  return;
}
```

- [ ] **Step 4: Hook lifecycle + render**

In `renderRoster()` aanroepen:

```js
renderChat();
syncChatMode();
```

In `startGame()` na `mountActiveGame`: `syncChatMode()`.

In `returnToVoting()`: `syncChatMode()`.

In `startHost()` / `joinRoom()` na connect: `initRoomChat(); renderChat();`.

In `adoptRoomPacket()` na renderRoster: chat update gebeurt via renderRoster.

- [ ] **Step 5: Handmatig test**

1. Host start room → chat open → stuur bericht → zichtbaar  
2. Gast joint → ziet historie → stuurt bericht → host + gast zien sync  
3. Start spel → chat collapsed → stuur bericht → badge +1 → klik → drawer open  
4. Spel eindigt → chat open again  

Run: `cd multi-game && node js/sync/room-log.test.js && node js/sync/room-host.test.js`

---

### Task 5: Room-first home + nav guard

**Files:**
- Modify: `multi-game/index.html`
- Modify: `multi-game/js/shell/nav.js`

**Interfaces:**
- Consumes: `loadActiveRoom()` from `js/p2p/room-memory.js`
- Produces: `guardRoomNavigation({ isConnected, onConfirmLeave })` export from nav.js

- [ ] **Step 1: Home banner in `index.html`**

In script block:

```js
import { loadActiveRoom } from "./js/p2p/room-memory.js";
import { buildRoomShareUrl } from "./js/shell/site-url.js";

const active = loadActiveRoom();
if (active?.code && active.isRoomShell) {
  const banner = document.createElement("div");
  banner.className = "panel room-continue-banner";
  banner.innerHTML = `
    <p>Je was in room <strong>${active.code}</strong>.</p>
    <a href="room/?room=${encodeURIComponent(active.code)}" class="btn btn-primary">Ga verder in room</a>`;
  document.querySelector("main")?.prepend(banner);
}
```

Update game-list blurbs: voeg “Multiplayer via room” toe in template string.

- [ ] **Step 2: Add `guardRoomNavigation` in `nav.js`**

```js
/**
 * @param {{ isConnected: () => boolean, onConfirmLeave?: () => void }} opts
 */
export function guardRoomNavigation(opts) {
  const { isConnected, onConfirmLeave } = opts;
  document.addEventListener(
    "click",
    (e) => {
      const a = /** @type {HTMLElement} */ (e.target)?.closest?.("a[href], .shell-tab[data-tab]");
      if (!a || !isConnected()) return;
      const leaving =
        a.matches(".shell-tab") ||
        (a.matches("a[href]") && !String(a.getAttribute("href") || "").includes("room"));
      if (!leaving) return;
      if (!confirm("Room verlaten? De verbinding met je groep verbroken.")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onConfirmLeave?.();
    },
    true,
  );
}
```

- [ ] **Step 3: Call guard from `room/main.js`**

```js
import { guardRoomNavigation } from "../js/shell/nav.js";

guardRoomNavigation({
  isConnected: () =>
    session != null &&
    (session.status === "hosting" || session.status === "connected"),
  onConfirmLeave: () => {
    /* optioneel: session.destroy() — YAGNI: alleen warn */
  },
});
```

Note: `session.status` — check `room-session.js` for actual status property name; gebruik `onStatus` callback state indien nodig:

```js
let connected = false;
// in bindSession onStatus:
connected = status === "hosting" || status === "connected";
// guard: isConnected: () => connected
```

- [ ] **Step 4: Handmatig test**

1. Join room → klik “Games” tab → confirm dialog  
2. Home met actieve room → banner “Ga verder”  

---

### Task 6: Documentatie

**Files:**
- Modify: `multi-game/docs/p2p-multiplayer.md`
- Modify: `multi-game/docs/speler-handleiding.md`
- Modify: `multi-game/docs/superpowers/specs/2026-08-24-room-first-chat-design.md` (status → geïmplementeerd na afloop)
- Modify: `multi-game/docs/superpowers/plans/README.md`

- [ ] **Step 1: `p2p-multiplayer.md` — sectie “Room chat”**

Toevoegen na room log tabel:

```markdown
### Room chat

| Event | Payload |
|-------|---------|
| `room.chat_message` | `{ messageId, playerId, name, text, ts }` |

- Gast → `ROOM_INTENT { kind: 'chat', playerId, text }`
- Host → commit → `ROOM_LOG`
- Chat blijft over spelrondes; niet in session logs
- UI: open in lobby, ingeklapt + badge tijdens spel
```

- [ ] **Step 2: `speler-handleiding.md` — chat + room-first**

Korte paragraaf:
- Multiplayer = altijd via room
- Chat onder spelerlijst; tijdens spel ingeklapt, badge bij nieuwe berichten
- Host start nog steeds het winnende spel na stemmen

- [ ] **Step 3: Update plans README**

```markdown
| [2026-08-24-room-first-chat.md](./2026-08-24-room-first-chat.md) | Room-first nav + room chat | Te implementeren |
```

- [ ] **Step 4: Update spec status**

In `2026-08-24-room-first-chat-design.md`: `Status: **geïmplementeerd**` (na alle tasks).

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `room.chat_message` in room-log | Task 1, 2 |
| replay `chat[]` + trim 100 in UI | Task 1, 3 |
| Chat niet wissen bij session | Task 1 |
| `postChat` + rate limit 10/60s | Task 2 |
| `ROOM_INTENT kind: chat` | Task 4 |
| Chat UI open/collapsed/expanded + badge | Task 3, 4 |
| Auto-collapse on session_start | Task 4 |
| Auto-open on session_end | Task 4 |
| Geen chat in game logs | Global constraint (geen game file changes) |
| Home “Ga verder in room” | Task 5 |
| Nav guard bij verlaten | Task 5 |
| Docs | Task 6 |

## Handmatige testplan (eind)

- [ ] Host + 1 gast: chat heen en weer in lobby  
- [ ] Gast refresh: chat historie via WELCOME  
- [ ] Start TTT: chat collapsed; bericht → badge; open drawer → leesbaar  
- [ ] TTT eindigt: chat open; berichten nog aanwezig  
- [ ] Stemmen + chat tegelijk: geen conflict  
- [ ] Rate limit: 11 snelle berichten → 11e geweigerd  
- [ ] Home banner + nav confirm  

## Test commands

```bash
cd multi-game
node js/sync/room-log.test.js
node js/sync/room-host.test.js
```

Expected output:
```
room-log ok
room-host ok
```
