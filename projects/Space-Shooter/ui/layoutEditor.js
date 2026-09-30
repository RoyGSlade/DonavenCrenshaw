// Moveable widgets. Every HUD piece and touch control is a [data-widget]
// element placed by its centre as a fraction of the screen, plus a scale.
// Settings → Edit layout: drag to move, − / + to resize, Reset, Done. Layouts
// are saved per device and orientation (desktop, touch landscape, touch
// portrait) in systems/flightSettings.js.
import { flightSettings, updateFlightSettings, isTouchDevice } from '../systems/flightSettings.js';

// x, y: widget centre as a fraction of the viewport; s: scale.
export const DEFAULT_LAYOUTS = Object.freeze({
  desktop: {
    gauges: { x: 0.15, y: 0.1, s: 1 },
    topbar: { x: 0.5, y: 0.055, s: 1 },
    settings: { x: 0.968, y: 0.06, s: 1 },
    minimap: { x: 0.12, y: 0.82, s: 1 },
  },
  'touch-landscape': {
    gauges: { x: 0.15, y: 0.12, s: 0.8 },
    topbar: { x: 0.56, y: 0.085, s: 0.8 },
    settings: { x: 0.955, y: 0.1, s: 0.9 },
    minimap: { x: 0.86, y: 0.3, s: 0.8 },
    stick: { x: 0.12, y: 0.74, s: 1 },
    brake: { x: 0.28, y: 0.64, s: 0.9 },
    boost: { x: 0.29, y: 0.85, s: 0.9 },
    wheel: { x: 0.86, y: 0.72, s: 1 },
  },
  'touch-portrait': {
    gauges: { x: 0.33, y: 0.07, s: 0.8 },
    topbar: { x: 0.5, y: 0.16, s: 0.66 },
    settings: { x: 0.91, y: 0.05, s: 0.9 },
    minimap: { x: 0.8, y: 0.26, s: 0.7 },
    stick: { x: 0.24, y: 0.84, s: 0.95 },
    brake: { x: 0.14, y: 0.66, s: 0.8 },
    boost: { x: 0.36, y: 0.66, s: 0.8 },
    wheel: { x: 0.74, y: 0.84, s: 0.95 },
  },
});
const MIN_S = 0.5, MAX_S = 1.8;

export function layoutMode(win = globalThis) {
  if (!isTouchDevice(win)) return 'desktop';
  return (win.innerWidth || 1) >= (win.innerHeight || 1) ? 'touch-landscape' : 'touch-portrait';
}

export function currentLayout(mode = layoutMode()) {
  const saved = flightSettings().layouts?.[mode] || {};
  const base = DEFAULT_LAYOUTS[mode];
  const out = {};
  for (const [id, def] of Object.entries(base)) {
    const s = saved[id];
    out[id] = s && [s.x, s.y, s.s].every(Number.isFinite)
      ? { x: Math.min(1, Math.max(0, s.x)), y: Math.min(1, Math.max(0, s.y)), s: Math.min(MAX_S, Math.max(MIN_S, s.s)) }
      : { ...def };
  }
  return out;
}

let root = null;
let working = null;   // the layout being edited
let editing = false;
let bar = null;
let selected = null;

export function applyLayout(layout = currentLayout()) {
  if (!root) return;
  const W = window.innerWidth, H = window.innerHeight;
  for (const el of root.querySelectorAll('[data-widget]')) {
    const spot = layout[el.dataset.widget];
    if (!spot) { el.classList.add('fx-unplaced'); continue; }
    el.classList.remove('fx-unplaced');
    el.style.setProperty('--fx-s', spot.s);
    // Keep the whole widget on screen: measure unscaled, then clamp the centre.
    const w = el.offsetWidth * spot.s, h = el.offsetHeight * spot.s;
    const cx = Math.min(Math.max(spot.x * W, w / 2 + 4), W - w / 2 - 4);
    const cy = Math.min(Math.max(spot.y * H, h / 2 + 4), H - h / 2 - 4);
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
  }
}

export function initLayout(flightRoot) {
  root = flightRoot;
  applyLayout();
  const relayout = () => applyLayout(editing ? working : currentLayout());
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
  window.addEventListener('stardust:flightSettings', relayout);
  bar = document.createElement('div');
  bar.className = 'fx-edit-bar';
  bar.innerHTML = '<span class="fx-edit-hint">Drag to move · select, then − / + to resize</span><button type="button" data-edit="smaller" aria-label="Smaller">−</button><button type="button" data-edit="bigger" aria-label="Bigger">+</button><button type="button" data-edit="reset">Reset</button><button type="button" data-edit="done" class="primary">Done</button>';
  root.append(bar);
  bar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-edit]')?.dataset.edit;
    if (action === 'done') stopEditing(true);
    else if (action === 'reset') { working = structuredClone(DEFAULT_LAYOUTS[layoutMode()]); applyLayout(working); }
    else if ((action === 'smaller' || action === 'bigger') && selected && working[selected]) {
      working[selected].s = Math.min(MAX_S, Math.max(MIN_S, working[selected].s + (action === 'bigger' ? 0.1 : -0.1)));
      applyLayout(working);
    }
  });
  // Drags take over every widget while editing (capture phase, before the controls).
  root.addEventListener('pointerdown', (event) => {
    if (!editing) return;
    const el = event.target.closest('[data-widget]');
    if (!el || !working[el.dataset.widget]) return;
    event.preventDefault();
    event.stopPropagation();
    select(el.dataset.widget);
    const id = el.dataset.widget;
    const start = { x: event.clientX, y: event.clientY, wx: working[id].x, wy: working[id].y };
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      working[id].x = Math.min(1, Math.max(0, start.wx + (e.clientX - start.x) / window.innerWidth));
      working[id].y = Math.min(1, Math.max(0, start.wy + (e.clientY - start.y) / window.innerHeight));
      applyLayout(working);
    };
    const up = (e) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }, true);
  // Widgets' own clicks (the settings gear) do nothing while editing.
  root.addEventListener('click', (event) => { if (editing && event.target.closest('[data-widget]')) { event.preventDefault(); event.stopPropagation(); } }, true);
}

function select(id) {
  selected = id;
  for (const el of root.querySelectorAll('[data-widget]')) el.classList.toggle('fx-selected', el.dataset.widget === id);
}

export const isEditingLayout = () => editing;

export function startEditing() {
  if (!root) return;
  editing = true;
  working = structuredClone(currentLayout());
  document.body.classList.add('fx-editing');
  select(null);
  applyLayout(working);
}

export function stopEditing(save) {
  if (!editing) return;
  editing = false;
  if (save) {
    const mode = layoutMode();
    const snapshot = structuredClone(working);
    updateFlightSettings((s) => { s.layouts = { ...(s.layouts || {}), [mode]: snapshot }; });
  }
  document.body.classList.remove('fx-editing');
  select(null);
  applyLayout();
  window.dispatchEvent(new CustomEvent('stardust:layoutEdited', { detail: { saved: !!save } }));
}
