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

  function trackIdOf(trackOrId) {
    return typeof trackOrId === 'number' ? trackOrId : GameConfig.getTrack(trackOrId)?.id;
  }

  function isVipTrack(trackOrId) {
    return !!GameConfig.getTrack(trackOrId)?.vip;
  }

  function trackHasTime(trackId) {
    const rec = NeonRacerGame.getLevelRecord?.(trackId);
    return !!(rec && Number(rec.time) > 0);
  }

  function isProgressionUnlocked(trackId, session) {
    if (resolveVip(session)) return true;
    const id = trackIdOf(trackId);
    if (id <= 1) return true;
    if (id > GameConfig.publicTrackCount) return false;
    return trackHasTime(id - 1);
  }

  function canAccessTrack(trackOrId, session) {
    const id = trackIdOf(trackOrId);
    const track = GameConfig.getTrack(id);
    if (!track) return false;
    if (resolveVip(session)) return true;
    if (track.vip) return false;
    return isProgressionUnlocked(id, session);
  }

  function getLockReason(trackOrId, session) {
    const id = trackIdOf(trackOrId);
    const track = GameConfig.getTrack(id);
    if (!track) return '';
    if (resolveVip(session)) return '';
    if (track.vip) {
      return 'VIP-baan — lees de Insider-tip in het menu';
    }
    if (id > 1 && !trackHasTime(id - 1)) {
      const prev = GameConfig.getTrack(id - 1);
      return `Rond eerst ${prev.name} af met een tijd`;
    }
    return '';
  }

  function getHighestUnlockedTrackId(session) {
    if (resolveVip(session)) return GameConfig.trackCount;
    let max = 1;
    for (let i = 2; i <= GameConfig.publicTrackCount; i++) {
      if (!trackHasTime(i - 1)) break;
      max = i;
    }
    return max;
  }

  return {
    PASSWORD,
    sessionNameGrantsVip,
    resolveVip,
    syncSessionVip,
    isVipTrack,
    trackHasTime,
    isProgressionUnlocked,
    canAccessTrack,
    getLockReason,
    getHighestUnlockedTrackId
  };
})();
/* END-MERGE-BLOCK */
