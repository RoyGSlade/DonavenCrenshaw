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
  let reachable = false;
  let connecting = null;
  let generation = 0;
  let full = null;
  let splits = {};
  let challengeId = null;
  let lastRun = null;
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
      // Any real answer to the session check, even "no one", means the hub is up.
      reachable = !unreachable(session.status);
      player = session.ok ? session.data?.user ?? null : null;
      versions = info.ok && Array.isArray(info.data?.boards)
        ? Object.fromEntries(info.data.boards.map((b) => [b.board, b.version]))
        : null;
      return player;
    })().finally(() => { connecting = null; });
    return connecting;
  }

  // Opens a hub run. Resolves to { runId } or { error } saying why the time
  // can't be saved: 'guest', 'offline', 'outdated' (this build or board version
  // is no longer current; a reload fixes it), 'signed-out' or 'refused'.
  // With a challenge id the run is started against it; if the hub refuses the
  // challenge, the run is started again without it and challengeRefused says why.
  async function open(board, challenge = null) {
    if (!player) return { error: reachable ? 'guest' : 'offline' };
    if (!versions) return { error: 'offline' };
    if (!Number.isInteger(versions[board])) return { error: 'outdated' };
    const body = { board, version: versions[board], build };
    let res = await call(`${base}/runs`, { method: 'POST', body: challenge ? { ...body, challenge } : body });
    let challengeRefused = null;
    if (challenge && refusesChallenge(res)) {
      challengeRefused = res.data?.error || (res.status === 410 ? 'challenge_expired' : 'unknown_challenge');
      res = await call(`${base}/runs`, { method: 'POST', body });
    }
    if (res.ok && res.data?.runId) {
      if (!challenge) return { runId: res.data.runId };
      if (challengeRefused) return { runId: res.data.runId, challenge: null, challengeRefused };
      return { runId: res.data.runId, challenge: res.data.challenge || { id: challenge } };
    }
    if (res.status === 401) { player = null; return { error: 'signed-out' }; }
    if (res.status === 409 || res.status === 403) return { error: 'outdated' };
    return { error: unreachable(res.status) ? 'offline' : 'refused' };
  }

  // Guests get null: nothing was ever going to be saved. A signed-in player
  // whose run never opened is told why instead of being shown a false save.
  async function close(runPromise, body) {
    const { runId, error } = await runPromise;
    if (error === 'guest') return null;
    if (!runId) return { status: 'unsaved', reasons: [error] };
    const res = await call(`${base}/runs/${encodeURIComponent(runId)}/finish`, { method: 'POST', body });
    return res.ok ? res.data : { status: 'error', reasons: [res.data?.code || res.data?.error || 'unreachable'] };
  }

  return {
    // Public leaderboard rows: [{ rank, displayName, username, timeMs, setAt }].
    async board(board = 'full', limit = 5) {
      if (!base) return null;
      const res = await call(`${base}/boards/${encodeURIComponent(board)}?limit=${limit}`);
      return res.ok && Array.isArray(res.data?.entries) ? res.data.entries : null;
    },
    get player() { return player; },
    get enabled() { return Boolean(base); },
    // Whether the last connect() reached the hub at all.
    get reachable() { return reachable; },
    // The board version the hub expects, or null.
    version(board) { return Number.isInteger(versions?.[board]) ? versions[board] : null; },
    connect,

    // The signed-in player's progress (bests with full-run splits), or null.
    async profile() {
      if (!base || !player) return null;
      const res = await call(`${base}/me`);
      return res.ok && res.data && typeof res.data === 'object' ? res.data : null;
    },

    // A challenge link's details: { status, data } straight from the hub, for
    // classifyChallenge() in challenges.js. Public, so guests can read it too.
    async loadChallenge(id) {
      if (!base) return { status: 0, data: null };
      const res = await call(`${base}/challenges/${encodeURIComponent(id)}`);
      return { status: res.status, data: res.data };
    },

    // Full runs from now on are started against this challenge (null for none).
    useChallenge(id) { challengeId = id || null; },
    get challengeId() { return challengeId; },

    // The last accepted full run of this launch: { runId, timeMs }, or null.
    get lastRun() { return lastRun; },

    // Makes a challenge link from an accepted run. Resolves to { challenge }
    // or { error } with the hub's code, 'offline' or 'signed-out'.
    async createChallenge({ runId, to, parent } = {}) {
      if (!base || !player) return { error: 'signed-out' };
      if (!runId) return { error: 'not_accepted' };
      const body = { runId };
      if (to) body.to = to;
      if (parent) body.parent = parent;
      const res = await call(`${base}/challenges`, { method: 'POST', body });
      if (res.ok && res.data?.challenge?.id) return { challenge: res.data.challenge };
      if (res.status === 401) { player = null; return { error: 'signed-out' }; }
      if (unreachable(res.status)) return { error: 'offline' };
      return { error: res.data?.error || res.data?.code || 'refused' };
    },

    // A new launch from the hangar, or a restart: every open run is abandoned.
    // The hub expires abandoned runs on its own. Resolves to how the full run
    // opened ({ runId, challenge, challengeRefused } or { error }), or null.
    async startRun() {
      const mine = ++generation;
      splits = {};
      levels.clear();
      full = null;
      lastRun = null;
      if (!base) return null;
      await connect();
      if (mine !== generation) return null;
      full = open('full', challengeId);
      const started = full;
      levels.set(1, open(LEVEL_BOARDS[0]));
      const info = await started;
      return mine === generation ? info : null;
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
      const timeMs = Math.max(0, Math.round(totalMs));
      const result = await close(run, { timeMs, splits: { ...splits } });
      if (mine !== generation || !result) return null;
      // Challenges point at an accepted run, so keep its id for "Challenge a friend".
      if (result.status === 'accepted') {
        const { runId } = await run;
        lastRun = { runId: result.runId || runId, timeMs: Number.isFinite(result.timeMs) ? result.timeMs : timeMs };
      }
      return { board: 'full', ...result };
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

// No answer, a timeout, or a proxy/tunnel failure: the hub is asleep, not refusing.
function unreachable(status) {
  return !status || status >= 500;
}

// The hub turned down the challenge, not the run: unknown (404), expired (410),
// or outdated / another board (409 challenge_*). A 409 version_mismatch is the
// run itself and is not retried.
function refusesChallenge(res) {
  if (res.ok) return false;
  if (res.status === 404 || res.status === 410) return true;
  return res.status === 409 && String(res.data?.error || '').startsWith('challenge_');
}

const REASONS = {
  'below-floor': 'faster than the circuit allows',
  'longer-than-elapsed': 'longer than the run has existed',
  'splits-exceed-total': 'circuit times add up to more than the run',
  'unknown-fragment': 'unrecognised shard',
};

// Why a signed-in player's run was never opened on the hub.
const UNSAVED = {
  offline: 'the leaderboard was offline, so this time wasn’t saved.',
  outdated: 'this copy of the game is out of date. Reload the page to race for the leaderboard.',
  'signed-out': 'you were signed out, so this time wasn’t saved. Sign in again to race for the leaderboard.',
  refused: 'the leaderboard didn’t accept this run, so the time wasn’t saved.',
};

// One line for the player about a saved result.
export function describeResult(result, name) {
  if (!result) return null;
  if (result.status === 'accepted') {
    const rank = result.best?.rank ? ` · #${result.best.rank}` : '';
    return result.personalBest ? `${name}: new best ${clock(result.timeMs)}${rank}` : `${name}: saved ${clock(result.timeMs)}${rank}`;
  }
  if (result.status === 'unsaved') return `${name}: ${UNSAVED[result.reasons?.[0]] || UNSAVED.refused}`;
  if (result.status === 'error') return `${name}: couldn’t reach the leaderboard; this time wasn’t saved.`;
  const why = (result.reasons || []).map((reason) => REASONS[reason] || reason).join('; ');
  return `${name}: time not counted${why ? ` (${why})` : ''}.`;
}
