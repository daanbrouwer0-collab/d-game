import { listDeskCards, navigateDeskCard } from "../core/desk.js";
import { readRoomFromUrl } from "./site-url.js";

/**
 * Inject shared bottom tab navigation for the D-Game sandbox shell.
 * @param {{ active: 'games'|'lobby'|'friends'|'netwerk'|'geheugen', base?: string }} opts
 */
export function mountShellNav({ active, base = "" }) {
  const root = base.endsWith("/") || base === "" ? base : `${base}/`;

  const tabs = [
    { id: "games", label: "Games", href: `${root}index.html` },
    { id: "lobby", label: "Lobby", href: `${root}lobby/` },
    { id: "friends", label: "Friends", href: `${root}friends/` },
    { id: "netwerk", label: "Netwerk", href: `${root}netwerk/` },
    { id: "geheugen", label: "Geheugen", href: `${root}geheugen/` },
  ];

  const normalized = tabs.map((t) => {
    if (t.id === "games") {
      return { ...t, href: root === "" ? "./" : `${root}` };
    }
    return t;
  });

  let nav = document.getElementById("shell-nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "shell-nav";
    nav.className = "shell-nav";
    nav.setAttribute("aria-label", "Hoofdnavigatie");
    document.body.appendChild(nav);
  }

  nav.innerHTML = normalized
    .map(
      (t) => `
    <a class="shell-tab${t.id === active ? " is-active" : ""}" href="${t.href}" data-tab="${t.id}">
      <span>${t.label}</span>
    </a>`,
    )
    .join("");

  document.documentElement.classList.add("has-shell-nav");
}

/**
 * Compact switcher of rooms saved on this device.
 * @param {{ base?: string, currentGameId?: string, currentCode?: string }} [opts]
 */
export function mountRoomStrip(opts = {}) {
  const { base = "", currentGameId = "", currentCode = "" } = opts;
  const cards = listDeskCards(base);
  let strip = document.getElementById("room-strip");
  if (!cards.length) {
    strip?.remove();
    document.documentElement.classList.remove("has-room-strip");
    return;
  }
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "room-strip";
    strip.className = "room-strip";
    strip.setAttribute("aria-label", "Mijn rooms");
    const nav = document.getElementById("shell-nav");
    if (nav) document.body.insertBefore(strip, nav);
    else document.body.appendChild(strip);
  }
  const code = currentCode || readRoomFromUrl() || "";
  strip.innerHTML = `<span class="room-strip-label">Mijn rooms</span>${cards
    .map((c, i) => {
      const here = c.gameId === currentGameId && code && c.code === code;
      const role = c.role === "host" ? "host" : "gast";
      return `<button type="button" class="room-chip${here ? " is-current" : ""}" data-desk-idx="${i}" title="${c.summary}">
        <strong>${c.title}</strong>
        <span>${c.code}</span>
        <span class="room-chip-role">${role}</span>
      </button>`;
    })
    .join("")}`;
  strip.querySelectorAll("[data-desk-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-desk-idx"));
      const card = cards[idx];
      if (card) navigateDeskCard(card, "open");
    });
  });
  document.documentElement.classList.add("has-room-strip");
}

/**
 * @param {number} [depth]
 */
export function shellBaseFromDepth(depth = 0) {
  if (depth <= 0) return "";
  return "../".repeat(depth);
}
