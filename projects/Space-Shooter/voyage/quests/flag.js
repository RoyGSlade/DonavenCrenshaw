// The new game is off by default (INTERFACES.md section 7). It shows only when
// runtimeConfig.voyage is true or the tab was opened with ?voyage=on (kept for
// the tab's session; ?voyage=off clears it). Core owns the real switch; this is
// the same rule for quests' sandbox page until core's helper lands.
export const PREVIEW_KEY = 'stardust.voyage.preview';

export function voyageEnabled(config, { location = globalThis.location, storage } = {}) {
  if (config?.voyage === true) return true;
  let store = storage;
  try { store ??= globalThis.sessionStorage; } catch { store = null; }
  try {
    const param = new URLSearchParams(location?.search || '').get('voyage');
    if (param === 'off') { store?.removeItem(PREVIEW_KEY); return false; }
    if (param === 'on') { store?.setItem(PREVIEW_KEY, '1'); return true; }
    return store?.getItem(PREVIEW_KEY) === '1';
  } catch { return false; }
}
