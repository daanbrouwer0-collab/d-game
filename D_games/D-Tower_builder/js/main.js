/* MERGE-BLOCK: main.js */
(function bootstrap() {
  Toast.init();
  Nav.init();
  SideViewGame.init();
  AppMenu.init();
  Character.init();

  Menu.init(
    () => SideViewGame.exportState(),
    (save) => SideViewGame.importState(save)
  );

  Nav.switchTab('play');

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
  }
})();
/* END-MERGE-BLOCK */
