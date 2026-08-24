const AppMenu = {
  init() {
    this.popup = document.getElementById('menu-popup');
    this.scrim = document.getElementById('menu-scrim');

    this.scrim?.addEventListener('click', () => this.closePopup());

    const items = this.popup?.querySelectorAll('[data-menu-page]');
    items?.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-menu-page');
        this.closePopup();
        Nav.switchTab(page);
      });
    });
  },

  togglePopup() {
    if (this.popup?.classList.contains('open')) {
      this.closePopup();
    } else {
      this.openPopup();
    }
  },

  openPopup() {
    this.popup?.classList.add('open');
    this.scrim?.classList.remove('hidden');
  },

  closePopup() {
    this.popup?.classList.remove('open');
    this.scrim?.classList.add('hidden');
  }
};
