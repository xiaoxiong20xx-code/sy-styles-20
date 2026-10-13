// Frame-accurate renderer: node render.js scene.html out.mp4 [--q "k=v&..."] [--fmt png|jpeg] [--from s] [--to s] [--still t:out.png]
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright')); }
const { spawn } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const html = path.resolve(argv[0]);
const out = argv[1];
const q = opt('q', '');
const fmt = opt('fmt', 'jpeg');
const stills = argv.filter((a, i) => argv[i - 1] === '--still');
const rs = parseFloat(opt('rs', '1'));
const framesDir = opt('frames', '');
const VW = Math.round(1920 * rs), VH = Math.round(1080 * rs);

(async () => {
  // --nogpu: pure software raster/compositing. ~10x faster capture for 2D pages (no WebGL); WebGL scenes keep SwiftShader.
  // --hwgpu: use the machine's real graphics card for WebGL (much faster on a desktop with a GPU); default is SwiftShader (works everywhere, slow)
  const GPU = argv.includes('--nogpu') ? ['--disable-gpu'] : argv.includes('--hwgpu') || process.env.HWGPU === '1' ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({
    args: [...GPU, '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(pathToFileURL(html).href + '?render=1&rs=' + rs + (q ? '&' + q : ''));
  await page.waitForFunction(() => typeof window.__seek === 'function');
  const dur = await page.evaluate(() => window.__duration);
  const fps = await page.evaluate(() => window.__fps);
  const shot = async (t, file) => {
    await page.evaluate((tt) => window.__seek(tt), t);
    return page.screenshot({ path: file, type: fmt, quality: fmt === 'jpeg' ? 95 : undefined, animations: 'disabled', caret: 'hide', timeout: 0 });
  };
  if (stills.length) {
    for (const s of stills) { const [t, f] = s.split(':'); await shot(parseFloat(t), f); console.log('still', t, f); }
    await browser.close(); return;
  }
  const from = parseFloat(opt('from', 0)), to = parseFloat(opt('to', dur));
  const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
  if (framesDir) {
    const fs = require('fs'); fs.mkdirSync(framesDir, { recursive: true });
    // --mb N: N sub-frames per frame spread over a 180-degree shutter (--shutter), each with a sub-pixel
    // jitter (Halton 2,3) -> averaged by ffmpeg = motion blur + anti-aliasing. Stop-motion scenes (frameKey) stay at 1.
    const MB = Math.max(1, parseInt(opt('mb', '1'))), SH = parseFloat(opt('shutter', '0.5'));
    const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
    const subDir = path.join(framesDir, '_sub');
    if (MB > 1) fs.mkdirSync(subDir, { recursive: true });
    const t0 = Date.now();
    let lastKey = null, lastFile = null, lastSubs = null;
    for (let n = n0; n < n1; n++) {
      const file = path.join(framesDir, `f${String(n).padStart(5, '0')}.jpg`);
      const key = await page.evaluate((tt) => (window.__frameKey ? window.__frameKey(tt) : null), n / fps);
      if (MB === 1) {
        if (key !== null && key === lastKey && lastFile) { fs.copyFileSync(lastFile, file); continue; }
        await page.evaluate((tt) => window.__seek(tt), n / fps);
        await page.screenshot({ path: file, type: 'jpeg', quality: 93, animations: 'disabled', caret: 'hide' });
        lastKey = key; lastFile = file;
      } else {
        // stop-motion scenes (frameKey) with --mb: render the jittered sub-frames once per drawing, copy them for held frames
        if (key !== null && key === lastKey && lastSubs) {
          lastSubs.forEach((f, k) => fs.copyFileSync(f, path.join(subDir, `s${String((n - n0) * MB + k).padStart(6, '0')}.jpg`)));
          continue;
        }
        const subs = [];
        for (let k = 0; k < MB; k++) {
          const tt = (n + SH * ((k + 0.5) / MB - 0.5)) / fps;
          const jx = halton(k + 1, 2) - 0.5, jy = halton(k + 1, 3) - 0.5;
          await page.evaluate(([a, x, y]) => { if (window.__setJitter) window.__setJitter(x, y); return window.__seek(a); }, [tt, jx, jy]);
          const sp = path.join(subDir, `s${String((n - n0) * MB + k).padStart(6, '0')}.jpg`);
          await page.screenshot({ path: sp, type: 'jpeg', quality: 97, animations: 'disabled', caret: 'hide' });
          subs.push(sp);
        }
        lastKey = key; lastSubs = subs;
      }
      if ((n - n0) % 30 === 0) process.stdout.write(`\r${path.basename(path.dirname(html))} ${n - n0}/${n1 - n0} ${((Date.now() - t0) / (n - n0 + 1)).toFixed(0)}ms/f   `);
    }
    if (MB > 1) {
      const { execFileSync } = require('child_process');
      const w = Array(MB).fill(1).join(' ');
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps * MB), '-i', path.join(subDir, 's%06d.jpg'),
        '-vf', `tmix=frames=${MB}:weights='${w}',select='eq(mod(n\\,${MB})\\,${MB - 1})'`, '-fps_mode', 'passthrough',
        '-q:v', '2', '-start_number', String(n0), path.join(framesDir, 'f%05d.jpg')]);
      fs.rmSync(subDir, { recursive: true, force: true });
    }
    console.log(`\ndone ${framesDir} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await browser.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let n = n0; n < n1; n++) {
    await page.evaluate((tt) => window.__seek(tt), n / fps);
    const buf = await page.screenshot({ type: fmt, quality: fmt === 'jpeg' ? 95 : undefined, animations: 'disabled', caret: 'hide' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((n - n0) % 30 === 0) process.stdout.write(`\r${path.basename(html)} ${n - n0}/${n1 - n0} ${((Date.now() - t0) / (n - n0 + 1)).toFixed(0)}ms/f   `);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\ndone ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
})();
