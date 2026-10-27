// Glow preset: light that wells up in the middle of a shape and runs out to its edges in the shape's
// own outline, the way the Touch ID glyph lights up. Works on an icon, a word or an image.
//
// Each glowing element gets an SVG filter. Its depth map (see depthMap) is 1 at the middle of the
// element's silhouette and falls to 0 where the silhouette ends in every direction, so each line of
// equal depth is the silhouette itself, shrunk towards its middle. Each period a soft band of light
// moves through those lines from the middle out, cut to the element's own pixels, with a bloom.
// The light plays while the element's trigger is hovered or focused, or, for data-glow="loop" and
// data-glow-trigger="view", while it is on screen. Colours and timing come from css/fx/glow.css.
import { reducedMotion } from '../shared.js';

const NS = 'http://www.w3.org/2000/svg';
const SHAPES = 'path, circle, ellipse, line, polyline, polygon, rect';
const SIZE = 64; // depth map pixels a side
const FADE = 450; // ms for the colour to come in and to go out
// The band of light across depth: q = SLOPE * depth + intercept, then BAND turns q into brightness.
// It is short on the side it runs towards and trails off behind, as on the Touch ID glyph.
const SLOPE = 0.8;
const BAND = '0 0 0.1 0.45 0.85 1 0.9 0.7 0.45 0.2 0.05';
const FROM = 1.3; // the band's depth when a run starts: the middle is about to light
const TO = -0.45; // and when it ends: its trailing side is just leaving the edge
const STILL = 0.45; // where the band rests under reduced motion

let uid = 0;
let defs = null;
let frame = 0;
const glows = new WeakMap(); // element -> its filter, depth map and current run
const running = new Set();
const sprites = new Map(); // sprite file URL -> its parsed document

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** The shapes an icon draws and the viewBox they sit in, following a <use> into its sprite file. */
async function drawing(svg) {
  const use = svg.querySelector('use');
  if (!use) return { shapes: [...svg.querySelectorAll(SHAPES)], viewBox: svg.getAttribute('viewBox') };
  const [file, id] = (use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '').split('#');
  let doc = document;
  if (file) {
    const url = new URL(file, document.baseURI).href;
    if (!sprites.has(url)) {
      sprites.set(url, fetch(url).then((r) => r.text()).then((text) => new DOMParser().parseFromString(text, 'image/svg+xml')));
    }
    doc = await sprites.get(url);
  }
  const symbol = doc.getElementById(id);
  return { shapes: symbol ? [...symbol.querySelectorAll(SHAPES)] : [], viewBox: symbol?.getAttribute('viewBox') };
}

/** The element's silhouette as alpha in a SIZE x SIZE grid stretched over its box: an icon's
    strokes drawn fat so they close into one body, an image's own alpha, or a text's line boxes. */
async function silhouette(el) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const box = el.getBoundingClientRect();

  if (el instanceof SVGSVGElement) {
    const { shapes, viewBox } = await drawing(el);
    if (!shapes.length || !viewBox) return null;
    const [, , w, h] = viewBox.split(/[\s,]+/).map(Number);
    const fat = Math.max(w, h) * 0.12;
    const markup =
      `<svg xmlns="${NS}" viewBox="${viewBox}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="none">` +
      `<style>*{fill:#000;stroke:#000;stroke-width:${fat}px;stroke-linecap:round;stroke-linejoin:round}</style>` +
      `${shapes.map((s) => s.outerHTML).join('')}</svg>`;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await img.decode();
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
  } else if (el instanceof HTMLImageElement) {
    await el.decode().catch(() => {});
    ctx.drawImage(el, 0, 0, SIZE, SIZE);
  } else {
    if (!box.width || !box.height) return null;
    for (const r of el.getClientRects()) {
      const sx = SIZE / box.width;
      const sy = SIZE / box.height;
      ctx.fillRect((r.left - box.left) * sx, (r.top - box.top) * sy, r.width * sx, r.height * sy);
    }
  }

  try {
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    return Uint8Array.from({ length: SIZE * SIZE }, (_, i) => data[i * 4 + 3]);
  } catch {
    // a cross-origin image can't be read: its box stands in for its shape
    return new Uint8Array(SIZE * SIZE).fill(255);
  }
}

/** Depth over the silhouette as a PNG in its alpha: 1 at the middle of the silhouette's bounds,
    0 where the silhouette ends along each direction from there. */
function depthMap(alpha) {
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alpha[y * SIZE + x] < 96) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;

  // how far the silhouette reaches in each direction from the middle
  const BINS = 96;
  const bin = (dx, dy) => (((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * BINS + BINS) % BINS;
  const raw = new Float32Array(BINS);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alpha[y * SIZE + x] < 96) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const b = Math.floor(bin(dx, dy)) % BINS;
      raw[b] = Math.max(raw[b], Math.hypot(dx, dy) + 0.7);
    }
  }
  // take the farthest reach near each direction, so gaps between strokes don't dent the fronts,
  // then average neighbours, so the fronts keep soft corners
  const top = Math.max(...raw);
  const reach = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    let sum = 0;
    for (let k = -4; k <= 4; k++) {
      let far = 0;
      for (let j = -3; j <= 3; j++) far = Math.max(far, raw[(i + k + j + BINS * 2) % BINS]);
      sum += far;
    }
    reach[i] = Math.max(sum / 9, top * 0.25);
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const a = bin(dx, dy) - 0.5;
      const i0 = (Math.floor(a) + BINS) % BINS;
      const f = a - Math.floor(a);
      const r = reach[i0] * (1 - f) + reach[(i0 + 1) % BINS] * f;
      const depth = Math.min(1, Math.max(0, 1 - Math.hypot(dx, dy) / r));
      out.data[(y * SIZE + x) * 4 + 3] = Math.round(depth * 255);
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The element's own filter: depth -> band of light, cut to the element, over its colour, bloomed. */
function makeFilter() {
  if (!defs) {
    defs = svgEl('defs');
    document.body.append(svgEl('svg', { 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' }, [defs]));
  }
  const id = `glow-${++uid}`;
  const f = {
    id,
    image: svgEl('feImage', { x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', result: 'depth' }),
    shift: svgEl('feFuncA', { type: 'linear', slope: SLOPE, intercept: -9 }),
    hi: svgEl('feFlood', { result: 'hi' }),
    base: svgEl('feFlood', { result: 'base' }),
    mix: svgEl('feComposite', { in: 'tint', in2: 'SourceGraphic', operator: 'arithmetic', k1: 0, k2: 0, k3: 1, k4: 0, result: 'body' }),
    blur: svgEl('feGaussianBlur', { in: 'lit', stdDeviation: 0.05, result: 'blur' }),
    bloom: svgEl('feFuncA', { type: 'linear', slope: 0 }),
  };
  defs.append(
    svgEl('filter', { id, x: -0.3, y: -0.3, width: 1.6, height: 1.6, primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' }, [
      f.image,
      svgEl('feComponentTransfer', { in: 'depth', result: 'q' }, [f.shift]),
      svgEl('feComponentTransfer', { in: 'q', result: 'band' }, [svgEl('feFuncA', { type: 'table', tableValues: BAND })]),
      f.hi,
      svgEl('feComposite', { in: 'hi', in2: 'band', operator: 'in', result: 'light' }),
      svgEl('feComposite', { in: 'light', in2: 'SourceAlpha', operator: 'in', result: 'lit' }),
      f.base,
      svgEl('feComposite', { in: 'base', in2: 'SourceAlpha', operator: 'in', result: 'tint' }),
      f.mix,
      f.blur,
      svgEl('feComponentTransfer', { in: 'blur', result: 'bloom' }, [f.bloom]),
      svgEl('feMerge', {}, [svgEl('feMergeNode', { in: 'bloom' }), svgEl('feMergeNode', { in: 'body' }), svgEl('feMergeNode', { in: 'lit' })]),
    ])
  );
  return f;
}

function easing(value) {
  const m = value.match(/cubic-bezier\(([^)]+)\)/);
  if (!m) return (x) => x;
  const [x1, y1, x2, y2] = m[1].split(',').map(Number);
  const curve = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 20; i++) {
      t = (lo + hi) / 2;
      if (curve(x1, x2, t) < x) lo = t;
      else hi = t;
    }
    return curve(y1, y2, t);
  };
}

/** Colours and timing from the element's custom properties, so a section or a style="" can tune them. */
function settings(el) {
  const cs = getComputedStyle(el);
  const prop = (name) => cs.getPropertyValue(name).trim();
  const ms = (name, fallback) => {
    const n = parseFloat(prop(name));
    return Number.isNaN(n) ? fallback : prop(name).endsWith('ms') ? n : n * 1000;
  };
  const bloom = parseFloat(prop('--glow-bloom'));
  return {
    base: prop('--glow-base') || '#3d7cc9',
    hi: prop('--glow-hi') || '#86f2ff',
    bloom: Number.isNaN(bloom) ? 0.75 : bloom,
    period: ms('--glow-period', 1250),
    delay: ms('--glow-delay', 0),
    ease: easing(prop('--glow-ease')),
  };
}

function wake() {
  if (!frame) frame = requestAnimationFrame(tick);
}

function tick(now) {
  for (const el of running) step(el, now);
  frame = running.size ? requestAnimationFrame(tick) : 0;
}

/** One frame: ease the colour in or out, and move the band of light through the depth map. */
function step(el, now) {
  const g = glows.get(el);
  const run = g.run;
  const lit = now - run.t0 - run.delay;
  if (!run.leaving && lit >= 0 && Math.floor(lit / run.period) > run.lastCycle) run.leaving = true;

  run.mix = Math.min(1, Math.max(0, run.mix + ((run.leaving ? -1 : 1) * (now - run.last)) / FADE));
  run.last = now;

  let intercept = -9; // nothing lit
  if (!run.leaving && lit >= 0) {
    const depth = reducedMotion.matches ? STILL : FROM + (TO - FROM) * run.ease((lit % run.period) / run.period);
    intercept = 0.5 - SLOPE * depth;
  }
  g.f.shift.setAttribute('intercept', intercept);
  g.f.mix.setAttribute('k2', run.mix);
  g.f.mix.setAttribute('k3', 1 - run.mix);

  if (run.leaving && run.mix === 0) {
    el.style.filter = '';
    el.classList.remove('is-glowing');
    g.run = null;
    running.delete(el);
  }
}

async function start(el) {
  const g = glows.get(el);
  g.wanted = true;
  el.classList.add('is-glowing');
  if (g.run) {
    // back before it went dark: carry on from the colour it has, with a fresh run of light
    if (g.run.leaving) Object.assign(g.run, { leaving: false, t0: performance.now() });
    g.run.lastCycle = Infinity;
    return;
  }

  // icons and images keep their map; text is measured again, since its lines may have rewrapped
  const fixed = el instanceof SVGSVGElement || el instanceof HTMLImageElement;
  if (!fixed || !g.depth) g.depth = silhouette(el).then((alpha) => alpha && depthMap(alpha));
  const depth = await g.depth;
  if (!depth || !g.wanted || g.run) return;

  const s = settings(el);
  const box = el.getBoundingClientRect();
  const blur = Math.min(box.width, box.height) * 0.06;
  g.f ??= makeFilter();
  g.f.image.setAttribute('href', depth);
  g.f.hi.setAttribute('flood-color', s.hi);
  g.f.base.setAttribute('flood-color', s.base);
  g.f.bloom.setAttribute('slope', s.bloom);
  g.f.blur.setAttribute('stdDeviation', `${blur / box.width} ${blur / box.height}`);
  const now = performance.now();
  g.run = { ...s, t0: now, last: now, mix: 0, leaving: false, lastCycle: Infinity };
  el.style.filter = `url(#${g.f.id})`;
  running.add(el);
  wake();
}

/** Let the light that is running reach the edge before the colour goes, so it never cuts off mid-run. */
function stop(el) {
  const g = glows.get(el);
  g.wanted = false;
  if (!g.run) return el.classList.remove('is-glowing');
  const lit = performance.now() - g.run.t0 - g.run.delay;
  if (reducedMotion.matches || lit < 0) g.run.leaving = true;
  else g.run.lastCycle = Math.floor(lit / g.run.period);
}

/** Set up every [data-glow] under root. Safe to call again for content added later. */
export function initGlow(root = document) {
  const added = [...root.querySelectorAll('[data-glow]')].filter((el) => !glows.has(el));
  const triggers = new Map();

  for (const el of added) {
    glows.set(el, { f: null, depth: null, run: null, wanted: false });
    // icons and images get their depth map ready ahead of the first hover
    if (el instanceof SVGSVGElement || el instanceof HTMLImageElement) {
      glows.get(el).depth = silhouette(el)
        .then((alpha) => alpha && depthMap(alpha))
        .catch((err) => console.error('glow', err));
    }
    // a looping glow, or one with no trigger around it, is its own trigger
    const trigger = el.dataset.glow === 'loop' ? el : (el.closest('[data-glow-trigger]') ?? el);
    if (!triggers.has(trigger)) triggers.set(trigger, []);
    triggers.get(trigger).push(el);
  }

  // data-glow="loop" and data-glow-trigger="view" run while on screen, so a group starts together
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) triggers.get(e.target).forEach(e.isIntersecting ? start : stop);
  });
  for (const [trigger, list] of triggers) {
    if (trigger.dataset.glow === 'loop' || trigger.dataset.glowTrigger === 'view') {
      io.observe(trigger);
      continue;
    }
    const on = () => list.forEach(start);
    const off = () => list.forEach(stop);
    trigger.addEventListener('pointerenter', on);
    trigger.addEventListener('pointerleave', off);
    trigger.addEventListener('focusin', on);
    trigger.addEventListener('focusout', off);
  }
}
