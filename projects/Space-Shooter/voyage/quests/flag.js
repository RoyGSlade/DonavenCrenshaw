// The new game's switch, the same contract as core's voyage/flag.js (core owns
// it; this copy only keeps the quest sandbox shut until core's branch lands):
// on when runtimeConfig.newGame is true, or when a page was opened with
// ?newgame=1 (remembered in localStorage 'stardust.newgame'); ?newgame=0 forgets.
export const FLAG = Object.freeze({ query: 'newgame', storageKey: 'stardust.newgame', on: '1', off: '0' });

export function newGameEnabled(config, { search = globalThis.location?.search || '', storage } = {}) {
  if (config?.newGame === true) return true;
  let store = storage;
  try { store ??= globalThis.localStorage; } catch { store = null; }
  let asked = null;
  try { asked = new URLSearchParams(search).get(FLAG.query); } catch { /* no query */ }
  try {
    if (asked === FLAG.off) { store?.removeItem(FLAG.storageKey); return false; }
    if (asked === FLAG.on) { store?.setItem(FLAG.storageKey, FLAG.on); return true; }
    return store?.getItem(FLAG.storageKey) === FLAG.on;
  } catch { return asked === FLAG.on; }
}
