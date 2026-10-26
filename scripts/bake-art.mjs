// Bakes the painted-sky stills from landing/js/art/sky.js into landing/assets/art/.
//
// How to run (from the repository root):
//   node scripts/bake-art.mjs                    bake every plate below, 1x and 2x WebP
//   node scripts/bake-art.mjs hero-phone         only plates whose name starts with "hero-phone"
//   node scripts/bake-art.mjs --out /tmp/x --png --scale 0.5
//                                                test renders: another folder, PNG copies, smaller
//   node scripts/bake-art.mjs --plate '{"name":"t","comp":"desktop","width":1680,"crop":[0.6,0,0.4,0.5]}' --out /tmp/x --png
//                                                an ad-hoc plate (for example a crop to inspect);
//                                                "override": {"paint": 0.005} changes composition fields
//   --scales 1                                   only the 1x (or 2x) still of each plate
// Baking a hero plate into landing/assets/art also rewrites its tiny placeholder in
// css/sections/hero.css (between the lqip markers).
//
// Needs Playwright (require('playwright') must resolve; no browser download is triggered).
// The script serves landing/ itself on a free port, so the dev server does not need to run.
// Rendering uses the same bakeSky() as the live page, so the stills match the live render:
// the paint filter is sized in composition units, so 1x, 2x and any live size agree.
// On a machine without a GPU, Chromium falls back to SwiftShader and a full 2x bake takes a
// few minutes; nothing else is needed.
//
// A plate is one framing of the world: a composition (COMPOSITIONS in sky.js), a light
// (LIGHTS), an output width at 1x, and an optional crop of the full frame given as fractions
// [left, top, width, height]. See ART.md for how to add one.

import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANDING = path.join(ROOT, 'landing');

export const PLATES = [
  // The hero: the full frame, laid out by js/sections/hero.js so the horizon meets the app window.
  // `lqip` also writes a tiny blurred copy into css/sections/hero.css, shown until the still decodes.
  { name: 'hero-desktop', comp: 'desktop', width: 1680, scales: [1, 2], q: 0.86, lqip: '' },
  { name: 'hero-tablet', comp: 'tablet', width: 1100, scales: [1, 2], q: 0.86, lqip: '(max-width: 1099.98px)' },
  { name: 'hero-phone', comp: 'phone', width: 600, scales: [1, 2], q: 0.86, lqip: '(max-width: 759.98px)' },
  // Soft cloud shadows for the slow drift over the sea and the glass (multiplied in CSS).
  { name: 'cloud-shadows', kind: 'shadows', width: 1600, height: 440, scales: [1], q: 0.8 },
];

/* ---------- arguments ---------- */
const args = process.argv.slice(2);
const flag = (k) => args.includes('--' + k);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i === -1 ? d : args[i + 1]; };
const only = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['png'].includes(args[i - 1].slice(2))));
const OUT = path.resolve(opt('out', path.join(LANDING, 'assets/art')));
const SCALE = +opt('scale', 1);
const SCALES = opt('scales', null);
const PNG = flag('png');

/* ---------- a tiny static server for landing/ ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__bake') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><title>bake</title><style>html,body{margin:0;background:#f6f8fb}</style><body></body>');
    return;
  }
  const file = path.join(LANDING, decodeURIComponent(url.pathname));
  if (!file.startsWith(LANDING)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ---------- render ---------- */
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  const g = path.join(process.env.NODE_PATH || '/opt/node-tools/node_modules', 'playwright');
  ({ chromium } = require(g));
}
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(`${BASE}/__bake`);

await mkdir(OUT, { recursive: true });
const adhoc = opt('plate', null);
const plates = adhoc ? [{ scales: [1], ...JSON.parse(adhoc) }] : PLATES.filter((p) => !only.length || only.some((o) => p.name.startsWith(o)));
if (!plates.length) console.log('No plate matches', only.join(', '));

for (const plate of plates) {
  const scales = SCALES ? SCALES.split(',').map(Number) : plate.scales;
  for (const s of scales) {
    const t0 = Date.now();
    const res = plate.kind === 'shadows' ? await page.evaluate(shadows, { plate, s, scale: SCALE }) : await page.evaluate(async ({ plate, s, scale }) => {
      const { bakeSky, COMPOSITIONS } = await import(`/js/art/sky.js?v=${Date.now()}`);
      if (!COMPOSITIONS[plate.comp]) throw new Error(`no composition "${plate.comp}"`);
      // `override` changes composition fields for a test render (for example the brush size)
      const comp = { ...COMPOSITIONS[plate.comp], ...(plate.override || {}) };
      const [cl, ct, cw, ch] = plate.crop || [0, 0, 1, 1];
      // the full frame at this scale, then the crop inside it (origin counts from the bottom-left)
      const fullW = Math.round((plate.width * s * scale) / cw);
      const fullH = Math.round(fullW / comp.aspect);
      const w = Math.round(fullW * cw), h = Math.round(fullH * ch);
      const ox = Math.round(fullW * cl), oy = fullH - Math.round(fullH * ct) - h;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      document.body.replaceChildren(c);
      const job = bakeSky(c, comp, { full: [fullW, fullH], origin: [ox, oy], light: plate.light, allowSoftware: true, strips: 6, budget: 4000 });
      if (!job) throw new Error('WebGL2 with float render targets is not available');
      const ms = await job.done;
      const webp = c.toDataURL('image/webp', plate.q ?? 0.86);
      const png = c.toDataURL('image/png');
      // the placeholder: about 28 pixels across, enough for the browser's own smoothing to blur
      let tiny = null;
      if (plate.lqip !== undefined) {
        const t = document.createElement('canvas');
        t.width = 28; t.height = Math.round((28 * h) / w);
        const tc = t.getContext('2d');
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(c, 0, 0, t.width, t.height);
        tiny = t.toDataURL('image/webp', 0.7);
      }
      job.release();
      return { w, h, ms, webp, png, tiny };
    }, { plate, s, scale: SCALE });
    const suffix = s === 1 ? '' : `@${s}x`;
    const file = path.join(OUT, `${plate.name}${suffix}.webp`);
    await writeFile(file, Buffer.from(res.webp.split(',')[1], 'base64'));
    if (PNG) await writeFile(path.join(OUT, `${plate.name}${suffix}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
    if (res.tiny && s === 1 && !adhoc && OUT === path.join(LANDING, 'assets/art')) await writeLqip(plate, res.tiny);
    const kb = Math.round((await stat(file)).size / 1024);
    console.log(`${path.relative(ROOT, file)}  ${res.w}x${res.h}  ${kb} KB  render ${Math.round(res.ms / 1000)}s  total ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}

await browser.close();
server.close();

/* Keep the hero's placeholders in step with its stills: one rule per plate between the
   lqip markers in css/sections/hero.css. */
async function writeLqip(plate, uri) {
  const css = path.join(LANDING, 'css/sections/hero.css');
  const src = await readFile(css, 'utf8');
  const a = src.indexOf('/* lqip:start'), b = src.indexOf('/* lqip:end */');
  if (a < 0 || b < 0) return;
  const head = src.slice(0, src.indexOf('\n', a) + 1);
  const lines = src.slice(head.length, b).split('\n').filter((l) => l.trim() && !l.includes(`/* ${plate.name} */`));
  const rule = `.s-hero__sky { background-image: url("${uri}"); }`;
  lines.push(plate.lqip ? `@media ${plate.lqip} { /* ${plate.name} */ ${rule} }` : `/* ${plate.name} */ ${rule}`);
  const order = (l) => (l.includes('hero-desktop') ? 0 : l.includes('hero-tablet') ? 1 : 2);
  lines.sort((x, y) => order(x) - order(y));
  await writeFile(css, head + lines.join('\n') + '\n' + src.slice(b));
}

/* Cloud shadows: a horizontally tileable field of soft, clear-blue shadows, flattened and smaller
   toward the top (the far sea), white where there is no shadow so it can be multiplied. A few
   large masses, each built from clustered puffs so the edges are irregular, with open sea between
   them so the movement reads. The darkest value is capped (about 14% in red, 3% in blue) so text
   under it keeps its contrast. Runs in the page. */
function shadows({ plate, s, scale }) {
  const W = Math.round(plate.width * s * scale), H = Math.round(plate.height * s * scale);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  let seed = 20261027;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blob = (x, y, rx, ry, a) => {
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rx);
      g.addColorStop(0, `rgba(200, 218, 246, ${a})`);
      g.addColorStop(0.6, `rgba(208, 224, 248, ${a * 0.75})`);
      g.addColorStop(1, 'rgba(222, 234, 252, 0)');
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-(x + dx), -y);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + dx, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  ctx.globalCompositeOperation = 'multiply';
  const masses = 4;
  for (let m = 0; m < masses; m++) {
    const cx = (m + 0.15 + rnd() * 0.5) * (W / masses);
    const cy = H * (0.3 + rnd() * 0.55);
    const depth = cy / H; // 0 far, 1 near
    const size = (150 + rnd() * 110) * (0.5 + depth * 0.85) * (W / 1600);
    const puffs = 9 + Math.floor(rnd() * 5);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (rnd() - 0.5) * size * 2.0;
      const py = cy + (rnd() - 0.5) * size * 0.45 * (0.5 + depth);
      const r = size * (0.42 + rnd() * 0.5);
      blob(px, py, r, r * (0.34 + depth * 0.3), 0.42 + rnd() * 0.2);
    }
  }
  // soften once more, keeping the tile seamless by blurring a wrapped copy
  const t = document.createElement('canvas');
  t.width = W * 3; t.height = H;
  const tc = t.getContext('2d');
  for (let i = 0; i < 3; i++) tc.drawImage(c, i * W, 0);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const oc = out.getContext('2d');
  oc.fillStyle = '#fff';
  oc.fillRect(0, 0, W, H);
  oc.filter = `blur(${Math.round(10 * (W / 1600))}px)`;
  oc.drawImage(t, -W, 0);
  oc.filter = 'none';
  // cap the darkening with a soft knee, so the cores stay soft rather than flat
  const img = oc.getImageData(0, 0, W, H);
  const cap = [0.14, 0.1, 0.03];
  for (let i = 0; i < img.data.length; i += 4) {
    const d = 1 - img.data[i + 1] / 255; // the green channel carries the shape
    const k = Math.min(1, d / 0.13);
    const e = 1 - Math.exp(-k * 1.8);
    for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.round(255 * (1 - cap[ch] * e / (1 - Math.exp(-1.8))));
  }
  oc.putImageData(img, 0, 0);
  return { w: W, h: H, ms: 0, webp: out.toDataURL('image/webp', plate.q ?? 0.8), png: out.toDataURL('image/png') };
}
