/* MERGE-BLOCK: nav.js */
const Nav = (() => {
  const MAIN_TABS = ['play', 'tracks', 'profile'];

  const state = { activeTab: 'play', tabBeforeMenu: 'play' };
  let navBtns = {};
  let screens = {};

  function init() {
    navBtns = {
      play: document.querySelector('[data-tab="play"]'),
      tracks: document.querySelector('[data-tab="tracks"]'),
      profile: document.querySelector('[data-tab="profile"]')
    };

    screens = {
      play: document.getElementById('screen-play'),
      tracks: document.getElementById('screen-tracks'),
      profile: document.getElementById('screen-profile')
    };

    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
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

    if (tabId === 'play' && prevTab === 'tracks') {
      document.body.classList.add('game-active');
      Tracks.launchOnPlayTab?.();
    } else {
      updateGameState(tabId);
    }

    if (tabId === 'profile') {
      NeonRacerGame.updatePanelStats?.();
      NeonRacerGame.syncCarCustomizerUi?.();
      NeonRacerGame.updateCarPreview?.();
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
    document.body.classList.toggle('game-active', tabId === 'play');

    if (tabId === 'play') {
      NeonRacerGame.onTabVisible();
    } else {
      NeonRacerGame.onTabHidden();
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
