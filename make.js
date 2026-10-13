#!/usr/bin/env node
// 一条命令出片（Windows / macOS / Linux 通用）
//   node make.js list                     列出 20 种风格
//   node make.js still 09 6.5             渲染某个风格某一秒的单帧，快速看效果
//   node make.js style 09 13              渲染单个风格的 10 秒视频（含音效）→ out/09.mp4
//   node make.js reel all                 渲染整条展示片（片头 + 信息卡 + 小球转场 + 片尾 + 配乐）→ out/reel.mp4
//   node make.js reel 01,09,11 mini       只用其中几个风格合成 → out/mini.mp4
//   node make.js cover                    用关键帧拼封面 → out/cover.jpg
//   node make.js brand 张三 ZHANGSAN       把画面里的署名换成你自己的
// 选项：--hwgpu 用电脑的独立显卡渲染 WebGL（快很多）；--force 已渲染过的风格也重新渲染
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const args = argv.filter((a) => !a.startsWith('--'));
const HW = flags.has('--hwgpu') ? ['--hwgpu'] : [];
const STYLES = fs.readdirSync(path.join(ROOT, 'styles')).filter((d) => /^\d\d-/.test(d)).sort();
const dirOf = (id) => STYLES.find((d) => d.startsWith(String(id).padStart(2, '0') + '-'));
const out = (...p) => path.join(ROOT, 'out', ...p);
fs.mkdirSync(out(), { recursive: true });

function run(cmd, a, opt = {}) {
  const r = spawnSync(cmd, a, { cwd: ROOT, stdio: 'inherit', shell: false, ...opt });
  if (r.error) { console.error(`\n找不到命令 ${cmd}：${r.error.message}\n请按 README 安装依赖。`); process.exit(1); }
  if (r.status !== 0) { console.error(`\n${cmd} 运行失败（退出码 ${r.status}）`); process.exit(r.status || 1); }
}
let PY = null;
function python() {
  if (PY) return PY;
  for (const c of ['python3', 'python', 'py']) { const r = spawnSync(c, ['--version']); if (!r.error && r.status === 0) return (PY = c); }
  console.error('找不到 Python，请先安装 Python 3（并 pip install numpy scipy）'); process.exit(1);
}
function ids(spec) {
  if (!spec || spec === 'all') return STYLES.map((d) => d.slice(0, 2));
  return spec.split(/[,\s]+/).filter(Boolean).map((s) => s.padStart(2, '0')).filter((i) => { if (!dirOf(i)) { console.warn('没有这个风格：' + i); return false; } return true; });
}
function renderFrames(id) {
  const dir = dirOf(id), fdir = path.join(ROOT, 'frames', id);
  if (!flags.has('--force') && fs.existsSync(fdir) && fs.readdirSync(fdir).filter((f) => f.endsWith('.jpg')).length >= 300) { console.log(`${dir} 已渲染，跳过（加 --force 重新渲染）`); return; }
  const html = fs.readFileSync(path.join(ROOT, 'styles', dir, 'index.html'), 'utf8');
  const extra = /gl\.js|rm\.js|getContext\('webgl/.test(html) ? HW : ['--nogpu'];
  const ra = path.join(ROOT, 'styles', dir, 'render.args');
  const more = fs.existsSync(ra) ? fs.readFileSync(ra, 'utf8').trim().split(/\s+/).filter(Boolean) : [];
  const tmp = fdir + '_new';
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n▶ 渲染 ${dir} ${[...extra, ...more].join(' ')}`);
  run('node', ['render.js', path.join('styles', dir, 'index.html'), 'x', '--rs', '0.633333', '--q', 'nolabel', ...extra, ...more, '--frames', tmp]);
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.renameSync(tmp, fdir);
}
function cuesOf(id) {
  const cj = path.join(ROOT, 'styles', dirOf(id), 'cues.json');
  return fs.existsSync(cj) ? JSON.parse(fs.readFileSync(cj, 'utf8')) : [];
}
function styleVideo(id) {
  renderFrames(id);
  const plan = out(`plan_${id}.json`), wav = out(`${id}.wav`);
  fs.writeFileSync(plan, JSON.stringify({ sections: [{ kind: id, start: 0, dur: 10, cues: cuesOf(id) }], global_cues: [] }));
  run(python(), [path.join('audio', 'synth.py'), plan, wav]);
  // the style is rendered at window size (1216x684); scale to 1080p for a standalone clip
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', path.join('frames', id, 'f%05d.jpg'), '-i', wav, '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out(`${id}.mp4`)]);
  console.log(`✔ out/${id}.mp4`);
}
function reel(list, name) {
  list.forEach(renderFrames);
  const cf = out(`cf_${name}`);
  fs.rmSync(cf, { recursive: true, force: true });
  console.log('\n▶ 合成整片（片头、信息卡、小球转场、片尾）');
  run('node', ['render.js', path.join('comp', 'reel.html'), 'x', '--nogpu', '--q', `ids=${list.join(',')}`, '--frames', cf]);
  const plan = out(`plan_${name}.json`), wav = out(`${name}.wav`);
  run(python(), [path.join('audio', 'reelplan.py'), plan, list.join(',')]);
  run(python(), [path.join('audio', 'synth.py'), plan, wav]);
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', path.join(cf, 'f%05d.jpg'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out(`${name}.mp4`)]);
  console.log(`✔ out/${name}.mp4`);
}

const cmd = args[0];
if (cmd === 'list' || !cmd) {
  const meta = fs.readFileSync(path.join(ROOT, 'comp', 'meta.js'), 'utf8');
  for (const m of meta.matchAll(/id: '(\d+)', dir: '([\w-]+)', zh: \[([^\]]*)\]/g)) console.log(`${m[1]}  ${m[3].replace(/'/g, '').replace(/, /g, '')}  styles/${m[2]}`);
  if (!cmd) console.log('\n用法见 make.js 顶部注释或 README.md');
} else if (cmd === 'still') {
  const id = ids(args[1])[0], t = args[2] || '5';
  const dir = dirOf(id), html = fs.readFileSync(path.join(ROOT, 'styles', dir, 'index.html'), 'utf8');
  const extra = /gl\.js|rm\.js|getContext\('webgl/.test(html) ? HW : ['--nogpu'];
  run('node', ['render.js', path.join('styles', dir, 'index.html'), 'x', '--rs', '1', '--q', 'nolabel', ...extra, '--still', `${t}:${out(`${id}_${t}s.jpg`)}`]);
  console.log(`✔ out/${id}_${t}s.jpg`);
} else if (cmd === 'style') {
  ids(args.slice(1).join(',')).forEach(styleVideo);
} else if (cmd === 'reel') {
  reel(ids(args[1]), args[2] || 'reel');
} else if (cmd === 'cover') {
  run('node', ['-e', `const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); await p.goto(require('url').pathToFileURL(${JSON.stringify(path.join(ROOT, 'comp', 'cover.html'))}).href); await p.waitForTimeout(800); await p.screenshot({ path: ${JSON.stringify(out('cover.jpg'))}, type: 'jpeg', quality: 92 }); await b.close(); })();`]);
  console.log('✔ out/cover.jpg');
} else if (cmd === 'brand') {
  // 把画面里的署名「肖雄 / XIAOXIONG」换成你自己的：node make.js brand 张三 ZHANGSAN
  const zh = args[1], en = args[2];
  if (!zh || !en) { console.log('用法：node make.js brand 中文名 英文名'); process.exit(1); }
  const cap = en.charAt(0).toUpperCase() + en.slice(1).toLowerCase();
  const files = [...STYLES.map((d) => path.join('styles', d, 'index.html')), path.join('comp', 'reel.html'), path.join('comp', 'meta.js'), path.join('comp', 'cover.html')];
  let n = 0;
  for (const f of files) {
    const p = path.join(ROOT, f), s0 = fs.readFileSync(p, 'utf8');
    const s1 = s0.split('肖雄').join(zh).split('XIAOXIONG').join(en.toUpperCase()).split('Xiaoxiong').join(cap);
    if (s1 !== s0) { fs.writeFileSync(p, s1); n++; }
  }
  console.log(`✔ 已替换 ${n} 个文件里的署名。已经渲染过的风格要加 --force 重新渲染。`);
} else if (cmd === 'cues') {
  run('node', [path.join('audio', 'dumpcues.js'), ...ids(args[1]).map(dirOf)]);
} else {
  console.log('未知命令：' + cmd + '。可用：list / still / style / reel / cover / brand / cues');
}
