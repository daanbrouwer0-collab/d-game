/**
 * Matrix.org login for the Multi Device hub.
 * Session (access_token) is stored in localStorage — never store the password.
 * Refresh tokens keep you logged in across page reloads.
 */
(function matrixAuthModule() {
  const STORAGE_KEY = 'd-games-matrix-session';
  const DEFAULT_SERVER_NAME = 'matrix.org';
  const DEVICE_NAME = 'D5 Games Hub';
  /** Refresh this many ms before access token expiry. */
  const REFRESH_MARGIN_MS = 2 * 60 * 1000;

  let refreshInFlight = null;
  let proactiveTimer = null;

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.accessToken || !data?.userId || !data?.baseUrl) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    scheduleProactiveRefresh(session);
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    if (proactiveTimer) {
      clearTimeout(proactiveTimer);
      proactiveTimer = null;
    }
  }

  function tokenExpiresAt(session) {
    if (!session?.loggedInAt || !session?.expiresInMs) return null;
    const at = Number(session.loggedInAt) + Number(session.expiresInMs);
    return Number.isFinite(at) ? at : null;
  }

  function needsRefresh(session) {
    if (!session?.refreshToken) return false;
    const exp = tokenExpiresAt(session);
    if (exp == null) return false;
    return Date.now() >= exp - REFRESH_MARGIN_MS;
  }

  function scheduleProactiveRefresh(session = loadSession()) {
    if (proactiveTimer) {
      clearTimeout(proactiveTimer);
      proactiveTimer = null;
    }
    if (!session?.refreshToken) return;
    const exp = tokenExpiresAt(session);
    if (exp == null) return;
    const delay = Math.max(5_000, exp - REFRESH_MARGIN_MS - Date.now());
    proactiveTimer = setTimeout(() => {
      refreshAccessToken(loadSession()).catch(() => {});
    }, delay);
  }

  function parseMatrixId(input) {
    const raw = String(input ?? '').trim();
    if (!raw) throw new Error('Vul je Matrix-adres in.');

    let localpart;
    let serverName = DEFAULT_SERVER_NAME;

    if (raw.startsWith('@')) {
      const match = raw.match(/^@([^:]+):(.+)$/);
      if (!match) throw new Error('Ongeldig Matrix-adres. Gebruik @naam:matrix.org');
      localpart = match[1];
      serverName = match[2].toLowerCase();
    } else if (raw.includes(':')) {
      throw new Error('Ongeldig Matrix-adres. Gebruik @naam:matrix.org');
    } else {
      localpart = raw.replace(/^@/, '');
    }

    if (!localpart) throw new Error('Ongeldig Matrix-adres.');
    if (serverName !== DEFAULT_SERVER_NAME) {
      throw new Error('Alleen matrix.org-accounts worden hier ondersteund (@naam:matrix.org).');
    }

    return {
      localpart,
      serverName,
      userId: `@${localpart}:${serverName}`
    };
  }

  async function discoverHomeserver(serverName) {
    const wellKnownUrl = `https://${serverName}/.well-known/matrix/client`;
    try {
      const res = await fetch(wellKnownUrl, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const base = data?.['m.homeserver']?.base_url;
        if (base) return String(base).replace(/\/+$/, '');
      }
    } catch {
      // fall through
    }
    return `https://${serverName}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function matrixFetch(baseUrl, path, { method = 'GET', token, body, retries = 4 } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok) return data;

      const errCode = data?.errcode || '';
      const isRate = res.status === 429 || errCode === 'M_LIMIT_EXCEEDED';
      if (isRate && attempt < retries) {
        const wait = Number(data?.retry_after_ms);
        await sleep(Number.isFinite(wait) && wait >= 0 ? Math.min(30000, wait) : 2000 * (attempt + 1));
        continue;
      }

      const error = new Error(data?.error || `HTTP ${res.status}`);
      error.errcode = errCode;
      error.status = res.status;
      error.retry_after_ms = data?.retry_after_ms;
      error.soft_logout = data?.soft_logout;
      throw error;
    }

    throw new Error('Matrix request mislukt.');
  }

  function friendlyLoginError(err) {
    const code = err?.errcode || '';
    if (code === 'M_FORBIDDEN' || code === 'M_UNAUTHORIZED') {
      return 'Verkeerd Matrix-adres of wachtwoord.';
    }
    if (code === 'M_USER_DEACTIVATED') {
      return 'Dit account is gedeactiveerd.';
    }
    if (code === 'M_LIMIT_EXCEEDED') {
      return 'Te veel pogingen. Wacht even en probeer opnieuw.';
    }
    if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
      return 'Geen verbinding met matrix.org. Check je internet.';
    }
    return err?.message || 'Inloggen mislukt.';
  }

  async function loginWithPassword(matrixAddress, password) {
    const parsed = parseMatrixId(matrixAddress);
    const pwd = String(password ?? '');
    if (!pwd) throw new Error('Vul je wachtwoord in.');

    const baseUrl = await discoverHomeserver(parsed.serverName);
    const prev = loadSession();
    const reuseDevice = prev?.userId === parsed.userId && prev?.deviceId
      ? prev.deviceId
      : null;

    const loginBody = {
      type: 'm.login.password',
      identifier: {
        type: 'm.id.user',
        user: parsed.userId
      },
      password: pwd,
      initial_device_display_name: DEVICE_NAME,
      refresh_token: true
    };
    if (reuseDevice) loginBody.device_id = reuseDevice;

    const login = await matrixFetch(baseUrl, '/_matrix/client/v3/login', {
      method: 'POST',
      body: loginBody
    });

    let displayName = parsed.localpart;
    try {
      const profile = await matrixFetch(
        baseUrl,
        `/_matrix/client/v3/profile/${encodeURIComponent(login.user_id)}/displayname`,
        { token: login.access_token }
      );
      if (profile?.displayname) displayName = profile.displayname;
    } catch {
      // optional
    }

    const session = {
      userId: login.user_id,
      accessToken: login.access_token,
      refreshToken: login.refresh_token || null,
      expiresInMs: login.expires_in_ms || null,
      deviceId: login.device_id || reuseDevice || null,
      baseUrl,
      displayName,
      serverName: parsed.serverName,
      loggedInAt: Date.now()
    };
    saveSession(session);
    return session;
  }

  async function logout() {
    const session = loadSession();
    if (session?.accessToken && session?.baseUrl) {
      try {
        await matrixFetch(session.baseUrl, '/_matrix/client/v3/logout', {
          method: 'POST',
          token: session.accessToken,
          body: {}
        });
      } catch {
        // still clear local session
      }
    }
    if (session?.userId && typeof MatrixClient?.clearSyncMeta === 'function') {
      MatrixClient.clearSyncMeta(session.userId);
    }
    clearSession();
  }

  async function refreshAccessToken(session = loadSession()) {
    if (!session?.refreshToken || !session?.baseUrl) return null;
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const data = await matrixFetch(session.baseUrl, '/_matrix/client/v3/refresh', {
          method: 'POST',
          body: { refresh_token: session.refreshToken }
        });
        const next = {
          ...session,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || session.refreshToken,
          expiresInMs: data.expires_in_ms != null ? data.expires_in_ms : session.expiresInMs,
          loggedInAt: Date.now()
        };
        saveSession(next);
        return next;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  /** Proactive refresh if near expiry; returns current/fresh session. */
  async function ensureFreshSession(session = loadSession()) {
    if (!session) return null;
    if (!needsRefresh(session)) return session;
    const refreshed = await refreshAccessToken(session);
    return refreshed || session;
  }

  async function validateSession(session) {
    if (!session?.accessToken || !session?.baseUrl || !session?.userId) return null;

    let current = session;
    if (needsRefresh(current)) {
      const refreshed = await refreshAccessToken(current);
      if (refreshed) current = refreshed;
    }

    try {
      const who = await matrixFetch(current.baseUrl, '/_matrix/client/v3/account/whoami', {
        token: current.accessToken
      });
      if (who?.user_id && who.user_id !== current.userId) {
        clearSession();
        return null;
      }
      scheduleProactiveRefresh(current);
      return current;
    } catch (err) {
      if (err?.status === 401 || err?.errcode === 'M_UNKNOWN_TOKEN') {
        const refreshed = await refreshAccessToken(current);
        if (refreshed) {
          try {
            const who = await matrixFetch(refreshed.baseUrl, '/_matrix/client/v3/account/whoami', {
              token: refreshed.accessToken
            });
            if (who?.user_id && who.user_id !== refreshed.userId) {
              clearSession();
              return null;
            }
            return refreshed;
          } catch {
            clearSession();
            return null;
          }
        }
        clearSession();
        return null;
      }
      // Network blip: keep session
      return current;
    }
  }

  function initMatrixLoginUi() {
    const panel = document.getElementById('matrix-login-panel');
    if (!panel) return;

    const form = document.getElementById('matrix-login-form');
    const loggedInView = document.getElementById('matrix-logged-in');
    const restoreEl = document.getElementById('matrix-session-restore');
    const addressInput = document.getElementById('matrix-address');
    const passwordInput = document.getElementById('matrix-password');
    const errorEl = document.getElementById('matrix-login-error');
    const submitBtn = document.getElementById('matrix-login-submit');
    const logoutBtn = document.getElementById('matrix-logout');
    const userLabel = document.getElementById('matrix-user-label');
    const userIdLabel = document.getElementById('matrix-userid-label');
    const gamesSection = document.getElementById('matrix-games-section');
    const loginHint = document.getElementById('matrix-login-hint');
    const whyPanel = document.getElementById('matrix-why');
    const connEl = document.getElementById('matrix-conn-status');

    function clearSessionPendingClass() {
      document.documentElement.classList.remove('md-session-pending');
    }

    function setError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    }

    function setBusy(busy) {
      if (submitBtn) {
        submitBtn.disabled = busy;
        submitBtn.textContent = busy ? 'Bezig…' : 'Inloggen';
      }
      if (addressInput) addressInput.disabled = busy;
      if (passwordInput) passwordInput.disabled = busy;
      if (logoutBtn) logoutBtn.disabled = busy;
    }

    function setRestoring(on) {
      if (restoreEl) {
        restoreEl.hidden = !on;
        restoreEl.textContent = on ? 'Sessie herstellen…' : '';
      }
      if (on) {
        if (form) form.hidden = true;
        if (loggedInView) loggedInView.hidden = true;
        if (whyPanel) whyPanel.hidden = true;
        if (loginHint) loginHint.hidden = true;
      }
    }

    function render(session) {
      clearSessionPendingClass();
      setRestoring(false);
      const loggedIn = Boolean(session);
      if (form) form.hidden = loggedIn;
      if (loggedInView) loggedInView.hidden = !loggedIn;
      if (gamesSection) gamesSection.hidden = !loggedIn;
      if (loginHint) loginHint.hidden = loggedIn;
      if (whyPanel) whyPanel.hidden = loggedIn;
      panel.classList.toggle('matrix-login-compact', loggedIn);

      if (loggedIn) {
        if (userLabel) userLabel.textContent = session.displayName || session.userId;
        if (userIdLabel) userIdLabel.textContent = session.userId;
        if (connEl) connEl.textContent = '';
        setError('');
      } else if (connEl) {
        connEl.textContent = '';
      }
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');
      setBusy(true);
      try {
        const session = await loginWithPassword(addressInput?.value, passwordInput?.value);
        if (passwordInput) passwordInput.value = '';
        render(session);
        if (typeof window.MdLobby?.start === 'function') {
          window.MdLobby.start();
        }
        if (typeof window.onMatrixLoginSuccess === 'function') {
          window.onMatrixLoginSuccess(session);
        }
      } catch (err) {
        setError(friendlyLoginError(err));
      } finally {
        setBusy(false);
      }
    });

    logoutBtn?.addEventListener('click', async () => {
      setBusy(true);
      setError('');
      try {
        if (typeof window.MdLobby?.stop === 'function') window.MdLobby.stop();
        await logout();
        render(null);
      } finally {
        setBusy(false);
      }
    });

    (async () => {
      const existing = loadSession();
      if (!existing) {
        clearSessionPendingClass();
        render(null);
        return;
      }
      setBusy(true);
      setRestoring(true);
      const valid = await validateSession(existing);
      setBusy(false);
      render(valid);
      if (valid && typeof window.MdLobby?.start === 'function') {
        window.MdLobby.start();
      }
    })();
  }

  window.MatrixAuth = {
    loadSession,
    saveSession,
    clearSession,
    loginWithPassword,
    logout,
    validateSession,
    refreshAccessToken,
    ensureFreshSession,
    needsRefresh,
    parseMatrixId,
    initMatrixLoginUi
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body?.dataset?.matrixLogin === 'true') {
      initMatrixLoginUi();
    }
    const existing = loadSession();
    if (existing) scheduleProactiveRefresh(existing);
  });
})();
