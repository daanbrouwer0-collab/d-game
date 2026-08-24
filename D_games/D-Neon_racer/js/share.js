/* MERGE-BLOCK: share.js */
const Share = (() => {
  let sharePromptOpen = false;
  let pendingShareFile = null;
  let onCloseCallback = null;
  let pendingShareMeta = null;

  function getRoadColorForLevel(level) {
    const theme = GameConfig.resolveTrackTheme(GameConfig.getTrack(level));
    return theme?.road || '#1c99ff';
  }

  function isRainbowShareLevel(level) {
    return Number(level) === 10;
  }

  function strokeShareFrame(ctx, level, x, y, w, h, lineWidth) {
    ctx.lineWidth = lineWidth;
    if (isRainbowShareLevel(level)) {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#ff2bd6');
      g.addColorStop(0.14, '#ff4400');
      g.addColorStop(0.28, '#ffea00');
      g.addColorStop(0.42, '#00ff88');
      g.addColorStop(0.57, '#00c3ff');
      g.addColorStop(0.71, '#6688ff');
      g.addColorStop(0.85, '#cc44ff');
      g.addColorStop(1, '#ff2bd6');
      ctx.strokeStyle = g;
    } else {
      ctx.strokeStyle = getRoadColorForLevel(level);
    }
    ctx.strokeRect(x, y, w, h);
  }

  function getDifficultyLabel(difficulty) {
    const key = String(difficulty || 'normal').toLowerCase();
    const labels = { easy: 'Easy', normal: 'Normaal', hard: 'Hard' };
    return labels[key] || GameConfig.difficulty[key]?.label || 'Normaal';
  }

  function buildShareImage(level, elapsedSec, characterName, isNewRecord, carCanvas, difficulty) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    const displayName = (characterName || 'Karakter').trim();
    const diffLabel = getDifficultyLabel(difficulty);

    ctx.fillStyle = '#0a001a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    strokeShareFrame(ctx, level, 5, 5, canvas.width - 10, canvas.height - 70, 10);

    const carW = 250;
    const carH = 175;
    const carX = 36;
    const carY = 118;

    if (carCanvas) {
      ctx.fillStyle = '#0a1020';
      ctx.fillRect(carX - 6, carY - 6, carW + 12, carH + 12);
      strokeShareFrame(ctx, level, carX - 6, carY - 6, carW + 12, carH + 12, 2);
      ctx.drawImage(carCanvas, carX, carY, carW, carH);
    }

    const textX = carCanvas ? 400 : canvas.width / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 28px Courier New, monospace';
    ctx.fillText(`NEON RACER: ${displayName}`, textX, 58);

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 24px Courier New, monospace';
    ctx.fillText(GameConfig.getLevelName(level), textX, 104);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Courier New, monospace';
    ctx.fillText(`Level ${level}`, textX, 132);

    ctx.fillStyle = '#ffdd33';
    ctx.font = 'bold 20px Courier New, monospace';
    ctx.fillText(diffLabel, textX, 162);

    ctx.fillStyle = isNewRecord ? '#00ff88' : '#ffdd33';
    ctx.font = 'bold 44px Courier New, monospace';
    const timeStr = formatTime(elapsedSec);
    ctx.fillText(timeStr, textX, 218);

    ctx.fillStyle = '#0a001a';
    ctx.fillRect(0, canvas.height - 56, canvas.width, 56);
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 18px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('www.d-game.nl', canvas.width / 2, canvas.height - 22);

    return canvas;
  }

  function formatTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const r = (s % 60).toFixed(2).padStart(m > 0 ? 5 : 5, '0');
    return m > 0 ? `${m}:${r}` : `${r}s`;
  }

  function buildShareText() {
    return 'www.d-game.nl';
  }

  function canvasToShareFile(shareCanvas) {
    return new Promise((resolve) => {
      shareCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], 'neon-racer-record.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  async function offerRecord(level, elapsedSec, characterName, isNewRecord, onDone, difficulty) {
    if (sharePromptOpen) {
      onDone?.();
      return;
    }

    sharePromptOpen = true;
    onCloseCallback = onDone || null;
    pendingShareMeta = { level, elapsedSec, characterName, isNewRecord, difficulty };
    NeonRacerGame.pauseForOverlay?.();

    const carCanvas = NeonRacerGame.renderCarShareCanvas?.() || null;
    const shareCanvas = buildShareImage(level, elapsedSec, characterName, isNewRecord, carCanvas, difficulty);
    pendingShareFile = await canvasToShareFile(shareCanvas);

    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-preview');
    const title = document.getElementById('share-modal-title');
    const text = document.getElementById('share-modal-text');

    if (title) title.textContent = 'Deel foto';
    if (text) text.textContent = 'www.d-game.nl';
    if (preview) preview.src = shareCanvas.toDataURL('image/png');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    sharePromptOpen = false;
    pendingShareFile = null;
    pendingShareMeta = null;
    const cb = onCloseCallback;
    onCloseCallback = null;
    NeonRacerGame.resumeFromOverlay?.();
    cb?.();
  }

  async function shareNow() {
    if (!pendingShareFile) {
      closeShareModal();
      return;
    }

    const shareText = buildShareText();
    const title = 'Neon Racer';

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [pendingShareFile] })) {
      try {
        await navigator.share({
          title,
          text: shareText,
          files: [pendingShareFile]
        });
      } catch {
        Toast.show('Delen geannuleerd');
      }
    } else if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: 'https://www.d-game.nl'
        });
      } catch {
        Toast.show('Delen geannuleerd');
      }
    } else {
      Toast.show('Delen niet ondersteund in deze browser');
    }
    closeShareModal();
  }

  function init() {
    document.getElementById('btn-share-yes')?.addEventListener('click', () => shareNow());
    document.getElementById('btn-share-no')?.addEventListener('click', () => closeShareModal());
  }

  return { init, offerRecord, closeShareModal };
})();
/* END-MERGE-BLOCK */
