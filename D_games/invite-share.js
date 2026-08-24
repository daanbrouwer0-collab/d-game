/**
 * Deelbare Multi Device-uitnodigingen (WhatsApp, Facebook, Web Share, klembord).
 * Publieke invite-links gebruiken altijd het productiedomein.
 * Pending invites: localStorage (overleeft tab-sluiten).
 */
(function () {
  const PENDING_KEY = 'd-games-pending-invite';
  /** Canonical productie-domein (custom domain op Netlify). */
  const PUBLIC_ORIGIN = 'https://www.d-game.nl';
  const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  const GAME_PATHS = {
    robotrally: './D-robotrally/index.html',
    'tic-tac-too': './MD-tic-tac-too/index.html',
    'md-robot': './MD-robot/index.html'
  };

  const GAME_TITLES = {
    robotrally: 'D-RobotRally',
    'tic-tac-too': 'MD-Tic-Tac-Too',
    'md-robot': 'MD-robot'
  };

  /**
   * Origin voor deelbare invite-links.
   * - Op www.d-game.nl → canonical productiedomein
   * - Op Netlify (.netlify.app) / andere host → huidige origin (vriend kan meedoen)
   * - file:// → productiedomein als fallback
   */
  function publicOrigin() {
    try {
      const origin = String(window.location.origin || '');
      if (!origin || origin === 'null' || origin.startsWith('file:')) {
        return PUBLIC_ORIGIN;
      }
      if (/^https:\/\/(www\.)?d-game\.nl$/i.test(origin)) {
        return 'https://www.d-game.nl';
      }
      return origin;
    } catch {
      return PUBLIC_ORIGIN;
    }
  }

  function publicHubUrl() {
    return new URL('/multi.html', publicOrigin());
  }

  function hubBaseUrl() {
    try {
      const url = new URL(window.location.href);
      if (
        url.pathname.includes('/D-robotrally/')
        || url.pathname.includes('/MD-tic-tac-too/')
        || url.pathname.includes('/D-Tic-Tac-Too/')
        || url.pathname.includes('/MD-robot/')
      ) {
        url.pathname = url.pathname.replace(/\/(?:MD|D)-[^/]+\/[^/]*$/, '/multi.html');
      } else if (!url.pathname.endsWith('multi.html')) {
        const dir = url.pathname.replace(/[^/]*$/, '');
        url.pathname = `${dir}multi.html`;
      }
      url.search = '';
      url.hash = '';
      return url;
    } catch {
      return null;
    }
  }

  /** Invite-link voor delen (huidige site-origin, of www.d-game.nl op productie). */
  function buildInviteUrl({ roomId, game, minPlayers = 2 }) {
    if (!roomId || !game) throw new Error('roomId en game zijn verplicht');
    const base = publicHubUrl();
    base.searchParams.set('join', roomId);
    base.searchParams.set('game', game);
    if (minPlayers) base.searchParams.set('min', String(minPlayers));
    return base.toString();
  }

  function buildShareText({ game, roomId, minPlayers = 2, url }) {
    const title = GAME_TITLES[game] || 'D-Games';
    const link = url || buildInviteUrl({ roomId, game, minPlayers });
    return `Doe mee met ${title} op D-Games! Log in met Matrix (@naam:matrix.org) en open de link. We starten als er genoeg spelers zijn (min. ${minPlayers}).\n\n${link}`;
  }

  function savePendingInvite(invite) {
    const payload = JSON.stringify({
      roomId: invite.roomId,
      game: invite.game,
      minPlayers: invite.minPlayers || 2,
      savedAt: Date.now()
    });
    try { localStorage.setItem(PENDING_KEY, payload); } catch { /* ignore */ }
    try { sessionStorage.setItem(PENDING_KEY, payload); } catch { /* ignore */ }
  }

  function loadPendingInvite() {
    try {
      const raw = localStorage.getItem(PENDING_KEY) || sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.roomId || !data?.game) return null;
      if (data.savedAt && Date.now() - data.savedAt > PENDING_MAX_AGE_MS) {
        clearPendingInvite();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function clearPendingInvite() {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  }

  function parseInviteFromLocation(loc = window.location) {
    const params = new URLSearchParams(loc.search || '');
    const roomId = params.get('join') || params.get('matrixRoom') || params.get('room');
    const game = params.get('game') || guessGameFromPath(loc.pathname);
    const minPlayers = Number(params.get('min') || 2) || 2;
    if (!roomId) return null;
    return { roomId, game: game || 'md-robot', minPlayers };
  }

  function guessGameFromPath(pathname) {
    const path = String(pathname);
    if (path.includes('D-robotrally') || path.includes('MD-robotrally')) return 'robotrally';
    if (path.includes('MD-tic-tac-too') || path.includes('D-Tic-Tac-Too')) return 'tic-tac-too';
    if (path.includes('MD-robot')) return 'md-robot';
    return null;
  }

  /** Navigatie binnen de app (huidige origin, ook lokaal). */
  function gameEntryUrl(invite) {
    const hub = hubBaseUrl();
    const root = hub
      ? hub.href.replace(/multi\.html(?:\?.*)?$/, '')
      : new URL('./', window.location.href).href;
    const rel = (GAME_PATHS[invite.game] || './multi.html').replace(/^\.\//, '');
    const entry = new URL(rel, root);
    entry.searchParams.set('matrixRoom', invite.roomId);
    entry.searchParams.set('join', invite.roomId);
    if (invite.game) entry.searchParams.set('game', invite.game);
    if (invite.minPlayers) entry.searchParams.set('min', String(invite.minPlayers));
    return entry.toString();
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  async function shareInvite(options) {
    const url = options.url || buildInviteUrl(options);
    const text = buildShareText({ ...options, url });
    const title = GAME_TITLES[options.game] || 'D-Games';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return 'native';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
      }
    }

    await copyText(text);
    return 'copied';
  }

  function shareWhatsApp(options) {
    const url = options.url || buildInviteUrl(options);
    const text = buildShareText({ ...options, url });
    const wa = new URL('https://wa.me/');
    wa.searchParams.set('text', text);
    window.open(wa.toString(), '_blank', 'noopener,noreferrer');
    return 'whatsapp';
  }

  function shareFacebook(options) {
    const url = options.url || buildInviteUrl(options);
    const fb = new URL('https://www.facebook.com/sharer/sharer.php');
    fb.searchParams.set('u', url);
    fb.searchParams.set('quote', buildShareText({ ...options, url }));
    window.open(fb.toString(), '_blank', 'noopener,noreferrer,width=640,height=720');
    return 'facebook';
  }

  async function copyInviteLink(options) {
    const url = options.url || buildInviteUrl(options);
    await copyText(url);
    return url;
  }

  window.InviteShare = {
    PENDING_KEY,
    PUBLIC_ORIGIN,
    publicOrigin,
    GAME_PATHS,
    GAME_TITLES,
    buildInviteUrl,
    buildShareText,
    savePendingInvite,
    loadPendingInvite,
    clearPendingInvite,
    parseInviteFromLocation,
    gameEntryUrl,
    shareInvite,
    shareWhatsApp,
    shareFacebook,
    copyInviteLink,
    copyText
  };
})();
