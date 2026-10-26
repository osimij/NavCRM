// The navigation scrolls with the hero, then returns as a compact white bar.

export function init(root) {
  const hero = document.querySelector('#hero');
  const heroSlot = root.parentElement;
  const toggle = root.querySelector('.s-nav__toggle');
  const menu = root.querySelector('.s-nav__menu');
  let closeTimer = 0;

  const open = () => {
    clearTimeout(closeTimer);
    menu.hidden = false;
    // next frame so @starting-style / the closed state can transition in
    requestAnimationFrame(() => (menu.dataset.open = 'true'));
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Закрыть меню');
    menu.querySelector('a')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey);
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (menu.hidden || toggle.getAttribute('aria-expanded') !== 'true') return;
    menu.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Открыть меню');
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
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => e.matches && close({ restoreFocus: false }));

  let scheduled = false;
  const update = () => {
    scheduled = false;
    const scrolled = hero ? hero.getBoundingClientRect().bottom <= 0 : window.scrollY > 80;
    const next = String(scrolled);
    if (root.dataset.scrolled !== next) {
      close({ restoreFocus: false });
      root.dataset.scrolled = next;
      // Keep the hero's reserved row while the same navigation becomes the page header.
      (scrolled ? document.body : heroSlot).append(root);
    }
    // Dismiss an open menu if its hero navigation has scrolled off screen.
    if (!scrolled && root.getBoundingClientRect().bottom <= 0) close({ restoreFocus: false });
  };
  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  update();
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  if (hero) new ResizeObserver(scheduleUpdate).observe(hero);
}
