/* MERGE-BLOCK: app-menu.js */
const AppMenu = (() => {
  let popup;
  let scrim;
  let popupOpen = false;

  function init() {
    popup = document.getElementById('menu-popup');
    scrim = document.getElementById('menu-scrim');

    popup?.querySelectorAll('[data-menu-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.menuPage;
        closeAll();
        Nav.switchMenuPage(page);
      });
    });

    scrim?.addEventListener('click', () => closeAll());
    initSettings();

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'records') NeonRacerGame.updatePanelStats?.();
      if (e.detail?.tabId === 'tracks') Tracks.refresh?.();
    });
  }

  function togglePopup() {
    if (popupOpen) {
      closePopup();
      return;
    }
    Nav.rememberTabBeforeMenu();
    openPopup();
  }

  function openPopup() {
    if (!popup) return;
    popupOpen = true;
    popup.classList.add('open');
    popup.setAttribute('aria-hidden', 'false');
    scrim?.classList.remove('hidden');
    scrim?.setAttribute('aria-hidden', 'false');
    Nav.setMenuNavActive(true);
  }

  function closePopup() {
    if (!popup) return;
    popupOpen = false;
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
    scrim?.classList.add('hidden');
    scrim?.setAttribute('aria-hidden', 'true');
    Nav.setMenuNavActive(false);
  }

  function closeAll() {
    closePopup();
  }

  function syncToggle(el, on, label) {
    if (!el) return;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.textContent = `${label}: ${on ? 'AAN' : 'UIT'}`;
  }

  function initSettings() {
    const toggleVibration = document.getElementById('toggle-vibration');
    const toggleSoundSettings = document.getElementById('toggle-sound-settings');
    const settings = Storage.readSettings();

    if (toggleVibration) {
      const vibOn = settings.vibration !== false;
      syncToggle(toggleVibration, vibOn, 'Trillen');
      toggleVibration.addEventListener('click', () => {
        const next = !toggleVibration.classList.contains('active');
        syncToggle(toggleVibration, next, 'Trillen');
        Storage.writeSettings({ ...Storage.readSettings(), vibration: next });
        Toast.show(next ? 'Trillen ingeschakeld' : 'Trillen uitgeschakeld');
      });
    }

    if (toggleSoundSettings) {
      const soundOn = !!settings.sound;
      syncToggle(toggleSoundSettings, soundOn, 'Geluid');
      toggleSoundSettings.addEventListener('click', () => {
        const next = !toggleSoundSettings.classList.contains('active');
        syncToggle(toggleSoundSettings, next, 'Geluid');
        Storage.writeSettings({ ...Storage.readSettings(), sound: next });
        Toast.show(next ? 'Geluid ingeschakeld' : 'Geluid uitgeschakeld');
      });
    }

    document.getElementById('btn-memory-reset')?.addEventListener('click', () => {
      if (!confirm('Race-geheugen wissen? Sessions, records, voortgang en instellingen worden verwijderd.')) return;
      Menu.resetAll();
    });
  }

  function refreshSettings() {
    const settings = Storage.readSettings();
    const toggleVibration = document.getElementById('toggle-vibration');
    const toggleSoundSettings = document.getElementById('toggle-sound-settings');
    if (toggleVibration) syncToggle(toggleVibration, settings.vibration !== false, 'Trillen');
    if (toggleSoundSettings) syncToggle(toggleSoundSettings, !!settings.sound, 'Geluid');
  }

  return { init, togglePopup, closeAll, refreshSettings };
})();
/* END-MERGE-BLOCK */
