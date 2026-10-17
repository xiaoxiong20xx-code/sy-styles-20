// Element-ball skins: each style's ball carries that style's look. drawBall(ctx, skin, R, t)
(function () {
  const TAU = Math.PI * 2;
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const circle = (ctx, r) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); };
  const jag = (ctx, r, n, amp, seed) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, rr = r * (1 + (h(i * 3.1 + seed) - 0.5) * amp); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
  };
  const shine = (ctx, R, a = 0.85) => {
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.42, 0, -R * 0.35, -R * 0.42, R * 0.6);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; circle(ctx, R); ctx.fill();
  };
  const SKINS = {
    sketch(ctx, R, t) {
      const f = Math.floor(t * 12) % 3;
      ctx.fillStyle = '#ffd347'; jag(ctx, R, 28, 0.05, f * 7); ctx.fill();
      ctx.save(); jag(ctx, R, 28, 0.05, f * 7); ctx.clip();
      ctx.strokeStyle = 'rgba(42,38,34,.35)'; ctx.lineWidth = 2;
      for (let x = -R * 2; x < R * 2; x += 7) { ctx.beginPath(); ctx.moveTo(x, R); ctx.lineTo(x + R * 0.8, -R); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,248,210,.9)'; ctx.beginPath(); ctx.ellipse(-R * .3, -R * .35, R * .32, R * .24, -0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; jag(ctx, R, 28, 0.07, f * 13 + 1); ctx.stroke();
    },
    iso(ctx, R) {
      ctx.save(); circle(ctx, R); ctx.clip();
      const s = R * 1.2;
      ctx.fillStyle = '#5d52d6'; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.fillStyle = '#c9c2ff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.87, -s * 0.5); ctx.lineTo(0, -s); ctx.lineTo(s * 0.87, -s * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8f84ff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.87, -s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.lineTo(0, s); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; circle(ctx, R - 0.75); ctx.stroke();
    },
    flat(ctx, R) {
      ctx.fillStyle = '#ff5a4e'; circle(ctx, R); ctx.fill();
      ctx.save(); circle(ctx, R); ctx.clip();
      ctx.fillStyle = '#d9443a'; ctx.beginPath(); ctx.arc(R * 0.35, R * 0.35, R, 0, TAU); ctx.arc(-R * 0.05, -R * 0.05, R * 1.02, 0, TAU, true); ctx.fill('evenodd');
      ctx.restore();
      ctx.fillStyle = '#fdf0d5'; ctx.beginPath(); ctx.ellipse(-R * 0.38, -R * 0.42, R * 0.2, R * 0.12, -0.7, 0, TAU); ctx.fill();
    },
    line(ctx, R, t) {
      ctx.fillStyle = '#0b1020'; circle(ctx, R); ctx.fill();
      ctx.strokeStyle = '#d9b25f'; ctx.lineWidth = 3.5; circle(ctx, R - 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-R * 0.55, R * 0.25); ctx.lineTo(-R * 0.2, -R * 0.2); ctx.lineTo(0.05 * R, R * 0.1); ctx.lineTo(R * 0.3, -R * 0.3); ctx.lineTo(R * 0.6, R * 0.25); ctx.stroke();
      const a = t * 5; ctx.fillStyle = '#fff4cf'; ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2), 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    },
    candy(ctx, R) {
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#ffc2d8'); g.addColorStop(0.55, '#ff7aa8'); g.addColorStop(1, '#b8325f');
      ctx.fillStyle = g; circle(ctx, R); ctx.fill();
      const rim = ctx.createRadialGradient(R * 0.4, R * 0.5, R * 0.2, R * 0.4, R * 0.5, R * 0.9);
      rim.addColorStop(0, 'rgba(120,200,255,.35)'); rim.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = rim; circle(ctx, R); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.ellipse(-R * 0.34, -R * 0.42, R * 0.22, R * 0.13, -0.6, 0, TAU); ctx.fill();
    },
    morph(ctx, R, t) {
      ctx.fillStyle = '#ffb02e'; ctx.beginPath();
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, rr = R * (1 + 0.07 * Math.sin(a * 4 + t * 9) + 0.04 * Math.sin(a * 3 - t * 6)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill(); shine(ctx, R * 0.9, 0.55);
    },
    sticker(ctx, R) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
      ctx.fillStyle = '#fff'; circle(ctx, R); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ff7a1a'; circle(ctx, R - 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.16 : R * 0.38; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill();
    },
    hud(ctx, R, t) {
      ctx.fillStyle = '#04141a'; circle(ctx, R); ctx.fill();
      ctx.save(); ctx.shadowColor = '#2ff3ff'; ctx.shadowBlur = 16; ctx.strokeStyle = '#2ff3ff'; ctx.lineWidth = 3; circle(ctx, R - 1.5); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.rotate(t * 3); ctx.strokeStyle = 'rgba(47,243,255,.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); circle(ctx, R * 0.62); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff2e88'; circle(ctx, R * 0.2); ctx.fill(); ctx.restore();
    },
    paper(ctx, R, t) {
      const f = Math.floor(t * 12) % 4;
      ctx.fillStyle = '#f2ead8'; jag(ctx, R + 3, 40, 0.06, 50 + f); ctx.fill();
      ctx.fillStyle = '#c9a06a'; jag(ctx, R - 1, 36, 0.05, 9 + f); ctx.fill();
      ctx.save(); jag(ctx, R - 1, 36, 0.05, 9 + f); ctx.clip();
      ctx.fillStyle = 'rgba(40,24,10,.35)';
      for (let y = -R; y < R; y += 6) for (let x = -R; x < R; x += 6) { const r = 1.6 * (0.4 + 0.6 * (x + R) / (2 * R)); ctx.beginPath(); ctx.arc(x + (y / 6 % 2 ? 3 : 0), y, r, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.save(); ctx.rotate(-0.5); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-R * 1.1, -8, R * 2.2, 16); ctx.restore();
    },
    glass(ctx, R) {
      const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(0.7, 'rgba(160,140,255,.35)'); g.addColorStop(1, 'rgba(56,211,255,.75)');
      ctx.fillStyle = g; circle(ctx, R); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; circle(ctx, R - 0.75); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,200,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(1.5, 1.5, R - 2, 0.2, 1.6); ctx.stroke();
      shine(ctx, R, 0.9);
    },
    bauhaus(ctx, R) {
      ctx.fillStyle = '#e63a2e'; circle(ctx, R); ctx.fill();
      ctx.save(); circle(ctx, R); ctx.clip(); ctx.fillStyle = '#f2c12e'; ctx.fillRect(-R, -R, R, 2 * R); ctx.fillStyle = '#1f4e9e'; ctx.fillRect(0, R * 0.3, R, R); ctx.restore();
      ctx.fillStyle = '#111'; circle(ctx, R * 0.18); ctx.fill();
    },
    sun(ctx, R) {
      ctx.save(); ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 22;
      const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#ffd319'); g.addColorStop(0.55, '#ff3fa4'); g.addColorStop(1, '#8c1eff');
      ctx.fillStyle = g; circle(ctx, R); ctx.fill(); ctx.restore();
      ctx.save(); circle(ctx, R); ctx.clip(); ctx.fillStyle = '#14002b';
      [0.15, 0.38, 0.6, 0.8].forEach((y, i) => ctx.fillRect(-R, y * R, 2 * R, 2 + i * 1.6)); ctx.restore();
    },
    pixel(ctx, R) {
      const p = 7, n = Math.ceil(R / p);
      for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
        const cx = (i + 0.5) * p, cy = (j + 0.5) * p; const d = Math.hypot(cx, cy); if (d > R) continue;
        const l = (-cx - cy) / (R * 1.4);
        ctx.fillStyle = d > R - p ? '#1a3f8a' : l > 0.45 ? '#bfe3ff' : l > 0.05 ? '#3fa7ff' : '#2a6fd0';
        ctx.fillRect(i * p, j * p, p, p);
      }
    },
    liquid(ctx, R, t) {
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, rr = R * (1 + 0.035 * Math.sin(a * 3 + t * 7)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.05);
      g.addColorStop(0, '#f1dcff'); g.addColorStop(0.35, '#c48bff'); g.addColorStop(0.8, '#7a2fe0'); g.addColorStop(1, '#ff6fd8');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.ellipse(-R * 0.32, -R * 0.4, R * 0.25, R * 0.12, -0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(R * 0.42, R * 0.38, R * 0.07, 0, TAU); ctx.fill();
    },
    variety(ctx, R) {
      // a fried egg sticker: die-cut white border, wobbly white, glossy yolk
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffffff'; circle(ctx, R); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#2a1d14'; circle(ctx, R - 4); ctx.fill();
      ctx.fillStyle = '#fbf7ef'; ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, r = R * (0.68 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7)); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.fill(); ctx.strokeStyle = 'rgba(205,130,50,.8)'; ctx.lineWidth = 2.5; ctx.stroke();
      const g = ctx.createRadialGradient(-R * 0.12, -R * 0.14, R * 0.03, 0, 0, R * 0.34);
      g.addColorStop(0, '#fff1a0'); g.addColorStop(0.45, '#ffc21a'); g.addColorStop(1, '#f08a00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(R * 0.04, R * 0.02, R * 0.32, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(-R * 0.08, -R * 0.1, R * 0.09, R * 0.05, -0.6, 0, TAU); ctx.fill();
    },
    cursor(ctx, R) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#f5f7fb'; circle(ctx, R); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#3d7bff'; ctx.lineWidth = 3; circle(ctx, R - 4); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(10, 3); ctx.lineTo(2, 4); ctx.lineTo(6, 13); ctx.lineTo(2, 15); ctx.lineTo(-2, 6); ctx.lineTo(-7, 11); ctx.closePath(); ctx.fill();
    },
    news(ctx, R) {
      ctx.fillStyle = '#f3efe6'; circle(ctx, R); ctx.fill();
      ctx.save(); circle(ctx, R); ctx.clip(); ctx.fillStyle = 'rgba(20,20,20,.5)';
      for (let y = -R; y < R; y += 5) for (let x = -R; x < R; x += 5) { const r = 1.3 * Math.max(0, (x + y) / (2 * R) - 0.05); if (r > 0.1) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } }
      ctx.fillStyle = '#141414'; ctx.fillRect(-R * 0.62, -R * 0.5, R * 1.24, R * 0.2); ctx.fillRect(-R * 0.62, -R * 0.2, R * 0.86, R * 0.2);
      ctx.fillStyle = 'rgba(20,20,20,.35)'; for (let i = 0; i < 3; i++) ctx.fillRect(-R * 0.62, R * 0.38 + i * R * 0.13, R * (i === 2 ? 0.6 : 1.0), R * 0.06);
      ctx.restore();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 3; circle(ctx, R - 1.5); ctx.stroke();
      ctx.strokeStyle = '#d6322e'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-R * 0.66, R * 0.15); ctx.quadraticCurveTo(0, R * 0.26, R * 0.62, R * 0.08); ctx.stroke();
    },
    ink(ctx, R, t) {
      // rice-paper disc + one ensō brush ring + red seal
      ctx.fillStyle = '#f1ebdd'; circle(ctx, R); ctx.fill();
      ctx.save(); circle(ctx, R); ctx.clip();
      ctx.strokeStyle = 'rgba(120,100,70,.10)'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) { const y = -R + h(i) * 2 * R; ctx.beginPath(); ctx.moveTo(-R, y); ctx.quadraticCurveTo(0, y + (h(i + 5) - .5) * 14, R, y + (h(i + 9) - .5) * 10); ctx.stroke(); }
      const g = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,40,.18)'); ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.restore();
      const a0 = -2.2, span = TAU * 0.86, Rr = R * 0.6, N = 90;
      const wid = (u) => R * (0.05 + 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7)) * (1 + (h(Math.floor(u * 30)) - .5) * 0.12);
      ctx.fillStyle = '#151515'; ctx.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N, a = a0 + span * u, r = Rr + wid(u) / 2; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      for (let i = N; i >= 0; i--) { const u = i / N, a = a0 + span * u, r = Rr - wid(u) / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      // dry-brush streaks at the tail
      ctx.strokeStyle = 'rgba(21,21,21,.75)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (let j = 0; j < 5; j++) { const off = (j - 2) * R * 0.035, u0 = 0.8 + h(j) * 0.05, u1 = 0.97 + h(j + 3) * 0.05; ctx.beginPath(); for (let i = 0; i <= 20; i++) { const u = u0 + (u1 - u0) * i / 20, a = a0 + span * u; const x = Math.cos(a) * (Rr + off), y = Math.sin(a) * (Rr + off); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = '#c8322b'; ctx.fillRect(R * 0.34, R * 0.3, R * 0.36, R * 0.36);
      ctx.fillStyle = '#f2ede2'; ctx.fillRect(R * 0.4, R * 0.36, R * 0.1, R * 0.24); ctx.fillRect(R * 0.54, R * 0.36, R * 0.1, R * 0.1);
      ctx.strokeStyle = 'rgba(40,30,20,.5)'; ctx.lineWidth = 2; circle(ctx, R - 1); ctx.stroke();
    },
    clay(ctx, R, t) {
      const f = Math.floor(t * 12) % 3;
      ctx.save(); ctx.translate((h(f) - .5) * 1.5, (h(f + 9) - .5) * 1.5);
      const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
      g.addColorStop(0, '#ffc69a'); g.addColorStop(0.6, '#f08a4b'); g.addColorStop(1, '#b85a26');
      ctx.fillStyle = g; jag(ctx, R, 30, 0.03, f * 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,210,.35)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(R * 0.15, R * 0.2, R * (0.2 + i * 0.12), 3.6, 5.2); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,240,225,.55)'; ctx.beginPath(); ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.2, R * 0.13, -0.6, 0, TAU); ctx.fill();
      ctx.restore();
    },
    blueprint(ctx, R) {
      ctx.fillStyle = '#0d3b8c'; circle(ctx, R); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; circle(ctx, R - 1.5); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.moveTo(-R - 8, 0); ctx.lineTo(R + 8, 0); ctx.moveTo(0, -R - 8); ctx.lineTo(0, R + 8); ctx.stroke();
      circle(ctx, R * 0.45); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R - 7), Math.sin(a) * (R - 7)); ctx.lineTo(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); ctx.stroke(); }
    },
  };
  window.drawBall = function (ctx, skin, R, t) { (SKINS[skin] || SKINS.flat)(ctx, R, t); };
})();
