const Toast = {
  /** Meldingen zijn uitgeschakeld — bord blijft altijd zichtbaar. */
  show() {},

  hide() {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;
    toastEl.classList.remove('show');
    toastEl.setAttribute('aria-hidden', 'true');
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
};
