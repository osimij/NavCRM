// Getting started: the track line draws through the five steps once, when the board comes into view.
// It travels node to node (each segment eased, 1200ms in total), and each node, card and text
// appears as the line reaches it.
import { onceVisible, reducedMotion, sleep } from '../main.js';

const DRAW = 1200; // ms for the whole line

export function init(root) {
  const board = root.querySelector('.s-setup__board');
  const line = root.querySelector('.s-setup__line');
  const steps = [...root.querySelectorAll('.s-setup__step')];
  const nodes = steps.map((s) => s.querySelector('.s-setup__node'));
  if (!board || !line || nodes.length < 2) return;

  // Stagger index for the ticks inside the booking link card.
  root.querySelectorAll('.s-setup__tick').forEach((el, i) => el.style.setProperty('--i', i));

  // Where each node sits along the line, from 0 (first) to 1 (last).
  let stops = nodes.map((_, i) => i / (nodes.length - 1));

  // Place the line from the first node centre to the last one, for either layout.
  const layout = () => {
    const b = board.getBoundingClientRect();
    const pts = nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
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
    stops.forEach((f, i) => steps[i].style.setProperty('--d', `${Math.round(f * DRAW)}ms`));
    line.style.setProperty('--s4', `${(stops[stops.length - 2] * 100).toFixed(2)}%`);
  };

  layout();
  new ResizeObserver(layout).observe(board);
  document.fonts?.ready.then(layout);

  if (reducedMotion.matches) return;

  // Hide the animated parts without letting them transition out first.
  const wait = root.querySelector('[data-state="wait"]');
  const done = root.querySelector('[data-state="done"]');
  const all = [line, ...board.querySelectorAll('.s-setup__step *')];
  all.forEach((el) => (el.style.transition = 'none'));
  board.dataset.anim = 'ready';
  line.style.setProperty('--cut', '100%');
  wait?.setAttribute('data-hidden', 'false');
  done?.setAttribute('data-hidden', 'true');
  void board.offsetHeight;
  all.forEach((el) => (el.style.transition = ''));

  onceVisible(
    board,
    async () => {
      await sleep(250);
      layout();
      board.dataset.anim = 'play';

      // The import status flips once its meter has filled.
      const importDelay = parseFloat(steps[1].style.getPropertyValue('--d')) || 0;
      setTimeout(() => {
        wait?.setAttribute('data-hidden', 'true');
        done?.setAttribute('data-hidden', 'false');
      }, importDelay + 250 + 750);

      // Draw node to node; segment time follows its length so the pace stays even.
      for (let i = 1; i < stops.length; i++) {
        const dur = Math.max(1, Math.round((stops[i] - stops[i - 1]) * DRAW));
        line.style.setProperty('--seg', `${dur}ms`);
        line.style.setProperty('--cut', `${((1 - stops[i]) * 100).toFixed(2)}%`);
        await sleep(dur);
      }
    },
    { rootMargin: '0px 0px -18% 0px' }
  );
}
