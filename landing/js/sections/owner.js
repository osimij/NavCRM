// Owner view: each card of the dashboard plays once as it comes into view (amounts and visits
// count up, the sparkline draws, meters grow, the source bar reveals), then stays still.
import { onceVisible, reducedMotion, fmt } from '../shared.js';

const COUNT_MS = 900;

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

function play(card) {
  const counters = [...card.querySelectorAll('[data-count]')].map((el) => ({ el, to: Number(el.dataset.count) }));
  counters.forEach((c) => (c.el.textContent = '0'));
  // Let the armed state paint before going live, so the transitions run.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      card.classList.add('is-live');
      if (!counters.length) return;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / COUNT_MS);
        const e = easeOut(p);
        counters.forEach((c) => (c.el.textContent = fmt(c.to * e)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
  );
}

export function init(root) {
  const phone = root.querySelector('[data-dash]');
  if (!phone || reducedMotion.matches) return;

  // Each counter reserves the width of its final value (see owner.css), so nothing beside it moves.
  phone.querySelectorAll('[data-count]').forEach((el) => (el.dataset.final = el.textContent));
  phone.classList.add('is-armed');

  // A card plays once it is well inside the viewport, not while it is still at the bottom edge.
  phone.querySelectorAll('[data-play]').forEach((card) => {
    onceVisible(card, () => play(card), { rootMargin: '0px 0px -15% 0px' });
  });
}
