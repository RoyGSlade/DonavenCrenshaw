// The tutorial's saved progress and the unlock gate every lane reads. Pure: a
// save in, answers out. The block lives at save.story (core's cleanSave keeps
// unknown top-level keys as they came; cleanStory repairs it here).
// ROUND2-CONTRACT.md section 4.
import { STEPS, STEP_IDS, STEP_BY_ID, ALL_UNLOCKS, UNLOCK_ID, TALKS } from './tutorial.js';
import { CAST, GIVER_CAST } from './cast.js';
import { lineById } from './lines.js';

export const STORY_VERSION = 1;
const STEP_SET = new Set(STEP_IDS);
const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const uniq = (list, ok) => (Array.isArray(list) ? [...new Set(list.filter((x) => typeof x === 'string' && ok(x)))] : []);

export function freshStory() {
  return { v: STORY_VERSION, step: STEPS[0].id, done: [], unlocks: [], paid: [], choices: {}, finished: false, skipped: false };
}

/** Any value -> a valid story block. */
export function cleanStory(input) {
  const s = plain(input) ? input : {};
  const out = freshStory();
  out.done = uniq(s.done, (id) => STEP_SET.has(id));
  out.paid = uniq(s.paid, (id) => STEP_SET.has(id) && Boolean(STEP_BY_ID.get(id).reward));
  out.unlocks = uniq(s.unlocks, (id) => UNLOCK_ID.test(id));
  out.finished = s.finished === true;
  out.skipped = out.finished && s.skipped === true;
  out.step = out.finished ? null : (STEP_SET.has(s.step) ? s.step : (STEPS.find((st) => !out.done.includes(st.id))?.id || STEPS[0].id));
  if (plain(s.choices)) {
    for (const [talk, i] of Object.entries(s.choices)) {
      if (TALKS[talk] && Number.isInteger(i) && i >= 0 && i < TALKS[talk].options.length) out.choices[talk] = i;
    }
  }
  return out;
}

/**
 * The story block of a save. A save with a captain but no block played the
 * slice before the tutorial existed: it counts as finished with everything
 * open (`legacy: true`, not saved until the director writes).
 */
export function storyOf(save) {
  if (plain(save?.story)) return cleanStory(save.story);
  if (save?.character) return { ...freshStory(), step: null, finished: true, legacy: true, unlocks: [...ALL_UNLOCKS] };
  return freshStory();
}

/** Is this part of the game open yet? Gate your UI with it (unlock ids: ROUND2-CONTRACT.md section 4). */
export function isUnlocked(save, id) {
  const s = storyOf(save);
  return s.finished || s.unlocks.includes(id);
}

/** The step the player is on, or null when the tutorial is over. */
export function currentStep(save) {
  const s = storyOf(save);
  return s.finished ? null : STEP_BY_ID.get(s.step) || null;
}

/** The objective for a step: { step, text, station, target }, or null when the step asks nothing. */
export function objectiveFor(step) {
  if (!step?.objective) return null;
  return { step: step.id, text: step.objective, station: step.station || null, target: step.target || null };
}

/** The quest givers this save has met, in tutorial order. */
export function metGivers(save) {
  return GIVER_CAST.filter((g) => (save?.flags?.[`met-${g}`] || 0) > 0 || isUnlocked(save, `giver:${g}`));
}

/** How far along: { done, total, leg } for a progress bar. */
export function progressOf(save) {
  const s = storyOf(save);
  return { done: s.finished ? STEPS.length : s.done.length, total: STEPS.length, leg: s.finished ? null : STEP_BY_ID.get(s.step)?.leg || null };
}

const IDLE_PREFIX = { hask: 'greet', vey: 'greet', garrity: 'greet' };
const STATION_OF = { mel: 'station:locker', edna: 'station:backroom' };

/**
 * What someone says when you talk to them and the tutorial isn't waiting on
 * them: their "not yet" line while their station is locked, else one of their
 * idle lines (n picks which, e.g. a talk counter). null for an unknown id.
 */
export function idleLine(castId, save, n = 0) {
  if (!CAST[castId]) return null;
  if (STATION_OF[castId] && !isUnlocked(save, STATION_OF[castId]) && lineById(`${castId}.locked.1`)) return `${castId}.locked.1`;
  const prefix = IDLE_PREFIX[castId] || 'idle';
  const ids = [];
  for (let i = 1; lineById(`${castId}.${prefix}.${i}`); i++) ids.push(`${castId}.${prefix}.${i}`);
  if (!ids.length) return null;
  return ids[Math.abs(Math.trunc(n)) % ids.length];
}
