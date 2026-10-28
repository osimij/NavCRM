// Pricing calculator: 1.5 TJS per completed visit. The owner answers in their own terms (clients
// a day, working days a month); the sum is written out and the monthly total rolls on an odometer.
import { fmt } from '../shared.js';

const RATE = 1.5;
const rules = new Intl.PluralRules('ru-RU');
const plural = (n, forms) => forms[rules.select(n)] ?? forms.other;
const CLIENTS = { one: 'клиент', few: 'клиента', many: 'клиентов', other: 'клиента' };
const DAYS = { one: 'день', few: 'дня', many: 'дней', other: 'дня' };
const CELLS = 4; // up to 6,750 TJS (150 clients a day for 30 days)

export function init(root) {
  const count = root.querySelector('.s-pricing__count');
  const range = root.querySelector('.s-pricing__range');
  const steps = [...root.querySelectorAll('[data-step]')];
  const days = [...root.querySelectorAll('input[name="pricing-days"]')];
  const odo = root.querySelector('[data-odo]');
  const totalText = root.querySelector('[data-total-text]');
  const sumDay = root.querySelector('[data-sum-day]');
  const sumDays = root.querySelector('[data-sum-days]');
  const perDay = root.querySelector('[data-per-day]');
  const MIN = Number(range.min);
  const MAX = Number(range.max);

  // Build fixed-width digit cells: d d , d d d style for 4 digits (one comma slot).
  const cells = [];
  let comma;
  for (let i = 0; i < CELLS; i++) {
    if (i === 1) {
      comma = document.createElement('span');
      comma.className = 'comma';
      comma.textContent = '\u00a0';
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
  const render = ({ announce = true } = {}) => {
    const perDayClients = Number(range.value);
    const workDays = Number(days.find((d) => d.checked)?.value ?? 26);
    const total = Math.round(perDayClients * workDays * RATE);
    const digits = String(total).padStart(CELLS, '0').split('').map(Number);
    const len = String(total).length;
    cells.forEach((strip, i) => {
      strip.style.setProperty('--n', digits[i]);
      strip.parentElement.hidden = i < CELLS - len;
    });
    comma.hidden = len < 4;

    range.style.setProperty('--p', `${((perDayClients - MIN) / (MAX - MIN)) * 100}%`);
    if (document.activeElement !== count) count.value = perDayClients;
    steps.forEach((b) => (b.disabled = perDayClients + Number(b.dataset.step) < MIN || perDayClients + Number(b.dataset.step) > MAX));
    sumDay.textContent = `${perDayClients} ${plural(perDayClients, CLIENTS)}`;
    sumDays.textContent = `${workDays} ${plural(workDays, DAYS)}`;
    perDay.textContent = fmt(perDayClients * RATE);

    // Announce the result once the value settles, not on every input event.
    clearTimeout(liveTimer);
    if (announce) liveTimer = setTimeout(() => (totalText.textContent = `${fmt(total)} сомони в месяц`), 350);
  };

  // One value (the slider's) behind the slider, the typed number and the − / + buttons
  const set = (n) => {
    range.value = Math.min(MAX, Math.max(MIN, Math.round(n) || MIN));
    render();
  };
  range.addEventListener('input', () => render());
  count.addEventListener('input', () => {
    if (count.value !== '') set(Number(count.value));
  });
  count.addEventListener('change', () => {
    count.value = range.value;
  });
  count.addEventListener('blur', () => (count.value = range.value));
  steps.forEach((b) => b.addEventListener('click', () => set(Number(range.value) + Number(b.dataset.step))));
  days.forEach((d) => d.addEventListener('change', () => render()));
  render({ announce: false });
}
