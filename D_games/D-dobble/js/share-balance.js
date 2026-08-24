/* MERGE-BLOCK: share-balance.js — saldo delen via win-kaart */
const ShareBalance = (() => {
  let shareOpen = false;
  let pendingShareFile = null;
  let pendingMeta = null;
  let wasPaused = false;

  const CONFETTI = [
    { x: 0.08, y: 0.12, w: 14, h: 6, rot: 0.4, c: '#fde68a' },
    { x: 0.92, y: 0.18, w: 12, h: 5, rot: -0.8, c: '#f472b6' },
    { x: 0.15, y: 0.78, w: 16, h: 5, rot: 1.2, c: '#34d399' },
    { x: 0.85, y: 0.72, w: 13, h: 6, rot: -0.3, c: '#60a5fa' },
    { x: 0.05, y: 0.45, w: 11, h: 4, rot: 0.9, c: '#fb923c' },
    { x: 0.95, y: 0.52, w: 15, h: 5, rot: -1.1, c: '#c084fc' },
    { x: 0.22, y: 0.08, w: 10, h: 4, rot: -0.5, c: '#fbbf24' },
    { x: 0.78, y: 0.09, w: 12, h: 5, rot: 0.7, c: '#f472b6' },
    { x: 0.12, y: 0.58, w: 14, h: 4, rot: 1.5, c: '#fde68a' },
    { x: 0.88, y: 0.38, w: 11, h: 5, rot: -0.6, c: '#4ade80' },
    { x: 0.35, y: 0.88, w: 13, h: 5, rot: 0.2, c: '#a78bfa' },
    { x: 0.65, y: 0.91, w: 12, h: 4, rot: -1.3, c: '#fcd34d' },
    { x: 0.48, y: 0.06, w: 10, h: 4, rot: 0.5, c: '#f472b6' },
    { x: 0.52, y: 0.94, w: 14, h: 5, rot: -0.4, c: '#34d399' },
    { x: 0.28, y: 0.32, w: 9, h: 4, rot: 1.0, c: '#fde68a' },
    { x: 0.72, y: 0.62, w: 11, h: 4, rot: -0.9, c: '#fb7185' }
  ];

  function drawStar(ctx, cx, cy, outerR, innerR, points, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRadialBurst(ctx, w, h) {
    const cx = w / 2;
    const cy = h * 0.48;
    const rays = 18;

    for (let i = 0; i < rays; i++) {
      const a = (Math.PI * 2 * i) / rays;
      const g = ctx.createLinearGradient(
        cx, cy,
        cx + Math.cos(a) * w * 0.7,
        cy + Math.sin(a) * h * 0.7
      );
      g.addColorStop(0, 'rgba(251, 191, 36, 0.22)');
      g.addColorStop(0.4, 'rgba(167, 139, 250, 0.08)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w * 0.72, a - 0.12, a + 0.12);
      ctx.closePath();
      ctx.fill();
    }

    const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.55);
    spot.addColorStop(0, 'rgba(253, 230, 138, 0.35)');
    spot.addColorStop(0.35, 'rgba(251, 191, 36, 0.12)');
    spot.addColorStop(0.7, 'rgba(120, 53, 180, 0.06)');
    spot.addColorStop(1, 'transparent');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
  }

  function drawConfetti(ctx, w, h) {
    CONFETTI.forEach((p) => {
      ctx.save();
      ctx.translate(p.x * w, p.y * h);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawSparkles(ctx, w, h) {
    const spots = [
      [0.18, 0.22, 10], [0.82, 0.25, 8], [0.14, 0.68, 9], [0.86, 0.65, 11],
      [0.5, 0.14, 12], [0.42, 0.82, 7], [0.58, 0.84, 9], [0.3, 0.42, 6],
      [0.7, 0.44, 7], [0.1, 0.35, 5], [0.9, 0.55, 6]
    ];
    spots.forEach(([rx, ry, size]) => {
      drawStar(ctx, rx * w, ry * h, size, size * 0.42, 4, '#fff9c4', 0.55 + (size % 3) * 0.12);
    });
  }

  function drawNeonFrame(ctx, w, h) {
    const pad = 16;
    const r = 20;

    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.55)';
    ctx.shadowBlur = 28;
    const frameG = ctx.createLinearGradient(pad, pad, w - pad, h - pad);
    frameG.addColorStop(0, '#fde68a');
    frameG.addColorStop(0.25, '#fbbf24');
    frameG.addColorStop(0.5, '#fff7ed');
    frameG.addColorStop(0.75, '#f59e0b');
    frameG.addColorStop(1, '#fde68a');
    ctx.strokeStyle = frameG;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(pad + 10, pad + 10, w - (pad + 10) * 2, h - (pad + 10) * 2, r - 4);
    ctx.stroke();

    const corners = [
      [pad + 28, pad + 28], [w - pad - 28, pad + 28],
      [pad + 28, h - pad - 28], [w - pad - 28, h - pad - 28]
    ];
    corners.forEach(([x, y]) => drawStar(ctx, x, y, 14, 6, 4, '#fde68a', 0.9));
  }

  function fitFontSize(ctx, text, fontFamily, maxWidth, startSize, minSize = 36) {
    let size = startSize;
    while (size > minSize) {
      ctx.font = `900 ${size}px ${fontFamily}`;
      if (ctx.measureText(text).width <= maxWidth) return size;
      size -= 2;
    }
    return minSize;
  }

  function drawBokeh(ctx, w, h) {
    const orbs = [
      [0.2, 0.3, 80, 'rgba(251, 191, 36, 0.08)'],
      [0.78, 0.28, 65, 'rgba(167, 139, 250, 0.1)'],
      [0.15, 0.72, 55, 'rgba(244, 114, 182, 0.07)'],
      [0.85, 0.68, 70, 'rgba(52, 211, 153, 0.06)'],
      [0.5, 0.5, 120, 'rgba(253, 230, 138, 0.05)']
    ];
    orbs.forEach(([rx, ry, r, color]) => {
      const g = ctx.createRadialGradient(rx * w, ry * h, 0, rx * w, ry * h, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function drawVignette(ctx, w, h) {
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, 'transparent');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawGlassPanel(ctx, x, y, pw, ph, radius) {
    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.25)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 8;

    const panel = ctx.createLinearGradient(x, y, x, y + ph);
    panel.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    panel.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    panel.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, radius);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const shine = ctx.createLinearGradient(x, y, x + pw, y);
    shine.addColorStop(0, 'transparent');
    shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
    shine.addColorStop(1, 'transparent');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 1, pw - 24, ph * 0.38, radius - 4);
    ctx.fill();
    ctx.restore();
  }

  function drawWinRibbon(ctx, cx, y) {
    const rw = 168;
    const rh = 44;
    const x = cx - rw / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
    ctx.shadowBlur = 16;

    const ribbon = ctx.createLinearGradient(x, y, x, y + rh);
    ribbon.addColorStop(0, '#fde68a');
    ribbon.addColorStop(0.5, '#fbbf24');
    ribbon.addColorStop(1, '#d97706');
    ctx.fillStyle = ribbon;
    ctx.beginPath();
    ctx.roundRect(x, y, rw, rh, 10);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(120, 53, 15, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x - 14, y + rh * 0.35);
    ctx.lineTo(x, y + rh * 0.35);
    ctx.lineTo(x, y + rh * 0.65);
    ctx.lineTo(x - 14, y + rh * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + rw + 14, y + rh * 0.35);
    ctx.lineTo(x + rw, y + rh * 0.35);
    ctx.lineTo(x + rw, y + rh * 0.65);
    ctx.lineTo(x + rw + 14, y + rh * 0.65);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 26px "Plus Jakarta Sans", Inter, sans-serif';
    ctx.fillStyle = '#451a03';
    ctx.fillText('WINST!', cx, y + rh / 2 + 1);
  }

  function drawGlowText(ctx, text, x, y, font, fills, glowColor, glowBlur, strokeWidth = 4) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.font = font;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = fills.shadow || 'rgba(0,0,0,0.5)';
    ctx.fillText(text, x + 3, y + 4);
    ctx.restore();

    ctx.save();
    ctx.font = font;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur * 0.6;
    ctx.fillStyle = fills.outline || '#92400e';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.restore();

    ctx.save();
    ctx.font = font;
    if (fills.gradient) {
      const m = ctx.measureText(text);
      const g = ctx.createLinearGradient(x - m.width / 2, y - 40, x + m.width / 2, y + 40);
      fills.gradient.forEach(([stop, color]) => g.addColorStop(stop, color));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = fills.fill || '#fde68a';
    }
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawChip(ctx, x, y, r, color, label) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${r * 0.9}px "Plus Jakarta Sans", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function buildShareImage(meta) {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 520;
    const ctx = canvas.getContext('2d');
    const { balance, playerName } = meta;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;

    const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
    bg.addColorStop(0, '#1e0a38');
    bg.addColorStop(0.4, '#140428');
    bg.addColorStop(1, '#030008');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const bg2 = ctx.createLinearGradient(w, 0, 0, h);
    bg2.addColorStop(0, 'rgba(88, 28, 135, 0.35)');
    bg2.addColorStop(0.6, 'transparent');
    bg2.addColorStop(1, 'rgba(180, 83, 9, 0.08)');
    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, w, h);

    drawBokeh(ctx, w, h);
    drawRadialBurst(ctx, w, h);
    drawConfetti(ctx, w, h);
    drawSparkles(ctx, w, h);
    drawNeonFrame(ctx, w, h);
    drawVignette(ctx, w, h);

    drawChip(ctx, 68, 108, 18, '#dc2626', '7');
    drawChip(ctx, w - 68, 108, 18, '#2563eb', '★');
    drawChip(ctx, 54, h - 82, 17, '#059669', '€');
    drawChip(ctx, w - 54, h - 82, 17, '#9333ea', '♦');

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillText('D-DOBBLE CASINO', cx, 48);

    if (playerName) {
      ctx.fillStyle = 'rgba(196, 181, 253, 0.7)';
      ctx.font = '500 14px Inter, sans-serif';
      ctx.fillText(playerName, cx, 68);
    }

    drawWinRibbon(ctx, cx, 108);

    const panelW = w - 88;
    const panelH = 168;
    const panelY = 168;
    drawGlassPanel(ctx, (w - panelW) / 2, panelY, panelW, panelH, 22);

    const balanceText = `€${balance}`;
    const balSize = fitFontSize(ctx, balanceText, '"Plus Jakarta Sans", Inter, sans-serif', panelW - 48, 108, 48);
    const balFont = `900 ${balSize}px "Plus Jakarta Sans", Inter, sans-serif`;
    drawGlowText(ctx, balanceText, cx, panelY + panelH / 2 + 4, balFont, {
      shadow: 'rgba(0,0,0,0.45)',
      outline: '#312e81',
      gradient: [
        [0, '#ffffff'],
        [0.3, '#fef3c7'],
        [0.55, '#fde68a'],
        [0.8, '#fbbf24'],
        [1, '#fffbeb']
      ]
    }, 'rgba(251, 191, 36, 0.75)', 28, 3);

    [[cx - 100, panelY + panelH + 18], [cx, panelY + panelH + 22], [cx + 100, panelY + panelH + 18]].forEach(([sx, sy], i) => {
      drawStar(ctx, sx, sy, 7 - i, 3, 4, '#fde68a', 0.5 + i * 0.15);
    });

    ctx.strokeStyle = 'rgba(253, 230, 138, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 90, panelY + panelH + 38);
    ctx.lineTo(cx + 90, panelY + panelH + 38);
    ctx.stroke();

    const footerH = 48;
    const footerGrad = ctx.createLinearGradient(0, h - footerH, 0, h);
    footerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    footerGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = footerGrad;
    ctx.fillRect(0, h - footerH, w, footerH);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 15px "Plus Jakarta Sans", Inter, sans-serif';
    ctx.fillText('www.d-game.nl', cx, h - footerH / 2 + 1);

    return canvas;
  }

  function buildShareText(meta) {
    return `WINST! Ik heb €${meta.balance} op D-Dobble Casino! 🎰 Speel zelf op www.d-game.nl`;
  }

  function canvasToShareFile(shareCanvas) {
    return new Promise((resolve) => {
      shareCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], 'd-dobble-winst.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  function getShareMeta() {
    const state = GameHub.state;
    const playerName = GameHub.getSessionMeta?.().playerName || 'Speler';
    return {
      balance: state.balance,
      playerName
    };
  }

  async function openShareModal() {
    if (shareOpen) return;

    shareOpen = true;
    wasPaused = GameHub.paused;
    GameHub.paused = true;

    pendingMeta = getShareMeta();
    const shareCanvas = buildShareImage(pendingMeta);
    pendingShareFile = await canvasToShareFile(shareCanvas);

    const preview = document.getElementById('share-balance-preview');
    const modal = document.getElementById('share-balance-modal');
    const text = document.querySelector('#share-balance-modal .share-modal-text');

    if (text) {
      text.textContent = `Deel je winst van €${pendingMeta.balance}!`;
    }
    if (preview) preview.src = shareCanvas.toDataURL('image/png');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeShareModal() {
    const modal = document.getElementById('share-balance-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    shareOpen = false;
    pendingShareFile = null;
    pendingMeta = null;
    if (!wasPaused) GameHub.paused = false;
    wasPaused = false;
  }

  function downloadShareFile() {
    if (!pendingShareFile) return;
    const url = URL.createObjectURL(pendingShareFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = pendingShareFile.name;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Afbeelding opgeslagen');
  }

  async function shareNow() {
    if (!pendingShareFile) {
      closeShareModal();
      return;
    }

    const shareText = pendingMeta ? buildShareText(pendingMeta) : 'Speel D-Dobble Casino op www.d-game.nl';

    if (navigator.share && navigator.canShare?.({ files: [pendingShareFile] })) {
      try {
        await navigator.share({
          title: 'WINST! — D-Dobble Casino',
          text: shareText,
          files: [pendingShareFile]
        });
      } catch {
        Toast.show('Delen geannuleerd');
      }
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: 'WINST! — D-Dobble Casino',
          text: shareText,
          url: 'https://www.d-game.nl'
        });
      } catch {
        Toast.show('Delen geannuleerd');
      }
    } else {
      downloadShareFile();
    }
    closeShareModal();
  }

  function init() {
    document.getElementById('btn-share-balance')?.addEventListener('click', () => {
      void openShareModal();
    });
    document.getElementById('btn-share-balance-yes')?.addEventListener('click', () => {
      void shareNow();
    });
    document.getElementById('btn-share-balance-no')?.addEventListener('click', closeShareModal);
    document.getElementById('share-balance-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'share-balance-modal') closeShareModal();
    });
  }

  return { init, openShareModal, closeShareModal };
})();
/* END-MERGE-BLOCK */
