/* MERGE-BLOCK: character.js */
const Character = (() => {
  function bindKarakterNameInput() {
    const input = document.getElementById('player-name');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';

    const save = () => {
      Menu.updateCharacterName?.(input.value);
    };
    input.addEventListener('change', save);
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  }

  function init() {
    NeonRacerGame.initCarCustomizer?.();
    bindKarakterNameInput();

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'character') {
        NeonRacerGame.updatePanelStats?.();
        NeonRacerGame.syncCarCustomizerUi?.();
        NeonRacerGame.updateCarPreview?.();
      }
    });
  }

  function refresh() {
    NeonRacerGame.updatePanelStats?.();
    NeonRacerGame.updateCarPreview?.();
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
