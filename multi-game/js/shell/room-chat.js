/**
 * Room chat panel — compact open chat (no toggle button chrome).
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
      <div class="room-chat-head">
        <span class="room-chat-title">Chat</span>
      </div>
      <div class="room-chat-body">
        <ul class="room-chat-messages" aria-live="polite"></ul>
        <form class="room-chat-form">
          <input type="text" class="room-chat-input" maxlength="500" autocomplete="off" placeholder="Bericht…" />
          <button type="submit" class="btn btn-primary room-chat-send">Stuur</button>
        </form>
      </div>
    </div>`;

  const shell = /** @type {HTMLElement} */ (rootEl.querySelector(".room-chat"));
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
    // Always keep chat body visible in lobby; collapse modes are unused.
    body.classList.remove("hidden", "is-drawer");
  }

  /** @type {{ messages: { messageId: string, playerId: string, name: string, text: string, seq: number }[], localPlayerId: string, chatSeq: number } | null} */
  let lastRender = null;

  /**
   * @param {{ messages: { messageId: string, playerId: string, name: string, text: string, seq: number }[], localPlayerId: string, chatSeq: number }} data
   */
  function paintChat(data) {
    lastRender = data;
    shell.dataset.chatSeq = String(data.chatSeq || 0);
    const visible = data.messages.slice(-maxVisible);
    list.innerHTML = visible
      .map((m) => {
        const mine = m.playerId === data.localPlayerId ? " is-mine" : "";
        return `<li class="room-chat-msg${mine}"><strong>${esc(m.name)}</strong> <span>${esc(m.text)}</span></li>`;
      })
      .join("");
    list.scrollTop = list.scrollHeight;
    lastReadSeq = Math.max(lastReadSeq, data.chatSeq || 0);
  }

  function renderLast() {
    if (lastRender) paintChat(lastRender);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    opts.onSend(text);
    input.value = "";
  });

  applyMode();

  return {
    setMode(next) {
      mode = next === "collapsed" || next === "expanded" ? "open" : next;
      applyMode();
    },
    markRead(chatSeq) {
      lastReadSeq = Math.max(lastReadSeq, chatSeq);
      renderLast();
    },
    /**
     * @param {{ messages: { messageId: string, playerId: string, name: string, text: string, seq: number }[], localPlayerId: string, chatSeq: number }} data
     */
    render(data) {
      paintChat(data);
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
