// Saved runs. Signed-in players' times go to the hub's leaderboards; guests
// play exactly as before and nothing leaves the browser.
//
// Each launch opens two kinds of hub run: one for the whole five-circuit
// network (board "full") and one per circuit. The hub times every run from
// the moment it is opened and refuses a time longer than that, or faster than
// the circuit's floor, so the game only has to report what its clock says.
// Nothing here can stop or slow the game: every call is best-effort.
import { runtimeConfig } from '../runtime-config.js';
import { validateBackendUrl } from './backend.js';

// Level n of the game is LEVEL_BOARDS[n - 1] on the hub, in rules.json order.
export const LEVEL_BOARDS = ['alpha-relay', 'beacon-prime', 'dustfall-station', 'nether-crossing', 'iron-veil'];

export function createRunRecorder({ config = runtimeConfig, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  let base = null;
  try { base = validateBackendUrl(config.backendBaseUrl); } catch { base = null; }
  const origin = base ? new URL(base).origin : null;
  const build = config.build || 'stardust-dev';
  const timeoutMs = Math.min(10000, Math.max(500, config.requestTimeoutMs || 2500));

  let player = null;
  let versions = null;
  let connecting = null;
  let generation = 0;
  let full = null;
  let splits = {};
  const levels = new Map();

  async function call(url, { method = 'GET', body } = {}) {
    if (!fetchImpl) return { ok: false, status: 0, data: null };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(url, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* empty body */ }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Who is flying, and which board versions the hub expects. Safe to call often.
  function connect() {
    if (!base) return Promise.resolve(null);
    connecting ??= (async () => {
      const [session, info] = await Promise.all([call(`${origin}/api/users/session`), call(base)]);
      player = session.ok ? session.data?.user ?? null : null;
      versions = info.ok && Array.isArray(info.data?.boards)
        ? Object.fromEntries(info.data.boards.map((b) => [b.board, b.version]))
        : null;
      return player;
    })().finally(() => { connecting = null; });
    return connecting;
  }

  async function open(board) {
    if (!player || !versions || !Number.isInteger(versions[board])) return null;
    const res = await call(`${base}/runs`, { method: 'POST', body: { board, version: versions[board], build } });
    if (res.status === 401) player = null;
    return res.ok ? res.data?.runId ?? null : null;
  }

  async function close(runPromise, body) {
    const runId = await runPromise;
    if (!runId) return null;
    const res = await call(`${base}/runs/${encodeURIComponent(runId)}/finish`, { method: 'POST', body });
    return res.ok ? res.data : { status: 'error', reasons: [res.data?.code || res.data?.error || 'unreachable'] };
  }

  return {
    get player() { return player; },
    get enabled() { return Boolean(base); },
    connect,

    // A new launch from the hangar, or a restart: every open run is abandoned.
    // The hub expires abandoned runs on its own.
    async startRun() {
      const mine = ++generation;
      splits = {};
      levels.clear();
      full = null;
      await connect();
      if (mine !== generation) return;
      full = open('full');
      levels.set(1, open(LEVEL_BOARDS[0]));
    },

    // Circuits after the first open as the previous one finishes.
    startLevel(level) {
      const board = LEVEL_BOARDS[level - 1];
      if (!board) return;
      levels.set(level, open(board));
    },

    // Returns the hub's verdict for this circuit, or null for guests.
    async finishLevel(level, elapsedMs) {
      const board = LEVEL_BOARDS[level - 1];
      const run = levels.get(level);
      if (!board || !run) return null;
      const mine = generation;
      const timeMs = Math.max(0, Math.round(elapsedMs));
      splits[board] = timeMs;
      levels.delete(level);
      const result = await close(run, { timeMs });
      return mine === generation && result ? { board, ...result } : null;
    },

    async finishRun(totalMs) {
      if (!full) return null;
      const mine = generation;
      const run = full;
      full = null;
      const result = await close(run, { timeMs: Math.max(0, Math.round(totalMs)), splits: { ...splits } });
      return mine === generation && result ? { board: 'full', ...result } : null;
    },

    abandon() {
      generation += 1;
      full = null;
      splits = {};
      levels.clear();
    },
  };
}

// "1:23.45" from milliseconds.
export function clock(ms) {
  const t = Math.max(0, Math.round(Number(ms) || 0));
  const two = (n) => String(n).padStart(2, '0');
  return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
}

const REASONS = {
  'below-floor': 'faster than the circuit allows',
  'longer-than-elapsed': 'longer than the run has existed',
  'splits-exceed-total': 'circuit times add up to more than the run',
  'unknown-fragment': 'unrecognised shard',
};

// One line for the player about a saved result.
export function describeResult(result, name) {
  if (!result) return null;
  if (result.status === 'accepted') {
    const rank = result.best?.rank ? ` · #${result.best.rank}` : '';
    return result.personalBest ? `${name}: new best ${clock(result.timeMs)}${rank}` : `${name}: saved ${clock(result.timeMs)}${rank}`;
  }
  if (result.status === 'error') return `${name}: couldn’t reach the leaderboard; this time wasn’t saved.`;
  const why = (result.reasons || []).map((reason) => REASONS[reason] || reason).join('; ');
  return `${name}: time not counted${why ? ` (${why})` : ''}.`;
}
