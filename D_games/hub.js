(function hubShared() {
  const STORAGE_KEY = 'd-games-hub-character';
  const DEFAULT_COLORS = { head: '#cccccc', body: '#888888', legs: '#444444' };
  const DEFAULT_NAME = 'nobody';
  const PLAYER = { w: 32, h: 44 };

  function normalizeName(name) {
    const n = String(name ?? '').trim().slice(0, 18);
    return n || DEFAULT_NAME;
  }

  function hasCustomName(name) {
    return normalizeName(name).toLowerCase() !== DEFAULT_NAME;
  }

  function defaultState() {
    return { name: DEFAULT_NAME, colors: { ...DEFAULT_COLORS } };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      let name = normalizeName(data.name);
      if (name === 'Held') name = DEFAULT_NAME;
      return {
        name,
        colors: { ...DEFAULT_COLORS, ...(data.colors || {}) }
      };
    } catch {
      return defaultState();
    }
  }

  function startBgMotion() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const root = document.documentElement;
    const start = performance.now();
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const pct = (v) => `${clamp(v, 0, 100).toFixed(2)}%`;

    const tick = (t) => {
      const s = (t - start) / 1000;
      root.style.setProperty('--b1x', pct(15 + Math.sin(s * 0.55) * 14));
      root.style.setProperty('--b1y', pct(20 + Math.cos(s * 0.62) * 12));
      root.style.setProperty('--b2x', pct(85 + Math.sin(s * 0.47 + 1.7) * 14));
      root.style.setProperty('--b2y', pct(25 + Math.cos(s * 0.58 + 0.9) * 12));
      root.style.setProperty('--b3x', pct(55 + Math.sin(s * 0.36 + 2.9) * 18));
      root.style.setProperty('--b3y', pct(95 + Math.cos(s * 0.44 + 1.2) * 10));
      root.style.setProperty('--b4x', pct(25 + Math.sin(s * 0.41 + 0.4) * 16));
      root.style.setProperty('--b4y', pct(80 + Math.cos(s * 0.52 + 2.2) * 12));
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function initHub(options = {}) {
    const { mode = null, gamesAction = 'games' } = options;

    const btnCharacter = document.getElementById('btn-hub-character');
    const btnMenu = document.getElementById('btn-hub-menu');
    const menuScrim = document.getElementById('hub-menu-scrim');
    const menuPopup = document.getElementById('hub-menu-popup');
    const characterOverlay = document.getElementById('hub-character-overlay');
    const memoryOverlay = document.getElementById('hub-memory-overlay');
    const btnCharacterClose = document.getElementById('btn-hub-character-close');
    const btnCharacterSave = document.getElementById('btn-hub-character-save');
    const btnMemoryClose = document.getElementById('btn-hub-memory-close');
    const btnMemoryClear = document.getElementById('btn-hub-memory-clear');
    const previewCanvas = document.getElementById('hub-character-preview');
    const previewCtx = previewCanvas?.getContext('2d');
    const nameInput = document.getElementById('hub-character-name');
    const mainTitle = document.getElementById('hub-main-title');
    const gamesGrid = document.getElementById('hub-games-grid');
    const emptyMode = document.getElementById('hub-empty-mode');
    const colorInputs = {
      head: document.getElementById('hub-color-head'),
      body: document.getElementById('hub-color-body'),
      legs: document.getElementById('hub-color-legs')
    };

    let state = loadState();
    let backupState = null;
    let visibleGames = [];

    if (mode && typeof renderGameCards === 'function' && gamesGrid) {
      visibleGames = renderGameCards(gamesGrid, mode);
      if (emptyMode) {
        emptyMode.hidden = visibleGames.length > 0;
      }
    }

    function updateMainTitle() {
      if (!mainTitle) return;
      if (mode === 'single') {
        mainTitle.textContent = 'Single Device';
        return;
      }
      if (mode === 'multi') {
        mainTitle.textContent = 'Multi Device';
        return;
      }
      const name = normalizeName(state.name);
      mainTitle.textContent = hasCustomName(name)
        ? `Hoi ${name}`
        : 'Hee nobody wat is je naam?';
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearSavedData() {
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      syncInputs();
    }

    function getBodyParts() {
      const headH = Math.round(PLAYER.h * 0.36);
      const bodyH = Math.round(PLAYER.h * 0.38);
      const legsH = PLAYER.h - headH - bodyH;
      const headW = Math.round(PLAYER.w * 0.78);
      const headX = (PLAYER.w - headW) / 2;
      return {
        head: { x: headX, y: 0, w: headW, h: headH },
        body: { x: 0, y: headH, w: PLAYER.w, h: bodyH },
        legs: { x: 0, y: headH + bodyH, w: PLAYER.w, h: legsH }
      };
    }

    function drawPreview() {
      const iconHead = document.getElementById('hub-icon-head');
      const iconBody = document.getElementById('hub-icon-body');
      const iconMenuHead = document.getElementById('hub-icon-menu-head');
      const iconMenuBody = document.getElementById('hub-icon-menu-body');
      if (state && state.colors) {
        if (iconHead && iconBody) {
          iconHead.style.fill = state.colors.head;
          iconHead.style.stroke = state.colors.head;
          iconBody.style.fill = state.colors.body;
          iconBody.style.stroke = state.colors.body;
        }
        if (iconMenuHead && iconMenuBody) {
          iconMenuHead.style.fill = state.colors.head;
          iconMenuHead.style.stroke = state.colors.head;
          iconMenuBody.style.fill = state.colors.body;
          iconMenuBody.style.stroke = state.colors.body;
        }
      }

      if (!previewCtx || !previewCanvas) return;
      const w = previewCanvas.width;
      const h = previewCanvas.height;
      const scale = 3.2;
      const ox = (w - PLAYER.w * scale) / 2;
      const oy = (h - PLAYER.h * scale) / 2 + 4;
      const parts = getBodyParts();
      const colors = state.colors;

      previewCtx.clearRect(0, 0, w, h);
      const bg = previewCtx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(0, 255, 255, 0.1)');
      bg.addColorStop(1, 'rgba(255, 0, 255, 0.06)');
      previewCtx.fillStyle = bg;
      previewCtx.fillRect(0, 0, w, h);

      previewCtx.fillStyle = 'rgba(0, 255, 255, 0.12)';
      previewCtx.fillRect(ox - 4, oy + PLAYER.h * scale - 10, PLAYER.w * scale + 8, 8);

      const legGap = 3 * scale;
      const legW = (parts.legs.w * scale - legGap) / 2;
      const legsX = ox + parts.legs.x * scale;
      const legsY = oy + parts.legs.y * scale;
      previewCtx.fillStyle = colors.legs;
      previewCtx.fillRect(legsX, legsY, legW, parts.legs.h * scale);
      previewCtx.fillRect(legsX + legW + legGap, legsY, legW, parts.legs.h * scale);

      previewCtx.fillStyle = colors.body;
      previewCtx.fillRect(ox + parts.body.x * scale, oy + parts.body.y * scale, parts.body.w * scale, parts.body.h * scale);

      previewCtx.fillStyle = colors.head;
      previewCtx.fillRect(ox + parts.head.x * scale, oy + parts.head.y * scale, parts.head.w * scale, parts.head.h * scale);

      previewCtx.fillStyle = '#001018';
      previewCtx.fillRect(
        ox + parts.head.x * scale + parts.head.w * scale - 7 * scale,
        oy + parts.head.y * scale + 5 * scale,
        5 * scale,
        5 * scale
      );
    }

    function updateVisibility() {
      if (!mode) return;
      const currentName = normalizeName(state.name).toLowerCase();
      const gamesList = typeof GAMES_DATA !== 'undefined' ? getGamesByMode(mode) : [];

      gamesList.forEach((game) => {
        const card = document.querySelector(`[data-game-id="${game.id}"]`);
        if (!card) return;

        const passwords = (game.passwords || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean);
        if (passwords.length === 0) {
          card.style.display = '';
          return;
        }
        if (currentName === 'nobody') {
          card.style.display = 'none';
          return;
        }
        const isAllowed = passwords.some((pwd) => currentName.includes(pwd));
        card.style.display = isAllowed ? '' : 'none';
      });

      if (emptyMode && gamesGrid) {
        const anyVisible = Array.from(gamesGrid.querySelectorAll('.card')).some(
          (card) => card.style.display !== 'none'
        );
        emptyMode.hidden = anyVisible;
      }
    }

    function syncInputs() {
      if (nameInput) nameInput.value = state.name;
      Object.entries(colorInputs).forEach(([part, input]) => {
        if (input) input.value = state.colors[part];
      });
      drawPreview();
      updateMainTitle();
      updateVisibility();
    }

    function closeMenu() {
      menuPopup?.classList.remove('open');
      menuScrim?.classList.add('hidden');
      menuPopup?.setAttribute('aria-hidden', 'true');
      menuScrim?.setAttribute('aria-hidden', 'true');
      btnMenu?.classList.remove('active');
      btnMenu?.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      closeCharacter();
      closeMemory();
      menuPopup?.classList.add('open');
      menuScrim?.classList.remove('hidden');
      menuPopup?.setAttribute('aria-hidden', 'false');
      menuScrim?.setAttribute('aria-hidden', 'false');
      btnMenu?.classList.add('active');
      btnMenu?.setAttribute('aria-expanded', 'true');
    }

    function toggleMenu() {
      if (menuPopup?.classList.contains('open')) closeMenu();
      else openMenu();
    }

    function openMemory() {
      closeMenu();
      closeCharacter();
      memoryOverlay?.classList.remove('hidden');
      memoryOverlay?.setAttribute('aria-hidden', 'false');
    }

    function closeMemory() {
      memoryOverlay?.classList.add('hidden');
      memoryOverlay?.setAttribute('aria-hidden', 'true');
    }

    function openCharacter() {
      closeMenu();
      closeMemory();
      characterOverlay?.classList.remove('hidden');
      characterOverlay?.setAttribute('aria-hidden', 'false');
      btnCharacter?.classList.add('active');
      btnCharacter?.setAttribute('aria-expanded', 'true');
      backupState = JSON.parse(JSON.stringify(state));
      syncInputs();
    }

    function closeCharacter() {
      if (backupState) {
        state = backupState;
        backupState = null;
        syncInputs();
      }
      characterOverlay?.classList.add('hidden');
      characterOverlay?.setAttribute('aria-hidden', 'true');
      btnCharacter?.classList.remove('active');
      btnCharacter?.setAttribute('aria-expanded', 'false');
    }

    btnMenu?.addEventListener('click', toggleMenu);
    menuScrim?.addEventListener('click', closeMenu);
    btnCharacter?.addEventListener('click', () => {
      if (characterOverlay?.classList.contains('hidden')) openCharacter();
      else closeCharacter();
    });
    btnCharacterClose?.addEventListener('click', closeCharacter);
    btnCharacterSave?.addEventListener('click', () => {
      backupState = null;
      saveState();
      updateMainTitle();
      updateVisibility();
      closeCharacter();
    });
    characterOverlay?.addEventListener('click', (e) => {
      if (e.target === characterOverlay) closeCharacter();
    });

    btnMemoryClose?.addEventListener('click', closeMemory);
    memoryOverlay?.addEventListener('click', (e) => {
      if (e.target === memoryOverlay) closeMemory();
    });

    btnMemoryClear?.addEventListener('click', () => {
      const ok = confirm('Naam en karakterinstellingen van deze pagina wissen?');
      if (!ok) return;
      clearSavedData();
      closeMemory();
    });

    menuPopup?.querySelectorAll('[data-hub-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.hubAction;
        closeMenu();
        if (action === 'character') openCharacter();
        else if (action === 'memory') openMemory();
        else if (action === 'tips') document.getElementById('hub-tips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (action === 'games') {
          if (gamesAction === 'home') {
            window.location.href = './index.html';
          } else {
            document.querySelector('.grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else if (action === 'home') {
          window.location.href = './index.html';
        }
      });
    });

    Object.entries(colorInputs).forEach(([part, input]) => {
      input?.addEventListener('input', (e) => {
        state.colors[part] = e.target.value;
        drawPreview();
      });
    });

    nameInput?.addEventListener('input', () => {
      state.name = normalizeName(nameInput.value);
      drawPreview();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
        closeCharacter();
        closeMemory();
      }
    });

    syncInputs();
    startBgMotion();
  }

  window.initHubChoice = function initHubChoice() {
    initHub({ mode: null, gamesAction: 'home' });
  };

  window.initHubList = function initHubList(mode) {
    initHub({ mode, gamesAction: 'games' });
  };
})();
