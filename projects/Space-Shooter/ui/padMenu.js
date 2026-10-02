// Controller navigation for every menu panel (hangar, pause and settings, the
// end and attempt-over screens): D-pad or left stick moves a highlight between
// the controls, left/right adjusts sliders (or moves along a row), A selects,
// B goes back. It runs on its own animation frame, because the game loop is
// stopped on some of these screens.
const REPEAT_DELAY = 360, REPEAT_EVERY = 120, STICK = 0.55;
import { controllerSnapshot, standardController } from '../systems/controllerDevices.js';
import { controllerTuning } from '../systems/flightSettings.js';
const FOCUSABLE = 'button:not(:disabled), a[href], input:not([disabled]), select:not([disabled]), summary';

let held = {};        // direction -> { since, last }
let lastButtons = {};
let current = null;
const suspensions = new Set();
let lastRevision = -1, lastRoot = null, awaitingRelease = false;
/** While a controller button is being rebound, presses must not drive the menu. */
export function setPadMenuSuspended(on, reason = 'capture') {
  if (on) suspensions.add(reason);
  else if (suspensions.delete(reason)) awaitingRelease = true;
}

function panel() {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) return dialog;
  const open = [...document.querySelectorAll('.overlay-panel:not(.hidden)')].filter((p) => p.getClientRects().length);
  return open.at(-1) || null;
}

function targets(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length && !n.closest('[hidden]') && getComputedStyle(n).visibility !== 'hidden');
}

function mark(node) {
  if (current && current !== node) current.classList.remove('pad-focus');
  current = node;
  if (!node) return;
  node.classList.add('pad-focus');
  node.focus({ preventScroll: true });
  node.scrollIntoView?.({ block: 'nearest' });
}

// The next control in a direction: nearest by screen position, rows before columns.
function step(list, from, dir) {
  if (!from || !list.includes(from)) return list[0];
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const n of list) {
    if (n === from) continue;
    const b = n.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    const along = dir === 'down' ? dy : dir === 'up' ? -dy : dir === 'right' ? dx : -dx;
    const across = dir === 'down' || dir === 'up' ? Math.abs(dx) : Math.abs(dy);
    if (along <= 4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  if (best) return best;
  // Wrap vertically so a long list never dead-ends.
  const i = list.indexOf(from);
  if (dir === 'down') return list[(i + 1) % list.length];
  if (dir === 'up') return list[(i - 1 + list.length) % list.length];
  return from;
}

function press(node) {
  if (!node) return;
  if (node.matches('select')) return; // Left/right chooses; keep the browser popup closed.
  if (node.matches('input[type=checkbox]')) { node.click(); return; }
  node.click();
}

function back(root) {
  if (root.id === 'starmap-start') {
    root.querySelector('details[open]')?.removeAttribute('open');
    return;
  }
  if (root.matches('dialog[open]')) {
    root.querySelector('.garage-close')?.click();
    return;
  }
  const cancel = root.querySelector('#starmap-resume-btn, #settings-cancel-btn, [data-fail="hangar"], #starmap-end-menu-btn');
  if (cancel && root.id !== 'starmap-start') cancel.click();
}

function adjustRange(node, sign) {
  if (node?.matches('select')) {
    node.selectedIndex = Math.min(node.options.length - 1, Math.max(0, node.selectedIndex + sign));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (!node?.matches('input[type=range]')) return false;
  const stepSize = Number(node.step) || (Number(node.max) - Number(node.min)) / 20 || 0.05;
  node.value = String(Math.min(Number(node.max), Math.max(Number(node.min), Number(node.value) + sign * stepSize)));
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function tick(now) {
  requestAnimationFrame(tick);
  const snapshot = controllerSnapshot();
  const pad = snapshot.pad;
  const root = panel();
  if (!pad || !root || !snapshot.active || !snapshot.activated || !standardController(pad)) {
    held = {};
    lastButtons = {}; awaitingRelease = true;
    if (!root && current) { current.classList.remove('pad-focus'); current = null; }
    return;
  }
  const btn = (i) => !!pad.buttons?.[i]?.pressed;
  const ax = pad.axes?.[0] || 0, ay = pad.axes?.[1] || 0;
  const threshold = Math.max(STICK, controllerTuning().stickDeadzone);
  if (lastRevision !== snapshot.revision || lastRoot !== root) {
    lastRevision = snapshot.revision; lastRoot = root; awaitingRelease = true; held = {}; lastButtons = {};
  }
  if (awaitingRelease) {
    // Activation and held directions after a dialog/focus change cannot click
    // a newly opened screen. Stick drift below the menu threshold is harmless.
    if (!Array.from(pad.buttons || []).some(b => b?.pressed || b?.value > 0.5) && Math.abs(ax) < threshold && Math.abs(ay) < threshold) awaitingRelease = false;
    return;
  }
  // Keep tracking A and B so the press that ends a rebind is not taken as a click.
  if (suspensions.size) { lastButtons = { a: btn(0), b: btn(1) }; held = {}; return; }
  const dirs = {
    up: btn(12) || ay < -threshold,
    down: btn(13) || ay > threshold,
    left: btn(14) || ax < -threshold,
    right: btn(15) || ax > threshold,
  };
  const list = targets(root);
  if (current && !list.includes(current)) mark(null);
  // Start from whatever the screen already focused (Resume, Retry, Fly again).
  const active = document.activeElement;
  if (list.includes(active) && current !== active && (Object.values(dirs).some(Boolean) || btn(0))) {
    if (current) current.classList.remove('pad-focus');
    current = active; active.classList.add('pad-focus');
  }
  for (const [dir, on] of Object.entries(dirs)) {
    if (!on) { delete held[dir]; continue; }
    const h = held[dir];
    const fire = !h || (now - h.since > REPEAT_DELAY && now - h.last > REPEAT_EVERY);
    if (!h) held[dir] = { since: now, last: now };
    if (!fire) continue;
    held[dir].last = now;
    if ((dir === 'left' || dir === 'right') && adjustRange(current, dir === 'right' ? 1 : -1)) continue;
    mark(step(list, current, dir));
  }
  const a = btn(0), b = btn(1);
  if (a && !lastButtons.a) { if (current && list.includes(current)) press(current); else mark(list[0]); }
  if (b && !lastButtons.b) back(root);
  lastButtons = { a, b };
}

let started = false;
export function initPadMenu() {
  if (started || typeof requestAnimationFrame !== 'function') return;
  started = true;
  // A mouse or touch takes over: drop the controller highlight.
  window.addEventListener('pointerdown', () => { if (current) { current.classList.remove('pad-focus'); current = null; } }, { passive: true });
  window.addEventListener('blur', () => { awaitingRelease = true; held = {}; lastButtons = {}; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { awaitingRelease = true; held = {}; lastButtons = {}; } });
  requestAnimationFrame(tick);
}
