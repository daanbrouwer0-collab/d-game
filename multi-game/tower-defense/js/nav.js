/* MERGE-BLOCK: nav.js */
const Nav = (() => {
  const MAIN_TABS = ['play', 'sectors', 'character'];

  const state = { activeTab: 'play', tabBeforeMenu: 'play' };
  let navBtns = {};
  let screens = {};

  function init() {
    navBtns = {
      play: document.querySelector('[data-tab="play"]'),
      sectors: document.querySelector('[data-tab="sectors"]'),
      character: document.querySelector('[data-tab="character"]')
    };

    screens = {
      play: document.getElementById('screen-play'),
      sectors: document.getElementById('screen-sectors'),
      character: document.getElementById('screen-character')
    };

    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      if (id === 'play') {
        btn.addEventListener('click', () => {
          if (state.activeTab === 'play' && !Menu.isVisible?.() && !Share.isOpen?.()) {
            G.toggleGameSpeed?.();
            return;
          }
          switchTab('play');
        });
        return;
      }
      btn.addEventListener('click', () => switchTab(id));
    });

    document.querySelectorAll('[data-menu-back]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab('play');
      });
    });
  }

  function switchTab(tabId) {
    if (!screens[tabId]) return;

    const prevTab = state.activeTab;

    if (Menu.isVisible?.() && tabId !== 'play') {
      Menu.hide();
    }

    state.activeTab = tabId;
    state.tabBeforeMenu = tabId;

    updateNavHighlight(tabId);
    showScreen(tabId);
    updateGameState(tabId);

    if (tabId === 'character') {
      Character.refresh?.();
    }
    if (tabId === 'sectors') {
      Sectors.render?.();
    }

    window.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId, prevTab } }));
  }

  function updateNavHighlight(tabId) {
    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      btn.classList.toggle('active', id === tabId);
    });
  }

  function showScreen(tabId) {
    Object.entries(screens).forEach(([id, screen]) => {
      if (screen) screen.classList.toggle('active', id === tabId);
    });
  }

  function updateGameState(tabId) {
    document.body.classList.toggle('game-active', tabId === 'play' && !Menu.isVisible?.() && !Share.isOpen?.());

    if (tabId === 'play' && !Menu.isVisible?.()) {
      G.onTabVisible?.();
    } else {
      G.onTabHidden?.();
    }
  }

  function getActiveTab() {
    return state.activeTab;
  }

  return {
    init,
    switchTab,
    getActiveTab
  };
})();
/* END-MERGE-BLOCK */
