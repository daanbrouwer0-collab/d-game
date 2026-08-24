/* MERGE-BLOCK: main.js */
(function bootstrap() {
  Toast.init();
  Share.init();
  Nav.init();
  G.init();
  AppMenu.init();
  Character.init();

  Menu.init(
    () => G.exportState(),
    (save) => G.importState(save)
  );

  Nav.switchTab('play');

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }
})();
/* END-MERGE-BLOCK */
