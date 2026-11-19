// The nine mini-game stations, pure. Each station is a check (skill, stat, tag) the real d20 rolls with the test character's
// real level, then the roll's tier and the character's category points set the mini-game up (the same setup.js functions the
// scene hooks and the gym use), and a finished game pays real XP into the skill (state.js earnXp). DOM lives in games.js.
import { check } from '../character.js';
import { ROLL_SKILLS } from '../data.js';
import { tierOf, tierInfo } from '../minigames/setup.js';
import { GYM_GAMES, gymGame } from '../minigames/gym.js';
import { hackSetup } from '../minigames/hack.js';
import { rollPreview } from '../minigames/rollPreview.js';
import { cleanSkillPoints } from '../minigames/picker.js';
import { characterOf, earnXp } from './state.js';

const SKILL_NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));

/** The nine stations, in room order. `prop` is the interact id in workbench.json; `check` is what the d20 rolls. */
export const STATIONS = Object.freeze([
  { id: 'repair', name: 'Repair bench', skill: 'repair', stat: 'wis', tag: 'repair', word: 'REPAIR', title: 'Coolant line' },
  { id: 'hack', name: 'Hacking bench', skill: 'hacking', stat: 'wis', tag: 'hack', word: 'BYPASS', title: 'Bench lock', lock: 2 },
  { id: 'craft', name: 'Crafting bench', skill: 'crafting', stat: 'dex', tag: 'craft', word: 'CRAFT', title: 'Fitting' },
  { id: 'nav', name: 'Navigation table', skill: 'navigation', stat: 'wis', tag: 'scan', word: 'NAVIGATE', title: 'Lane run' },
  { id: 'pilot', name: 'Flight console', skill: 'piloting', stat: 'dex', tag: 'nav', word: 'TOUCHDOWN', title: 'Hangar pad' },
  { id: 'stealth', name: 'Shadow lane', skill: 'stealth', stat: 'dex', tag: 'sneak', word: 'SLIP PAST', title: 'Cargo hold' },
  { id: 'persuade', name: 'Parley desk', skill: 'social', stat: 'cha', tag: 'talk', word: 'PERSUADE', title: 'Dock clerk', who: 'the dock clerk', what: 'let you through' },
  { id: 'intimidate', name: 'Standoff door', skill: 'social', stat: 'cha', tag: 'bluff', word: 'INTIMIDATE', title: 'Cinder Reaver', who: 'the Cinder Reaver', what: 'stand down' },
  { id: 'haggle', name: 'Trade counter', skill: 'social', stat: 'cha', tag: 'trade', word: 'HAGGLE', title: 'Trade counter', who: 'the trader', what: 'the price', open: 20, best: 30 },
].map((s) => Object.freeze({ ...s, prop: `wb-${s.id}`, prompt: `Try ${s.id}` })));
export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
export const stationOfProp = (prop) => STATIONS.find((s) => s.prop === prop) || null;

/** The check spec the d20 rolls for a station at a difficulty. */
export const specOf = (station, dc) => ({ skill: station.skill, stat: station.stat, tag: station.tag, dc });

/** One real d20 attempt for the station with the test character's real level (rng() in [0, 1)). */
export function rollStation(state, station, rng = Math.random) {
  return check(characterOf(state), specOf(station, state.dc), rng);
}

/** The level and cleaned category points the games read for a skill. */
export function loadoutOf(state, skill) {
  const level = state.progress.levels[skill];
  return { level, points: cleanSkillPoints(skill, state.progress.points[skill], level) };
}

/**
 * Everything the page needs to open a station's game after the d20: the tier, the setup (level and points applied) and the
 * preview line ("Smooth roll: 15 s more...") with how far the next tier is. `attempt` is the check's attempt (total, dc, natural).
 */
export function startStation(state, station, attempt) {
  const { level, points } = loadoutOf(state, station.skill);
  const tier = tierOf(attempt);
  const game = gymGame(station.id);
  const setup = station.id === 'hack' ? hackSetup({ tier, level, points, lock: station.lock }) : game.setup({ tier, level, points });
  const preview = rollPreview(station.id, attempt, { level, points });
  return { station, tier, label: tierInfo(tier).label, setup, level, points, preview };
}

/** A plain-words line for the dice tray's preview slot. */
export const previewLine = (start) => (start.preview ? `${start.preview.line} ${start.preview.nextLine}` : '');

/**
 * Settle a finished game: real XP into the skill, haggle's price into credits. `result` is what the game resolved with
 * ({ success, xp, outcome?, price? }). Returns { state, xp, gained, credits, said }.
 */
export function settleStation(state, station, result) {
  const earned = earnXp(state, station.skill, result?.xp);
  let next = earned.state;
  let credits = 0;
  if (station.id === 'haggle' && result?.outcome !== 'walked' && Number.isFinite(result?.price) && result.price > 0) {
    credits = Math.trunc(result.price);
    next = { ...next, credits: next.credits + credits };
  }
  const name = SKILL_NAME[station.skill];
  const won = station.id === 'haggle' ? result?.outcome !== 'walked' : Boolean(result?.success);
  const parts = [won ? `${station.id[0].toUpperCase()}${station.id.slice(1)}: you did it.` : `${station.id[0].toUpperCase()}${station.id.slice(1)}: not this time.`];
  parts.push(earned.xp ? `+${earned.xp} ${name} XP.` : 'No XP this time.');
  if (earned.gained) parts.push(`${name} is now level ${next.progress.levels[station.skill]}.`);
  if (credits) parts.push(`+${credits} credits.`);
  return { state: { ...next, said: parts.join(' ') }, xp: earned.xp, gained: earned.gained, credits, said: parts.join(' ') };
}

export const GAME_IDS = Object.freeze(GYM_GAMES.map((g) => g.id));
