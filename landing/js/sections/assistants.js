// Assistants: an Instagram Direct exchange plays in the chat. The client's question is already
// there; the assistant types and replies, and earlier messages slide up as new ones arrive at the
// bottom, the way a messenger does. It holds, fades out and starts again.
import { sleep, loopWhileVisible } from '../shared.js';

export function init(root) {
  const demo = root.querySelector('.s-assistants__demo');
  const thread = demo?.querySelector('[data-thread]');
  if (!thread) return;
  const msgs = [...thread.querySelectorAll('[data-m]')];
  const [first, ...rest] = msgs;

  const set = (el, state) => {
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  };

  // Shrink each wrapped bubble to its longest line, the way a messenger draws it
  // (CSS alone leaves a wrapped box at its full available width).
  const bubbles = [...thread.querySelectorAll('.ui-bubble:not(.s-assistants__typing)')];
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
    thread.style.height = '';
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

  // FLIP: messages already on screen glide from where they were to where the change puts them.
  const flip = (change) => {
    const shown = msgs.filter((m) => m.dataset.state);
    const before = shown.map((m) => m.getBoundingClientRect().top);
    change();
    shown.forEach((m, i) => {
      const dy = before[i] - m.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) return;
      m.style.transition = 'none';
      m.style.translate = `0 ${dy}px`;
    });
    void thread.offsetWidth;
    shown.forEach((m) => {
      m.style.transition = '';
      m.style.translate = '';
    });
  };
  // Lay a message out in its starting state (others make room), then let it transition.
  const arrive = (msg, from, to) => {
    flip(() => set(msg, from));
    set(msg, to);
  };

  // Back to the opening state, the client's question alone, without animating the way back.
  const reset = () => {
    demo.classList.add('is-reset');
    demo.classList.remove('is-out');
    msgs.forEach((m) => {
      m.style.translate = '';
      set(m, m === first ? 'on' : null);
    });
    void demo.offsetWidth;
    demo.classList.remove('is-reset');
  };
  const atStart = () => !demo.classList.contains('is-out') && msgs.every((m) => (m === first ? m.dataset.state === 'on' : !m.dataset.state));

  const scene = async (signal) => {
    if (!atStart()) {
      demo.classList.add('is-out');
      await sleep(450, signal);
      reset();
      set(first, 'pre');
      void first.offsetWidth;
      set(first, 'on');
    }
    await sleep(1000, signal);
    for (const msg of rest) {
      if ('typing' in msg.dataset) {
        arrive(msg, 'pre', 'typing');
        await sleep(1100, signal);
        arrive(msg, 'land', 'on');
        await sleep(msg === rest.at(-1) ? 3600 : 1700, signal);
      } else {
        arrive(msg, 'pre', 'on');
        await sleep(1100, signal);
      }
    }
  };

  // The hidden states only apply from here on, so the chat is never empty if this script fails.
  demo.dataset.ready = '';
  reset();
  loopWhileVisible(demo, scene, {
    final: () => msgs.forEach((m) => set(m, 'on')),
  });
}
