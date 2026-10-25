// Assistants: the Instagram Direct chat plays one exchange, the booking lands in NavCRM,
// everything holds, fades out together and the loop repeats.
import { sleep, loopWhileVisible } from '../main.js';

export function init(root) {
  const demo = root.querySelector('.s-assistants__demo');
  const chat = root.querySelector('[data-chat]');
  if (!demo || !chat) return;
  const thread = chat.querySelector('.s-assistants__thread');
  const msgs = [...chat.querySelectorAll('[data-m]')];
  const toast = demo.querySelector('[data-toast]');

  const set = (el, state) => {
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  };
  // Commit a starting state before the next one, so the change transitions.
  const step = (el, from, to) => {
    set(el, from);
    void el.offsetWidth;
    set(el, to);
  };

  // Shrink each wrapped bubble to its longest line, the way a messenger draws it
  // (CSS alone leaves a wrapped box at its full available width).
  const bubbles = [...chat.querySelectorAll('.s-assistants__bubble')];
  const range = document.createRange();
  const tighten = (el) => {
    el.style.width = '';
    range.selectNodeContents(el);
    let line = 0;
    for (const r of range.getClientRects()) line = Math.max(line, r.width);
    const cs = getComputedStyle(el);
    el.style.width = `${Math.ceil(line + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 1}px`;
  };

  // Lock the thread to the height of the full exchange, so the window keeps its size
  // while messages arrive. Re-measured when the width changes the wrapping.
  let lastWidth = 0;
  const measure = () => {
    demo.classList.add('is-reset', 'is-measure');
    bubbles.forEach(tighten);
    const h = thread.offsetHeight;
    demo.classList.remove('is-measure');
    thread.style.height = `${h}px`;
    void demo.offsetWidth;
    demo.classList.remove('is-reset');
  };
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w === lastWidth) return;
    lastWidth = w;
    measure();
  }).observe(thread);
  document.fonts?.ready.then(measure);

  // Back to an empty thread without animating the way back.
  const reset = () => {
    demo.classList.add('is-reset');
    demo.classList.remove('is-out');
    [...msgs, toast].forEach((el) => set(el, null));
    void demo.offsetWidth;
    demo.classList.remove('is-reset');
  };

  const scene = async (signal) => {
    reset();
    await sleep(700, signal);
    for (const msg of msgs) {
      if ('typing' in msg.dataset) {
        step(msg, 'pre-typing', 'typing');
        await sleep(200 + 900, signal);
        step(msg, 'land', 'on');
      } else {
        step(msg, 'pre', 'on');
      }
      await sleep(1500, signal);
    }
    set(toast, 'on');
    await sleep(4000, signal);
    demo.classList.add('is-out');
    await sleep(600, signal);
  };

  loopWhileVisible(demo, scene, {
    final: () => [...msgs, toast].forEach((el) => set(el, 'on')),
  });
}
