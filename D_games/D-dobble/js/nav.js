/* MERGE-BLOCK: nav.js — tab navigatie (Pdf_Bareka patroon) */
const Nav = (() => {
  const MAIN_TABS = ['play', 'character', 'items'];
  const MENU_PAGES = ['help', 'settings', 'more', 'world'];

  const state = { activeTab: 'play', tabBeforeMenu: 'play' };
  let navBtns = {};
  let screens = {};

  function init() {
    navBtns = {
      play: document.querySelector('[data-tab="play"]'),
      character: document.querySelector('[data-tab="character"]'),
      start: document.querySelector('[data-tab="start"]'),
      items: document.querySelector('[data-tab="items"]'),
      menu: document.querySelector('[data-tab="menu"]')
    };

    screens = {
      play: document.getElementById('screen-play'),
      character: document.getElementById('screen-character'),
      world: document.getElementById('screen-world'),
      items: document.getElementById('screen-items'),
      help: document.getElementById('screen-help'),
      settings: document.getElementById('screen-settings'),
      more: document.getElementById('screen-more')
    };

    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      if (id === 'menu') {
        btn.addEventListener('click', () => AppMenu.togglePopup());
        return;
      }
      if (id === 'start') {
        btn.addEventListener('click', () => openStartScreen());
        return;
      }
      btn.addEventListener('click', () => switchTab(id));
    });

    document.querySelectorAll('[data-menu-back]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = MAIN_TABS.includes(state.activeTab) && state.activeTab !== 'play'
          ? 'play'
          : (state.tabBeforeMenu || 'play');
        switchTab(tab);
      });
    });
  }

  function openStartScreen() {
    AppMenu.closeAll();

    if (state.activeTab !== 'play') {
      switchTab('play');
    } else {
      SlotGame.onTabHidden();
    }

    SlotGame.pause();
    Menu.openStartScreen(true);
    setStartNavActive(true);
  }

  function switchTab(tabId) {
    if (!screens[tabId]) return;

    AppMenu.closeAll();
    if (Menu.isVisible?.() && tabId !== 'play') {
      Menu.hide();
      setStartNavActive(false);
    }

    state.activeTab = tabId;
    if (MAIN_TABS.includes(tabId)) {
      state.tabBeforeMenu = tabId;
    }

    if (Menu.isVisible?.() && tabId === 'play') {
      setStartNavActive(true);
    } else {
      updateNavHighlight(tabId);
    }

    showScreen(tabId);
    updateGameState(tabId);
    window.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId } }));
  }

  function switchMenuPage(pageId) {
    if (!MENU_PAGES.includes(pageId) || !screens[pageId]) return;

    AppMenu.closeAll();
    if (Menu.isVisible?.()) {
      Menu.hide();
      setStartNavActive(false);
    }

    state.activeTab = pageId;
    updateNavHighlight(pageId, true);
    showScreen(pageId);
    updateGameState(pageId);
    window.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId: pageId } }));
  }

  function updateNavHighlight(tabId, fromMenu = false) {
    const menuPage = MENU_PAGES.includes(tabId);
    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      if (menuPage || fromMenu) {
        btn.classList.toggle('active', id === 'menu');
      } else {
        btn.classList.toggle('active', id === tabId);
      }
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
      SlotGame.onTabVisible();
    } else {
      SlotGame.onTabHidden();
    }
  }

  function setMenuNavActive(active) {
    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      if (active) {
        btn.classList.toggle('active', id === 'menu');
      } else if (!MENU_PAGES.includes(state.activeTab) && !Menu.isVisible?.()) {
        btn.classList.toggle('active', id === state.activeTab);
      }
    });
  }

  function setStartNavActive(active) {
    Object.entries(navBtns).forEach(([id, btn]) => {
      if (!btn) return;
      if (active) {
        btn.classList.toggle('active', id === 'start');
      } else if (!MENU_PAGES.includes(state.activeTab)) {
        btn.classList.toggle('active', id === state.activeTab);
      }
    });
  }

  function getActiveTab() {
    return state.activeTab;
  }

  function rememberTabBeforeMenu() {
    if (!MENU_PAGES.includes(state.activeTab)) {
      state.tabBeforeMenu = state.activeTab;
    }
  }

  return {
    init,
    switchTab,
    switchMenuPage,
    openStartScreen,
    getActiveTab,
    rememberTabBeforeMenu,
    setMenuNavActive,
    setStartNavActive
  };
})();
/* END-MERGE-BLOCK */
