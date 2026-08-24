/**
 * Public site uses hash routing on Netlify:
 *   https://www.d-game.nl/#index.html
 *   https://www.d-game.nl/#tic-tac-toe/index.html?room=AB7K2M
 *
 * multi-game itself is loaded into an iframe (often about:srcdoc) from jsDelivr.
 * Share links and ?room= must therefore target the parent hash, not path URLs.
 */

export const PUBLIC_SITE_ORIGIN = "https://www.d-game.nl";

/**
 * @returns {Window}
 */
export function shellWindow() {
  try {
    if (window.parent && window.parent !== window) {
      // same-origin srcdoc iframe can read parent
      void window.parent.location.href;
      return window.parent;
    }
  } catch {
    /* cross-origin */
  }
  return window;
}

/**
 * @returns {boolean}
 */
export function isHashShell() {
  try {
    const win = shellWindow();
    if (win !== window) {
      const host = win.location.hostname || "";
      if (host === "www.d-game.nl" || host === "d-game.nl") return true;
      if (win.document?.getElementById("site-frame")) return true;
    }
  } catch {
    /* ignore */
  }
  if (location.protocol === "about:" || String(location.href).startsWith("about:")) {
    return true;
  }
  return false;
}

/**
 * @returns {string}
 */
export function publicSiteOrigin() {
  if (isHashShell()) {
    try {
      const origin = shellWindow().location.origin;
      if (origin && origin !== "null") return origin;
    } catch {
      /* ignore */
    }
    return PUBLIC_SITE_ORIGIN;
  }
  if (location.origin && location.origin !== "null") return location.origin;
  return PUBLIC_SITE_ORIGIN;
}

/**
 * "/tic-tac-toe/" → "tic-tac-toe/index.html"
 * @param {string} gamePath
 * @returns {string}
 */
export function toHashPath(gamePath) {
  let p = String(gamePath || "index.html").replace(/^\/+/, "");
  if (!p || p === "/") return "index.html";
  if (p.endsWith("/")) p += "index.html";
  else if (!/\.[a-zA-Z0-9]+$/.test(p)) p += "/index.html";
  return p;
}

/**
 * Search string including leading "?", from iframe location or parent hash.
 * @returns {string}
 */
export function getUrlSearch() {
  if (window.location.search && window.location.search.length > 1) {
    return window.location.search;
  }
  try {
    const hash = shellWindow().location.hash || "";
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    const qi = raw.indexOf("?");
    if (qi >= 0) return raw.slice(qi);
  } catch {
    /* ignore */
  }
  const ownHash = location.hash || "";
  const raw = ownHash.startsWith("#") ? ownHash.slice(1) : ownHash;
  const qi = raw.indexOf("?");
  if (qi >= 0) return raw.slice(qi);
  return "";
}

/**
 * @param {string} [search]
 * @returns {URLSearchParams}
 */
export function getUrlParams(search = getUrlSearch()) {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(q);
}

/**
 * @param {string} [search]
 * @returns {string | null}
 */
export function readRoomFromUrl(search = getUrlSearch()) {
  const room = getUrlParams(search).get("room");
  if (!room) return null;
  const code = room.trim().toUpperCase();
  return code || null;
}

/**
 * Lobby “Host opnieuw” sets as=host on the invite URL.
 * @param {string} [search]
 */
export function readHostIntentFromUrl(search = getUrlSearch()) {
  return getUrlParams(search).get("as") === "host";
}

/**
 * Build invite URL for QR / share.
 * Production (hash shell / d-game.nl): https://www.d-game.nl/#game/index.html?room=CODE
 * Local static server: http://localhost:8080/game/?room=CODE
 *
 * @param {string} gamePath e.g. "/tic-tac-toe/"
 * @param {string} code
 * @param {{ origin?: string, via?: string }} [opts]
 */
export function buildShareUrl(gamePath, code, opts = {}) {
  let origin = opts.origin || publicSiteOrigin();
  try {
    // Normalize potentially odd origins like "null" from srcdoc contexts.
    if (!origin || origin === "null") origin = PUBLIC_SITE_ORIGIN;
    // Validate origin early so URL construction below never crashes host flow.
    origin = new URL(origin).origin;
  } catch {
    origin = PUBLIC_SITE_ORIGIN;
  }
  const useHash =
    isHashShell() ||
    /d-game\.nl$/i.test(new URL(origin).hostname);

  const params = new URLSearchParams();
  params.set("room", String(code || "").trim().toUpperCase());
  if (opts.via) params.set("via", opts.via);

  if (useHash) {
    const path = toHashPath(gamePath);
    return `${origin.replace(/\/$/, "")}/#${path}?${params.toString()}`;
  }

  const path = gamePath.endsWith("/") ? gamePath : `${gamePath}/`;
  const url = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
  params.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

/**
 * @param {string} gamePath
 * @param {string} code
 * @param {{ via?: string }} [opts]
 */
export function writeRoomToUrl(gamePath, code, opts = {}) {
  const params = new URLSearchParams();
  params.set("room", String(code || "").trim().toUpperCase());
  if (opts.via) params.set("via", opts.via);

  try {
    if (isHashShell()) {
      const win = shellWindow();
      const path = toHashPath(gamePath);
      const next = `#${path}?${params.toString()}`;
      win.history.replaceState({ path }, "", next);
      return;
    }

    if (String(window.location.href).startsWith("about:")) return;

    const url = new URL(window.location.href);
    params.forEach((value, key) => url.searchParams.set(key, value));
    history.replaceState(null, "", url);
  } catch {
    /* never block host/QR on URL updates */
  }
}

/**
 * @param {string} [gamePath]
 */
export function clearRoomFromUrl(gamePath) {
  try {
    if (isHashShell()) {
      const win = shellWindow();
      let path = gamePath ? toHashPath(gamePath) : null;
      if (!path) {
        const raw = (win.location.hash || "#index.html").replace(/^#/, "");
        path = raw.split("?")[0] || "index.html";
      }
      win.history.replaceState({ path }, "", `#${path}`);
      return;
    }

    if (String(window.location.href).startsWith("about:")) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("via");
    history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

/**
 * Home / share-site URL for Friends, etc.
 * @returns {string}
 */
export function buildSiteHomeUrl() {
  let origin = publicSiteOrigin();
  try {
    origin = new URL(origin).origin;
  } catch {
    origin = PUBLIC_SITE_ORIGIN;
  }
  if (isHashShell() || /d-game\.nl$/i.test(new URL(origin).hostname)) {
    return `${origin.replace(/\/$/, "")}/#index.html`;
  }
  return `${origin.replace(/\/$/, "")}/`;
}

/**
 * Extract room (+ optional via) from invite text (hash or path URL).
 * @param {string} raw
 * @returns {{ code: string, url: string, via: string | null } | null}
 */
export function parseInviteFromText(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    let params = url.searchParams;
    if (![...params.keys()].length && url.hash.includes("?")) {
      const hash = url.hash.replace(/^#/, "");
      const qi = hash.indexOf("?");
      if (qi >= 0) params = new URLSearchParams(hash.slice(qi + 1));
    }
    const room = params.get("room");
    if (room && room.trim()) {
      return {
        code: room.trim().toUpperCase(),
        url: url.toString(),
        via: params.get("via"),
      };
    }
  } catch {
    /* not a URL */
  }

  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length >= 4 && code.length <= 12) {
    return { code, url: text, via: null };
  }
  return null;
}
