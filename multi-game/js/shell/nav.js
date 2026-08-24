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

  // Prefer clean folder URLs when on a directory
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
 * Resolve base path from a script or page depth.
 * Call from pages under /lobby/ with base "../"
 */
export function shellBaseFromDepth(depth = 0) {
  if (depth <= 0) return "";
  return "../".repeat(depth);
}
