// Made here (#local): the offline phone demo and the language switcher.
import { sleep, loopWhileVisible, reducedMotion } from '../main.js';

export function init(root) {
  const offline = root.querySelector('[data-offline]');
  const langs = root.querySelector('[data-langs]');
  if (offline) initOffline(offline);
  if (langs) initLanguages(langs);
}

/* Online -> offline, three changes saved on the phone -> back online, each change synced. About 9s. */
function initOffline(el) {
  const states = [...el.querySelectorAll('[data-net]')];
  const wifiOn = el.querySelector('[data-wifi="on"]');
  const wifiOff = el.querySelector('[data-wifi="off"]');
  const spin = el.querySelector('[data-sync="spin"]');
  const done = el.querySelector('[data-sync="done"]');
  const rows = [...el.querySelectorAll('.s-local__change')];

  const hide = (node, hidden) => (node.dataset.hidden = String(hidden));
  const net = (name) => states.forEach((s) => hide(s, s.dataset.net !== name));
  const wifi = (on) => {
    hide(wifiOn, !on);
    hide(wifiOff, on);
  };
  const syncIcon = (finished) => {
    hide(spin, finished);
    hide(done, !finished);
  };

  const toStart = () => {
    net('online');
    wifi(true);
    syncIcon(false);
    rows.forEach((r) => r.classList.remove('is-in', 'is-synced'));
  };
  const toEnd = () => {
    net('synced');
    wifi(true);
    syncIcon(true);
    rows.forEach((r) => r.classList.add('is-in', 'is-synced'));
  };

  // The markup ships in the end state (no JS, reduced motion). With motion, start from the top.
  if (!reducedMotion.matches) toStart();

  loopWhileVisible(
    el,
    async (signal) => {
      await sleep(1500, signal);

      // The connection drops
      net('offline');
      wifi(false);
      await sleep(550, signal);

      // Work carries on: each change is saved on the phone
      for (const row of rows) {
        row.classList.add('is-in');
        await sleep(650, signal);
      }
      await sleep(1100, signal);

      // Back online: changes sync one by one
      net('synced');
      wifi(true);
      await sleep(450, signal);
      for (const row of rows) {
        row.classList.add('is-synced');
        await sleep(180, signal);
      }
      await sleep(150, signal);
      syncIcon(true);
      await sleep(2600, signal);

      // Fade back to the start: opacity only, nothing travels on the way out
      el.classList.add('is-resetting');
      toStart();
      await sleep(450, signal);
      el.classList.remove('is-resetting');
    },
    { final: toEnd }
  );
}

/* The "New booking" button in Tajik, Russian and English, every 2.4s. */
function initLanguages(el) {
  const seg = el.querySelector('.ui-seg');
  const thumb = seg.querySelector('.ui-seg__thumb');
  const tabs = [...seg.querySelectorAll('[data-lang]')];
  const labels = [...el.querySelectorAll('.s-local__new-swap > [data-lang]')];
  const order = tabs.map((t) => t.dataset.lang);
  let current = order[0];

  const place = () => {
    const tab = tabs.find((t) => t.dataset.lang === current);
    seg.style.setProperty('--x', `${tab.offsetLeft}px`);
    seg.style.setProperty('--w', `${tab.offsetWidth}px`);
  };

  const show = (lang) => {
    const prev = current;
    current = lang;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.lang === lang));
    labels.forEach((l) => {
      const name = l.dataset.lang;
      if (name === lang) {
        l.classList.remove('is-leaving');
        l.dataset.hidden = 'false';
      } else if (name === prev) {
        l.classList.add('is-leaving');
        l.dataset.hidden = 'true';
      } else {
        // invisible, so it can travel back below without being seen
        l.classList.remove('is-leaving');
        l.dataset.hidden = 'true';
      }
    });
    place();
  };

  // Place the thumb without animating it in.
  thumb.style.transition = 'none';
  place();
  requestAnimationFrame(() => requestAnimationFrame(() => (thumb.style.transition = '')));
  document.fonts?.ready.then(place);
  new ResizeObserver(place).observe(seg);

  loopWhileVisible(
    el,
    async (signal) => {
      for (const lang of order) {
        if (lang !== current) show(lang);
        await sleep(2400, signal);
      }
    },
    { final: () => show(order[0]) }
  );
}
