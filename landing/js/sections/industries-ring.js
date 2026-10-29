// Industries, ring variant: the circles fan out from the centre when the ring scrolls in.
// Hovering a circle (or tapping it on touch) shows its name in the middle; when the mouse
// leaves, the ring goes back to how it was before.
// While nobody is pointing at the ring, a highlight steps around it on its own.
// Kept light for slow phones: the spin and the walk run only while the ring is on screen, and
// nothing here forces a layout.
const STEP_MS = 1600;
const RESUME_MS = 2400;
const SPIN_EASE_MS = 700;

export function init(root) {
  const stage = root.querySelector('.s-ring__stage');
  const circles = [...root.querySelectorAll('.s-ring__btn')];
  // The ring's middle, which shows the current business name
  const names = [...root.querySelectorAll('.s-ring__name')].map((el) => ({ el, idle: el.textContent }));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -1 means no circle is lit and the middle shows the idle name
  let spot = -1;
  const show = (i) => {
    if (i === spot) return;
    circles[spot]?.classList.remove('is-spot');
    circles[spot]?.parentElement.classList.remove('is-up');
    spot = i;
    circles[i]?.classList.add('is-spot');
    circles[i]?.parentElement.classList.add('is-up');
    names.forEach(({ el, idle }) => {
      el.textContent = i < 0 ? idle : circles[i].getAttribute('aria-label');
      // the new name settles in; opacity and transform only, so it stays on the compositor
      if (!still) {
        el.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 360, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
        );
      }
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

  // What was lit before the mouse came over a circle, restored when it leaves. Only the circles
  // pause the ring: the mouse in the empty middle leaves the spin and the walk running.
  let rest = null;
  circles.forEach((circle, i) => {
    circle.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (rest === null) rest = spot;
      hold();
      easeSpin(0);
      show(i);
    });
    circle.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || rest === null) return;
      show(rest);
      rest = null;
      // the mouse is off the circle: pick up the walk and the spin right where they were
      clearTimeout(resume);
      busy = false;
      start();
      easeSpin(1);
    });
    circle.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && show(i));
  });
  // The ring's rotation eases to a stop under the mouse on a circle, so a name is easy to read,
  // and back up again on leave. The ring and its circles share one rate so the icons stay upright.
  // looked up once: getAnimations() flushes styles, too costly to call every frame
  let spinAnims = null;
  const spins = () =>
    (spinAnims ??= [root.querySelector('.s-ring__list'), ...circles]
      .flatMap((el) => el.getAnimations())
      .filter((a) => a.animationName === 's-ring-spin'));
  let rate = 1;
  let raf = 0;
  const easeSpin = (target) => {
    cancelAnimationFrame(raf);
    const from = rate;
    const begin = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - begin) / SPIN_EASE_MS);
      rate = from + (target - from) * (1 - (1 - t) ** 3);
      spins().forEach((a) => (a.playbackRate = rate));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  stage.addEventListener('touchstart', () => {
    hold();
    release();
  }, { passive: true });

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) stage.setAttribute('data-in', '');
      stage.toggleAttribute('data-live', visible);
      visible ? start() : stop();
    },
    { rootMargin: '0px 0px -15% 0px' }
  ).observe(stage);
}
