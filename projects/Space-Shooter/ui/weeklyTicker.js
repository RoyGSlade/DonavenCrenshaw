import { currentWeekly, weeklyStatus } from '../systems/weekly.js';
import { runtimeConfig } from '../runtime-config.js';
import { validateBackendUrl } from '../systems/backend.js';
import { clock } from '../systems/hubRuns.js';

export const REFRESH_MS = 60000;

// Only the public board endpoint supplies rows: the hub excludes staff/dev
// times. Never merge profile, around-me, local best or ghost data into this list.
export function tickerRows(entries) {
  return (Array.isArray(entries) ? entries : []).filter(row =>
    Number.isInteger(row?.rank) && row.rank > 0 && row.rank <= 10 &&
    typeof row.timeMs === 'number' && Number.isFinite(row.timeMs) && row.timeMs > 0 &&
    typeof (row.displayName || row.username) === 'string' && (row.displayName || row.username).trim()
  ).slice(0, 10).map(row => ({ rank: row.rank, name: row.displayName || row.username, time: clock(row.timeMs) }));
}

export async function loadWeeklyBoard(event, { config = runtimeConfig, fetchImpl = globalThis.fetch, signal } = {}) {
  let base;
  try { base = validateBackendUrl(config.backendBaseUrl); } catch { return null; }
  if (!base || !fetchImpl || signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, Math.min(10000, Math.max(100, config.requestTimeoutMs || 2500)));
  try {
    const res = await fetchImpl(`${base}/boards/${encodeURIComponent(event.id)}?limit=10`, {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    const data = res.ok ? await res.json() : null;
    return !controller.signal.aborted && Array.isArray(data?.entries) ? tickerRows(data.entries) : null;
  } catch { return null; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function initWeeklyTicker() {
  const root = document.getElementById('weekly-ticker');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const title = document.getElementById('weekly-ticker-title');
  const status = document.getElementById('weekly-ticker-status');
  const viewport = document.getElementById('weekly-ticker-viewport');
  const track = document.getElementById('weekly-ticker-track');
  const list = document.getElementById('weekly-ticker-list');
  const pause = document.getElementById('weekly-ticker-pause');
  let controller = null, generation = 0, timer = 0, checkedAt = 0, rows = [], active = true;

  function measure() {
    root.style.setProperty('--ticker-width', `${viewport.clientWidth}px`);
    root.style.setProperty('--ticker-duration', `${Math.max(24, list.scrollWidth / 35)}s`);
  }
  new ResizeObserver(measure).observe(viewport);
  function paint(next) {
    rows = next;
    track.querySelector('[data-ticker-copy]')?.remove();
    list.replaceChildren(...rows.map(row => {
      const li = document.createElement('li');
      for (const [kind, text] of [['rank', `#${row.rank}`], ['name', row.name], ['time', row.time]]) {
        const span = document.createElement('span');
        span.className = `ticker-${kind}`;
        span.textContent = text;
        li.append(span);
      }
      return li;
    }));
    if (rows.length) {
      const copy = list.cloneNode(true);
      copy.removeAttribute('id');
      copy.dataset.tickerCopy = '';
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      track.append(copy);
    }
    viewport.hidden = pause.hidden = !rows.length;
    measure();
  }
  pause.addEventListener('click', () => {
    const paused = root.dataset.paused !== 'true';
    root.dataset.paused = String(paused);
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Resume ticker' : 'Pause ticker';
  });
  function cancel() {
    generation++;
    controller?.abort();
    controller = null;
    clearTimeout(timer);
  }
  async function refresh() {
    cancel();
    if (!active || document.visibilityState === 'hidden') return;
    const mine = generation;
    const event = currentWeekly();
    const state = weeklyStatus(event).state;
    title.textContent = `WEEK ${event.week} / TOP 10`;
    if (root.dataset.event !== event.id) { paint([]); checkedAt = 0; }
    root.dataset.event = event.id;
    if (state === 'upcoming' || state === 'invalid') {
      paint([]);
      root.dataset.state = state;
      status.textContent = state === 'upcoming' ? 'Week has not opened yet.' : 'Weekly standings unavailable.';
      timer = setTimeout(refresh, REFRESH_MS);
      return;
    }
    root.dataset.state = rows.length ? 'stale' : 'loading';
    status.textContent = checkedAt ? `Updating · last checked ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading weekly standings…';
    controller = new AbortController();
    const next = await loadWeeklyBoard(event, { signal: controller.signal });
    if (mine !== generation || !active) return;
    controller = null;
    // Don't keep names cached on failures: privacy changes take effect on the
    // next read, and unavailable standings must never look like live results.
    paint(next || []);
    root.dataset.state = next === null ? 'unavailable' : next.length ? 'ready' : 'empty';
    if (next !== null) checkedAt = Date.now();
    const count = next?.length || 0;
    status.textContent = next === null ? 'Weekly board unavailable · retrying each minute.'
      : !count ? (state === 'closed' ? 'Week closed · no ranked times.' : 'No ranked times yet.')
      : `${state === 'closed' ? 'Week closed' : 'Current standings'} · ${count < 10 ? `${count} ranked ${count === 1 ? 'pilot' : 'pilots'} · ` : ''}checked ${new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    timer = setTimeout(refresh, REFRESH_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { cancel(); root.dataset.suspended = 'true'; }
    else { root.dataset.suspended = 'false'; refresh(); }
  });
  window.addEventListener('pagehide', () => { active = false; cancel(); root.dataset.suspended = 'true'; });
  window.addEventListener('pageshow', () => { if (!active) { active = true; root.dataset.suspended = 'false'; refresh(); } });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => { cancel(); paint([]); root.dataset.state = 'unavailable'; status.textContent = 'Offline · weekly standings unavailable.'; });
  refresh();
}
