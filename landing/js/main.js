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
  const versions = {
    hero: '1.5-hero-fit',
    industries: '1.5-industry-hover-slow',
    'industries-ring': '1.5-ring-hover',
    local: '1.5-merged',
    pricing: '1.5-calc-days',
    footer: '1.5-footer-dark',
  };
  await Promise.all(
    [...roots].map(async (root) => {
      const name = root.dataset.section;
      try {
        const version = versions[name] || '1.5-aside-inspected';
        const mod = await import(`./sections/${name}.js?v=${version}`);
        mod.init?.(root);
      } catch (err) {
        // A section without behaviour has no module; anything else is a real error.
        if (!String(err).includes('Failed to fetch dynamically imported module')) console.error(name, err);
      }
    })
  );
}

/** Effect presets (css/fx, js/fx): each one loads only when the page uses it. */
async function initEffects() {
  if (document.querySelector('[data-glow]')) (await import('./fx/glow.js?v=1.5-glow-shape-3')).initGlow();
}

initReveals();
initSections();
initEffects();
