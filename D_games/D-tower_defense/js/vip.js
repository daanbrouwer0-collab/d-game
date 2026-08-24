/* MERGE-BLOCK: vip.js */
const Vip = (() => {
  const PASSWORD = 'Riszy';

  function sessionNameGrantsVip(sessionName) {
    return String(sessionName || '').includes(PASSWORD);
  }

  function resolveVip(session) {
    if (!session) return false;
    return !!(session.vip || sessionNameGrantsVip(session.sessionName));
  }

  function syncSessionVip(session) {
    if (!session) return session;
    session.vip = sessionNameGrantsVip(session.sessionName);
    return session;
  }

  function getMaxLevel() {
    return GameConfig.vipMaxLevel || 99;
  }

  function canAccessLevel(level, session) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    if (resolveVip(session)) return lvl <= getMaxLevel();
    const completed = Number(session?.maxCompletedLevel) || 0;
    const progress = Number(session?.currentLevel || session?.gameState?.lvl || 1);
    const maxUnlocked = Math.max(completed + 1, progress, 1);
    return lvl >= 1 && lvl <= maxUnlocked;
  }

  function getLockReason(level, session) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    if (canAccessLevel(lvl, session)) return '';
    if (resolveVip(session)) return `Max. level ${getMaxLevel()}`;
    const completed = Number(session?.maxCompletedLevel) || 0;
    if (completed > 0) return `Voltooi eerst level ${completed + 1}`;
    return 'Start bij level 1';
  }

  return {
    PASSWORD,
    sessionNameGrantsVip,
    resolveVip,
    syncSessionVip,
    getMaxLevel,
    canAccessLevel,
    getLockReason
  };
})();
/* END-MERGE-BLOCK */
