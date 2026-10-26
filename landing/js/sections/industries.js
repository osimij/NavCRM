// Industries: a vertical ARIA tablist and stacked panels that crossfade.
// The visitor picks; nothing auto-advances.
import { onceVisible } from '../shared.js';

export function init(root) {
  const list = root.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => root.querySelector(`#${tab.getAttribute('aria-controls')}`));
  const panelsWrap = root.querySelector('.s-industries__panels');
  let current = Math.max(
    0,
    tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
  );

  const select = (index, { focus = false } = {}) => {
    if (index !== current) {
      tabs[current].setAttribute('aria-selected', 'false');
      tabs[current].tabIndex = -1;
      panels[current].removeAttribute('data-active');
      current = index;
      tabs[current].setAttribute('aria-selected', 'true');
      tabs[current].removeAttribute('tabindex');
      panels[current].setAttribute('data-active', '');
    }
    if (focus) tabs[current].focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      root.removeAttribute('data-keyboard');
      select(i);
    });
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      let next = null;
      if (e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      if (next === null) return;
      e.preventDefault();
      root.setAttribute('data-keyboard', '');
      select(next, { focus: true });
    });
  });

  // The first panel's demo items stagger in the first time the section is seen.
  root.setAttribute('data-armed', '');
  onceVisible(panelsWrap, () => requestAnimationFrame(() => root.setAttribute('data-seen', '')), {
    rootMargin: '0px 0px -20% 0px',
  });
}
