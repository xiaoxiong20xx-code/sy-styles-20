/* StyleReel core — deterministic timeline for 1920x1080 motion scenes.
 * Each scene calls Reel.scene({ duration, fps, setup, render(t) }).
 * Preview mode: opens in a browser, auto-plays & loops, space = pause, drag the bar to scrub.
 * Render mode (?render=1): exposes window.__seek(t) for frame-accurate capture.
 */
(function () {
  const W = 1920, H = 1080;
  const Q = new URLSearchParams(location.search);
  const RENDER = Q.has('render');
  // render scale: frames for the reel are captured at window size (1216x684 = 0.6333 of 1080p)
  const RS = RENDER ? parseFloat(Q.get('rs') || '1') : 1;

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const remap = (x, a, b, c, d, e = (k) => k) => lerp(c, d, e(inv(a, b, x)));
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inQuart: (t) => t * t * t * t,
    inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inQuint: (t) => t ** 5,
    inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  // damped spring from 0 -> 1, t in seconds since start (closed form, deterministic)
  function spring(t, { k = 170, c = 14, m = 1, v0 = 0 } = {}) {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const A = 1, B = (z * w0 * A - v0) / wd;
      return 1 - Math.exp(-z * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    }
    const r = -w0; // critically damped approx
    return 1 - Math.exp(r * t) * (1 + (-r - v0) * t);
  }
  // seeded RNG
  function rng(seed = 1) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
  function noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const h = (a, b) => hash(a * 57 + b * 131);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy) * 2 - 1;
  }
  const step = (t, fps) => Math.floor(t * fps + 1e-6) / fps; // hold frames (on twos etc.)
  // window helper: progress of t inside [a, a+d]
  const win = (t, a, d, ease = E.linear) => ease(inv(a, a + d, t));

  // ---------- stage ----------
  function makeStage(bg = '#000') {
    document.documentElement.style.cssText = `margin:0;height:100%;background:${RENDER ? bg : '#0b0b0d'};overflow:hidden`;
    document.body.style.cssText = 'margin:0;height:100%;overflow:hidden';
    let stage = document.getElementById('stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'stage'; document.body.prepend(stage); }
    stage.style.cssText += `;position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:${bg};transform-origin:0 0;`;
    if (RENDER && RS !== 1) stage.style.transform = `scale(${RS})`;
    // sub-pixel jitter for supersampled / motion-blurred renders (dx,dy in output pixels).
    // scenes that jitter inside their own shader set Reel.ownJitter = true and read Reel.jit instead.
    if (RENDER) window.__setJitter = (dx, dy) => {
      Reel.jit = [dx, dy];
      if (Reel.ownJitter) return;
      stage.style.transform = `translate(${dx}px, ${dy}px)` + (RS !== 1 ? ` scale(${RS})` : '');
    };
    if (!RENDER) {
      const fit = () => {
        const s = Math.min(innerWidth / W, (innerHeight - 40) / H);
        stage.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - 40 - H * s) / 2}px) scale(${s})`;
      };
      addEventListener('resize', fit); fit();
    }
    return stage;
  }

  // ---------- scene runner ----------
  function scene(def) {
    const fps = def.fps || 30, dur = def.duration;
    const ready = (async () => {
      const fams = def.fonts || [];
      await Promise.all(fams.map((f) => document.fonts.load(f).catch(() => {})));
      await document.fonts.ready;
      if (def.setup) await def.setup();
    })();
    window.__duration = dur; window.__fps = fps; window.__cues = def.cues || [];
    if (def.frameKey) window.__frameKey = def.frameKey;
    window.__seek = async (t) => { await ready; if (def.before) await def.before(t); def.render(t); if (def.after) await def.after(t); return true; };
    if (RENDER) return;
    // preview player
    ready.then(() => {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:40px;background:#16161a;color:#aaa;font:12px Inter,monospace;display:flex;align-items:center;gap:12px;padding:0 14px;z-index:99;user-select:none';
      bar.innerHTML = '<span id=pp style="cursor:pointer;width:16px">❚❚</span><div id=tr style="flex:1;height:6px;background:#333;border-radius:3px;position:relative;cursor:pointer"><div id=fi style="position:absolute;left:0;top:0;bottom:0;background:#e8e8e8;border-radius:3px"></div></div><span id=tc>0.00s</span>';
      document.body.appendChild(bar);
      let t = 0, playing = true, last = performance.now();
      const pp = bar.querySelector('#pp'), tr = bar.querySelector('#tr'), fi = bar.querySelector('#fi'), tc = bar.querySelector('#tc');
      const toggle = () => { playing = !playing; pp.textContent = playing ? '❚❚' : '▶'; };
      pp.onclick = toggle; addEventListener('keydown', (e) => { if (e.code === 'Space') toggle(); });
      const scrub = (e) => { const r = tr.getBoundingClientRect(); t = clamp((e.clientX - r.left) / r.width) * dur; };
      tr.onmousedown = (e) => { scrub(e); const mv = (ev) => scrub(ev); addEventListener('mousemove', mv); addEventListener('mouseup', () => removeEventListener('mousemove', mv), { once: true }); };
      const loop = (now) => {
        if (playing) { t += (now - last) / 1000; if (t > dur) t = 0; }
        last = now;
        def.render(Math.floor(t * fps) / fps);
        fi.style.width = (t / dur) * 100 + '%'; tc.textContent = t.toFixed(2) + 's';
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }

  // ---------- svg helpers ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  // stroke draw-on: p in [0,1]
  function drawOn(path, p) {
    if (!path.__len) path.__len = path.getTotalLength();
    const L = path.__len;
    path.style.strokeDasharray = `${L} ${L}`;
    path.style.strokeDashoffset = `${L * (1 - clamp(p))}`;
  }
  function cfg(defaults) {
    // template text override: ?cfg={"title":"..."} (URL-encoded JSON)
    try { return Object.assign({}, defaults, JSON.parse(Q.get('cfg') || '{}')); } catch (e) { return defaults; }
  }

  // 2D canvas whose backing store follows the render scale; call begin() each frame
  function canvas2d(parent, { w = W, h = H, x = 0, y = 0, scale = 1 } = {}) {
    const cv = document.createElement('canvas');
    const k = RS * scale;
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    if (parent) parent.appendChild(cv);
    const ctx = cv.getContext('2d');
    const begin = () => { ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; };
    return { cv, ctx, begin, k };
  }

  window.Reel = { W, H, RENDER, RS, canvas2d, Q, clamp, lerp, inv, remap, E, spring, rng, hash, noise1, noise2, step, win, makeStage, scene, svgEl, drawOn, cfg, SVGNS };
})();
