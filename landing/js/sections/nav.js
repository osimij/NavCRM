// Sticky nav: glass appears after scrolling; mobile menu with focus handling.

export function init(root) {
  const setScrolled = () => {
    root.dataset.scrolled = String(window.scrollY > 8);
  };
  setScrolled();
  window.addEventListener('scroll', setScrolled, { passive: true });

  const toggle = root.querySelector('.s-nav__toggle');
  const menu = root.querySelector('.s-nav__menu');
  let closeTimer = 0;

  const open = () => {
    clearTimeout(closeTimer);
    menu.hidden = false;
    // next frame so @starting-style / the closed state can transition in
    requestAnimationFrame(() => (menu.dataset.open = 'true'));
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    menu.querySelector('a')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey);
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (menu.hidden) return;
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    closeTimer = setTimeout(() => (menu.hidden = true), 160);
    if (restoreFocus) toggle.focus({ preventScroll: true });
    document.removeEventListener('pointerdown', onOutside);
    document.removeEventListener('keydown', onKey);
  };

  const onOutside = (e) => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) close({ restoreFocus: false });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  toggle.addEventListener('click', () => (toggle.getAttribute('aria-expanded') === 'true' ? close() : open()));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close({ restoreFocus: false })));
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => e.matches && close({ restoreFocus: false }));
}
