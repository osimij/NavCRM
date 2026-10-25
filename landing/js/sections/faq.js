// FAQ accordion: several items can be open at once.

export function init(root) {
  root.querySelectorAll('.s-faq__item').forEach((item) => {
    const button = item.querySelector('button');
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      item.dataset.open = String(open);
    });
  });
}
