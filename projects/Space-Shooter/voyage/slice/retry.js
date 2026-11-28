// The retry screen (opening B, outcome 4): a fight that ends with the player at 0 HP ends the run. This shows the one way on:
// retry from the start of the scene. Plain words, one big button, phone first. The words are DRAFTS for Donaven.
export const RETRY_WORDS = Object.freeze({
  eyebrow: 'DOWN',
  title: 'You went down.',
  body: 'The Reavers got there first. The scene starts again from the top.',
  button: 'Retry from the scene start',
});

/** root: where the screen goes (document.body). onRetry(): the page restores the scene's start and plays it again. */
export function createRetry({ root = document.body, onRetry }) {
  let node = null;
  function show() {
    if (node) return node;
    const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
    const card = el('div', 'op-retry-card');
    const btn = el('button', 'op-retry-btn', RETRY_WORDS.button);
    btn.type = 'button';
    card.append(el('p', 'op-retry-eyebrow', RETRY_WORDS.eyebrow), el('h2', 'op-retry-title', RETRY_WORDS.title), el('p', 'op-retry-body', RETRY_WORDS.body), btn);
    node = el('section', 'op-retry');
    node.setAttribute('role', 'alertdialog');
    node.setAttribute('aria-label', RETRY_WORDS.title);
    node.append(card);
    root.append(node);
    btn.addEventListener('click', () => { const n = node; node = null; n.classList.add('is-leaving'); setTimeout(() => n.remove(), 320); onRetry(); });
    requestAnimationFrame(() => btn.focus({ preventScroll: true }));
    return node;
  }
  return { show, get open() { return Boolean(node); }, close() { node?.remove(); node = null; } };
}
