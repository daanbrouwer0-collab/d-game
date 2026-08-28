/* MERGE-BLOCK: sectors.js */
const Sectors = (() => {
  let listEl;
  let btnStartSector;
  let selectedLevel = 1;

  function init() {
    listEl = document.getElementById('sector-list');
    btnStartSector = document.getElementById('btn-sector-start');
    selectedLevel = Number(G.lvl) || 1;

    btnStartSector?.addEventListener('click', () => {
      startSector(selectedLevel);
    });

    listEl?.addEventListener('click', (e) => {
      const card = e.target.closest('[data-sector-level]');
      if (!card) return;
      const lvl = Number(card.dataset.sectorLevel);
      const session = Menu.getActiveSession?.();
      const max = getMaxAllowedLevel(session);
      if (lvl > max) {
        Toast.show('Deze sector is nog vergrendeld');
        return;
      }
      selectedLevel = lvl;
      render();
    });

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'sectors') render();
    });
  }

  function getMaxAllowedLevel(session) {
    if (Vip.resolveVip(session)) return 20;
    const completed = Number(session?.maxCompletedLevel) || 0;
    return Math.max(1, completed + 1);
  }

  function render() {
    if (!listEl) return;
    const session = Menu.getActiveSession?.();
    const completed = Number(session?.maxCompletedLevel) || 0;
    const maxAllowed = getMaxAllowedLevel(session);
    const currentPlaying = Number(G.lvl) || 1;

    if (selectedLevel > maxAllowed) selectedLevel = maxAllowed;

    const totalToShow = Math.max(10, completed + 3);
    const items = [];

    for (let lvl = 1; lvl <= totalToShow; lvl++) {
      const name = GameConfig.getLevelName(lvl);
      const isCompleted = lvl <= completed;
      const isCurrent = lvl === currentPlaying;
      const isSelected = lvl === selectedLevel;
      const isLocked = lvl > maxAllowed;

      items.push(`
        <button type="button" class="track-card${isSelected ? ' active' : ''}${isLocked ? ' track-card-locked' : ''}" data-sector-level="${lvl}"${isLocked ? ' disabled' : ''}>
          <div class="track-card-top">
            <span class="track-lvl">Sector ${lvl}</span>
            ${isLocked ? '<span class="track-locked">Vergrendeld</span>' : (isCompleted ? '<span class="track-picked">✓ Voltooid</span>' : (isCurrent ? '<span class="track-picked">Actief</span>' : ''))}
          </div>
          <strong class="track-name">${name}</strong>
          <span class="track-theme">Waves 1–5</span>
        </button>
      `);
    }

    listEl.innerHTML = items.join('');

    if (btnStartSector) {
      btnStartSector.textContent = `Start Sector ${selectedLevel} (${GameConfig.getLevelName(selectedLevel)})`;
      btnStartSector.disabled = selectedLevel > maxAllowed;
    }
  }

  function startSector(lvl) {
    const session = Menu.getActiveSession?.();
    const max = getMaxAllowedLevel(session);
    if (lvl > max) {
      Toast.show('Sector nog vergrendeld');
      return;
    }
    G.startFreshLevel?.(lvl);
    Nav.switchTab('play');
    Toast.show(`Sector ${lvl} gestart!`);
  }

  return { init, render, getSelectedLevel: () => selectedLevel };
})();
/* END-MERGE-BLOCK */
