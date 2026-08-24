/* MERGE-BLOCK: character.js — kleuren per lichaamsdeel */
const Character = (() => {
  const PARTS = ['head', 'body', 'legs'];

  let previewCanvas;
  let previewCtx;

  function init() {
    previewCanvas = document.getElementById('character-preview');
    previewCtx = previewCanvas?.getContext('2d');

    PARTS.forEach((part) => {
      document.getElementById(`color-${part}`)?.addEventListener('input', (e) => {
        RollerCoasterGame.setBodyColors({ [part]: e.target.value });
        drawPreview();
      });
    });

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      RollerCoasterGame.resetBodyColors();
      syncColorInputs();
      drawPreview();
      Toast.show('Kleuren reset');
    });

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'character') {
        syncColorInputs();
        drawPreview();
      }
    });

    syncColorInputs();
    drawPreview();
  }

  function syncColorInputs() {
    const colors = RollerCoasterGame.getBodyColors();
    PARTS.forEach((part) => {
      const input = document.getElementById(`color-${part}`);
      if (input && colors[part]) input.value = colors[part];
    });
  }

  function drawPreview() {
    if (!previewCtx || !previewCanvas) return;

    const w = previewCanvas.width;
    const h = previewCanvas.height;
    const scale = 3.2;
    const pw = GameConfig.player.width;
    const ph = GameConfig.player.height;
    const ox = (w - pw * scale) / 2;
    const oy = (h - ph * scale) / 2 + 4;
    const colors = RollerCoasterGame.getBodyColors();
    const parts = RollerCoasterGame.getPlayerBodyParts({ x: 0, y: 0, w: pw, h: ph, facing: 1 });

    previewCtx.clearRect(0, 0, w, h);

    const bg = previewCtx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(99, 102, 241, 0.08)');
    bg.addColorStop(1, 'rgba(0, 229, 255, 0.06)');
    previewCtx.fillStyle = bg;
    previewCtx.fillRect(0, 0, w, h);

    previewCtx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    previewCtx.fillRect(ox - 4, oy + ph * scale - 10, pw * scale + 8, 8);

    const legGap = 3 * scale;
    const legs = parts.legs;
    const legW = (legs.w * scale - legGap) / 2;
    const legsX = ox + legs.x * scale;
    const legsY = oy + legs.y * scale;
    previewCtx.fillStyle = colors.legs;
    previewCtx.fillRect(legsX, legsY, legW, legs.h * scale);
    previewCtx.fillRect(legsX + legW + legGap, legsY, legW, legs.h * scale);

    previewCtx.fillStyle = colors.body;
    previewCtx.fillRect(ox + parts.body.x * scale, oy + parts.body.y * scale, parts.body.w * scale, parts.body.h * scale);

    previewCtx.fillStyle = colors.head;
    previewCtx.fillRect(ox + parts.head.x * scale, oy + parts.head.y * scale, parts.head.w * scale, parts.head.h * scale);

    previewCtx.fillStyle = '#001018';
    previewCtx.fillRect(
      ox + parts.head.x * scale + parts.head.w * scale - 7 * scale,
      oy + parts.head.y * scale + 5 * scale,
      5 * scale,
      5 * scale
    );
  }

  function refresh() {
    syncColorInputs();
    drawPreview();
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
