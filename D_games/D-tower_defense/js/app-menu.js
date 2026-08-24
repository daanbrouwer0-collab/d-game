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
        closeAll();
        Nav.switchMenuPage(btn.dataset.menuPage);
      });
    });

    scrim?.addEventListener('click', () => closeAll());
    initSettings();
    initMoreActions();
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

  function initMoreActions() {
    document.getElementById('btn-app-save')?.addEventListener('click', () => {
      Menu.saveFromApp();
    });
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

    const toggleGameSpeed = document.getElementById('toggle-game-speed');
    if (toggleGameSpeed) {
      G.syncSpeedButton?.();
      toggleGameSpeed.addEventListener('click', () => {
        G.toggleGameSpeed?.();
      });
    }

    document.getElementById('btn-reset-progress')?.addEventListener('click', () => {
      if (!confirm('Alle game-data op dit apparaat wissen? Sessions, voortgang en instellingen worden verwijderd.')) return;
      Menu.resetAll();
    });
  }

  function refreshSettings() {
    const settings = Storage.readSettings();
    const toggleVibration = document.getElementById('toggle-vibration');
    const toggleSoundSettings = document.getElementById('toggle-sound-settings');
    if (toggleVibration) syncToggle(toggleVibration, settings.vibration !== false, 'Trillen');
    if (toggleSoundSettings) syncToggle(toggleSoundSettings, !!settings.sound, 'Geluid');
    if (G.gameSpeed !== settings.gameSpeed) G.gameSpeed = settings.gameSpeed === 2 ? 2 : 1;
    G.syncSpeedButton?.();
  }

  return { init, togglePopup, closeAll, refreshSettings };
})();
/* END-MERGE-BLOCK */
