const Nav = {
  init() {
    const navItems = document.querySelectorAll('.bottom-nav .nav-item[data-tab]');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab === 'menu') {
          AppMenu.togglePopup();
        } else if (tab === 'start') {
          SessionMenu.openStartModal();
        } else {
          this.switchTab(tab);
        }
      });
    });

    const backBtns = document.querySelectorAll('[data-menu-back]');
    backBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab('play');
      });
    });
  },

  switchTab(tabId) {
    AppMenu.closePopup();

    const screens = document.querySelectorAll('.view-screen');
    screens.forEach(s => s.classList.remove('active'));

    const targetScreen = document.getElementById(`screen-${tabId}`);
    if (targetScreen) {
      targetScreen.classList.add('active');
    }

    const navItems = document.querySelectorAll('.bottom-nav .nav-item[data-tab]');
    navItems.forEach(item => {
      const isMatch = item.getAttribute('data-tab') === tabId;
      item.classList.toggle('active', isMatch);
    });

    if (tabId === 'character') {
      CharacterManager?.refreshForCurrentTurn?.();
    }
  }
};
