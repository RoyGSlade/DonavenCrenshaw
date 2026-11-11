// The new game's switch. Off by default: runtimeConfig.newGame is false on main.
// Preview (the contract the bench lane's test kit uses, scripts/stardust-test-kit.mjs):
// a page opened with ?newgame=1 turns it on for this browser and remembers it
// (localStorage 'stardust.newgame' = '1'); ?newgame=0 forgets it. ?dev=1 on a
// previewing tab adds the hangar's test tools; they never show from the public
// switch alone.
export const FLAG = Object.freeze({ query: 'newgame', storageKey: 'stardust.newgame', on: '1', off: '0' });

export function newGameFlag({ config = {}, search = '', storage = globalThis.localStorage } = {}) {
  let params;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(); }
  const asked = params.get(FLAG.query);
  let override = false;
  try {
    if (asked === FLAG.off) storage?.removeItem(FLAG.storageKey);
    else if (asked === FLAG.on) storage?.setItem(FLAG.storageKey, FLAG.on);
    override = asked === FLAG.on || (asked !== FLAG.off && storage?.getItem(FLAG.storageKey) === FLAG.on);
  } catch { override = asked === FLAG.on; }
  const enabled = config.newGame === true || override;
  return { enabled, override, dev: override && params.get('dev') === '1' };
}

/**
 * The cut-over: with runtimeConfig.newGame on, a bare visit to today's hangar
 * page goes to the new hangar. Any query (?weekly=, ?vs=, ?import=, ?challenge=,
 * ?lab=, ?activity=classic, ...) keeps today's racing page, so old boards,
 * ghosts and shared links still open where they always did.
 */
export function cutOverTarget({ config = {}, search = '' } = {}) {
  if (config.newGame !== true) return null;
  let params;
  try { params = new URLSearchParams(search); } catch { return null; }
  return [...params.keys()].length === 0 ? './voyage/' : null;
}
