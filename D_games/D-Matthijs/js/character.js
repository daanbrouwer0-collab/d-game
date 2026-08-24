/* MERGE-BLOCK: character.js — kleuren per lichaamsdeel */
const Character = (() => {
  const PARTS = ['head', 'body', 'legs'];

  const RAINBOW_TOGGLES = [
    { part: 'head', btnId: 'toggle-rainbow-head', labelOn: 'Regenbooghoofd aan!', labelOff: 'Regenbooghoofd uit' },
    { part: 'body', btnId: 'toggle-rainbow-body', labelOn: 'Regenboogkleding aan!', labelOff: 'Regenboogkleding uit' },
    { part: 'legs', btnId: 'toggle-rainbow-legs', labelOn: 'Regenboogschoenen aan!', labelOff: 'Regenboogschoenen uit' }
  ];

  const RAINBOW_KEYS = { head: 'rainbowHead', body: 'rainbowBody', legs: 'rainbowLegs' };

  let previewCanvas;
  let previewCtx;
  let previewRaf = 0;

  function init() {
    previewCanvas = document.getElementById('character-preview');
    previewCtx = previewCanvas?.getContext('2d');

    PARTS.forEach((part) => {
      document.getElementById(`color-${part}`)?.addEventListener('input', (e) => {
        const patch = { [part]: e.target.value };
        const rainbowKey = RAINBOW_KEYS[part];
        if (rainbowKey) patch[rainbowKey] = false;
        SideViewGame.setBodyColors(patch);
        syncRainbowToggles();
        drawPreview();
      });
    });

    RAINBOW_TOGGLES.forEach(({ part, btnId, labelOn, labelOff }) => {
      document.getElementById(btnId)?.addEventListener('click', () => {
        const colors = SideViewGame.getBodyColors();
        const key = RAINBOW_KEYS[part];
        const next = !colors[key];
        SideViewGame.setBodyColors({ [key]: next });
        syncRainbowToggles();
        drawPreview();
        Toast.show(next ? labelOn : labelOff);
      });
    });

    document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
      SideViewGame.resetBodyColors();
      syncColorInputs();
      syncRainbowToggles();
      drawPreview();
      Toast.show('Kleuren reset');
    });

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'character') {
        syncColorInputs();
        syncRainbowToggles();
        SkillTree.refresh();
        startPreviewLoop();
      } else {
        stopPreviewLoop();
      }
    });

    syncColorInputs();
    syncRainbowToggles();
    drawPreview();
  }

  function syncColorInputs() {
    const colors = SideViewGame.getBodyColors();
    PARTS.forEach((part) => {
      const input = document.getElementById(`color-${part}`);
      if (!input || !colors[part]) return;
      input.value = colors[part];
      const rainbowKey = RAINBOW_KEYS[part];
      input.disabled = !!(rainbowKey && colors[rainbowKey]);
    });
  }

  function syncRainbowToggles() {
    const colors = SideViewGame.getBodyColors();
    RAINBOW_TOGGLES.forEach(({ part, btnId }) => {
      const btn = document.getElementById(btnId);
      const key = RAINBOW_KEYS[part];
      if (!btn || !key) return;
      const on = !!colors[key];
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Aan' : 'Uit';
      btn.classList.toggle('on', on);
    });
  }

  function startPreviewLoop() {
    stopPreviewLoop();
    const tick = () => {
      if (Nav.getActiveTab() === 'character') {
        drawPreview();
        previewRaf = requestAnimationFrame(tick);
      }
    };
    previewRaf = requestAnimationFrame(tick);
  }

  function stopPreviewLoop() {
    cancelAnimationFrame(previewRaf);
    previewRaf = 0;
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
    const parts = SideViewGame.getPlayerBodyParts({ x: 0, y: 0, w: pw, h: ph, facing: 1 });

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
    const legH = legs.h * scale;
    SideViewGame.drawCharacterPart(previewCtx, 'legs', legsX, legsY, legW, legH, 0.4);
    SideViewGame.drawCharacterPart(previewCtx, 'legs', legsX + legW + legGap, legsY, legW, legH, 0.9);

    const bodyX = ox + parts.body.x * scale;
    const bodyY = oy + parts.body.y * scale;
    SideViewGame.drawCharacterPart(
      previewCtx,
      'body',
      bodyX,
      bodyY,
      parts.body.w * scale,
      parts.body.h * scale,
      0.2
    );

    const headX = ox + parts.head.x * scale;
    const headY = oy + parts.head.y * scale;
    const headW = parts.head.w * scale;
    const headH = parts.head.h * scale;
    SideViewGame.drawCharacterHead(previewCtx, headX, headY, headW, headH);

    previewCtx.fillStyle = '#001018';
    previewCtx.fillRect(
      headX + headW - 7 * scale,
      headY + 5 * scale,
      5 * scale,
      5 * scale
    );
  }

  function refresh() {
    syncColorInputs();
    syncRainbowToggles();
    SkillTree.refresh();
    drawPreview();
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
