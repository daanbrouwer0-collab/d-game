/* MERGE-BLOCK: storage.js */
const Storage = (() => {
  const keys = GameConfig.storageKeys;

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return safeParse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function readSessions() {
    const list = readJson(keys.sessions, []);
    if (!Array.isArray(list)) return [];
    return list.filter((s) => s && typeof s === 'object' && s.id && s.sessionName);
  }

  function writeSessions(list) {
    return writeJson(keys.sessions, Array.isArray(list) ? list : []);
  }

  function getSession(id) {
    return readSessions().find((s) => s.id === id) || null;
  }

  function upsertSession(session) {
    if (!session?.id) return false;
    const list = readSessions().filter((s) => s.id !== session.id);
    list.unshift(session);
    const max = GameConfig.session?.maxCount || 24;
    writeSessions(list.slice(0, max));
    return true;
  }

  function deleteSession(id) {
    writeSessions(readSessions().filter((s) => s.id !== id));
  }

  function readLastSessionId() {
    const settings = readSettings();
    return settings.lastSessionId || null;
  }

  function writeLastSessionId(id) {
    return writeSettings({ ...readSettings(), lastSessionId: id || null });
  }

  function formatTimestamp(ts) {
    const d = new Date(Number(ts) || 0);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${m}-${y} ${hh}:${mm}`;
  }

  function forgetAll() {
    try {
      const prefix = `game:${GameConfig.slug}:`;
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  function readSettings() {
    return readJson(keys.settings, {
      sound: false,
      vibration: true,
      carStyleId: 'balanced',
      selectedTrack: 1,
      lastSessionId: null
    });
  }

  function writeSettings(settings) {
    return writeJson(keys.settings, settings || {});
  }

  return {
    readSessions,
    writeSessions,
    getSession,
    upsertSession,
    deleteSession,
    readLastSessionId,
    writeLastSessionId,
    formatTimestamp,
    forgetAll,
    readSettings,
    writeSettings
  };
})();
/* END-MERGE-BLOCK */
