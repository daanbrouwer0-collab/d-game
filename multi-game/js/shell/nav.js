import { listDeskCards, deskHashHref } from "../core/desk.js";
import { isHashShell, readRoomFromUrl } from "./site-url.js";

/**
 * Inject shared bottom tab navigation for the D-Game sandbox shell.
 * @param {{ active: 'games'|'lobby'|'friends'|'netwerk'|'geheugen', base?: string }} opts
 *   base: relative path prefix to site root, e.g. "" or "../" or "../../"
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
    .map((c) => {
      const here = c.gameId === currentGameId && code && c.code === code;
      const role = c.role === "host" ? "host" : "gast";
      const link = isHashShell() ? deskHashHref(c, "open") : c.openHref;
      return `<a class="room-chip${here ? " is-current" : ""}" href="${link}" title="${c.summary}">
        <strong>${c.title}</strong>
        <span>${c.code}</span>
        <span class="room-chip-role">${role}</span>
      </a>`;
    })
    .join("")}`;
  document.documentElement.classList.add("has-room-strip");
}

/**
 * Resolve base path from a script or page depth.
 * Call from pages under /lobby/ with base "../"
 */
export function shellBaseFromDepth(depth = 0) {
  if (depth <= 0) return "";
  return "../".repeat(depth);
}
