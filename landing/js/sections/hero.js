// Hero: places the painted sky so its horizon meets the top edge of the product and its cumulus
// tower stands in clear air beside the copy, scales the product composition to fit, bakes the
// sky live where the still would be upscaled, and plays a short loop of a working day at
// Gulnor Beauty.

import { sleep, loopWhileVisible, reducedMotion } from '../main.js';
import { FRAMES, towerOutline } from '../art/frames.js';

const PHONE = matchMedia('(max-width: 759.98px)');
const TABLET = matchMedia('(max-width: 1099.98px)');
const params = new URLSearchParams(location.search);
const OUTLINE = { desktop: towerOutline(...FRAMES.desktop.tower), phone: towerOutline(...FRAMES.phone.tower) };
// the 1x stills' widths (the 2x stills are twice that), and so their pixels per world unit
const STILL_PX = { desktop: 2236, phone: 600 };
const STILL_U = { desktop: STILL_PX.desktop / FRAMES.desktop.width, phone: STILL_PX.phone / FRAMES.phone.width };

export function init(root) {
  const frame = root.querySelector('.s-hero__frame');
  const stage = root.querySelector('[data-stage]');
  const comp = root.querySelector('[data-comp]');
  const sky = root.querySelector('[data-sky]');
  const art = root.querySelector('.s-hero__art');
  const still = sky.querySelector('picture img');
  const imageArt = root.dataset.art === 'image';

  if (!imageArt) grain(root.querySelector('.s-hero__grain'));
  odometers(comp);

  // the still fades in over the blurred placeholder once it has decoded
  const showStill = () => still.classList.add('is-ready');
  if (still.complete && still.naturalWidth) showStill();
  else {
    still.addEventListener('load', () => (still.decode ? still.decode().catch(() => {}).then(showStill) : showStill()), { once: true });
    still.addEventListener('error', showStill, { once: true });
  }
  const copy = root.querySelector('.s-hero__copy');
  const title = root.querySelector('.s-hero__title');
  const lead = root.querySelector('.s-hero__lead');
  const actions = root.querySelector('.s-hero__actions');

  /* ---------- layout ---------- */
  let box = null;
  let compositions = null;
  let live = null;
  let job = null, bakeTimer = 0, lastKey = '', failed = false;
  const compName = () => (PHONE.matches ? 'phone' : 'desktop');

  let phoneVH = 0;
  function layout() {
    const W = frame.clientWidth;
    // the composition is designed at a fixed size and scaled to the copy column
    const cs = getComputedStyle(stage);
    const cw = parseFloat(cs.getPropertyValue('--cw')) || 1200;
    const gutter = parseFloat(getComputedStyle(copy).paddingLeft) || 16;
    const s = Math.min(1, (W - gutter * 2) / cw);
    stage.style.setProperty('--s', s.toFixed(4));
    stage.style.removeProperty('--art-gap');

    if (imageArt) {
      stage.style.removeProperty('--phone-art');
      root.dataset.artMode = 'image';
      return null;
    }

    // phones: the painting gets the rest of the first screen, so the horizon (and the product)
    // sits near its bottom edge; the viewport height is read once per width so the address bar
    // showing and hiding does not move it
    if (PHONE.matches) {
      if (!phoneVH || Math.abs(window.innerHeight - phoneVH) > 160) phoneVH = window.innerHeight;
      const copyBottom = copy.offsetTop + copy.offsetHeight;
      const inset = frame.getBoundingClientRect().top + window.scrollY;
      const target = phoneVH * 0.92 - inset;
      const gap = Math.round(Math.max(200, Math.min(target - copyBottom, 380)));
      stage.style.setProperty('--phone-art', `${gap}px`);
    } else stage.style.removeProperty('--phone-art');

    const name = compName();
    const F = FRAMES[name];
    const place = name === 'phone' ? placePhone(W, F) : placeBeside(W, F);
    const { u, X0 } = place;
    const yh = stage.offsetTop;
    const H = frame.clientHeight;
    const w = F.width * u, h = F.span * u;
    const left = X0 - (F.width / 2) * u;
    const top = yh - F.top * u;
    sky.style.setProperty('--sky-left', `${left.toFixed(1)}px`);
    sky.style.setProperty('--sky-x', '0px');
    sky.style.setProperty('--sky-w', `${w.toFixed(1)}px`);
    sky.style.setProperty('--sky-h', `${h.toFixed(1)}px`);
    sky.style.setProperty('--sky-top', `${top.toFixed(1)}px`);
    // a box that stops short of the frame's left edge fades into the sky there
    sky.style.setProperty('--sky-fade-x', left > -2 ? '2.5%' : '0%');
    // around the painting's box: the zenith above it, the sky's own gradient to the horizon,
    // and the page below the sea
    const z = Math.max(0, top + h * (place.mode === 'gap' ? 0.12 : 0.06));
    art.style.setProperty('--art-bg', `linear-gradient(180deg, #6b9ee3 ${z.toFixed(0)}px, #a9c9f1 ${(yh - 0.42 * (yh - z)).toFixed(0)}px, #e9f0f8 ${(yh - 14).toFixed(0)}px, #f7f4ef ${(yh + 24).toFixed(0)}px, #f6f8fb ${(yh + 5.5 * u).toFixed(0)}px)`);
    box = { name, comp: F, W, H, w, h, top, left, yh, u };
    root.dataset.artMode = place.mode;
    // a live render belongs to one box; when the layout moves, fall back to the still at once
    if (live && live.dataset.box !== boxKey(box)) {
      const old = live;
      live = null;
      lastKey = '';
      delete root.dataset.sky;
      old.classList.remove('is-in');
      setTimeout(() => { URL.revokeObjectURL(old.src); old.remove(); }, 900);
    }
    return box;
  }

  // Phones: the tall phone frame, as wide as the frame and centred.
  function placePhone(W, F) {
    const yh = stage.offsetTop, H = frame.clientHeight;
    const u = Math.max(W / F.width, yh / F.top, (H - yh) / -F.bottom);
    return { u, X0: W / 2, mode: 'phone' };
  }

  // Desktops and tablets: the largest tower that fits beside the copy. The tower's lit edge
  // keeps clear air from every line of copy it rises beside (52px from the title, 48px from the
  // lead, 40px from the buttons), its crown stays below the nav and inside the frame
  // (on tablets its shaded side may run off the edge), and the painting still covers the frame.
  // Where no such tower fits (portrait tablets), the product moves down and the tower stands
  // in the gap between the copy and the product.
  function placeBeside(W, F) {
    const O = OUTLINE.desktop;
    const fr = frame.getBoundingClientRect();
    const bands = [];
    const add = (rects, gap) => { for (const r of rects) if (r.width > 1) bands.push({ t: r.top - fr.top, b: r.bottom - fr.top, r: r.right - fr.left, gap }); };
    const lines = (el) => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()]; };
    add(lines(title), 52);
    add(lines(lead), 48);
    add([actions.getBoundingClientRect()], 40);
    const minTop = 86; // below the nav, with air
    const narrow = TABLET.matches;
    const margin = narrow ? 12 : 36;
    const crop = narrow ? 0.22 * (O.right - O.left) : 0;
    const half = F.width / 2;

    const solve = (yh, uMax, uMin, cover) => {
      for (let u = uMax; u >= uMin; u -= 0.5) {
        let lo = -Infinity, hi = Infinity;
        for (const [y, xl, xr] of O.rows) {
          if (y < 0.2) continue; // at the horizon the tower stands behind the product
          const sy = yh - y * u;
          for (const b of bands) if (sy >= b.t - 12 && sy <= b.b + 12) lo = Math.max(lo, b.r + b.gap - xl * u);
          // the crown always stays whole; on tablets the shaded side of the body may run off the edge
          hi = Math.min(hi, W - margin + (y < 2.8 ? crop * u : 0) - xr * u);
        }
        if (cover) { lo = Math.max(lo, W - half * u); hi = Math.min(hi, half * u); }
        if (lo <= hi) return { u, X0: lo + (hi - lo) * 0.3 };
      }
      return null;
    };

    let yh = stage.offsetTop;
    const uFit = (yh - minTop) / O.top;
    const uMax = Math.min(uFit, STILL_U.desktop * 1.06);
    const found = solve(yh, uMax, uFit * 0.5, true) || solve(yh, uMax, uFit * 0.5, false);
    if (found) return { ...found, mode: 'beside' };

    // no room beside the copy: open a band between the copy and the product for the tower
    const vh = window.innerHeight;
    const gap = Math.round(Math.max(200, Math.min(0.3 * vh, 340)));
    stage.style.setProperty('--art-gap', `${gap}px`);
    yh = stage.offsetTop;
    const copyBottom = copy.getBoundingClientRect().bottom - fr.top;
    const u = Math.min((yh - copyBottom - 26) / O.top, STILL_U.desktop * 1.06);
    let X0 = W * 0.76 - ((O.left + O.right) / 2) * u;
    X0 = Math.min(Math.max(X0, W - half * u), half * u);
    return { u, X0, mode: 'gap' };
  }

  const boxKey = (b) => `${b.name}:${Math.round(b.w)}:${Math.round(b.h)}:${Math.round(b.top)}:${Math.round(b.left)}:${Math.round(b.H)}`;

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
  const force = params.has('live');
  const allowLive = !imageArt && !params.has('still') && !reducedData();

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
    // device pixels the box needs against the pixels of the still the browser chose
    // (naturalWidth is density-corrected under srcset, so read the candidate instead)
    const need = L.w * dpr;
    const have = still.complete && still.naturalWidth ? STILL_PX[L.name] * (/@2x\./.test(still.currentSrc) ? 2 : 1) : 0;
    if (!force && have && need <= have * 1.06) return;

    const mod = await import('../art/sky.js');
    if (!mod.liveBakeAllowed().ok && !force) { failed = true; return; }
    compositions = mod.COMPOSITIONS;
    layout();
    const B = box;

    // only the part of the box that is inside the frame is rendered
    const x0 = Math.max(0, B.left), x1 = Math.min(B.W, B.left + B.w);
    const y0 = Math.max(0, B.top), y1 = Math.min(B.H, B.top + B.h);
    const visX = x0 - B.left, visY = y0 - B.top, visW = x1 - x0, visH = y1 - y0;
    const key = `${boxKey(B)}:${dpr}`;
    if (key === lastKey) return;
    lastKey = key;
    job?.cancel();
    job?.release?.();

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(visW * dpr);
    canvas.height = Math.round(visH * dpr);
    const fw = Math.round(B.w * dpr), fh = Math.round(B.h * dpr);
    const origin = [Math.round(visX * dpr), fh - Math.round(visY * dpr) - canvas.height];
    // ?live&soft lets a software rasteriser bake too (development only: checking that the
    // live render lines up with the still)
    const soft = force && params.has('soft');
    const mine = mod.bakeSky(canvas, compositions[B.name], { full: [fw, fh], origin, strips: 64, allowSoftware: soft, gate: soft ? null : { firstStripMs: 450, totalMs: 9000 } });
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
    img.dataset.box = boxKey(B);
    Object.assign(img.style, { left: `${visX}px`, top: `${visY}px`, width: `${visW}px`, height: `${visH}px` });
    await img.decode().catch(() => {});
    if (boxKey(box) !== img.dataset.box) { URL.revokeObjectURL(img.src); return; }
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
  // The beats the first screen can see come first: a booking arrives, lands at 12:00 and joins
  // the owner's "next up"; Umed pays and the owner's phone hears about it. Then a client further
  // down confirms tomorrow's reminder.
  const tap = comp.querySelector('[data-tap]');
  const note = comp.querySelector('[data-note]');
  const confirmBtn = comp.querySelector('[data-confirm]');
  const keys = comp.querySelector('[data-keys]');
  const done = comp.querySelector('[data-done]');
  const chair = comp.querySelector('[data-chair]');
  const paid = comp.querySelector('[data-paid]');
  const tg = comp.querySelector('[data-tg]');
  const next = [...comp.querySelectorAll('[data-next]')];

  const setOdo = (to) => comp.querySelectorAll('[data-odo]').forEach((el) => el._odo?.(to ? el.dataset.odo : el.dataset.from));
  const setNext = (after) => next.forEach((row) => {
    row.querySelector('[data-before]').dataset.hidden = String(after);
    row.querySelector('[data-after]').dataset.hidden = String(!after);
  });
  const setUmed = (isPaid) => {
    if (isPaid) delete comp.dataset.umed; else comp.dataset.umed = 'chair';
    chair.dataset.hidden = String(isPaid);
    paid.dataset.hidden = String(!isPaid);
  };
  const setTg = (confirmed) => {
    keys.dataset.hidden = String(confirmed);
    done.dataset.hidden = String(!confirmed);
  };
  // the start of the day's loop; on phones the notification stays up until the loop runs, so a
  // phone always opens on the booking resting on the cloud sea
  const startState = ({ keepNote = false } = {}) => {
    delete comp.dataset.reset;
    if (keepNote) delete comp.dataset.note; else comp.dataset.note = 'off';
    comp.dataset.slot = 'off';
    comp.dataset.toast = 'off';
    setUmed(false);
    setTg(false);
    setNext(false);
    setOdo(false);
  };
  const endState = () => {
    for (const k of ['note', 'slot', 'umed', 'toast', 'reset']) delete comp.dataset[k];
    setUmed(true);
    setTg(true);
    setNext(true);
    setOdo(true);
  };
  const centerIn = (el) => {
    let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
    for (let n = el; n && n !== comp; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return [x, y];
  };

  let runs = 0;
  async function scene(signal) {
    // the first time round on a phone the notification is already there: the day starts with it
    const first = runs++ === 0 && PHONE.matches;
    startState({ keepNote: first });
    await sleep(first ? 500 : 900, signal);
    delete comp.dataset.note; // a booking arrives from Instagram
    await sleep(1000, signal);
    comp.dataset.slot = 'ring'; // and lands in Malika's column at 12:00
    setNext(true); // and in the owner's "next up"
    await sleep(1300, signal);
    delete comp.dataset.slot;
    await sleep(400, signal);
    // Umed, finished at 11:15, pays by Alif QR; the owner's phone hears about it
    setUmed(true);
    await sleep(300, signal);
    delete comp.dataset.toast;
    setOdo(true);
    await sleep(1500, signal);
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
      setTg(true);
      await sleep(260, signal);
      tap.classList.remove('is-on');
    } else {
      setTg(true);
    }
    await sleep(3600, signal);
    // everything that changed goes back to the start one piece at a time, then the day plays again
    comp.dataset.reset = '';
    const steps = [
      () => setTg(false),
      () => { comp.dataset.toast = 'off'; },
      () => setOdo(false),
      () => setUmed(false),
      () => setNext(false),
      () => { comp.dataset.slot = 'off'; },
      () => { comp.dataset.note = 'off'; },
    ];
    for (const step of steps) {
      step();
      await sleep(70, signal);
    }
    await sleep(520, signal);
  }

  if (!reducedMotion.matches) startState({ keepNote: PHONE.matches });
  // on phones the loop follows the notification itself, which is what the first screen shows
  loopWhileVisible(PHONE.matches ? note : comp, scene, { final: endState, threshold: PHONE.matches ? 0.3 : 0.2 });
  reducedMotion.addEventListener?.('change', (e) => e.matches && endState());

  /* ---------- lensing on the window's glass (Chromium), once the entrance has settled ---------- */
  setTimeout(() => lensAll(comp), reducedMotion.matches ? 0 : 1300);
}

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
