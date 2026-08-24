/** Shared cute robot drawing. Local +Y is toward the bottom; front faces local -Y (up on screen when angle=0). */
const RobotDraw = {
  draw(ctx, {
    size = 40,
    colors = CONFIG.DEFAULT_CHARACTER.colors,
    style = 'scout',
    showFrontMarker = true,
    glow = false
  } = {}) {
    const head = colors.head || '#00ffff';
    const body = colors.body || '#008cff';
    const legs = colors.legs || '#ff00ff';
    const s = size;

    ctx.save();
    if (glow) {
      ctx.shadowColor = head;
      ctx.shadowBlur = Math.max(16, s * 0.48);
    }

    switch (style) {
      case 'tank':
        this.drawTank(ctx, s, head, body, legs);
        break;
      case 'spider':
        this.drawSpider(ctx, s, head, body, legs);
        break;
      case 'bee':
        this.drawBee(ctx, s, head, body, legs);
        break;
      case 'roller':
        this.drawRoller(ctx, s, head, body, legs);
        break;
      default:
        this.drawScout(ctx, s, head, body, legs);
        break;
    }

    this.drawFace(ctx, s, head, style);
    if (showFrontMarker) this.drawFrontMarker(ctx, s, head);

    ctx.restore();
  },

  roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },

  drawScout(ctx, s, head, body, legs) {
    ctx.fillStyle = legs;
    this.roundRect(ctx, -s * 0.42, -s * 0.18, s * 0.16, s * 0.52, s * 0.06);
    ctx.fill();
    this.roundRect(ctx, s * 0.26, -s * 0.18, s * 0.16, s * 0.52, s * 0.06);
    ctx.fill();

    ctx.fillStyle = body;
    this.roundRect(ctx, -s * 0.34, -s * 0.22, s * 0.68, s * 0.58, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = head;
    ctx.lineWidth = Math.max(2, s * 0.06);
    this.roundRect(ctx, -s * 0.34, -s * 0.22, s * 0.68, s * 0.58, s * 0.12);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, s * 0.02, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(0, s * 0.02, s * 0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = head;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.48);
    ctx.lineTo(0, -s * 0.68);
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  },

  drawTank(ctx, s, head, body, legs) {
    ctx.fillStyle = legs;
    this.roundRect(ctx, -s * 0.46, s * 0.08, s * 0.92, s * 0.28, s * 0.08);
    ctx.fill();

    ctx.fillStyle = body;
    this.roundRect(ctx, -s * 0.4, -s * 0.28, s * 0.8, s * 0.56, s * 0.1);
    ctx.fill();

    ctx.fillStyle = head;
    this.roundRect(ctx, -s * 0.52, -s * 0.18, s * 0.16, s * 0.34, s * 0.06);
    ctx.fill();
    this.roundRect(ctx, s * 0.36, -s * 0.18, s * 0.16, s * 0.34, s * 0.06);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(2, s * 0.05);
    this.roundRect(ctx, -s * 0.4, -s * 0.28, s * 0.8, s * 0.56, s * 0.1);
    ctx.stroke();
  },

  drawSpider(ctx, s, head, body, legs) {
    ctx.strokeStyle = legs;
    ctx.lineWidth = Math.max(3, s * 0.08);
    ctx.lineCap = 'round';
    [
      [-0.55, -0.08, -0.78, -0.32],
      [-0.55, 0.12, -0.8, 0.28],
      [0.55, -0.08, 0.78, -0.32],
      [0.55, 0.12, 0.8, 0.28]
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(s * x1, s * y1);
      ctx.lineTo(s * x2, s * y2);
      ctx.stroke();
    });

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0.04 * s, s * 0.36, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = head;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.stroke();
  },

  drawBee(ctx, s, head, body, legs) {
    ctx.fillStyle = legs;
    this.roundRect(ctx, -s * 0.38, s * 0.1, s * 0.16, s * 0.28, s * 0.05);
    ctx.fill();
    this.roundRect(ctx, s * 0.22, s * 0.1, s * 0.16, s * 0.28, s * 0.05);
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.34, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = legs;
    ctx.lineWidth = Math.max(2, s * 0.06);
    [-0.12, 0.02, 0.16].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * y);
      ctx.lineTo(s * 0.28, s * y);
      ctx.stroke();
    });

    ctx.strokeStyle = head;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.34, s * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  drawRoller(ctx, s, head, body, legs) {
    ctx.fillStyle = legs;
    this.roundRect(ctx, -s * 0.48, -s * 0.08, s * 0.96, s * 0.42, s * 0.12);
    ctx.fill();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(s * i * 0.12 - s * 0.02, -s * 0.02, s * 0.04, s * 0.3);
    }

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = head;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.stroke();
  },

  drawFace(ctx, s, head, style) {
    const faceY = style === 'roller' ? -s * 0.2 : -s * 0.34;
    const faceW = style === 'tank' ? s * 0.46 : s * 0.4;
    const faceH = s * 0.22;

    ctx.fillStyle = '#0b1224';
    this.roundRect(ctx, -faceW / 2, faceY, faceW, faceH, s * 0.06);
    ctx.fill();

    ctx.fillStyle = head;
    ctx.globalAlpha = 0.95;
    this.roundRect(ctx, -faceW / 2 + 2, faceY + 2, faceW - 4, faceH - 4, s * 0.05);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Eyes
    ctx.fillStyle = '#0f172a';
    const eyeY = faceY + faceH * 0.42;
    const eyeR = Math.max(2.5, s * 0.055);
    ctx.beginPath();
    ctx.arc(-faceW * 0.22, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(faceW * 0.22, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(-faceW * 0.22 + eyeR * 0.35, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.arc(faceW * 0.22 + eyeR * 0.35, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  },

  drawFrontMarker(ctx, s, head) {
    // Large high-contrast arrow on the front (-Y), readable on any board color.
    const tipY = -s * 0.98;
    const baseY = -s * 0.58;
    const midY = -s * 0.72;
    const halfW = s * 0.28;

    ctx.save();

    // Soft halo so the arrow pops against busy tiles
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = Math.max(4, s * 0.12);

    // Outer dark outline
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.moveTo(0, tipY - s * 0.04);
    ctx.lineTo(halfW + s * 0.06, baseY + s * 0.04);
    ctx.lineTo(s * 0.08, midY + s * 0.02);
    ctx.lineTo(-(s * 0.08), midY + s * 0.02);
    ctx.lineTo(-(halfW + s * 0.06), baseY + s * 0.04);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Bright white arrow body
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = Math.max(2, s * 0.055);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, tipY);
    ctx.lineTo(halfW, baseY);
    ctx.lineTo(s * 0.07, midY);
    ctx.lineTo(-(s * 0.07), midY);
    ctx.lineTo(-halfW, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Colored accent tip (player color) for a clear "forward" cue
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(0, tipY + s * 0.02);
    ctx.lineTo(s * 0.11, midY - s * 0.02);
    ctx.lineTo(-(s * 0.11), midY - s * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    ctx.stroke();

    // Short stem connecting arrow to the robot
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2.5, s * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(0, -s * 0.48);
    ctx.stroke();
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.stroke();

    ctx.restore();
  }
};
