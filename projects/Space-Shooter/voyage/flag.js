// Is Voyage open in this tab? Off by default (runtimeConfig.voyage is false).
// ?voyage=on opens it for the rest of the tab's session, ?voyage=off closes it
// again. ?dev=1 on an opened tab adds the hangar's test tools (a practice job,
// a test death, a fresh save); they never show from the public flag alone.
export const FLAG_KEY = 'stardust.voyage.flag';

export function voyageFlag({ config = {}, search = '', session = globalThis.sessionStorage } = {}) {
  let params;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(); }
  const asked = params.get('voyage');
  let override = false;
  try {
    if (asked === 'off') session?.removeItem(FLAG_KEY);
    else if (asked === 'on') session?.setItem(FLAG_KEY, 'on');
    override = asked === 'on' || (asked !== 'off' && session?.getItem(FLAG_KEY) === 'on');
  } catch { override = asked === 'on'; }
  const enabled = config.voyage === true || override;
  return { enabled, override, dev: override && params.get('dev') === '1' };
}

/**
 * The cut-over switch: with runtimeConfig.voyage on, a bare visit to today's
 * hangar page goes to the new hangar. Any query (?weekly=, ?vs=, ?import=,
 * ?challenge=, ?lab=, ?activity=classic, ...) keeps today's racing page, so old
 * boards, ghosts and shared links still open where they always did.
 */
export function cutOverTarget({ config = {}, search = '' } = {}) {
  if (config.voyage !== true) return null;
  let params;
  try { params = new URLSearchParams(search); } catch { return null; }
  return [...params.keys()].length === 0 ? './voyage/' : null;
}
