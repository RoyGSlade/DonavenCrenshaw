// The first-time controls card and the pause sheet (round 3, basics lane).
// The card shows once per device, the first time the floor is yours (keys on a
// computer, the stick and buttons on a phone), and again from the pause sheet.
// Esc (or the pause button on a phone) opens the pause sheet: back to it, how to
// play, sound and display, classic Stardust. Words are data (data.js).
import { BASICS_DATA } from './data.js';
import { el } from './pages.js';
import { icon, keyCap } from './icons.js';

const C = BASICS_DATA.controls;
const P = BASICS_DATA.pause;

export function createControlsCard({ root = document.body, touch = false }) {
  let card = null;
  const seen = () => { try { return localStorage.getItem(C.seenKey) === '1'; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(C.seenKey, '1'); } catch { /* private window */ } };
  function show() {
    if (card) return;
    const rows = touch ? C.touch : C.desktop;
    const ok = el('button', { type: 'button', class: 'ui-btn primary dp-controls-ok', text: C.dismiss });
    card = el('section', { class: `dp-controls${touch ? ' is-touch' : ''}`, role: 'dialog', 'aria-label': C.title },
      el('p', { class: 'ui-eyebrow', text: C.title.toUpperCase() }),
      el('ul', {}, rows.map((r) => el('li', {}, el('span', { class: 'dp-controls-keys' }, r.keys.map((k) => keyCap(k, 'dp-key dp-key-sm'))), el('span', { text: r.text })))),
      ok);
    ok.addEventListener('click', hide);
    root.append(card);
  }
  function hide() { if (!card) return; card.remove(); card = null; remember(); }
  return {
    /** Show it if this device has never seen it. */
    maybeShow() { if (!seen()) show(); },
    show, hide,
    get open() { return Boolean(card); },
  };
}

/**
 * The pause sheet. onChange(open): the page holds or frees the floor.
 * settings: ui/settings.js (open()). controls: the card above. canOpen(): nothing else owns Esc.
 */
export function createPause({ root = document.body, touch = false, settings = null, controls = null, onChange = () => {}, canOpen = () => true, classicHref = '../?activity=classic' }) {
  let sheet = null;
  let opener = null;
  const btn = touch ? el('button', { type: 'button', class: 'dp-pause-btn', 'aria-label': 'Pause and settings' }, icon('pause', 'dp-icon')) : null;
  if (btn) { btn.addEventListener('click', () => (sheet ? close() : open())); root.append(btn); }

  function open() {
    if (sheet || !canOpen()) return false;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const resume = el('button', { type: 'button', class: 'ui-btn primary', id: 'dp-resume', text: P.resume, on: { click: () => close() } });
    sheet = el('div', { class: 'dp-pause-scrim' },
      el('section', { class: 'dp-pause ui-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dp-pause-title' },
        el('h2', { id: 'dp-pause-title', text: P.title }),
        el('p', { class: 'ui-note', text: P.note }),
        resume,
        el('button', { type: 'button', class: 'ui-btn', text: P.controls, on: { click: () => { close(); controls?.show(); } } }),
        settings ? el('button', { type: 'button', class: 'ui-btn', text: P.settings, on: { click: () => { close(); settings.open(); } } }) : null,
        el('a', { class: 'ui-btn dp-pause-link', href: classicHref, text: P.classic })));
    sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) close(); });
    root.append(sheet);
    document.body.classList.add('dp-paused');
    onChange(true);
    requestAnimationFrame(() => resume.focus({ preventScroll: true }));
    return true;
  }
  function close() {
    if (!sheet) return false;
    sheet.remove();
    sheet = null;
    document.body.classList.remove('dp-paused');
    onChange(false);
    (opener?.isConnected && opener !== document.body ? opener : null)?.focus?.({ preventScroll: true });
    return true;
  }
  return { open, close, get open_() { return Boolean(sheet); }, get isOpen() { return Boolean(sheet); }, button: btn };
}
