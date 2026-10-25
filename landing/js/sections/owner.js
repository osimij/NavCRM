// Owner view: the dashboard plays once on first view (numbers count up, meters grow,
// the sparkline draws, the source bar reveals), then stays still.
import { onceVisible, reducedMotion, fmt, sleep } from '../main.js';

const COUNT_MS = 900;
const LEAD_MS = 280;

// cubic-bezier(0.23, 1, 0.32, 1), the --ease-out token, solved for y at time x.
function easeOut(x) {
  const [x1, y1, x2, y2] = [0.23, 1, 0.32, 1];
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t ** 2 * (1 - t) + t ** 3;
  const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

const format = (v, decimals) => (decimals ? v.toFixed(decimals) : fmt(v));

export function init(root) {
  const phone = root.querySelector('[data-dash]');
  if (!phone || reducedMotion.matches) return;

  const counters = [...phone.querySelectorAll('[data-count]')].map((el) => ({
    el,
    to: Number(el.dataset.count),
    decimals: Number(el.dataset.decimals) || 0,
  }));

  // Hold each number's final width so the units beside it never shift while it counts.
  const lockWidths = () => {
    counters.forEach(({ el }) => {
      el.style.minWidth = '';
      el.style.minWidth = `${Math.ceil(el.getBoundingClientRect().width / (parseFloat(getComputedStyle(phone).zoom) || 1))}px`;
    });
  };

  phone.classList.add('is-armed');
  counters.forEach((c) => (c.el.textContent = format(0, c.decimals)));

  let started = false;
  const play = async () => {
    if (started) return;
    started = true;
    // Give the phone's own scroll reveal a head start, so the numbers move once it is in view.
    await sleep(LEAD_MS);
    counters.forEach((c) => (c.el.textContent = format(c.to, c.decimals)));
    lockWidths();
    counters.forEach((c) => (c.el.textContent = format(0, c.decimals)));
    // Let the armed state paint before switching to live, so the transitions run.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        phone.classList.add('is-live');
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / COUNT_MS);
          const e = easeOut(p);
          counters.forEach((c) => (c.el.textContent = format(c.to * e, c.decimals)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
    );
  };

  document.fonts.ready.then(() => {
    onceVisible(phone, play, { rootMargin: '0px 0px -30% 0px' });
  });
}
