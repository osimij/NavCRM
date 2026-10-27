// Industries, ring variant: the circles fan out from the centre when the ring scrolls in.
// Hovering a circle (or tapping it on touch) shows its name in the middle; when the mouse
// leaves, the ring goes back to how it was before.
// While nobody is pointing at the ring, a highlight steps around it on its own.
const STEP_MS = 1600;
const RESUME_MS = 2400;
const SPIN_EASE_MS = 700;

export function init(root) {
  const stage = root.querySelector('.s-ring__stage');
  const circles = [...root.querySelectorAll('.s-ring__btn')];
  // Every place that shows the current business name (the ring's middle, an eyebrow above the title)
  const names = [...root.querySelectorAll('.s-ring__name')].map((el) => ({ el, idle: el.textContent }));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -1 means no circle is lit and the middle shows the idle name
  let spot = -1;
  const show = (i) => {
    if (i === spot) return;
    circles[spot]?.classList.remove('is-spot');
    spot = i;
    circles[i]?.classList.add('is-spot');
    names.forEach(({ el, idle }) => {
      el.textContent = i < 0 ? idle : circles[i].getAttribute('aria-label');
      el.classList.remove('is-new');
      void el.offsetWidth;
      el.classList.add('is-new');
    });
  };

  // The walking highlight: runs only while the ring is on screen and nobody is using it
  let timer = 0;
  let visible = false;
  let busy = false;
  let resume = 0;
  const stop = () => clearInterval(timer);
  const start = () => {
    stop();
    if (still || !visible || busy) return;
    timer = setInterval(() => show((spot + 1) % circles.length), STEP_MS);
  };
  const hold = () => {
    busy = true;
    clearTimeout(resume);
    stop();
  };
  const release = () => {
    clearTimeout(resume);
    resume = setTimeout(() => {
      busy = false;
      start();
    }, RESUME_MS);
  };

  // What was lit before the mouse came over a circle, restored when it leaves
  let rest = null;
  circles.forEach((circle, i) => {
    circle.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (rest === null) rest = spot;
      show(i);
    });
    circle.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || rest === null) return;
      show(rest);
      rest = null;
    });
    circle.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && show(i));
  });
  // The ring's rotation eases to a stop under the mouse, so a name is easy to read, and back
  // up again on leave. The ring and its circles share one rate so the icons stay upright.
  const spins = () => [root.querySelector('.s-ring__list'), ...circles].flatMap((el) => el.getAnimations());
  let rate = 1;
  let raf = 0;
  const easeSpin = (target) => {
    cancelAnimationFrame(raf);
    const from = rate;
    const begin = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - begin) / SPIN_EASE_MS);
      rate = from + (target - from) * (1 - (1 - t) ** 3);
      spins().forEach((a) => a.animationName === 's-ring-spin' && (a.playbackRate = rate));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  stage.addEventListener('pointerenter', (e) => {
    hold();
    if (e.pointerType === 'mouse') easeSpin(0);
  });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return release();
    // The mouse is gone: pick up the walk and the spin right where they were
    clearTimeout(resume);
    busy = false;
    start();
    easeSpin(1);
  });
  stage.addEventListener('touchstart', () => {
    hold();
    release();
  }, { passive: true });

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) stage.setAttribute('data-in', '');
      visible ? start() : stop();
    },
    { rootMargin: '0px 0px -15% 0px' }
  ).observe(stage);
}
