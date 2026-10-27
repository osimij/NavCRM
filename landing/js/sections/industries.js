// Industries: three rows of business capsules that drift sideways in a loop.
// Each row's list is cloned once so translating the track by -50% wraps seamlessly.
// Hovering the rows eases them down to half speed rather than stopping them.
const HOVER_RATE = 0.5;
const EASE_MS = 400;

export function init(root) {
  const tracks = [];
  root.querySelectorAll('.s-industries__row').forEach((row) => {
    const group = row.querySelector('.s-industries__group');
    const track = document.createElement('div');
    track.className = 's-industries__track';
    const clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    row.append(track);
    track.append(group, clone);
    tracks.push(track);
  });
  root.setAttribute('data-running', '');

  // Ease every row's CSS animation toward a playback rate; setting playbackRate keeps position
  let rate = 1;
  let raf = 0;
  const easeTo = (target) => {
    cancelAnimationFrame(raf);
    const from = rate;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / EASE_MS);
      rate = from + (target - from) * (1 - (1 - t) ** 3);
      tracks.forEach((track) => track.getAnimations().forEach((a) => (a.playbackRate = rate)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  root.querySelectorAll('.s-industries__ticker').forEach((ticker) => {
    ticker.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && easeTo(HOVER_RATE));
    ticker.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && easeTo(1));
  });
}
