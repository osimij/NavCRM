// Made here (#local): the offline phone demo.
import { sleep, loopWhileVisible, reducedMotion } from '../shared.js';

export function init(root) {
  const offline = root.querySelector('[data-offline]');
  if (offline) initOffline(offline);
}

/*
  Today's schedule on a phone. About 9s:
  online (schedule only) -> offline (banner, then three changes saved on the phone, then the count)
  -> syncing (each change ticks) -> synced (check, "Everything synced.") -> fade back.
  Phase and row count live on data attributes; CSS does the layout and motion.
*/
function initOffline(el) {
  const rows = el.querySelectorAll('[data-row]').length;
  const netOffline = el.querySelector('[data-net="offline"]');
  const netSynced = el.querySelector('[data-net="synced"]');
  const spin = el.querySelector('[data-sync="spin"]');
  const done = el.querySelector('[data-sync="done"]');

  const hide = (node, hidden) => (node.dataset.hidden = String(hidden));
  const banner = (back, syncing = false) => {
    hide(netOffline, back);
    hide(netSynced, !back);
    hide(spin, !syncing);
    hide(done, syncing);
  };
  const render = (phase, count) => {
    el.dataset.phase = phase;
    el.dataset.rows = String(count);
    const offline = phase === 'offline';
    // While online the banner is hidden; its content keeps whatever it last said.
    if (phase !== 'online') banner(!offline, phase === 'syncing');
  };

  // Fade back to the start: the banner and changes fade, the schedule settles back up.
  // Once the banner is invisible, its content quietly returns to "Offline." for the next round.
  const rewind = async (signal) => {
    el.classList.add('is-resetting');
    render('online', 0);
    try {
      await sleep(700, signal);
    } finally {
      el.classList.remove('is-resetting');
      banner(false);
    }
  };

  // The markup ships in the end state (no JS, reduced motion). With motion, jump to the start unseen.
  if (!reducedMotion.matches) {
    el.classList.add('is-instant');
    render('online', 0);
    banner(false);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-instant')));
  }

  loopWhileVisible(
    el,
    async (signal) => {
      // Coming back mid-scene (scrolled away, tab hidden): fade back to the start first.
      if (el.dataset.phase !== 'online') await rewind(signal);
      await sleep(1400, signal);

      // The connection drops; work carries on and each change is kept on the phone.
      render('offline', 0);
      await sleep(700, signal);
      for (let n = 1; n <= rows; n++) {
        render('offline', n);
        await sleep(650, signal);
      }
      await sleep(1000, signal);

      // Back online: the changes sync one after another, then the banner confirms it.
      render('syncing', rows);
      await sleep(900, signal);
      render('synced', rows);
      await sleep(2400, signal);
      await rewind(signal);
    },
    { final: () => render('synced', rows) }
  );
}
