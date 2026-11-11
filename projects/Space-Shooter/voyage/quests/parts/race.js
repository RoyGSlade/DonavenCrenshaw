// Race leg: a quest step on one of today's tracks. The rival's time comes from
// the racing game's own test pilot (engine/weekly/pilot.js flyWeeklyLap) on the
// real layout, scaled by the rival's rolled pace, so the target is a real time
// on a real track. The page can fly the race live (today's racing code, the
// "race" activity: no board is written) and report the time with
// { type: 'live', timeMs, finished }, or resolve it quickly with a check.
import { check } from '../core.js';
import { TRACKS } from '../data/tracks.js';

export function createRace(params) {
  const track = TRACKS[params.track];
  if (!track) throw new Error(`Unknown race track: ${params.track}`);
  const rival = params.rival || { name: 'Rival', pace: 0.9 };
  return {
    kind: 'race',
    track: params.track,
    rival: { name: rival.name, pace: rival.pace },
    targetMs: Math.round(track.pilotMs * rival.pace),
    log: [],
    done: false,
    outcome: null,
    timeMs: null,
  };
}

export function viewRace(state) {
  const track = TRACKS[state.track];
  return {
    title: `Race: ${track.title}`,
    track: { id: state.track, title: track.title, weekly: track.weekly },
    rival: { ...state.rival },
    targetMs: state.targetMs,
    live: { kind: 'race', activity: 'race', weekly: track.weekly, targetMs: state.targetMs },
    moves: [
      { id: 'clean', label: 'Fly a clean line (Dexterity, 8+)' },
      { id: 'push', label: 'Push it (Dexterity, 7+, a miss scrapes the hull)' },
    ],
    log: [...state.log],
    timeMs: state.timeMs,
    done: state.done,
    outcome: state.outcome,
  };
}

const seconds = ms => `${(ms / 1000).toFixed(2)} s`;

export function actRace(state, action, ctx) {
  if (state.done) return { state };
  if (action?.type === 'live') {
    if (!Number.isFinite(action.timeMs) || action.timeMs <= 0) return { state, error: 'No time reported' };
    state.timeMs = Math.round(action.timeMs);
    const won = action.finished !== false && state.timeMs <= state.targetMs;
    state.log.push(`You crossed in ${seconds(state.timeMs)}. ${state.rival.name}: ${seconds(state.targetMs)}.`);
    state.done = true; state.outcome = won ? 'win' : 'lose';
    return { state };
  }
  if (action?.type !== 'quick' || !['clean', 'push'].includes(action.style)) return { state, error: 'Unknown move' };
  const push = action.style === 'push';
  const r = check(ctx.save.character, { stat: 'dex', tag: 'nav', dc: push ? 7 : 8 }, ctx.rng.next);
  // A quick race still reports a believable time either side of the rival's.
  const spread = (r.total - r.dc) * 0.015;
  state.timeMs = Math.round(state.targetMs * (1 - spread));
  if (!r.pass && push) {
    ctx.run.hull = Math.max(1, ctx.run.hull - 8);
    state.log.push('You clip a rail. 8 hull.');
  }
  if (r.pass && state.timeMs > state.targetMs) state.timeMs = state.targetMs - 10;
  if (!r.pass && state.timeMs <= state.targetMs) state.timeMs = state.targetMs + 10;
  state.log.push(`Roll ${r.roll}+${r.bonus} vs ${r.dc}. You: ${seconds(state.timeMs)}. ${state.rival.name}: ${seconds(state.targetMs)}.`);
  state.done = true; state.outcome = r.pass ? 'win' : 'lose';
  return { state };
}
