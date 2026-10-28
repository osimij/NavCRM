// Footer: a soft light follows the pointer over the giant wordmark. Fine pointers only; touch and
// reduced motion keep the plain fade.
import { reducedMotion } from '../shared.js';

export function init(root) {
  const word = root.querySelector('[data-word]');
  if (!word || reducedMotion.matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let raf = 0;
  let x = 0;
  let y = 0;
  const paint = () => {
    raf = 0;
    const box = word.firstElementChild.getBoundingClientRect();
    word.style.setProperty('--mx', `${x - box.left}px`);
    word.style.setProperty('--my', `${y - box.top}px`);
  };
  // the footer, not the word, takes the pointer: the word itself lets clicks through
  root.addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
    word.classList.add('is-lit');
    if (!raf) raf = requestAnimationFrame(paint);
  });
  root.addEventListener('pointerleave', () => word.classList.remove('is-lit'));
}
