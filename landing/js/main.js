// NavCRM landing: shared utilities and section bootstrapping.
// Each section root carries data-section="name" and gets ./sections/name.js -> init(root).

document.documentElement.classList.add('js');

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Resolve after ms, or reject with AbortError when the signal aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/** Call cb once, the first time el scrolls into view. */
export function onceVisible(el, cb, { rootMargin = '0px 0px -12% 0px', threshold = 0 } = {}) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.disconnect();
          cb(e);
        }
      }
    },
    { rootMargin, threshold }
  );
  io.observe(el);
  return () => io.disconnect();
}

/**
 * Run an async scene repeatedly while el is on screen and the tab is visible.
 * scene(signal) should await sleep(ms, signal) between beats; it is aborted when
 * the element leaves the screen, and restarted from the top when it comes back.
 * With reduced motion, final(el) is called once instead and nothing loops.
 */
export function loopWhileVisible(el, scene, { final, threshold = 0.25, gap = 0 } = {}) {
  if (reducedMotion.matches) {
    final?.();
    return () => {};
  }
  let controller = null;
  let onScreen = false;

  const start = () => {
    if (controller || !onScreen || document.hidden) return;
    controller = new AbortController();
    const { signal } = controller;
    (async () => {
      try {
        while (!signal.aborted) {
          await scene(signal);
          if (gap) await sleep(gap, signal);
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    })();
  };
  const stop = () => {
    controller?.abort();
    controller = null;
  };

  const io = new IntersectionObserver(
    ([e]) => {
      onScreen = e.isIntersecting;
      onScreen ? start() : stop();
    },
    { threshold }
  );
  io.observe(el);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  return () => {
    stop();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** Format numbers for the Russian interface, with a space between thousands. */
export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');

/** Scroll reveals: .reveal elements fade up once. A [data-stagger] parent staggers its .reveal children. */
function initReveals() {
  document.querySelectorAll('[data-stagger]').forEach((parent) => {
    const step = Number(parent.dataset.stagger) || 60;
    parent.querySelectorAll(':scope .reveal').forEach((child, i) => {
      if (!child.style.getPropertyValue('--delay')) child.style.setProperty('--delay', `${i * step}ms`);
    });
  });
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

async function initSections() {
  const roots = document.querySelectorAll('[data-section]');
  await Promise.all(
    [...roots].map(async (root) => {
      const name = root.dataset.section;
      try {
        const mod = await import(`./sections/${name}.js?v=1.5-phone-2`);
        mod.init?.(root);
      } catch (err) {
        // A section without behaviour has no module; anything else is a real error.
        if (!String(err).includes('Failed to fetch dynamically imported module')) console.error(name, err);
      }
    })
  );
}

initReveals();
initSections();
