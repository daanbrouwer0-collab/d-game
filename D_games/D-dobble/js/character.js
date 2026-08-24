/* MERGE-BLOCK: character.js — automaat kleuren & statistieken preview */
const Character = (() => {
  const COLOR_KEYS = ['frame', 'frameLight', 'accent'];

  let previewCanvas;
  let previewCtx;

  function init() {
    previewCanvas = document.getElementById('character-preview');
    previewCtx = previewCanvas?.getContext('2d');

    COLOR_KEYS.forEach((key) => {
      document.getElementById(`color-${key}`)?.addEventListener('input', (e) => {
        SlotGame.setMachineColors({ [key]: e.target.value });
        drawPreview();
      });
    });

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      SlotGame.resetMachineColors();
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
    const colors = SlotGame.getMachineColors();
    COLOR_KEYS.forEach((key) => {
      const input = document.getElementById(`color-${key}`);
      if (input && colors[key]) input.value = colors[key];
    });
  }

  function drawPreview() {
    if (!previewCtx || !previewCanvas) return;

    const w = previewCanvas.width;
    const h = previewCanvas.height;
    const colors = SlotGame.getMachineColors();
    const game = SlotGame.getActiveMachine?.() || {};
    const symbols = (SlotGame.getActiveSymbols() || []).slice(0, 3);
    const isSlot = game.type === 'slot' && symbols.length >= 3;

    previewCtx.clearRect(0, 0, w, h);

    const bg = previewCtx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a0533');
    bg.addColorStop(1, '#050010');
    previewCtx.fillStyle = bg;
    previewCtx.fillRect(0, 0, w, h);

    const mx = 16;
    const my = 20;
    const mw = w - 32;
    const mh = h - 40;

    previewCtx.fillStyle = colors.frame;
    previewCtx.strokeStyle = colors.frameLight;
    previewCtx.lineWidth = 3;
    roundRect(previewCtx, mx, my, mw, mh, 12);
    previewCtx.fill();
    previewCtx.stroke();

    previewCtx.strokeStyle = colors.accent;
    previewCtx.lineWidth = 1.5;
    previewCtx.globalAlpha = 0.5;
    roundRect(previewCtx, mx + 4, my + 4, mw - 8, mh - 8, 8);
    previewCtx.stroke();
    previewCtx.globalAlpha = 1;

    if (isSlot) {
      const reelW = (mw - 24) / 3;
      const reelH = mh - 24;
      const ry = my + 12;
      for (let i = 0; i < 3; i++) {
        const rx = mx + 12 + i * (reelW + 4);
        previewCtx.fillStyle = '#0f0518';
        roundRect(previewCtx, rx, ry, reelW, reelH, 6);
        previewCtx.fill();
        previewCtx.font = `${reelH * 0.35}px serif`;
        previewCtx.textAlign = 'center';
        previewCtx.textBaseline = 'middle';
        previewCtx.fillText(symbols[i].emoji, rx + reelW / 2, ry + reelH / 2);
      }
    } else {
      previewCtx.font = `${mh * 0.42}px serif`;
      previewCtx.textAlign = 'center';
      previewCtx.textBaseline = 'middle';
      previewCtx.fillText(game.icon || '🎮', mx + mw / 2, my + mh / 2);
    }
  }

  function roundRect(c, x, y, width, height, radius) {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.lineTo(x + width - radius, y);
    c.quadraticCurveTo(x + width, y, x + width, y + radius);
    c.lineTo(x + width, y + height - radius);
    c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    c.lineTo(x + radius, y + height);
    c.quadraticCurveTo(x, y + height, x, y + height - radius);
    c.lineTo(x, y + radius);
    c.quadraticCurveTo(x, y, x + radius, y);
    c.closePath();
  }

  function refresh() {
    syncColorInputs();
    drawPreview();
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
