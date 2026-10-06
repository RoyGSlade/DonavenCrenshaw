// Which renderer the weekly races use: '3d' or '2d'. Pure apart from reading
// the address bar and the saved setting, both passed in for tests.
export const RENDER_KEY = 'stardust.render';
export const RENDER_EVENT = 'stardust:render-mode';

// A choice that could not be saved (blocked storage) still holds for this page load.
let sessionMode = null;
export function clearSessionRenderMode() { sessionMode = null; }

/** ?render=3d|2d wins for this page load; otherwise the saved setting; otherwise 2D. */
export function readRenderMode({ search = globalThis.location?.search || '', storage = globalThis.localStorage } = {}) {
  const asked = new URLSearchParams(search).get('render');
  if (asked === '3d' || asked === '2d') return asked;
  try {
    const saved = storage?.getItem(RENDER_KEY);
    if (saved === '3d' || saved === '2d') return saved;
  } catch { /* storage blocked: default */ }
  return sessionMode || '2d';
}

/** Where the effective mode came from: 'link' (?render=), 'saved' (the setting) or 'default'. */
export function renderModeSource({ search = globalThis.location?.search || '', storage = globalThis.localStorage } = {}) {
  const asked = new URLSearchParams(search).get('render');
  if (asked === '3d' || asked === '2d') return 'link';
  try {
    const saved = storage?.getItem(RENDER_KEY);
    if (saved === '3d' || saved === '2d') return 'saved';
  } catch { /* storage blocked: default */ }
  return sessionMode ? 'saved' : 'default';
}

export function saveRenderMode(mode, storage = globalThis.localStorage) {
  if (mode !== '3d' && mode !== '2d') return false;
  try { storage?.setItem(RENDER_KEY, mode); return true; } catch { return false; }
}

/**
 * Settings-menu entry point: save the choice and tell the game, so the next
 * frame picks it up with no reload. Returns false when the choice could not be
 * kept (private mode, blocked storage); the caller says "applies this session
 * only" in that case. A ?render= link still wins on this page load.
 */
export function chooseRenderMode(mode, { storage = globalThis.localStorage, target = globalThis } = {}) {
  const saved = saveRenderMode(mode, storage);
  if (mode === '3d' || mode === '2d') sessionMode = saved ? null : mode;
  try { target?.dispatchEvent?.(new CustomEvent(RENDER_EVENT, { detail: { mode } })); } catch { /* no DOM */ }
  return saved;
}
