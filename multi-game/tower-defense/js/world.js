/* MERGE-BLOCK: world.js */
const World = (() => {
  let listEl;

  function init() {
    listEl = document.getElementById('world-level-list');
    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'world') refresh();
    });
    refresh();
  }

  function refresh() {
    if (!listEl) return;

    const session = Menu.getActiveSession?.();
    const hasSession = Menu.hasStarted?.() && (session || G.sessionMeta);
    const maxCompleted = hasSession
      ? (session?.maxCompletedLevel || G.sessionMeta?.maxCompletedLevel || 0)
      : 0;
    const currentLvl = G.lvl || session?.currentLevel || session?.gameState?.lvl || 1;
    const currentWave = G.wave || session?.currentWave || session?.gameState?.wave || 1;
    const hasSave = !!(session?.gameState && session.gameState.map?.length);

    listEl.innerHTML = '';

    if (!hasSession) {
      listEl.innerHTML = '<p class="empty-state">Start eerst een session via het huis-icoon om je voortgang op te slaan.</p>';
      return;
    }

    const progress = document.createElement('div');
    progress.className = 'glass-card world-progress-card';
    progress.innerHTML = `
      <div class="world-progress-title">Huidige voortgang</div>
      <div class="world-progress-line"><strong>Level ${currentLvl}</strong> — ${GameConfig.getLevelName(currentLvl)}</div>
      <div class="world-progress-line">Wave ${currentWave} / ${CFG.SYS.maxWaves}</div>
      <div class="world-progress-meta">${hasSave ? `Opgeslagen: ${Storage.formatTimestamp(session.updatedAt)}` : 'Nog geen tussentijdse save'}</div>
    `;
    listEl.appendChild(progress);

    const actions = document.createElement('div');
    actions.className = 'world-actions';

    const btnContinue = document.createElement('button');
    btnContinue.type = 'button';
    btnContinue.className = 'btn success';
    btnContinue.textContent = 'Ga verder waar je was';
    btnContinue.disabled = !hasSave;
    btnContinue.addEventListener('click', () => Menu.resumeFromSave());
    actions.appendChild(btnContinue);

    listEl.appendChild(actions);

    if (maxCompleted > 0) {
      const replayHead = document.createElement('p');
      replayHead.className = 'world-replay-head';
      replayHead.textContent = 'Voltooide sectoren (herhalen)';
      listEl.appendChild(replayHead);

      for (let i = 1; i <= maxCompleted; i++) {
        const row = document.createElement('div');
        row.className = 'setting-row';

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `<strong>Level ${i} — ${GameConfig.getLevelName(i)}</strong><span>Beveiligd ✓</span>`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn alt';
        btn.textContent = 'Herhaal';
        btn.addEventListener('click', () => Menu.replayLevel(i));

        row.appendChild(info);
        row.appendChild(btn);
        listEl.appendChild(row);
      }
    }
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
