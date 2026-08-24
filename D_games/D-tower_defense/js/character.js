/* MERGE-BLOCK: character.js */
const Character = (() => {
  let badgeCanvas;
  let badgeCtx;
  let castleCanvas;
  let castleCtx;

  const BADGE_SIZE = 72;
  const CASTLE_SIZE = 96;

  function init() {
    badgeCanvas = document.getElementById('commander-badge');
    badgeCtx = badgeCanvas?.getContext('2d');
    castleCanvas = document.getElementById('castle-preview');
    castleCtx = castleCanvas?.getContext('2d');

    document.getElementById('color-castle')?.addEventListener('input', (e) => {
      if (!Menu.hasStarted?.()) {
        Toast.show('Start eerst een session');
        syncCastleColorInput();
        return;
      }
      G.setCastleColor(e.target.value);
      persistCastleColor(e.target.value);
      drawCastlePreview();
      drawBadge();
      Menu.autoSave?.();
    });

    document.getElementById('btn-reset-castle-color')?.addEventListener('click', () => {
      if (!Menu.hasStarted?.()) {
        Toast.show('Start eerst een session');
        return;
      }
      G.setCastleColor(CFG.CASTLE.color);
      persistCastleColor(CFG.CASTLE.color);
      syncCastleColorInput();
      drawCastlePreview();
      drawBadge();
      Menu.autoSave?.();
      Toast.show('Kasteelkleur reset');
    });

    window.addEventListener('tabchange', (e) => {
      if (e.detail?.tabId === 'character') refresh();
    });

    refresh();
  }

  function getCastleColor() {
    const session = Menu.getActiveSession?.();
    if (Menu.hasStarted?.()) {
      return G.getCastleColor() || session?.castleColor || CFG.CASTLE.color;
    }
    return session?.castleColor || CFG.CASTLE.color;
  }

  function persistCastleColor(color) {
    const id = Menu.getCurrentSessionId?.();
    if (!id) return;
    const session = Storage.getSession(id);
    if (!session) return;
    session.castleColor = color;
    Storage.upsertSession(session);
  }

  function syncCastleColorInput() {
    const input = document.getElementById('color-castle');
    if (input) input.value = getCastleColor();
  }

  function prepCanvas(canvas, ctx, displaySize) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(displaySize * dpr);
    canvas.height = Math.floor(displaySize * dpr);
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    return displaySize;
  }

  function drawBadge() {
    if (!badgeCtx || !badgeCanvas) return;

    const size = prepCanvas(badgeCanvas, badgeCtx, BADGE_SIZE);
    const cx = size / 2;
    const cy = size / 2;
    const color = getCastleColor();
    const r = size * 0.38;

    badgeCtx.clearRect(0, 0, size, size);
    badgeCtx.fillStyle = color + '22';
    badgeCtx.beginPath();
    badgeCtx.arc(cx, cy, r, 0, Math.PI * 2);
    badgeCtx.fill();

    badgeCtx.strokeStyle = color;
    badgeCtx.lineWidth = 2.5;
    badgeCtx.beginPath();
    badgeCtx.arc(cx, cy, r, 0, Math.PI * 2);
    badgeCtx.stroke();

    badgeCtx.fillStyle = color;
    badgeCtx.font = `bold ${Math.round(r * 0.75)}px Plus Jakarta Sans, sans-serif`;
    badgeCtx.textAlign = 'center';
    badgeCtx.textBaseline = 'middle';
    const initial = (G.sessionMeta?.characterName || '?').charAt(0).toUpperCase();
    badgeCtx.fillText(initial, cx, cy);
  }

  function hexPoints(cx, cy, radius) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      pts.push({
        x: cx + radius * Math.cos(ang),
        y: cy + radius * Math.sin(ang)
      });
    }
    return pts;
  }

  function drawCastlePreview() {
    if (!castleCtx || !castleCanvas) return;

    const size = prepCanvas(castleCanvas, castleCtx, CASTLE_SIZE);
    const color = getCastleColor();
    const hexR = Math.min(size / 2.3, size / (Math.sqrt(3) + 0.5));

    const pts = hexPoints(0, 0, hexR);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const cx = size / 2 - (minX + maxX) / 2 + 3;
    const cy = size / 2 - (minY + maxY) / 2 + 5;

    castleCtx.clearRect(0, 0, size, size);

    const centered = hexPoints(cx, cy, hexR);
    castleCtx.beginPath();
    centered.forEach((p, i) => {
      if (i === 0) castleCtx.moveTo(p.x, p.y);
      else castleCtx.lineTo(p.x, p.y);
    });
    castleCtx.closePath();
    castleCtx.fillStyle = CFG.COLORS.v;
    castleCtx.fill();

    castleCtx.strokeStyle = color;
    castleCtx.lineWidth = 2.5;
    castleCtx.lineCap = 'round';
    castleCtx.lineJoin = 'round';
    castleCtx.stroke();

    const coreR = hexR * 0.42;
    castleCtx.beginPath();
    castleCtx.arc(cx, cy, coreR, 0, Math.PI * 2);
    castleCtx.fillStyle = color;
    castleCtx.fill();

    const ringR = hexR * 0.56;
    castleCtx.beginPath();
    castleCtx.arc(cx, cy, ringR, -Math.PI / 2, Math.PI * 2 * 0.72);
    castleCtx.strokeStyle = '#fff';
    castleCtx.lineWidth = 2;
    castleCtx.lineCap = 'round';
    castleCtx.stroke();
  }

  function refresh() {
    const meta = G.sessionMeta;
    const session = Menu.getActiveSession?.();

    const commander = meta?.characterName || session?.characterName || '—';
    const sessionName = meta?.sessionName || session?.sessionName || 'Geen session';
    const diffLabel = GameConfig.difficulty[meta?.difficulty || session?.difficulty || 'normal']?.label || 'Normal';

    $('stat-commander').textContent = commander;
    const vip = Vip.resolveVip(session) || !!meta?.vip;
    $('stat-session').textContent = vip ? `${sessionName} ★ VIP` : sessionName;
    $('stat-sectors').textContent = String(meta?.maxCompletedLevel || session?.maxCompletedLevel || 0);
    $('stat-level').textContent = String(G.lvl || session?.gameState?.lvl || 1);
    $('stat-waves').textContent = String(meta?.stats?.wavesSurvived || session?.stats?.wavesSurvived || 0);
    $('stat-castle-hp').textContent = G.castle
      ? `${Math.floor((G.castle.hp / G.castle.max) * 100)}%`
      : '100%';
    $('stat-difficulty').textContent = diffLabel;
    $('stat-money').textContent = String(Math.floor(G.money || 0));

    const colorInput = document.getElementById('color-castle');
    const resetBtn = document.getElementById('btn-reset-castle-color');
    const canEdit = Menu.hasStarted?.();
    if (colorInput) colorInput.disabled = !canEdit;
    if (resetBtn) resetBtn.disabled = !canEdit;

    syncCastleColorInput();
    drawBadge();
    drawCastlePreview();
  }

  return { init, refresh };
})();
/* END-MERGE-BLOCK */
