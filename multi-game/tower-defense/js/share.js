/* MERGE-BLOCK: share.js — tactische snapshot na sector-overwinning */
const Share = (() => {
  let sharePromptOpen = false;
  let pendingShareFile = null;
  let onCloseCallback = null;

  function getShareCropRect(sourceCanvas) {
    const dpr = G.dpr || window.devicePixelRatio || 1;
    const w = G.w || Math.floor(sourceCanvas.width / dpr);
    const h = G.h || Math.floor(sourceCanvas.height / dpr);
    if (!w || !h) return null;

    const hudTop = document.querySelector('#ui .hud-top-block')?.offsetHeight || 52;
    const hudBtm = document.querySelector('#ui .hud-btm')?.offsetHeight || 72;
    const marginV = 6;

    const cropBottom = h - hudBtm - marginV;
    const castleX = G.castle?.pos?.x ?? (w / 2 + (G.offX || 0));
    const castleY = G.castle?.pos?.y ?? cropBottom * 0.65;

    // Kasteel net onder het midden van de snapshot (iets hoger beeld = meer map boven)
    const castleVerticalRatio = 0.57;
    const minTop = hudTop + marginV;
    let cropH = Math.round((cropBottom - castleY) / (1 - castleVerticalRatio));
    let cropTop = Math.round(castleY - cropH * castleVerticalRatio);
    if (cropTop < minTop) {
      cropTop = minTop;
      cropH = cropBottom - cropTop;
    }

    const cropW = w;
    let cropLeft = Math.round(castleX - cropW / 2);
    cropLeft = Math.max(0, Math.min(cropLeft, w - cropW));

    return {
      sx: Math.round(cropLeft * dpr),
      sy: Math.round(cropTop * dpr),
      sw: Math.max(1, Math.round(cropW * dpr)),
      sh: Math.max(1, Math.round(cropH * dpr))
    };
  }

  function buildShareImage(sourceCanvas, level, commanderName) {
    const out = document.createElement('canvas');
    const maxW = 600;
    const headerH = 96;
    const footerH = 48;
    const crop = getShareCropRect(sourceCanvas);
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    const sectorName = GameConfig.getLevelName(lvl);

    let imgW = maxW;
    let imgH;
    if (crop) {
      imgH = Math.round((crop.sh / crop.sw) * maxW);
    } else {
      imgH = Math.round((sourceCanvas.height / sourceCanvas.width) * maxW);
    }

    out.width = imgW;
    out.height = imgH + headerH + footerH;
    const c = out.getContext('2d');

    c.fillStyle = '#020205';
    c.fillRect(0, 0, imgW, headerH);

    c.textAlign = 'center';
    c.fillStyle = '#00f3ff';
    c.font = '800 72px Plus Jakarta Sans, Inter, sans-serif';
    c.fillText(String(lvl), imgW / 2, 58);

    c.fillStyle = '#94a3b8';
    c.font = '600 14px Inter, sans-serif';
    c.fillText(`LEVEL · ${sectorName}`, imgW / 2, 78);

    c.fillStyle = '#64748b';
    c.font = '500 12px Inter, sans-serif';
    c.fillText(commanderName ? `Commandant: ${commanderName}` : 'D-Tower Defense', imgW / 2, 92);

    if (crop) {
      c.drawImage(sourceCanvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, headerH, imgW, imgH);
    } else {
      c.drawImage(sourceCanvas, 0, headerH, imgW, imgH);
    }

    c.strokeStyle = '#00f3ff';
    c.lineWidth = 3;
    c.strokeRect(1.5, headerH + 1.5, imgW - 3, imgH - 3);

    c.fillStyle = '#0a1420';
    c.fillRect(0, headerH + imgH, imgW, footerH);
    c.fillStyle = '#ff00ff';
    c.font = '600 15px Plus Jakarta Sans, Inter, sans-serif';
    c.fillText('www.d-game.nl', imgW / 2, headerH + imgH + 30);

    return out;
  }

  function canvasToShareFile(shareCanvas) {
    return new Promise((resolve) => {
      shareCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], 'd-tower-snapshot.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  async function offerVictory(sourceCanvas, level, commanderName, onDone) {
    if (!sourceCanvas || sharePromptOpen) {
      onDone?.();
      return;
    }

    sharePromptOpen = true;
    onCloseCallback = onDone || null;
    G.pauseForOverlay?.();

    const shareCanvas = buildShareImage(sourceCanvas, level, commanderName);
    pendingShareFile = await canvasToShareFile(shareCanvas);

    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-preview');
    if (preview) preview.src = shareCanvas.toDataURL('image/png');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSharePrompt() {
    sharePromptOpen = false;
    pendingShareFile = null;
    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-preview');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (preview) preview.removeAttribute('src');

    const cb = onCloseCallback;
    onCloseCallback = null;
    G.resumeFromOverlay?.();
    cb?.();
  }

  async function shareMoment() {
    const shareLink = 'www.d-game.nl';

    if (pendingShareFile && navigator.share && navigator.canShare?.({ files: [pendingShareFile] })) {
      try {
        await navigator.share({
          text: shareLink,
          files: [pendingShareFile]
        });
      } catch (error) {
        if (error?.name !== 'AbortError') Toast.show('Delen mislukt');
      }
    } else if (navigator.share) {
      try {
        await navigator.share({ text: shareLink });
      } catch (error) {
        if (error?.name !== 'AbortError') Toast.show('Delen mislukt');
      }
    } else {
      Toast.show('Delen niet ondersteund in deze browser');
    }

    closeSharePrompt();
  }

  function isOpen() {
    return sharePromptOpen;
  }

  function bindModal() {
    document.getElementById('btn-share-yes')?.addEventListener('click', () => {
      void shareMoment();
    });
    document.getElementById('btn-share-no')?.addEventListener('click', closeSharePrompt);
    document.getElementById('share-modal')?.addEventListener('click', (e) => {
      if (e.target?.id === 'share-modal') closeSharePrompt();
    });
  }

  return { init: bindModal, offerVictory, isOpen, closeSharePrompt };
})();
/* END-MERGE-BLOCK */
