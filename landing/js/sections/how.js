// How it works: five steps that follow one booking. Steps auto-advance every 7s while the
// section is on screen; hover, keyboard focus or a touch pauses the timer; picking a step stops
// auto-advance for good.
import { sleep, loopWhileVisible, reducedMotion, fmt } from '../shared.js';

const STEP_MS = 7000;
const MIN_CANVAS = 340; // narrowest layout the demos are drawn for; smaller stages scale it down
const DESIGN_W = 568; // wide layout design width; larger stages scale it up...
const MAX_UP = 1.15; // ...but never by more than this
const SETTLE_MS = 320; // after a click the list reflows for 250ms; hover tints wait until it has

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
    if (/\s/.test(ch)) {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
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

/* Segmented control: the highlight takes the picked item's width once (--w), then moves by
   transform alone, scaling slightly in x when it sits on a narrower or wider item */
const SEG_PICK = 2;
function setSeg(seg, i) {
  const items = [...seg.children].filter((c) => !c.classList.contains('ui-seg__thumb'));
  const item = items[i];
  const base = items[SEG_PICK];
  if (!item || !base || !base.offsetWidth) return;
  seg.style.setProperty('--w', `${base.offsetWidth}px`);
  seg.style.setProperty('--x', `${item.offsetLeft}px`);
  seg.style.setProperty('--sx', (item.offsetWidth / base.offsetWidth).toFixed(4));
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
  demo.querySelectorAll('[data-b-seg]').forEach((el) => setSeg(el, n >= Number(el.dataset.bSeg) ? SEG_PICK : 0));
  demo.dispatchEvent(new CustomEvent('how:beat', { detail: n }));
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
      await sleep(250, s);
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
  const list = root.querySelector('.s-how__steps');
  const fit = root.querySelector('.s-how__fit');
  const canvas = root.querySelector('.s-how__canvas');

  root.style.setProperty('--how-step', `${STEP_MS}ms`);
  root.querySelectorAll('.s-how__roll').forEach(buildRoll);

  /* Fit the canvas: narrow stages scale the demo down instead of reflowing it, wide ones scale it up a little */
  const fitCanvas = () => {
    const w = fit.clientWidth;
    if (!w) return;
    let s = 1;
    if (w < MIN_CANVAS) s = w / MIN_CANVAS;
    else if (w > DESIGN_W) s = Math.min(MAX_UP, w / DESIGN_W);
    if (s === 1) {
      canvas.style.width = '';
      canvas.style.transform = '';
      fit.style.height = '';
    } else {
      canvas.style.width = `${w / s}px`;
      canvas.style.transform = `scale(${s})`;
      fit.style.height = `${canvas.offsetHeight * s}px`;
    }
    // segmented thumbs are placed in px, so re-place them after a reflow
    demos.forEach((d) => d.querySelectorAll('[data-b-seg]').forEach((seg) => setSeg(seg, Number(d.dataset.beat) >= Number(seg.dataset.bSeg) ? SEG_PICK : 0)));
  };
  new ResizeObserver(fitCanvas).observe(fit);
  new ResizeObserver(fitCanvas).observe(canvas);

  /* Keep the list as tall as it is with its longest step open, so nothing below it moves
     when the open step changes (in one column the list sits above the rest of the page) */
  let listW = 0;
  const sizeList = (force = false) => {
    const w = list.clientWidth;
    if (!w || (w === listW && !force)) return;
    listW = w;
    let shut = 0;
    let tallest = 0;
    tabs.forEach((t) => {
      shut += t.getBoundingClientRect().height - t.querySelector('.s-how__more').getBoundingClientRect().height;
      tallest = Math.max(tallest, t.querySelector('.s-how__more-in').scrollHeight);
    });
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    list.style.minHeight = `${Math.ceil(shut + gap * (tabs.length - 1) + tallest)}px`;
  };
  new ResizeObserver(() => sizeList()).observe(list);

  document.fonts?.ready.then(() => {
    measureRolls(root);
    fitCanvas();
    sizeList(true);
  });

  let index = 0;
  let auto = true;
  let stepCtl = null; // the auto-advance pass in progress
  let manualCtl = null; // a demo replay started by the visitor
  root.dataset.auto = 'true';

  /* Stage tint follows the time of day: the old mood fades out on a ghost layer over the new one */
  const setMood = (mood) => {
    const old = stage.dataset.mood;
    if (!mood || old === mood) return;
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

  /* Time pill and mood for step i at beat n. A panel can move the clock on mid-story
     (data-late-beat): the last step jumps five weeks when its divider appears. */
  const syncStage = (i, n) => {
    const p = panels[i];
    const late = p.dataset.lateBeat !== undefined && n >= Number(p.dataset.lateBeat);
    const t = late ? Number(p.dataset.lateTime) : i;
    times.forEach((el) => (el.dataset.hidden = String(Number(el.dataset.time) !== t)));
    setMood(late ? p.dataset.lateMood : p.dataset.mood);
  };
  demos.forEach((d, i) => d.addEventListener('how:beat', (e) => i === index && syncStage(i, e.detail)));

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

  // Call after the demo has been reset or finished, so the clock and tint match its beat.
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
    syncStage(i, Number(demos[i].dataset.beat) || 0);
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
      resetDemo(i);
      show(i, true);
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
    if (reducedMotion.matches) {
      finishDemo(i);
      show(i);
      return;
    }
    manualCtl = new AbortController();
    resetDemo(i);
    show(i);
    const d = demos[i];
    SCRIPTS[d.dataset.demo].play(d, manualCtl.signal).catch(() => {});
  };

  /* After a click the open step changes and the rows below shift under a still pointer;
     hold the hover tint until the pointer moves again once the list has settled. */
  let settleAt = 0;
  const settle = () => {
    list.dataset.settling = 'true';
    settleAt = performance.now() + SETTLE_MS;
  };
  list.addEventListener('pointermove', () => {
    if (list.dataset.settling && performance.now() > settleAt) delete list.dataset.settling;
  });
  list.addEventListener('pointerleave', () => delete list.dataset.settling);

  tabs.forEach((t, i) =>
    t.addEventListener('click', (e) => {
      if (e.detail) settle();
      choose(i);
    })
  );
  list.addEventListener('keydown', (e) => {
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

  /* Pause the timer while the visitor is looking at the stage, moving through the steps by
     keyboard, or has a finger on the section (reading on a phone); touch resumes a moment after lifting */
  let hover = false;
  let focus = false;
  let touch = false;
  let touchTimer = 0;
  const syncPause = () => (root.dataset.paused = String(hover || focus || touch));
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
  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(touchTimer);
    touch = true;
    syncPause();
  });
  const release = (e) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      touch = false;
      syncPause();
    }, 2500);
  };
  grid.addEventListener('pointerup', release);
  grid.addEventListener('pointercancel', release);

  // Start every demo in its opening state; the first one plays when the section comes into view.
  demos.forEach((_, i) => resetDemo(i));
  loopWhileVisible(stage, scene, {
    threshold: 0.35,
    final: () => {
      root.dataset.auto = 'false';
      auto = false;
      finishDemo(0);
      show(0);
    },
  });
}
