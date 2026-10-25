// Getting started: the track line draws through the five steps once.
// Horizontal track (1200px and up, the whole track fits on screen): one eased 1200ms stroke when
// the track comes into view, and each node, card and text appears as the line reaches it.
// Vertical track (narrower screens, taller than the screen): the line follows the scroll, so each
// step appears as the reader gets to it instead of finishing off screen.
import { reducedMotion } from '../main.js';

const DRAW = 1200; // ms, matches the clip-path transition on .s-setup__line[data-axis="x"]

// --ease-in-out is cubic-bezier(0.77, 0, 0.175, 1). timeAt(p) is the fraction of the draw time at
// which the line has covered fraction p of its length, so each node appears exactly as it is reached.
const bezier = (a, b) => (u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
const easeTime = bezier(0.77, 0.175);
const easeProgress = bezier(0, 1);
const timeAt = (p) => {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (easeProgress(mid) < p) lo = mid;
    else hi = mid;
  }
  return easeTime((lo + hi) / 2);
};

export function init(root) {
  const board = root.querySelector('.s-setup__board');
  const line = root.querySelector('.s-setup__line');
  const steps = [...root.querySelectorAll('.s-setup__step')];
  const nodes = steps.map((s) => s.querySelector('.s-setup__node'));
  if (!board || !line || nodes.length < 2) return;

  // Stagger index for the ticks inside each card.
  steps.forEach((s) => s.querySelectorAll('.s-setup__tick').forEach((el, i) => el.style.setProperty('--i', i)));

  // Where each node sits along the line, from 0 (first) to 1 (last), and how early a node
  // counts as reached (when the line touches its edge rather than its centre).
  let stops = nodes.map((_, i) => i / (nodes.length - 1));
  let early = 0;
  let schedule = () => {};

  // Place the line from the first node centre to the last one, for either layout.
  const layout = () => {
    const b = board.getBoundingClientRect();
    const pts = nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top, half: r.width / 2 };
    });
    const first = pts[0];
    const last = pts[pts.length - 1];
    const horizontal = Math.abs(last.x - first.x) > Math.abs(last.y - first.y);
    const len = horizontal ? last.x - first.x : last.y - first.y;
    if (len <= 0) return;

    line.dataset.axis = horizontal ? 'x' : 'y';
    line.style.setProperty('--lx', `${(horizontal ? first.x : first.x - 1).toFixed(1)}px`);
    line.style.setProperty('--ly', `${(horizontal ? first.y - 1 : first.y).toFixed(1)}px`);
    line.style.setProperty('--lw', horizontal ? `${len.toFixed(1)}px` : '2px');
    line.style.setProperty('--lh', horizontal ? '2px' : `${len.toFixed(1)}px`);

    stops = pts.map((p) => Math.min(1, Math.max(0, (horizontal ? p.x - first.x : p.y - first.y) / len)));
    early = first.half / len;
    line.style.setProperty('--s4', `${(stops[stops.length - 2] * 100).toFixed(2)}%`);
    schedule();
  };

  layout();
  new ResizeObserver(layout).observe(board);
  document.fonts?.ready.then(layout);

  if (reducedMotion.matches) return;

  // Hide the animated parts without letting them transition out first.
  const wait = root.querySelector('[data-state="wait"]');
  const done = root.querySelector('[data-state="done"]');
  const all = [line, ...board.querySelectorAll('.s-setup__step, .s-setup__step *')];
  all.forEach((el) => (el.style.transition = 'none'));
  board.dataset.anim = '';
  line.style.setProperty('--cut', '100%');
  wait?.setAttribute('data-hidden', 'false');
  done?.setAttribute('data-hidden', 'true');
  void board.offsetHeight;
  all.forEach((el) => (el.style.transition = ''));

  let finished = false;
  let fill = 0;
  let raf = 0;
  let io;

  const show = (step, delay) => {
    if ('in' in step.dataset) return;
    step.style.setProperty('--d', `${Math.round(delay)}ms`);
    step.dataset.in = '';
    // The import status flips once its meter has filled (meter: 250ms delay, 800ms fill).
    if (step === steps[1]) {
      setTimeout(() => {
        wait?.setAttribute('data-hidden', 'true');
        done?.setAttribute('data-hidden', 'false');
      }, delay + 250 + 700);
    }
  };

  const finish = () => {
    finished = true;
    io?.disconnect();
    removeEventListener('scroll', schedule);
  };

  const check = () => {
    raf = 0;
    if (finished) return;
    const vh = window.innerHeight;

    if (line.dataset.axis === 'x') {
      // The whole track is on screen at once: draw it in one stroke when the node row is in view.
      if (nodes[0].getBoundingClientRect().top > vh * 0.8) return;
      line.style.setProperty('--cut', '0%');
      steps.forEach((s, i) => show(s, timeAt(Math.max(0, stops[i] - early)) * DRAW));
      finish();
      return;
    }

    // Vertical: the drawn part of the line reaches down to 85% of the screen, and never undraws.
    // Once the whole track is on screen, nothing is left waiting below the fold.
    const r = line.getBoundingClientRect();
    const reach = board.getBoundingClientRect().bottom <= vh ? 1 : (vh * 0.85 - r.top) / r.height;
    if (reach < 0) return;
    fill = Math.max(fill, Math.min(1, reach));
    line.style.setProperty('--cut', `${((1 - fill) * 100).toFixed(2)}%`);
    steps.forEach((s, i) => {
      if (fill >= stops[i] - early) show(s, 0);
    });
    if (fill >= 1) finish();
  };

  schedule = () => {
    if (!finished && !raf) raf = requestAnimationFrame(check);
  };

  // Listen to scroll only while the board is near the screen.
  io = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) {
        addEventListener('scroll', schedule, { passive: true });
        schedule();
      } else {
        removeEventListener('scroll', schedule);
        // Scrolled past it in one jump: everything above the screen counts as read.
        if (e.boundingClientRect.bottom < 0) {
          fill = 1;
          line.style.setProperty('--cut', '0%');
          steps.forEach((s) => show(s, 0));
          finish();
        }
      }
    },
    { rootMargin: '0px 0px 0px 0px' }
  );
  io.observe(board);
}
