/* MERGE-BLOCK: main.js */
function bootstrapApp() {
  Toast.init();
  Share.init();
  Nav.init();
  try {
    NeonRacerGame.init();
  } catch (err) {
    console.error('NeonRacerGame init mislukt:', err);
  }
  AppMenu.init();
  Character.init();
  Tracks.init();

  Menu.init();

  Nav.switchTab('play');

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-capable');
  }
}

bootstrapApp();
/* END-MERGE-BLOCK */
