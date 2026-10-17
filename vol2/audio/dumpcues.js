// dump each scene's evaluated cue list (window.__cues) to styles/<dir>/cues.json, so expressions like T0 + x / SPEED resolve
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright')); }
const fs = require('fs'), path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, 'styles')).filter((d) => /^\d\d-/.test(d));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const d of dirs) {
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
    page.setDefaultTimeout(120000);
    try {
      await page.goto(require('url').pathToFileURL(path.join(root, 'styles', d, 'index.html')).href + '?render=1&rs=0.25&nolabel');
      await page.waitForFunction(() => Array.isArray(window.__cues));
      const cues = await page.evaluate(() => window.__cues.map((c) => Object.assign({}, c)));
      fs.writeFileSync(path.join(root, 'styles', d, 'cues.json'), JSON.stringify(cues));
      console.log(d, cues.length);
    } catch (e) { console.log(d, 'ERR', e.message.slice(0, 120)); }
    await page.close();
  }
  await browser.close();
})();
