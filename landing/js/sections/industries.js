// Industries: an ARIA tablist whose active pill is a clipped dark copy of the tab row,
// and stacked panels that crossfade. The visitor picks; nothing auto-advances.
import { onceVisible, reducedMotion } from '../main.js';

export function init(root) {
  const list = root.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => root.querySelector(`#${tab.getAttribute('aria-controls')}`));
  const clip = root.querySelector('[data-clip]');
  const scroller = root.querySelector('[data-scroller]');
  const panelsWrap = root.querySelector('.s-industries__panels');
  let current = Math.max(
    0,
    tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
  );

  // Clip the dark copy to the selected tab, in px relative to the copy itself. Measuring the copy's
  // own (never pressed) tab keeps the pill full width even while the real tab is scaled by :active.
  const clipTabs = [...clip.children];
  const placeClip = () => {
    const row = clip.getBoundingClientRect();
    const tab = clipTabs[current].getBoundingClientRect();
    clip.style.setProperty('--clip-l', `${(tab.left - row.left).toFixed(2)}px`);
    clip.style.setProperty('--clip-r', `${(row.right - tab.right).toFixed(2)}px`);
  };

  // On narrow screens the row scrolls: bring the selected tab into view.
  const reveal = (tab) => {
    if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const s = scroller.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(scroller).scrollPaddingInlineStart) || 16;
    let left = scroller.scrollLeft;
    if (t.left < s.left + pad) left += t.left - s.left - pad;
    else if (t.right > s.right - pad) left += t.right - s.right + pad;
    else return;
    scroller.scrollTo({ left, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  };

  const updateFades = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.dataset.start = String(scroller.scrollLeft <= 6);
    scroller.dataset.end = String(scroller.scrollLeft >= max - 6);
  };

  const select = (index, { focus = false } = {}) => {
    if (index !== current) {
      tabs[current].setAttribute('aria-selected', 'false');
      tabs[current].tabIndex = -1;
      panels[current].removeAttribute('data-active');
      current = index;
      tabs[current].setAttribute('aria-selected', 'true');
      tabs[current].removeAttribute('tabindex');
      panels[current].setAttribute('data-active', '');
      placeClip();
    }
    if (focus) tabs[current].focus({ preventScroll: true });
    reveal(tabs[current]);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      let next = null;
      if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      if (next === null) return;
      e.preventDefault();
      select(next, { focus: true });
    });
  });

  // Keep the clip exact through resizes and font loading, without animating those corrections.
  const settle = () => {
    clip.removeAttribute('data-ready');
    placeClip();
    updateFades();
    requestAnimationFrame(() => requestAnimationFrame(() => clip.setAttribute('data-ready', '')));
  };
  new ResizeObserver(settle).observe(list);
  document.fonts?.ready.then(settle);
  scroller.addEventListener('scroll', updateFades, { passive: true });
  settle();

  // The first panel's demo items stagger in the first time the section is seen.
  root.setAttribute('data-armed', '');
  onceVisible(panelsWrap, () => requestAnimationFrame(() => root.setAttribute('data-seen', '')), {
    rootMargin: '0px 0px -20% 0px',
  });
}
