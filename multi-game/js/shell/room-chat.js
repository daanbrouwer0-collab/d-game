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
    <div class="room-chat panel" data-mode="open">
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

  const shell = /** @type {HTMLElement} */ (rootEl.querySelector(".room-chat"));
  const toggle = /** @type {HTMLButtonElement} */ (
    rootEl.querySelector(".room-chat-toggle")
  );
  const badge = /** @type {HTMLElement} */ (rootEl.querySelector(".room-chat-badge"));
  const body = /** @type {HTMLElement} */ (rootEl.querySelector(".room-chat-body"));
  const list = /** @type {HTMLElement} */ (
    rootEl.querySelector(".room-chat-messages")
  );
  const form = /** @type {HTMLFormElement} */ (
    rootEl.querySelector(".room-chat-form")
  );
  const input = /** @type {HTMLInputElement} */ (
    rootEl.querySelector(".room-chat-input")
  );

  function applyMode() {
    shell.dataset.mode = mode;
    toggle.setAttribute(
      "aria-expanded",
      mode !== "collapsed" ? "true" : "false",
    );
    body.classList.toggle("hidden", mode === "collapsed");
    body.classList.toggle("is-drawer", mode === "expanded");
  }

  toggle.addEventListener("click", () => {
    if (mode === "collapsed") {
      mode = "expanded";
      applyMode();
      markRead(Number(shell.dataset.chatSeq || 0));
      renderLast();
      return;
    }
    if (mode === "expanded") {
      mode = "collapsed";
      applyMode();
    }
  });

  /** @type {{ messages: unknown[], localPlayerId: string, chatSeq: number } | null} */
  let lastRender = null;

  function renderLast() {
    if (lastRender) {
      render(lastRender);
    }
  }

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
      renderLast();
    },
    /**
     * @param {{ messages: { messageId: string, playerId: string, name: string, text: string, seq: number }[], localPlayerId: string, chatSeq: number }} data
     */
    render({ messages, localPlayerId, chatSeq }) {
      lastRender = { messages, localPlayerId, chatSeq };
      shell.dataset.chatSeq = String(chatSeq || 0);
      const visible = messages.slice(-maxVisible);
      list.innerHTML = visible
        .map((m) => {
          const mine = m.playerId === localPlayerId ? " is-mine" : "";
          return `<li class="room-chat-msg${mine}"><strong>${esc(m.name)}</strong> <span>${esc(m.text)}</span></li>`;
        })
        .join("");
      list.scrollTop = list.scrollHeight;

      if (mode === "open" || mode === "expanded") {
        lastReadSeq = Math.max(lastReadSeq, chatSeq || 0);
      }
      const unread = Math.max(0, (chatSeq || 0) - lastReadSeq);
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
