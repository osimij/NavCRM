// NavCRM landing: reveal and section bootstrapping.

document.documentElement.classList.add('js');

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
        const version = name === 'industries' ? '1.5-vertical-industries-2' : '1.5-aside-inspected';
        const mod = await import(`./sections/${name}.js?v=${version}`);
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
