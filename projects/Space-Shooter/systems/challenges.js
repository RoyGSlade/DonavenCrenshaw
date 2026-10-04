// Challenges, splits and finish breakdowns: the words and numbers only. No
// DOM and no network here, so every line the player reads can be tested.
// The hub contract is docs/game/FRIENDS_CHALLENGES.md.
import { clock } from './hubRuns.js';

// Circuit names by hub board id, in race order.
export const CIRCUITS = [
  ['alpha-relay', 'Alpha Relay'],
  ['beacon-prime', 'Beacon Prime'],
  ['dustfall-station', 'Dustfall Station'],
  ['nether-crossing', 'Nether Crossing'],
  ['iron-veil', 'Iron Veil'],
];
const CIRCUIT_NAME = Object.fromEntries(CIRCUITS);

const MINUS = '−';
const two = (n) => String(n).padStart(2, '0');
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

export function pilotName(pilot) {
  return pilot?.displayName || pilot?.username || 'another pilot';
}

// ?challenge=<id> from the page URL, or null. Ids are opaque to the game, so
// only their shape is checked: uuid-like characters, sensibly short.
export function parseChallengeId(search) {
  let raw = null;
  try { raw = new URLSearchParams(search || '').get('challenge'); } catch { return null; }
  const id = (raw || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(id) ? id : null;
}

// Whole centiseconds as "0.84" or "1:02.10".
function centis(cs) {
  const s = Math.floor(cs / 100);
  const c = cs % 100;
  return s < 60 ? `${s}.${two(c)}` : `${Math.floor(s / 60)}:${two(s % 60)}.${two(c)}`;
}

// A signed difference: "−0.84" is faster, "+1.20" slower, "±0.00" level.
export function formatDelta(ms) {
  if (!finite(ms)) return '';
  const cs = Math.round(Math.abs(ms) / 10);
  return `${cs === 0 ? '±' : ms < 0 ? MINUS : '+'}${centis(cs)}`;
}

// An unsigned gap: "3.10 s", or "1:02.10" once it reaches a minute.
export function formatGap(ms) {
  const cs = Math.round(Math.abs(Number(ms) || 0) / 10);
  return cs < 6000 ? `${centis(cs)} s` : centis(cs);
}

// "Alpha Relay 0:41.23 · −0.84 PB · +1.20 Nova". Missing references are left
// out rather than guessed.
export function splitLine({ board, timeMs, pbMs, targetMs, targetName }) {
  const parts = [`${CIRCUIT_NAME[board] || 'Circuit'} ${clock(timeMs)}`];
  if (finite(pbMs)) parts.push(`${formatDelta(timeMs - pbMs)} PB`);
  if (finite(targetMs)) parts.push(`${formatDelta(timeMs - targetMs)} ${targetName || 'target'}`);
  return parts.join(' · ');
}

// Sums a reference's splits over the circuits flown so far, or null when any
// of them is unknown.
export function referenceSoFar(splits, reference) {
  if (!reference) return null;
  let sum = 0;
  for (const board of Object.keys(splits || {})) {
    if (!finite(reference[board])) return null;
    sum += reference[board];
  }
  return sum;
}

// "Running 1:22.40 · −0.40 Nova (ahead)", or null without a target.
export function runningLine({ totalMs, targetMs, targetName }) {
  if (!finite(totalMs) || !finite(targetMs)) return null;
  const d = totalMs - targetMs;
  const cs = Math.round(Math.abs(d) / 10);
  const where = cs === 0 ? 'level' : d < 0 ? 'ahead' : 'behind';
  return `Running ${clock(totalMs)} · ${formatDelta(d)} ${targetName || 'target'} (${where})`;
}

// Rows for the finish table. pb and target are { timeMs, splits } (target
// also has name); either may be null. A column appears only when it has at
// least one number in it.
export function breakdownRows({ splits = {}, totalMs, pb = null, target = null }) {
  const delta = (value, ref) => (finite(value) && finite(ref) ? value - ref : null);
  const rows = CIRCUITS.filter(([board]) => finite(splits[board])).map(([board, name]) => ({
    board,
    name,
    timeMs: splits[board],
    pb: delta(splits[board], pb?.splits?.[board]),
    target: delta(splits[board], target?.splits?.[board]),
  }));
  const total = { name: 'Total', timeMs: totalMs, pb: delta(totalMs, pb?.timeMs), target: delta(totalMs, target?.timeMs) };
  const has = (key) => rows.some((row) => row[key] !== null) || total[key] !== null;
  return { rows, total, columns: { pb: has('pb'), target: has('target') }, targetName: target?.name || 'Target' };
}

// "Nova", "Nova and Vega", "Nova, Vega and Rook", "Nova, Vega, Rook and 2 more".
export function nameList(pilots) {
  const names = (pilots || []).map(pilotName);
  if (names.length <= 1) return names[0] || '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

const MEDAL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

// How this run went against a challenge target.
export function challengeOutcome({ timeMs, targetMs, pilot }) {
  if (!finite(timeMs) || !finite(targetMs)) return null;
  const who = pilotName(pilot);
  const d = targetMs - timeMs;
  if (Math.round(d / 10) === 0 && d <= 0) return `You matched ${who}’s ${clock(targetMs)}. A tie doesn’t beat it.`;
  return d > 0
    ? `You beat ${who}’s ${clock(targetMs)} by ${formatGap(d)}.`
    : `${formatGap(-d)} short of ${who}’s ${clock(targetMs)}.`;
}

// The end-of-run summary for an accepted full run: one headline plus the lines
// the hub gave us material for. Only a real personal best is celebrated.
export function finishSummary(result) {
  if (result?.status !== 'accepted') return null;
  const rank = result.best?.rank;
  const before = result.rankBefore;
  let headline;
  if (result.personalBest) {
    headline = `New personal best: ${clock(result.timeMs)}.`;
    if (rank && before && rank < before) headline += ` Up from #${before} to #${rank} on the full network.`;
    else if (rank && before === rank) headline += ` Still #${rank} on the full network.`;
    else if (rank) headline += ` #${rank} on the full network.`;
  } else if (rank && finite(result.best?.timeMs)) {
    headline = `Saved ${clock(result.timeMs)}. Your best is still ${clock(result.best.timeMs)}, #${rank} on the full network.`;
  } else {
    headline = `Saved ${clock(result.timeMs)} to the full-network board.`;
  }

  const lines = [];
  if (result.verification === 'provisional' || result.rewardEligible === false) lines.push('Provisional time: gameplay is not verified. New account rewards are paused.');
  const friends = result.friends;
  if (friends) {
    if (result.personalBest && friends.overtaken?.length) lines.push(`You passed ${nameList(friends.overtaken)}.`);
    if (friends.rank && friends.of) lines.push(`Friends: ${friends.rank} of ${friends.of}`);
    if (friends.next && finite(friends.next.gapMs)) lines.push(`Next: ${pilotName(friends.next)}, ${formatGap(friends.next.gapMs)} faster`);
    else if (friends.rank === 1 && friends.of > 1) lines.push('You lead your friends.');
  }
  const medal = result.medal;
  if (medal?.gauntlet) {
    // The network medal is the best medal held on most circuits.
    const held = medal.earned ? medal.circuits?.[medal.earned] : null;
    if (medal.earned) lines.push(`Network medal: ${MEDAL[medal.earned] || medal.earned}${Number.isInteger(held) ? ` (${held} of ${CIRCUITS.length} circuits)` : ''}.`);
    const need = medal.next?.circuitsNeeded;
    if (Number.isInteger(need) && need > 0) lines.push(`Next network medal: ${MEDAL[medal.next.medal] || medal.next.medal} on ${need} more circuit${need === 1 ? '' : 's'}.`);
  } else if (medal) {
    if (medal.earned && medal.improved) lines.push(`${MEDAL[medal.earned] || medal.earned} medal earned.`);
    else if (medal.earned) lines.push(`Your medal: ${MEDAL[medal.earned] || medal.earned}.`);
    if (medal.next && finite(medal.next.gapMs)) lines.push(`Next medal: ${MEDAL[medal.next.medal] || medal.next.medal}, ${formatGap(medal.next.gapMs)} faster.`);
  }
  const unlocked = (result.achievements || []).map((a) => a?.name).filter(Boolean);
  if (unlocked.length) lines.push(`Achievement${unlocked.length > 1 ? 's' : ''}: ${unlocked.join(', ')}.`);
  const challenge = result.challenge;
  if (challenge) {
    const line = challengeOutcome({ timeMs: result.timeMs, targetMs: challenge.targetMs, pilot: challenge.pilot || challenge.from });
    if (line) lines.push(line);
  }
  return { headline, lines };
}

// Maps GET /challenges/:id to a state the hangar can explain.
// active | expired | outdated | unsupported | missing | offline | unavailable
export function classifyChallenge(status, data) {
  if (!status || status >= 500) return { state: 'offline', challenge: null };
  if (status === 404) return { state: 'missing', challenge: null };
  if (status < 200 || status >= 300 || !data?.id) return { state: 'unavailable', challenge: null };
  if (data.status === 'expired') return { state: 'expired', challenge: data };
  if (data.status === 'outdated') return { state: 'outdated', challenge: data };
  if (data.board !== 'full') return { state: 'unsupported', challenge: data };
  if (data.status !== 'active' || !finite(data.target?.timeMs)) return { state: 'unavailable', challenge: data };
  return { state: 'active', challenge: data };
}

// The hangar line for a challenge link. signIn: the page follows the text
// with "Sign in for this attempt to count." (Sign in being a link).
export function challengeNote({ state, challenge }, { signedIn = false } = {}) {
  const from = pilotName(challenge?.from);
  switch (state) {
    case 'active': {
      const pilot = challenge.target.pilot;
      const time = clock(challenge.target.timeMs);
      const chase = pilot?.username && challenge.from?.username && pilot.username !== challenge.from.username;
      let text = challenge.viewer?.isCreator
        ? `Your challenge link: ${pilotName(pilot)}’s ${time} on the full network.`
        : chase
          ? `Challenge from ${from}: chase down ${pilotName(pilot)}’s ${time} on the full network.`
          : `Challenge from ${from}: beat ${pilotName(pilot)}’s ${time} on the full network.`;
      const viewer = challenge.viewer;
      if (viewer?.beaten && finite(viewer.bestMs)) text += ` You’ve beaten it already (${clock(viewer.bestMs)}).`;
      else if (finite(viewer?.bestMs)) text += ` Your best try: ${clock(viewer.bestMs)}.`;
      return { text, signIn: !signedIn };
    }
    case 'expired':
      return { text: `This challenge from ${from} has expired. You can still fly the full network; ask for a fresh link to race it.`, signIn: false };
    case 'outdated':
      return { text: 'This challenge was set on an older version of the network, so it no longer counts. You can still fly.', signIn: false };
    case 'unsupported':
      return { text: 'This challenge is for a board the game doesn’t race challenges on yet. You can still fly.', signIn: false };
    case 'missing':
      return { text: 'That challenge link doesn’t exist or is no longer available. You can still fly.', signIn: false };
    case 'offline':
      return { text: 'The leaderboard is offline, so this challenge can’t be loaded right now. You can still fly.', signIn: false };
    default:
      return { text: 'This challenge couldn’t be loaded right now. You can still fly.', signIn: false };
  }
}

// Why the hub wouldn't start a run against the challenge. The run is still
// recorded as a normal one.
const REFUSED = {
  unknown_challenge: 'That challenge is no longer available',
  challenge_expired: 'This challenge has expired',
  challenge_outdated: 'This challenge is from an older version of the network',
  challenge_board: 'This challenge is for a different board',
};
export function refusalText(code) {
  return `${REFUSED[code] || 'The challenge couldn’t be applied'}, so this run counts as a normal run.`;
}

// Hangar state after the hub refused the challenge at start.
export function refusalState(code) {
  return { challenge_expired: 'expired', challenge_outdated: 'outdated', challenge_board: 'unsupported' }[code] || 'missing';
}

// Why a challenge link couldn't be made. Nothing was created.
const CREATE_ERRORS = {
  offline: 'Couldn’t reach the leaderboard, so no link was made. Try again in a moment.',
  'signed-out': 'You were signed out, so no link was made. Sign in again and fly another run.',
  outdated: 'This run is from an older version of the network, so it can’t be sent as a challenge.',
  not_accepted: 'This run wasn’t accepted on the board, so it can’t be sent as a challenge.',
  too_many_challenges: 'That’s the daily limit for challenge links. Try again tomorrow.',
  not_friends: 'You can only send a challenge straight to a friend.',
  blocked: 'That pilot can’t receive challenges from you.',
  no_user: 'That pilot no longer exists.',
};
export function createErrorText(code) {
  return CREATE_ERRORS[code] || 'The leaderboard didn’t make a link for this run.';
}

// The public challenge page lives at /stardust/challenge/ on the site; the
// game at /games/stardust/. Built from the page's own address so previews and
// the live site both link to themselves.
export function challengeLink(id, baseURI) {
  return new URL(`../../stardust/challenge/?c=${encodeURIComponent(id)}`, baseURI).href;
}

export function challengeMessage(timeMs, link) {
  return `Beat my Stardust time: ${clock(timeMs)} on the full network → ${link}`;
}
