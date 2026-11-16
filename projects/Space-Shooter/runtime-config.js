// Public configuration only. Never put a tunnel token, service credential, or secret here.
// The hub at api.donavencrenshaw.com. Empty keeps gameplay fully local.
// build names this version of the game to the hub, which can refuse runs from a broken one.
// bossFight: false switches off the hidden Warden fight behind Iron Veil's gate (and its
// cues) until it is ready to come back.
// newGame: false keeps the new Stardust (voyage/) closed to the public and today's
// game as the front door; true is the cut-over. ?newgame=1 previews it in one
// browser (voyage/flag.js).
//
// voyageServer: false keeps the new game's money, items and skill levels in the
// browser save, as today. true hands them to the hub (the voyage session gate and
// economy client; the hub's games/stardust/rules.json "voyage".enabled must be
// on too). ?vserver=1 previews it in one tab.
//
// Local testing: ?hub=http://localhost:3100 points the game at a hub on this
// machine for the rest of the tab's session. Only plain-HTTP loopback hubs are
// accepted, so a link can never send a player's runs anywhere else.
const HUB_KEY = 'stardust.localHub';
function localHub() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    let hub = params.get('hub');
    if (hub === 'off') { globalThis.sessionStorage?.removeItem(HUB_KEY); return null; }
    if (hub) globalThis.sessionStorage?.setItem(HUB_KEY, hub);
    else hub = globalThis.sessionStorage?.getItem(HUB_KEY);
    if (!hub) return null;
    const url = new URL(hub);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
    return `${url.origin}/api/games/stardust`;
  } catch { return null; }
}
export const runtimeConfig = Object.freeze({ backendBaseUrl: localHub() || 'https://api.donavencrenshaw.com/api/games/stardust', requestTimeoutMs: 2500, build: 'stardust-2026.09.29', bossFight: false, newGame: false, voyageServer: false });
