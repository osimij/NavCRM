// Hero: lays the painted sky out so its horizon meets the top edge of the product, scales the
// product composition to fit, bakes the sky live where the still would be upscaled, and plays
// a short loop of a working day at Gulnor Beauty.

import { sleep, loopWhileVisible, reducedMotion } from '../main.js';

const PHONE = matchMedia('(max-width: 759.98px)');
const TABLET = matchMedia('(max-width: 1099.98px)');
const params = new URLSearchParams(location.search);

export function init(root) {
  const frame = root.querySelector('.s-hero__frame');
  const stage = root.querySelector('[data-stage]');
  const comp = root.querySelector('[data-comp]');
  const sky = root.querySelector('[data-sky]');
  const still = sky.querySelector('picture img');

  grain(root.querySelector('.s-hero__grain'));
  odometers(comp);

  /* ---------- layout ---------- */
  let box = null;
  let compositions = null;
  const compName = () => (PHONE.matches ? 'phone' : TABLET.matches ? 'tablet' : 'desktop');

  function layout() {
    const W = frame.clientWidth, H = frame.clientHeight;
    // the composition is designed at a fixed size and scaled to the copy column
    const cs = getComputedStyle(stage);
    const cw = parseFloat(cs.getPropertyValue('--cw')) || 1200;
    const gutter = parseFloat(getComputedStyle(root.querySelector('.s-hero__copy')).paddingLeft) || 16;
    const s = Math.min(1, (W - gutter * 2) / cw);
    stage.style.setProperty('--s', s.toFixed(4));

    // the horizon is the top edge of the window (or of the phone, on phones)
    const yh = stage.offsetTop;
    const name = compName();
    const c = compositions?.[name] || FRAMES[name];
    const below = c.hz, above = 1 - c.hz;
    const h = Math.max(W / c.aspect, yh / above, (H - yh) / below);
    const w = h * c.aspect;
    const top = yh - above * h;
    sky.style.setProperty('--sky-w', `${w.toFixed(1)}px`);
    sky.style.setProperty('--sky-h', `${h.toFixed(1)}px`);
    sky.style.setProperty('--sky-top', `${top.toFixed(1)}px`);
    box = { name, comp: c, W, H, w, h, top, yh };
    return box;
  }

  const ro = new ResizeObserver(() => {
    layout();
    scheduleBake();
  });
  ro.observe(frame);
  layout();
  document.fonts?.ready.then(() => { layout(); scheduleBake(); });

  /* ---------- live sky ---------- */
  // The still is the product. A capable desktop GPU re-renders the same frame at the exact
  // device resolution when the still would otherwise be upscaled (or with ?live).
  let job = null, bakeTimer = 0, lastKey = '', live = null, failed = false;
  const force = params.has('live');
  const allowLive = !params.has('still') && !reducedData();

  function scheduleBake() {
    if (!allowLive || failed) return;
    clearTimeout(bakeTimer);
    bakeTimer = setTimeout(() => {
      const run = () => bake().catch(() => {});
      'requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 800 }) : run();
    }, live ? 500 : 250);
  }

  async function bake() {
    const L = box;
    if (!L) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const need = L.w * dpr;
    const have = still.complete && still.naturalWidth ? still.naturalWidth : 0;
    if (!force && have && need <= have * 1.06) return;

    const mod = await import('../art/sky.js');
    if (!mod.liveBakeAllowed().ok && !force) { failed = true; return; }
    compositions = mod.COMPOSITIONS;
    layout();
    const B = box;

    // only the part of the box that is inside the frame is rendered
    const visX = (B.w - B.W) / 2;
    const visY = Math.max(0, -B.top);
    const visH = Math.min(B.h - visY, B.H - Math.max(0, B.top));
    const key = `${B.name}:${Math.round(B.w)}:${Math.round(B.h)}:${Math.round(visH)}:${dpr}`;
    if (key === lastKey) return;
    lastKey = key;
    job?.cancel();
    job?.release?.();

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(B.W * dpr);
    canvas.height = Math.round(visH * dpr);
    const fw = Math.round(B.w * dpr), fh = Math.round(B.h * dpr);
    const origin = [Math.round(visX * dpr), fh - Math.round(visY * dpr) - canvas.height];
    const mine = mod.bakeSky(canvas, B.comp, { full: [fw, fh], origin, gate: { firstStripMs: 450, totalMs: 9000 } });
    if (!mine) { failed = true; return; }
    job = mine;
    const off = () => { if (!document.hidden && onScreen) mine.resume(); else mine.pause(); };
    pauseHooks.add(off);
    off();
    try {
      await mine.done;
    } catch (e) {
      // software GL, a slow GPU, a lost context: the still stays
      if (e.message !== 'cancelled') failed = true;
      pauseHooks.delete(off);
      mine.release();
      if (job === mine) job = null;
      return;
    }
    pauseHooks.delete(off);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    mine.release();
    if (job !== mine || !blob) return;
    job = null;
    const img = new Image();
    img.className = 's-hero__live';
    img.alt = '';
    img.src = URL.createObjectURL(blob);
    Object.assign(img.style, { left: `${visX}px`, top: `${visY}px`, width: `${B.W}px`, height: `${visH}px` });
    await img.decode().catch(() => {});
    const prev = live;
    sky.append(img);
    requestAnimationFrame(() => img.classList.add('is-in'));
    live = img;
    if (prev) setTimeout(() => { URL.revokeObjectURL(prev.src); prev.remove(); }, 1000);
    root.dataset.sky = 'live';
  }

  /* ---------- off screen: pause the drift and any bake ---------- */
  let onScreen = true;
  const pauseHooks = new Set();
  const syncPause = () => {
    root.dataset.paused = String(!onScreen || document.hidden);
    pauseHooks.forEach((f) => f());
  };
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; syncPause(); }).observe(frame);
  document.addEventListener('visibilitychange', syncPause);

  /* ---------- the loop ---------- */
  const tap = comp.querySelector('[data-tap]');
  const confirmBtn = comp.querySelector('[data-confirm]');
  const keys = comp.querySelector('[data-keys]');
  const done = comp.querySelector('[data-done]');
  const chair = comp.querySelector('[data-chair]');
  const paid = comp.querySelector('[data-paid]');
  const tg = comp.querySelector('[data-tg]');

  const setOdo = (to) => comp.querySelectorAll('[data-odo]').forEach((el) => el._odo?.(to ? el.dataset.odo : el.dataset.from));
  const startState = () => {
    delete comp.dataset.reset;
    comp.dataset.note = 'off';
    comp.dataset.slot = 'off';
    comp.dataset.umed = 'chair';
    comp.dataset.toast = 'off';
    keys.dataset.hidden = 'false';
    done.dataset.hidden = 'true';
    chair.dataset.hidden = 'false';
    paid.dataset.hidden = 'true';
    setOdo(false);
  };
  const endState = () => {
    for (const k of ['note', 'slot', 'umed', 'toast', 'reset']) delete comp.dataset[k];
    keys.dataset.hidden = 'true';
    done.dataset.hidden = 'false';
    chair.dataset.hidden = 'true';
    paid.dataset.hidden = 'false';
    setOdo(true);
  };
  const centerIn = (el) => {
    let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
    for (let n = el; n && n !== comp; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return [x, y];
  };

  async function scene(signal) {
    startState();
    await sleep(900, signal);
    delete comp.dataset.note; // a booking arrives from Instagram
    await sleep(1100, signal);
    comp.dataset.slot = 'ring'; // and lands in Malika's column at 15:00
    await sleep(1300, signal);
    delete comp.dataset.slot;
    await sleep(500, signal);
    if (tg.offsetParent) {
      // a client confirms tomorrow's reminder in Telegram
      const [x, y] = centerIn(confirmBtn);
      tap.style.transition = 'none';
      tap.style.setProperty('--tx', `${x + 40}px`);
      tap.style.setProperty('--ty', `${y + 34}px`);
      void tap.offsetWidth;
      tap.style.transition = '';
      tap.classList.add('is-on');
      tap.style.setProperty('--tx', `${x}px`);
      tap.style.setProperty('--ty', `${y}px`);
      await sleep(560, signal);
      tap.classList.add('is-press');
      confirmBtn.classList.add('is-press');
      await sleep(160, signal);
      tap.classList.remove('is-press');
      confirmBtn.classList.remove('is-press');
      keys.dataset.hidden = 'true';
      done.dataset.hidden = 'false';
      await sleep(260, signal);
      tap.classList.remove('is-on');
      await sleep(1200, signal);
    } else {
      keys.dataset.hidden = 'true';
      done.dataset.hidden = 'false';
      await sleep(800, signal);
    }
    // Umed pays by Alif QR; the owner's phone hears about it
    delete comp.dataset.umed;
    chair.dataset.hidden = 'true';
    paid.dataset.hidden = 'false';
    await sleep(300, signal);
    delete comp.dataset.toast;
    setOdo(true);
    await sleep(4300, signal);
    // everything that changed fades back to the start, then the day plays again
    comp.dataset.reset = '';
    startState();
    comp.dataset.reset = '';
    await sleep(500, signal);
  }

  if (!reducedMotion.matches) startState();
  loopWhileVisible(comp, scene, { final: endState, threshold: 0.2 });
  reducedMotion.addEventListener?.('change', (e) => e.matches && endState());

  /* ---------- lensing on the glass (Chromium), once the entrance has settled ---------- */
  setTimeout(() => lensAll(comp), reducedMotion.matches ? 0 : 1300);
}

/* Frame proportions of each composition, so layout works before sky.js is loaded.
   Must match COMPOSITIONS in js/art/sky.js. */
const frameOf = (width, top, bottom) => ({ aspect: width / (top - bottom), hz: -bottom / (top - bottom) });
const FRAMES = { desktop: frameOf(15, 7.4, -9.5), tablet: frameOf(11, 8.4, -10.0), phone: frameOf(6.8, 12.0, -14.0) };

function reducedData() {
  try {
    return navigator.connection?.saveData || matchMedia('(prefers-reduced-data: reduce)').matches;
  } catch (e) {
    return false;
  }
}

/* Digits that roll in fixed-width cells: each digit is a strip of 0 to 9 moved by transform. */
function odometers(scope) {
  scope.querySelectorAll('[data-odo]').forEach((el) => {
    const text = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-hidden', 'true');
    const cells = [...text].map((ch) => {
      if (!/\d/.test(ch)) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        el.append(c);
        return null;
      }
      const d = document.createElement('span');
      d.className = 'd';
      const strip = document.createElement('span');
      for (let i = 0; i < 10; i++) {
        const n = document.createElement('span');
        n.textContent = String(i);
        strip.append(n);
      }
      d.append(strip);
      el.append(d);
      return d;
    });
    el._odo = (value) => {
      const digits = String(value).replace(/\D/g, '');
      let k = digits.length - 1;
      for (let i = cells.length - 1; i >= 0; i--) {
        if (!cells[i]) continue;
        cells[i].style.setProperty('--n', digits[k] ?? '0');
        k--;
      }
    };
    el._odo(el.dataset.odo);
  });
}

/* Fine film grain: a small tile of monochrome noise, made once. */
function grain(el) {
  if (!el) return;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(160, 160);
    let s = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1103515245 + 12345) >>> 0;
      const a = (s >>> 16) & 255, b = (s >>> 8) & 255;
      const v = 128 + (a + b - 255) * 0.34;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
  } catch (e) { /* decoration only */ }
}

/* ---------- liquid-glass lensing ----------
   For each [data-lens] element a displacement map is drawn from its rounded outline with a
   convex bezel profile and used in an SVG filter inside backdrop-filter, so the sky behind the
   rim bends like thick glass. Chromium only; elsewhere the frosted glass in CSS stays. It acts
   on the backdrop alone, so it never touches the text on the glass. */
const NS = 'http://www.w3.org/2000/svg';
const lensSupported = /Chrome\//.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'blur(1px)') && !matchMedia('(pointer: coarse)').matches;
let lensDefs = null, lensUid = 0;

function sdRound(x, y, hw, hh, r, p) {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  const outside = p === 2 ? Math.hypot(ox, oy) : Math.pow(Math.pow(ox, p) + Math.pow(oy, p), 1 / p);
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function lensMap(w, h, r, p, bezel, res) {
  const W = Math.max(2, Math.round(w * res)), H = Math.max(2, Math.round(h * res));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const hw = w / 2, hh = h / 2, e = 0.75;
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / res - hh;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / res - hw;
      const k = (j * W + i) * 4;
      const t = -sdRound(x, y, hw, hh, r, p);
      let dx = 0, dy = 0;
      if (t > -1 && t < bezel) {
        const gx = sdRound(x + e, y, hw, hh, r, p) - sdRound(x - e, y, hw, hh, r, p);
        const gy = sdRound(x, y + e, hw, hh, r, p) - sdRound(x, y - e, hw, hh, r, p);
        const gl = Math.hypot(gx, gy) || 1;
        const u = Math.min(Math.max(1 - t / bezel, 0), 1);
        const m = u * u * (1.35 - 0.35 * u);
        dx = (-gx / gl) * m; dy = (-gy / gl) * m;
      }
      img.data[k] = Math.round(128 + 127 * dx);
      img.data[k + 1] = Math.round(128 + 127 * dy);
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function lens(node) {
  const w = node.offsetWidth, h = node.offsetHeight;
  if (!w || !h) return;
  const d = node.dataset;
  const bezel = +d.lensBezel || 16, scale = +d.lensScale || 36, blur = +d.lensBlur || 14;
  const cs = getComputedStyle(node);
  const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
  const m = /superellipse\(([\d.]+)\)/.exec(cs.getPropertyValue('corner-shape') || '');
  const p = m ? Math.pow(2, parseFloat(m[1])) : 2;
  const key = [w, h, r, p, bezel, scale, blur].join(':');
  if (node._lensKey === key) return;
  node._lensKey = key;
  if (!lensDefs) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    lensDefs = document.createElementNS(NS, 'defs');
    svg.append(lensDefs);
    document.body.append(svg);
  }
  const id = node._lensId || (node._lensId = `hero-lens-${++lensUid}`);
  document.getElementById(id)?.remove();
  const f = document.createElementNS(NS, 'filter');
  const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  set(f, { id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  const href = lensMap(w, h, r, p, bezel, w * h > 300000 ? 0.5 : 1);
  f.append(set(document.createElementNS(NS, 'feImage'), { href, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }));
  // a faint dispersion at the rim: each channel bends by a slightly different amount
  const chans = [[1.16, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'], [1, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'], [0.84, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0']];
  chans.forEach(([k, matrix], i) => {
    f.append(set(document.createElementNS(NS, 'feDisplacementMap'), { in: 'SourceGraphic', in2: 'map', scale: scale * k, xChannelSelector: 'R', yChannelSelector: 'G', result: `d${i}` }));
    f.append(set(document.createElementNS(NS, 'feColorMatrix'), { in: `d${i}`, type: 'matrix', values: matrix, result: `c${i}` }));
  });
  f.append(set(document.createElementNS(NS, 'feComposite'), { in: 'c0', in2: 'c1', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'c01' }));
  f.append(set(document.createElementNS(NS, 'feComposite'), { in: 'c01', in2: 'c2', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0 }));
  lensDefs.append(f);
  const value = `blur(${blur}px) url(#${id}) saturate(1.6)`;
  node.style.backdropFilter = value;
  node.style.webkitBackdropFilter = value;
}

function lensAll(scope) {
  if (!lensSupported || matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  const nodes = [...scope.querySelectorAll('[data-lens]')];
  nodes.forEach(lens);
  const ro = new ResizeObserver((entries) => entries.forEach((e) => lens(e.target)));
  nodes.forEach((n) => ro.observe(n));
}
