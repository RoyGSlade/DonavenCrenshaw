// The session gate (launch tech lane, outcome 2; design doc Section 9): with the
// home server mode on, a new-game session starts only when the hub answers both
// its health probe and the game clock. Otherwise the page shows a maintenance
// screen instead of a game that would earn nothing. A guest (no account) plays
// a local demo that pays nothing real (Q2.1). Only the new game is gated:
// racing, Dogfight, weeklies and boards never import this file.
//
// Server mode is off unless runtimeConfig.voyageServer is true, or a tab opens
// with ?vserver=1 (remembered for the tab; ?vserver=0 forgets it).
export const SERVER_FLAG = Object.freeze({ query: 'vserver', key: 'stardust.voyage.server', on: '1', off: '0' });

/** Is the server-owned economy on for this page? */
export function serverMode({ config = {}, search = '', storage = globalThis.sessionStorage } = {}) {
  if (config.voyageServer === true) return true;
  let asked = null;
  try { asked = new URLSearchParams(search).get(SERVER_FLAG.query); } catch { asked = null; }
  try {
    if (asked === SERVER_FLAG.off) { storage?.removeItem(SERVER_FLAG.key); return false; }
    if (asked === SERVER_FLAG.on) { storage?.setItem(SERVER_FLAG.key, SERVER_FLAG.on); return true; }
    return storage?.getItem(SERVER_FLAG.key) === SERVER_FLAG.on;
  } catch { return asked === SERVER_FLAG.on; }
}

export const MAINTENANCE_WORDS = Object.freeze({
  title: 'Down for maintenance',
  body: 'The Guild bank is offline for a moment, so no new runs can start. Your ship, credits and skills are safe, and the station clock keeps running.',
  retry: 'Try again',
  classic: 'Fly classic Stardust',
  checking: 'Checking the Guild bank…',
});

const answered = (r) => Number.isInteger(r?.status) && r.status >= 200 && r.status < 300;

/**
 * Whether a session may start. health and clock are the hub's answers
 * ({ status, data }) to /v1/health and /v1/clock. signedIn: false gives a guest
 * demo. Returns { mode: 'play' | 'guest' | 'maintenance', reason, words, clock }.
 */
export function decideSession({ health, clock, signedIn = true } = {}) {
  const down = (reason) => ({ mode: 'maintenance', reason, words: `${MAINTENANCE_WORDS.title}. ${MAINTENANCE_WORDS.body}`, clock: null });
  if (!answered(health) || health.data?.ok === false) return down(health?.status ? 'health' : 'unreachable');
  if (!answered(clock) || !Number.isFinite(clock.data?.now)) return down('clock');
  if (clock.data.enabled === false) return down('off');
  const c = { now: clock.data.now, day: clock.data.day, month: clock.data.month, dayOfMonth: clock.data.dayOfMonth, msToNextDay: clock.data.msToNextDay };
  if (!signedIn) return { mode: 'guest', reason: 'guest', words: 'Guest demo: nothing you earn is kept. Sign in to keep your progress.', clock: c };
  return { mode: 'play', reason: 'ok', words: '', clock: c };
}

/** Asks the hub (recorder.api / recorder.gamePath) and decides. */
export async function probeSession({ api, gamePath, signedIn = true }) {
  if (!gamePath('/v1/health')) return decideSession({ health: { status: 0 }, clock: { status: 0 } });
  const [health, clock] = await Promise.all([api(gamePath('/v1/health')), api(gamePath('/v1/clock'))]);
  return decideSession({ health, clock, signedIn });
}

/**
 * The maintenance screen: fills root (an empty element) and shows it. onRetry()
 * resolves to the next decision; the screen hides itself when play can start.
 */
export function showMaintenance(root, { onRetry, classicHref = '../index.html', reason = '' } = {}) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const card = el('div', 'vy-maint-card ui-card');
  const eyebrow = el('p', 'ui-eyebrow', 'STARDUST · GUILD BANK');
  const title = el('h1', 'vy-maint-title', MAINTENANCE_WORDS.title);
  const body = el('p', 'vy-maint-body', MAINTENANCE_WORDS.body);
  const status = el('p', 'vy-maint-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = el('button', 'ui-btn primary', MAINTENANCE_WORDS.retry);
  retry.type = 'button';
  const classic = el('a', 'ui-btn', MAINTENANCE_WORDS.classic);
  classic.href = classicHref;
  const row = el('div', 'vy-maint-row');
  row.append(retry, classic);
  const lamp = el('div', 'vy-maint-lamp');
  lamp.setAttribute('aria-hidden', 'true');
  card.append(lamp, eyebrow, title, body, row, status);
  root.replaceChildren(card);
  root.hidden = false;
  root.dataset.reason = reason;
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    status.textContent = MAINTENANCE_WORDS.checking;
    const next = await onRetry?.().catch(() => null);
    retry.disabled = false;
    if (next && next.mode !== 'maintenance') { root.hidden = true; return; }
    status.textContent = 'Still offline. The bank will be back soon.';
  });
  retry.focus?.();
  return { hide() { root.hidden = true; } };
}
