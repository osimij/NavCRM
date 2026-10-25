// How it works: five steps that follow one booking. Steps auto-advance every 7s while the
// section is on screen; hover or focus pauses the timer; picking a step stops auto-advance for good.
import { sleep, loopWhileVisible, reducedMotion, fmt } from '../main.js';

const STEP_MS = 7000;
const MIN_CANVAS = 360; // narrowest layout the demos are drawn for; smaller screens scale it down

const abortError = () => new DOMException('Aborted', 'AbortError');
const idle = (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true }));

/* Rolling numbers: fixed-width digit cells, each a 0 to 9 strip moved with transform */
function buildRoll(el) {
  const from = Number(el.dataset.from);
  const to = Number(el.dataset.to);
  const text = fmt(Math.max(from, to));
  el.textContent = '';
  el.rollCells = [];
  for (const ch of text) {
    if (ch === ',') {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ',';
      el.append(c);
      continue;
    }
    const d = document.createElement('span');
    d.className = 'd';
    const strip = document.createElement('span');
    strip.className = 'strip';
    for (let n = 0; n <= 9; n++) {
      const s = document.createElement('span');
      s.textContent = n;
      strip.append(s);
    }
    d.append(strip);
    el.append(d);
    el.rollCells.push(strip);
  }
}
function setRoll(el, value) {
  const digits = String(value).padStart(el.rollCells.length, '0').split('').map(Number);
  el.rollCells.forEach((strip, i) => strip.style.setProperty('--n', digits[i]));
}
function measureRolls(root) {
  root.querySelectorAll('.s-how__roll').forEach((el) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    el.append(probe);
    let max = 0;
    for (let n = 0; n <= 9; n++) {
      probe.textContent = String(n);
      max = Math.max(max, probe.getBoundingClientRect().width);
    }
    probe.remove();
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && max) el.style.setProperty('--dw', `${(max / fs).toFixed(3)}em`);
  });
}

/* Segmented control thumb: follows the item at index i */
function setSeg(seg, i) {
  const items = [...seg.children].filter((c) => !c.classList.contains('ui-seg__thumb'));
  const item = items[i];
  if (!item) return;
  seg.style.setProperty('--x', `${item.offsetLeft}px`);
  seg.style.setProperty('--w', `${item.offsetWidth}px`);
  items.forEach((it, k) => it.classList.toggle('is-active', k === i));
}

/* Beat engine: elements declare at which beat they change, the script just counts beats */
function setBeat(demo, n) {
  demo.dataset.beat = n;
  demo.querySelectorAll('[data-b]').forEach((el) => el.classList.toggle(el.dataset.bCls || 'is-on', n >= Number(el.dataset.b)));
  demo.querySelectorAll('[data-b-show]').forEach((el) => (el.dataset.hidden = String(n < Number(el.dataset.bShow))));
  demo.querySelectorAll('[data-b-hide]').forEach((el) => (el.dataset.hidden = String(n >= Number(el.dataset.bHide))));
  demo.querySelectorAll('[data-b-roll]').forEach((el) => setRoll(el, n >= Number(el.dataset.bRoll) ? el.dataset.to : el.dataset.from));
  demo.querySelectorAll('[data-b-meter]').forEach((el) => el.style.setProperty('--v', n >= Number(el.dataset.bMeter) ? el.dataset.to : el.dataset.from));
  demo.querySelectorAll('[data-b-seg]').forEach((el) => setSeg(el, n >= Number(el.dataset.bSeg) ? 2 : 0));
}
function instantly(demo, fn) {
  demo.classList.add('is-instant');
  fn();
  void demo.offsetWidth;
  demo.classList.remove('is-instant');
}

/* Tap indicator: glides to a target, then presses it */
async function tap(demo, selector, signal) {
  const dot = demo.querySelector('.tap');
  const target = demo.querySelector(selector);
  const box = demo.getBoundingClientRect();
  const scale = box.width / demo.offsetWidth || 1;
  const r = target.getBoundingClientRect();
  const x = (r.left + r.width / 2 - box.left) / scale;
  const y = (r.top + r.height / 2 - box.top) / scale;
  const first = !dot.classList.contains('is-on');
  if (first) {
    dot.style.transition = 'none';
    dot.style.setProperty('--tx', `${x}px`);
    dot.style.setProperty('--ty', `${y}px`);
    void dot.offsetWidth;
    dot.style.transition = '';
    dot.classList.add('is-on');
    await sleep(320, signal);
  } else {
    dot.style.setProperty('--tx', `${x}px`);
    dot.style.setProperty('--ty', `${y}px`);
    await sleep(560, signal);
  }
  dot.classList.add('is-press');
  target.classList.add('is-press');
  await sleep(150, signal);
  dot.classList.remove('is-press');
  target.classList.remove('is-press');
  await sleep(120, signal);
}
function hideTap(demo) {
  demo.querySelector('.tap')?.classList.remove('is-on', 'is-press');
}

const SCRIPTS = {
  book: {
    last: 5,
    async play(d, s) {
      await sleep(450, s);
      setBeat(d, 1);
      await sleep(500, s);
      await tap(d, '[data-t="service"]', s);
      setBeat(d, 2);
      await tap(d, '[data-t="malika"]', s);
      setBeat(d, 3);
      await tap(d, '[data-t="time"]', s);
      setBeat(d, 4);
      await sleep(150, s);
      await tap(d, '[data-t="book"]', s);
      await sleep(120, s);
      hideTap(d);
      setBeat(d, 5);
    },
  },
  remind: {
    last: 3,
    async play(d, s) {
      await sleep(450, s);
      setBeat(d, 1);
      await sleep(1100, s);
      await tap(d, '[data-t="confirm"]', s);
      hideTap(d);
      setBeat(d, 2);
      await sleep(600, s);
      setBeat(d, 3);
    },
  },
  receipt: {
    last: 3,
    async play(d, s) {
      await sleep(350, s);
      setBeat(d, 1);
      await sleep(900, s);
      await tap(d, '[data-t="alif"]', s);
      setBeat(d, 2);
      await sleep(700, s);
      await tap(d, '[data-t="take"]', s);
      hideTap(d);
      setBeat(d, 3);
    },
  },
  after: {
    last: 5,
    async play(d, s) {
      await sleep(700, s);
      for (let b = 1; b <= 5; b++) {
        setBeat(d, b);
        await sleep(300, s);
      }
    },
  },
  back: {
    last: 5,
    async play(d, s) {
      await sleep(400, s);
      setBeat(d, 1);
      await sleep(900, s);
      await tap(d, '[data-t="star"]', s);
      hideTap(d);
      setBeat(d, 2);
      await sleep(900, s);
      setBeat(d, 3);
      await sleep(500, s);
      setBeat(d, 4);
      await sleep(350, s);
      setBeat(d, 5);
    },
  },
};

export function init(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"]')];
  const demos = panels.map((p) => p.querySelector('[data-demo]'));
  const times = [...root.querySelectorAll('[data-time]')];
  const stage = root.querySelector('.s-how__stage');
  const art = stage.querySelector('.stage__art');
  const grid = root.querySelector('.s-how__grid');
  const fit = root.querySelector('.s-how__fit');
  const canvas = root.querySelector('.s-how__canvas');

  root.style.setProperty('--how-step', `${STEP_MS}ms`);
  root.querySelectorAll('.s-how__roll').forEach(buildRoll);

  /* Fit the canvas: below MIN_CANVAS the whole demo scales down instead of reflowing */
  const fitCanvas = () => {
    const w = fit.clientWidth;
    if (!w) return;
    if (w >= MIN_CANVAS) {
      canvas.style.width = '';
      canvas.style.transform = '';
      fit.style.height = '';
    } else {
      const s = w / MIN_CANVAS;
      canvas.style.width = `${MIN_CANVAS}px`;
      canvas.style.transform = `scale(${s})`;
      fit.style.height = `${canvas.offsetHeight * s}px`;
    }
    // segmented thumbs are placed in px, so re-place them after a reflow
    demos.forEach((d) => d.querySelectorAll('[data-b-seg]').forEach((seg) => setSeg(seg, Number(d.dataset.beat) >= Number(seg.dataset.bSeg) ? 2 : 0)));
  };
  new ResizeObserver(fitCanvas).observe(fit);
  new ResizeObserver(fitCanvas).observe(canvas);

  document.fonts?.ready.then(() => {
    measureRolls(root);
    fitCanvas();
  });

  let index = 0;
  let auto = true;
  let stepCtl = null; // the auto-advance pass in progress
  let manualCtl = null; // a demo replay started by the visitor
  root.dataset.auto = 'true';

  /* Stage tint follows the time of day: the old mood fades out on a ghost layer over the new one */
  const setMood = (mood) => {
    const old = stage.dataset.mood;
    if (old === mood) return;
    stage.dataset.mood = mood;
    const ghost = document.createElement('div');
    ghost.className = 'stage s-how__ghost';
    ghost.dataset.mood = old;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.append(art.cloneNode(true));
    art.after(ghost);
    requestAnimationFrame(() => requestAnimationFrame(() => ghost.classList.add('is-gone')));
    setTimeout(() => ghost.remove(), 1100);
  };

  const resetDemo = (i) => {
    const d = demos[i];
    hideTap(d);
    instantly(d, () => setBeat(d, 0));
  };
  const finishDemo = (i) => {
    const d = demos[i];
    hideTap(d);
    instantly(d, () => setBeat(d, SCRIPTS[d.dataset.demo].last));
  };

  const show = (i, replay = false) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (!on) t.removeAttribute('data-run');
    });
    panels.forEach((p, k) => {
      if (k === i) {
        if (replay || p.dataset.state !== 'in') {
          p.dataset.state = 'pre';
          void p.offsetWidth;
          p.dataset.state = 'in';
        }
      } else if (p.dataset.state === 'in' || p.dataset.state === 'pre') {
        p.dataset.state = 'out';
      }
    });
    times.forEach((t, k) => (t.dataset.hidden = String(k !== i)));
    setMood(panels[i].dataset.mood);
  };

  const startBar = (i) => {
    const t = tabs[i];
    t.removeAttribute('data-run');
    void t.offsetWidth;
    t.dataset.run = 'true';
  };
  const barDone = (i, signal) =>
    new Promise((resolve, reject) => {
      const bar = tabs[i].querySelector('.s-how__bar i');
      const done = (e) => {
        if (e.target !== bar) return;
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(abortError());
      };
      const cleanup = () => {
        bar.removeEventListener('animationend', done);
        signal.removeEventListener('abort', abort);
      };
      bar.addEventListener('animationend', done);
      signal.addEventListener('abort', abort, { once: true });
    });

  /* One pass of the loop = one step. Returns early (without throwing) if the visitor takes over. */
  const scene = async (signal) => {
    if (!auto) return idle(signal);
    const ctl = new AbortController();
    const relay = () => ctl.abort();
    signal.addEventListener('abort', relay, { once: true });
    stepCtl = ctl;
    const i = index;
    try {
      show(i, true);
      resetDemo(i);
      startBar(i);
      const d = demos[i];
      await Promise.all([SCRIPTS[d.dataset.demo].play(d, ctl.signal), barDone(i, ctl.signal)]);
      index = (i + 1) % tabs.length;
    } catch (err) {
      if (signal.aborted || err.name !== 'AbortError') throw err;
    } finally {
      signal.removeEventListener('abort', relay);
      tabs[i].removeAttribute('data-run');
      if (stepCtl === ctl) stepCtl = null;
    }
  };

  const choose = (i) => {
    auto = false;
    root.dataset.auto = 'false';
    stepCtl?.abort();
    manualCtl?.abort();
    index = i;
    show(i);
    if (reducedMotion.matches) {
      finishDemo(i);
      return;
    }
    manualCtl = new AbortController();
    resetDemo(i);
    const d = demos[i];
    SCRIPTS[d.dataset.demo].play(d, manualCtl.signal).catch(() => {});
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => choose(i)));
  root.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const cur = tabs.indexOf(document.activeElement);
    if (cur < 0) return;
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (cur + 1) % tabs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (cur - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    choose(next);
  });

  /* Pause the timer while the visitor is looking at the stage or moving through the steps */
  let hover = false;
  let focus = false;
  const syncPause = () => (root.dataset.paused = String(hover || focus));
  stage.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      hover = true;
      syncPause();
    }
  });
  stage.addEventListener('pointerleave', () => {
    hover = false;
    syncPause();
  });
  grid.addEventListener('focusin', (e) => {
    focus = e.target.matches(':focus-visible');
    syncPause();
  });
  grid.addEventListener('focusout', (e) => {
    if (!grid.contains(e.relatedTarget)) {
      focus = false;
      syncPause();
    }
  });

  // Start every demo in its opening state; the first one plays when the section comes into view.
  demos.forEach((_, i) => resetDemo(i));
  loopWhileVisible(stage, scene, {
    threshold: 0.35,
    final: () => {
      root.dataset.auto = 'false';
      auto = false;
      show(0);
      finishDemo(0);
    },
  });
}
