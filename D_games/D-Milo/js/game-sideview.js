/* MERGE-BLOCK: game-sideview.js — universele game hub */
const SideViewGame = (() => {
  const MODES = [
    {
      id: 'adventure',
      label: 'Avontuur',
      shortLabel: 'Avontuur',
      desc: 'Goed voor actie, platform, verhaal, missies en ontdekking.'
    },
    {
      id: 'chess',
      label: 'Schaak',
      shortLabel: 'Schaak',
      desc: 'Sterk voor beurtlogica, bordweergave, zettenhistorie en AI.'
    },
    {
      id: '3d',
      label: 'Kirby 3D',
      shortLabel: 'Kirby',
      desc: 'Rond Kirby in een blokkenwereld — loop, spring en zuig sterren op.'
    },
    {
      id: 'fishing',
      label: 'Vissen',
      shortLabel: 'Vissen',
      desc: 'Past bij ritme, locaties, beloningen, inventory en progressie.'
    },
    {
      id: 'poker',
      label: 'Poker',
      shortLabel: 'Poker',
      desc: 'Geschikt voor kaarten, chips, rondes, UI-statistiek en regels.'
    },
    {
      id: 'memory',
      label: 'Memory',
      shortLabel: 'Memory',
      desc: 'Handig voor compacte levels, score, tijd en herhaalbare sessies.'
    },
    {
      id: 'risk',
      label: 'Risk',
      shortLabel: 'Risk',
      desc: 'Sterk voor strategische maps, teams, fases en menu-gestuurde flow.'
    }
  ];

  let running = false;
  let paused = false;
  let pendingShareFile = null;
  let sharePromptOpen = false;
  let sharePreviewUrl = '';
  let msgTimer = null;
  let systemUnlockIndex = 0;

  let bodyColors = { ...GameConfig.player.bodyColors };
  let sessionMeta = {
    sessionName: '',
    characterName: 'Held',
    difficulty: 'normal'
  };

  let state = createDefaultState();

  const refs = {};

  function createDefaultState() {
    return {
      score: 120,
      coins: 4,
      wood: 4,
      rope: 3,
      camera: 2,
      level: 1,
      hp: 100,
      mode: '3d',
      t: Date.now()
    };
  }

  function cacheDom() {
    refs.hudScore = document.getElementById('hud-score');
    refs.hudCoins = document.getElementById('hud-coins');
    refs.hudLevel = document.getElementById('hud-level');
    refs.hudHp = document.getElementById('hud-hp');

    refs.heroAvatar = document.getElementById('hero-avatar');
    refs.heroCharacterName = document.getElementById('hero-character-name');
    refs.heroSessionLine = document.getElementById('hero-session-line');
    refs.hubTitle = document.getElementById('hub-title');
    refs.hubSubtitle = document.getElementById('hub-subtitle');
    refs.hubModeChip = document.getElementById('hub-mode-chip');
    refs.hubSessionChip = document.getElementById('hub-session-chip');
    refs.hubStatusChip = document.getElementById('hub-status-chip');
    refs.activeModeDesc = document.getElementById('active-mode-desc');
    refs.progressNote = document.getElementById('progress-note');
    refs.modeLibraryList = document.getElementById('game-mode-list');

    refs.btnCycleTemplate = document.getElementById('btn-cycle-template');
    refs.btnRandomTemplate = document.getElementById('btn-random-template');
    refs.btnBoostProgress = document.getElementById('btn-boost-progress');
    refs.btnAddScore = document.getElementById('btn-add-score');
    refs.btnAddCoin = document.getElementById('btn-add-coin');
    refs.btnUnlockSystem = document.getElementById('btn-unlock-system');
    refs.btnRestoreEnergy = document.getElementById('btn-restore-energy');
    refs.btnPlayKirby = document.getElementById('btn-play-kirby');
    refs.pauseBadge = document.getElementById('pause-badge');

    refs.statScore = document.getElementById('stat-score');
    refs.statCoins = document.getElementById('stat-coins');
    refs.statLevel = document.getElementById('stat-level');
    refs.statHp = document.getElementById('stat-hp');

    refs.invCoin = document.getElementById('inv-coin');
    refs.invWood = document.getElementById('inv-wood');
    refs.invRope = document.getElementById('inv-rope');
    refs.invCamera = document.getElementById('inv-camera');

    refs.modal = document.getElementById('share-modal');
    refs.sharePreview = document.getElementById('share-preview');
    refs.btnShareYes = document.getElementById('btn-share-yes');
    refs.btnShareNo = document.getElementById('btn-share-no');
  }

  function getMode(modeId = state.mode) {
    return MODES.find((mode) => mode.id === modeId) || MODES[0];
  }

  function normalizeBodyColors(colors) {
    const defaults = GameConfig.player.bodyColors;
    const hex = (value, fallback) => (
      typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
    );

    return {
      head: hex(colors?.head, defaults.head),
      body: hex(colors?.body, defaults.body),
      legs: hex(colors?.legs, defaults.legs)
    };
  }

  function loadBodyColors() {
    const settings = Storage.readSettings();
    bodyColors = normalizeBodyColors(settings.characterColors || GameConfig.player.bodyColors);
  }

  function getBodyColors() {
    return { ...bodyColors };
  }

  function setBodyColors(colors) {
    bodyColors = normalizeBodyColors({ ...bodyColors, ...colors });
    Storage.writeSettings({
      ...Storage.readSettings(),
      characterColors: { ...bodyColors }
    });
    syncDashboardAvatar();
  }

  function resetBodyColors() {
    bodyColors = { ...GameConfig.player.bodyColors };
    Storage.writeSettings({
      ...Storage.readSettings(),
      characterColors: { ...bodyColors }
    });
    syncDashboardAvatar();
  }

  function setSessionMeta(meta = {}) {
    sessionMeta = {
      sessionName: String(meta.sessionName || '').trim(),
      characterName: String(meta.characterName || 'Held')
        .trim()
        .slice(0, GameConfig.session?.maxCharacterLength || 18),
      difficulty: GameConfig.difficulty[meta.difficulty] ? meta.difficulty : 'normal'
    };
    renderPlayScreen();
  }

  function getSessionMeta() {
    return { ...sessionMeta };
  }

  function getPlayerBodyParts(p) {
    const headH = Math.round(p.h * 0.36);
    const bodyH = Math.round(p.h * 0.38);
    const legsH = p.h - headH - bodyH;
    const headW = Math.round(p.w * 0.78);
    const headX = p.x + (p.w - headW) / 2;

    return {
      head: { x: headX, y: p.y, w: headW, h: headH },
      body: { x: p.x, y: p.y + headH, w: p.w, h: bodyH },
      legs: { x: p.x, y: p.y + headH + bodyH, w: p.w, h: legsH }
    };
  }

  function isKirbyMode() {
    return state.mode === '3d';
  }

  function launchKirbyWorld() {
    setMode('3d', false);

    if (!window.THREE) {
      showMessage('Three.js mist — check js/vendor/three.min.js');
      return Promise.resolve(false);
    }

    if (!window.VoxelKirbyGame) {
      showMessage('Game kon niet laden');
      return Promise.resolve(false);
    }

    if (!window.VoxelKirbyGame._inited) {
      window.VoxelKirbyGame.init();
      window.VoxelKirbyGame._inited = true;
    }

    if (Nav.getActiveTab?.() !== 'play') Nav.switchTab('play');

    return window.VoxelKirbyGame.start().then((ok) => {
      if (!ok) {
        showMessage('3D wereld kon niet starten');
        return false;
      }

      running = true;
      paused = false;
      syncPauseBadge();
      renderPlayScreen();
      showMessage(`${sessionMeta.characterName || 'Kirby'} — zuig sterren!`);
      return true;
    });
  }

  function stopKirbyWorld() {
    window.VoxelKirbyGame?.stop();
    syncPauseBadge();
  }

  function syncPauseBadge() {
    if (!refs.pauseBadge) return;
    const show = running && paused && window.VoxelKirbyGame?.isActive?.();
    refs.pauseBadge.classList.toggle('hidden', !show);
  }

  function bindActions() {
    refs.btnPlayKirby?.addEventListener('click', launchKirbyWorld);
    refs.btnCycleTemplate?.addEventListener('click', cycleMode);
    refs.btnRandomTemplate?.addEventListener('click', randomizeMode);
    refs.btnBoostProgress?.addEventListener('click', boostTemplate);
    refs.btnAddScore?.addEventListener('click', addCredits);
    refs.btnAddCoin?.addEventListener('click', addUiModule);
    refs.btnUnlockSystem?.addEventListener('click', unlockSystem);
    refs.btnRestoreEnergy?.addEventListener('click', restoreEnergy);

    document.querySelectorAll('.template-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode, true);
      });
    });
  }

  function bindShareModal() {
    refs.btnShareYes?.addEventListener('click', () => {
      void shareCurrentMoment();
    });
    refs.btnShareNo?.addEventListener('click', closeSharePrompt);
    refs.modal?.addEventListener('click', (e) => {
      if (e.target === refs.modal) closeSharePrompt();
    });
  }

  function getDifficultyLabel() {
    return GameConfig.difficulty[sessionMeta.difficulty]?.label || 'Normal';
  }

  function setMode(modeId, announce = false) {
    const mode = getMode(modeId);
    state.mode = mode.id;
    state.t = Date.now();
    updateAll();
    if (announce) showMessage(`${mode.label} template actief`);
  }

  function cycleMode() {
    const currentIndex = MODES.findIndex((mode) => mode.id === state.mode);
    const nextMode = MODES[(currentIndex + 1) % MODES.length];
    setMode(nextMode.id, true);
  }

  function randomizeMode() {
    const currentMode = state.mode;
    let nextMode = currentMode;

    while (nextMode === currentMode && MODES.length > 1) {
      nextMode = MODES[Math.floor(Math.random() * MODES.length)].id;
    }

    setMode(nextMode, true);
  }

  function addCredits() {
    state.score += 50;
    state.t = Date.now();
    updateAll();
    showMessage('+50 credits voor je template');
  }

  function addUiModule() {
    state.coins += 1;
    state.wood += 1;
    state.hp = Math.max(40, Math.min(100, state.hp + 3));
    state.t = Date.now();
    updateAll();
    showMessage('UI module toegevoegd');
  }

  function unlockSystem() {
    const channel = systemUnlockIndex % 3;
    if (channel === 0) state.wood += 1;
    if (channel === 1) state.rope += 1;
    if (channel === 2) state.camera += 1;
    systemUnlockIndex += 1;
    state.score += 25;
    state.t = Date.now();
    updateAll();
    showMessage('Nieuw systeem geactiveerd');
  }

  function restoreEnergy() {
    state.hp = 100;
    state.t = Date.now();
    updateAll();
    showMessage('Template status hersteld');
  }

  function boostTemplate() {
    state.level = Math.min(9, state.level + 1);
    state.score += 80;
    state.coins += 1;
    state.wood += 1;
    state.rope += 1;
    state.camera += state.level % 2 === 0 ? 1 : 0;
    state.hp = Math.min(100, state.hp + 8);
    state.t = Date.now();
    updateAll();
    showMessage(`Fase ${state.level} bereikt`);
  }

  function exportState() {
    return {
      score: state.score,
      coins: state.coins,
      wood: state.wood,
      rope: state.rope,
      camera: state.camera,
      level: state.level,
      hp: state.hp,
      mode: state.mode,
      t: Date.now()
    };
  }

  function importState(save) {
    if (!save || typeof save !== 'object') return false;

    state = {
      score: Number(save.score) || 0,
      coins: Number(save.coins) || 0,
      wood: Number(save.wood) || 0,
      rope: Number(save.rope) || 0,
      camera: Number(save.camera) || 0,
      level: Math.max(1, Number(save.level) || 1),
      hp: Math.max(0, Math.min(100, Number(save.hp) || 100)),
      mode: getMode(save.mode).id,
      t: Number(save.t) || Date.now()
    };

    updateAll();
    return true;
  }

  function resetGame() {
    state = createDefaultState();
    updateAll();
  }

  function stopGame() {
    stopKirbyWorld();
    running = false;
    paused = false;
    closeSharePrompt();
    setSessionMeta({ sessionName: '', characterName: 'Held', difficulty: 'normal' });
    loadBodyColors();
    resetGame();
  }

  function start(fromLoad = false) {
    if (!fromLoad) {
      resetGame();
      state.mode = '3d';
    }
    running = true;
    paused = false;
    renderPlayScreen();
    launchKirbyWorld();
  }

  function pause() {
    paused = true;
    if (window.VoxelKirbyGame?.isActive?.()) {
      window.VoxelKirbyGame.pause();
    }
    syncPauseBadge();
  }

  function resume() {
    if (!running) {
      start(true);
      return;
    }
    paused = false;
    if (window.VoxelKirbyGame?.isActive?.()) {
      window.VoxelKirbyGame.resume();
    } else {
      launchKirbyWorld();
    }
    syncPauseBadge();
    renderPlayScreen();
  }

  function onTabVisible() {
    if (window.VoxelKirbyGame?.isActive?.()) {
      window.VoxelKirbyGame.resize();
      if (!paused) window.VoxelKirbyGame.resume();
    }
    renderPlayScreen();
  }

  function onTabHidden() {
    if (running) {
      paused = true;
      window.VoxelKirbyGame?.pause();
      syncPauseBadge();
    }
  }

  function syncDashboardAvatar() {
    if (!refs.heroAvatar) return;
    refs.heroAvatar.style.setProperty('--hero-head', bodyColors.head);
    refs.heroAvatar.style.setProperty('--hero-body', bodyColors.body);
    refs.heroAvatar.style.setProperty('--hero-legs', bodyColors.legs);
  }

  function getStatusText() {
    if (!running) return 'Status: wacht op een session';
    if (paused || Menu.isVisible?.()) return 'Status: gepauzeerd maar volledig klaar';
    return 'Status: template actief en uitbreidbaar';
  }

  function renderPlayScreen() {
    const mode = getMode();

    if (refs.heroCharacterName) {
      refs.heroCharacterName.textContent = sessionMeta.characterName || 'Held';
    }

    if (refs.heroSessionLine) {
      refs.heroSessionLine.textContent = sessionMeta.sessionName
        ? `${sessionMeta.sessionName} · ${getDifficultyLabel()}`
        : 'Nog geen actieve session';
    }

    if (refs.hubTitle) {
      refs.hubTitle.textContent = window.VoxelKirbyGame?.isActive?.()
        ? 'Kirby rent door de blokkenwereld'
        : `${mode.label} is actief, maar je kunt elk moment wisselen`;
    }

    if (refs.hubSubtitle) {
      refs.hubSubtitle.textContent = mode.desc;
    }

    if (refs.hubModeChip) {
      refs.hubModeChip.textContent = `Actief template: ${mode.shortLabel}`;
    }

    if (refs.hubSessionChip) {
      refs.hubSessionChip.textContent = sessionMeta.sessionName
        ? `Session: ${sessionMeta.sessionName}`
        : 'Session: nog niet gestart';
    }

    if (refs.hubStatusChip) {
      refs.hubStatusChip.textContent = getStatusText();
    }

    if (refs.activeModeDesc) {
      refs.activeModeDesc.textContent = `${mode.label}: ${mode.desc}`;
    }

    if (refs.progressNote) {
      refs.progressNote.textContent = `Fase ${state.level} · ${state.wood + state.rope + state.camera} systemen`;
    }

    document.querySelectorAll('.template-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });

    syncDashboardAvatar();
    renderModeLibrary();
  }

  function renderModeLibrary() {
    if (!refs.modeLibraryList) return;

    refs.modeLibraryList.innerHTML = MODES.map((mode) => {
      const active = mode.id === state.mode;
      const label = active ? 'Actief' : 'Beschikbaar';
      const btnClass = active ? 'btn success' : 'btn alt';

      return `
        <div class="mode-library-row">
          <div class="info">
            <strong>${mode.label}</strong>
            <span>${mode.desc}</span>
          </div>
          <button class="${btnClass}" type="button" data-world-mode="${mode.id}">${label}</button>
        </div>
      `;
    }).join('');

    refs.modeLibraryList.querySelectorAll('[data-world-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.worldMode, true);
      });
    });
  }

  function updateHud() {
    const mode = getMode();
    if (refs.hudScore) refs.hudScore.textContent = `Credits: ${state.score}`;
    if (refs.hudCoins) refs.hudCoins.textContent = `Modules: ${state.wood + state.rope + state.camera}`;
    if (refs.hudLevel) refs.hudLevel.textContent = `Fase: ${state.level} · ${mode.shortLabel}`;
    if (refs.hudHp) refs.hudHp.textContent = `Energie: ${state.hp}%`;
  }

  function updateItemsTab() {
    if (refs.invCoin) refs.invCoin.textContent = state.score;
    if (refs.invWood) refs.invWood.textContent = state.wood;
    if (refs.invRope) refs.invRope.textContent = state.rope;
    if (refs.invCamera) refs.invCamera.textContent = state.camera;
  }

  function updatePanelStats() {
    if (refs.statScore) refs.statScore.textContent = state.score;
    if (refs.statCoins) refs.statCoins.textContent = state.wood + state.rope + state.camera;
    if (refs.statLevel) refs.statLevel.textContent = state.level;
    if (refs.statHp) refs.statHp.textContent = `${state.hp}%`;
    updateItemsTab();
  }

  function updateAll() {
    updateHud();
    updatePanelStats();
    renderPlayScreen();
  }

  function buildShareCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    const mode = getMode();

    const bg = ctx.createLinearGradient(0, 0, 640, 420);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(0.5, '#111827');
    bg.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 640, 420);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText(GameConfig.title, 40, 62);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillText(`Template: ${mode.label}`, 40, 102);
    ctx.fillText(`Karakter: ${sessionMeta.characterName || 'Held'}`, 40, 134);
    ctx.fillText(`Session: ${sessionMeta.sessionName || 'Nog niet gestart'}`, 40, 166);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(40, 210, 560, 130);

    ctx.fillStyle = bodyColors.head;
    ctx.fillRect(420, 78, 90, 62);
    ctx.fillStyle = bodyColors.body;
    ctx.fillRect(400, 144, 130, 72);
    ctx.fillStyle = bodyColors.legs;
    ctx.fillRect(400, 220, 58, 100);
    ctx.fillRect(472, 220, 58, 100);
    ctx.fillStyle = '#001018';
    ctx.fillRect(486, 98, 14, 14);

    ctx.fillStyle = '#c4b5fd';
    ctx.font = '700 22px Inter, sans-serif';
    ctx.fillText(`Fase ${state.level} · Credits ${state.score} · Systemen ${state.wood + state.rope + state.camera}`, 40, 250);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillText(mode.desc, 40, 292);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText('Universele template zonder vaste game-scene, klaar voor uitbreiding.', 40, 370);

    return canvas;
  }

  function canvasToShareFile(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], 'd-game-template.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  async function openSharePrompt() {
    if (sharePromptOpen) return;

    const previewCanvas = buildShareCanvas();
    pendingShareFile = await canvasToShareFile(previewCanvas);
    sharePreviewUrl = previewCanvas.toDataURL('image/png');
    sharePromptOpen = true;
    paused = true;

    if (refs.sharePreview) refs.sharePreview.src = sharePreviewUrl;
    if (refs.modal) {
      refs.modal.classList.add('open');
      refs.modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSharePrompt() {
    sharePromptOpen = false;
    pendingShareFile = null;
    if (sharePreviewUrl) {
      sharePreviewUrl = '';
    }
    if (refs.sharePreview) refs.sharePreview.removeAttribute('src');
    if (refs.modal) {
      refs.modal.classList.remove('open');
      refs.modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function shareCurrentMoment() {
    if (!pendingShareFile) {
      closeSharePrompt();
      return;
    }

    const shareText = `Ik bouw nu een ${getMode().label.toLowerCase()} game vanuit ${GameConfig.title}.`;

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [pendingShareFile] })) {
      try {
        await navigator.share({
          title: `${GameConfig.title} moment`,
          text: shareText,
          files: [pendingShareFile]
        });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          alert('Delen mislukt of geannuleerd.');
        }
      }
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: `${GameConfig.title} moment`,
          text: shareText
        });
      } catch (error) {
        if (error?.name !== 'AbortError') {
          alert('Delen mislukt of geannuleerd.');
        }
      }
    } else {
      alert('Delen wordt niet ondersteund in deze browser.');
    }

    closeSharePrompt();
  }

  function showMessage(text) {
    const overlay = document.getElementById('msg-overlay');
    const msgText = document.getElementById('msg-text');
    if (!overlay || !msgText) return;
    msgText.textContent = text;
    overlay.classList.add('visible');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => overlay.classList.remove('visible'), 1400);
  }

  function init() {
    loadBodyColors();
    cacheDom();
    bindActions();
    bindShareModal();

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'btn alt';
    shareButton.textContent = 'Deel moment';
    shareButton.addEventListener('click', () => {
      void openSharePrompt();
    });
    refs.btnBoostProgress?.insertAdjacentElement('afterend', shareButton);

    window.addEventListener('kirby-collect', (e) => {
      state.coins = e.detail?.stars ?? state.coins;
      state.score += 25;
      updateAll();
    });

    setMode('3d', false);

    if (window.VoxelKirbyGame && !window.VoxelKirbyGame._inited) {
      window.VoxelKirbyGame.init();
      window.VoxelKirbyGame._inited = true;
    }

    updateAll();
  }

  return {
    init,
    start,
    pause,
    resume,
    onTabVisible,
    onTabHidden,
    exportState,
    importState,
    resetGame,
    stopGame,
    getBodyColors,
    setBodyColors,
    resetBodyColors,
    getPlayerBodyParts,
    setSessionMeta,
    getSessionMeta
  };
})();
/* END-MERGE-BLOCK */
