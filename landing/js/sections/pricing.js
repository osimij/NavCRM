// Pricing calculator: 1.5 TJS per completed visit, with a rolling odometer.
import { fmt } from '../main.js';

const RATE = 1.5;
const CELLS = 4; // up to 4,500 TJS (3,000 visits)

export function init(root) {
  const range = root.querySelector('.s-pricing__range');
  const visitsOut = root.querySelector('.s-pricing__visits');
  const odo = root.querySelector('[data-odo]');
  const totalText = root.querySelector('[data-total-text]');
  const working = root.querySelector('[data-working]');
  const presets = [...root.querySelectorAll('[data-visits]')];

  // Build fixed-width digit cells: d d , d d d style for 4 digits (one comma slot).
  const cells = [];
  let comma;
  for (let i = 0; i < CELLS; i++) {
    if (i === 1) {
      comma = document.createElement('span');
      comma.className = 'comma';
      comma.textContent = ',';
      odo.append(comma);
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
    odo.append(d);
    cells.push(strip);
  }

  // Cell width = the widest digit, so nothing shifts while digits roll.
  const measure = () => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    odo.append(probe);
    let max = 0;
    for (let n = 0; n <= 9; n++) {
      probe.textContent = String(n);
      max = Math.max(max, probe.getBoundingClientRect().width);
    }
    probe.remove();
    const fs = parseFloat(getComputedStyle(odo).fontSize);
    if (fs) odo.style.setProperty('--digit-w', `${(max / fs).toFixed(3)}em`);
  };
  document.fonts.ready.then(measure);

  let liveTimer = 0;
  const render = (visits, { announce = true } = {}) => {
    const total = Math.round(visits * RATE);
    const digits = String(total).padStart(CELLS, '0').split('').map(Number);
    const len = String(total).length;
    cells.forEach((strip, i) => {
      strip.style.setProperty('--n', digits[i]);
      strip.parentElement.hidden = i < CELLS - len;
    });
    comma.hidden = len < 4;

    const pct = ((visits - range.min) / (range.max - range.min)) * 100;
    range.style.setProperty('--p', `${pct}%`);
    visitsOut.textContent = fmt(visits);
    working.textContent = `${fmt(visits)} visits × 1.5 TJS`;
    presets.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.visits) === visits)));

    // Announce the result once the value settles, not on every input event.
    clearTimeout(liveTimer);
    if (announce) liveTimer = setTimeout(() => (totalText.textContent = `${fmt(total)} TJS a month`), 350);
  };

  range.addEventListener('input', () => render(Number(range.value)));
  presets.forEach((b) =>
    b.addEventListener('click', () => {
      range.value = b.dataset.visits;
      render(Number(range.value));
    })
  );
  render(Number(range.value), { announce: false });
}
