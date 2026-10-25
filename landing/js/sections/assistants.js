// Assistants: the Instagram Direct chat plays one exchange, holds, fades out and repeats.
import { sleep, loopWhileVisible } from '../main.js';

export function init(root) {
  const chat = root.querySelector('[data-chat]');
  if (!chat) return;
  const msgs = [...chat.querySelectorAll('[data-m]')];

  const set = (msg, state) => {
    if (state) msg.dataset.state = state;
    else delete msg.dataset.state;
  };

  // Back to an empty thread without animating the way back.
  const reset = () => {
    chat.classList.add('is-reset');
    chat.classList.remove('is-out');
    msgs.forEach((m) => set(m, null));
    void chat.offsetWidth;
    chat.classList.remove('is-reset');
  };

  const scene = async (signal) => {
    reset();
    await sleep(700, signal);
    for (const msg of msgs) {
      if ('typing' in msg.dataset) {
        set(msg, 'typing');
        await sleep(200 + 900, signal);
      }
      set(msg, 'on');
      await sleep(msg.nextElementSibling ? 1500 : 3800, signal);
    }
    chat.classList.add('is-out');
    await sleep(600, signal);
  };

  loopWhileVisible(chat, scene, { final: () => msgs.forEach((m) => set(m, 'on')) });
}
