// The skills menu's rules and numbers (skills-menu lane, 2026-11-18). Pure: no DOM, no clock.
// Every number on the page comes from somewhere that already owns it: the effect words from the
// mini-games' setups (minigames/picker.js), levels, XP and points from the skill save
// (skillSave.js `toProgress`), the risk from the last scan, the prices from the gym and the nap.
//
// Points you add on the page are PENDING (not saved) until Lock in. "-" takes back only pending
// points. After a lock, points come back only with a nap at the bunk (datapad/nap.js).
import { ROLL_SKILL_IDS, SKILL_CATEGORY_IDS, POINT_MAX, LEVEL_MAX } from '../data.js';
import { CATEGORIES } from '../minigames/picker.js';
import { xpToNext, unscanned } from '../minigames/progress.js';
import { GYM, gymGamesFor } from '../minigames/gym.js';
import { cleanSkillPoints } from '../minigames/picker.js';

export const SKILL_ORDER = Object.freeze([...ROLL_SKILL_IDS]);
export const SCAN_COST = 40;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Each skill as the design draws it: colour, emblem (24x24 line path), words, its game, its three paths. */
export const SKILL_UI = Object.freeze({
  shooting: { name: 'Shooting', short: 'Shoot', color: '#FF7A59', icon: 'M12 2v5M12 17v5M2 12h5M17 12h5M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    tagline: 'Pure aim, no mini-game. Points make the gun kinder: faster reloads, more rounds, a tighter spray.',
    game: 'Firing range', gameLine: 'Shooting has no mini-game. Your hands are the skill; the points tune the gun.',
    cats: [{ id: 'reload', name: 'Faster reload' }, { id: 'ammo', name: 'Bigger magazine' }, { id: 'spray', name: 'Tighter spray' }] },
  piloting: { name: 'Piloting', short: 'Pilot', color: '#4FC3F7', icon: 'M12 2l7 19-7-4-7 4z',
    tagline: 'Flying by hand: drifting, burning fuel well, putting her down soft.',
    game: 'Touchdown', gameLine: 'Bring a falling ship down on the pad in a crosswind.',
    cats: [{ id: 'handling', name: 'Handling' }, { id: 'boost', name: 'Boost' }, { id: 'landing', name: 'Landing' }] },
  stealth: { name: 'Stealth', short: 'Stealth', color: '#9C8CFF', icon: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM4 4l16 16',
    tagline: 'Getting past people who are paid to see you.',
    game: 'Shadow slip', gameLine: 'Step or wait, beat by beat, past guards whose sightlines you can see.',
    cats: [{ id: 'quiet', name: 'Quiet steps' }, { id: 'range', name: 'Smaller sightlines' }, { id: 'decay', name: 'Cool off' }] },
  hacking: { name: 'Hacking', short: 'Hack', color: '#3DDC97', icon: 'M8 8h8v8H8zM12 3v5M12 16v5M3 12h5M16 12h5',
    tagline: 'Doors, locks, terminals. Anything with a circuit and an opinion.',
    game: 'Bypass ring', gameLine: 'Splice each tumbler when the sweep crosses the lit window.',
    cats: [{ id: 'time', name: 'Time' }, { id: 'size', name: 'Fewer tumblers' }, { id: 'retries', name: 'Spare misses' }] },
  repair: { name: 'Repair', short: 'Repair', color: '#5EE6E6', icon: 'M14.5 4a4.5 4.5 0 0 0 4.9 6.1L11 18.5a2.1 2.1 0 0 1-3-3l8.4-8.4A4.5 4.5 0 0 0 14.5 4z',
    tagline: 'Pipes, leaks, patches. Keeping a ship that should be scrap in one piece.',
    game: 'Coolant line', gameLine: 'Close every pipe end before the leak pool fills. No open ends allowed.',
    cats: [{ id: 'time', name: 'Bigger pool' }, { id: 'size', name: 'Smaller board' }, { id: 'quality', name: 'Patch quality' }] },
  crafting: { name: 'Crafting', short: 'Craft', color: '#FFB547', icon: 'M4 20l9-9M14 4l6 6-3 3-6-6zM11 9l4 4',
    tagline: 'Heat it, shape it, sell it. Parts you make yourself.',
    game: 'Heat and shape', gameLine: 'Hold to heat, let go in the band, then shape rough to fine.',
    cats: [{ id: 'quality', name: 'Quality' }, { id: 'speed', name: 'Speed' }, { id: 'material', name: 'Less scrap' }] },
  social: { name: 'Social', short: 'Social', color: '#FF8AC4', icon: 'M4 5h16v10H9l-5 4z',
    tagline: 'Talking people into it, out of it, or down on price.',
    game: 'Read the room · Stare down · Haggle', gameLine: 'Three games: pick the right arguments, push your luck, or name your price.',
    cats: [{ id: 'persuade', name: 'Persuade' }, { id: 'intimidate', name: 'Intimidate' }, { id: 'haggle', name: 'Haggle' }] },
  navigation: { name: 'Navigation', short: 'Nav', color: '#C8E06B', icon: 'M12 2l3 10-3 10-3-10zM2 12h20',
    tagline: 'Plotting a lane that gets you there with fuel to spare.',
    game: 'Plot the lane', gameLine: 'Chain sectors from your ship to the port inside the time and fuel you have.',
    cats: [{ id: 'time', name: 'Faster lanes' }, { id: 'fuel', name: 'Fuel use' }, { id: 'warning', name: 'Hazard warning' }] },
});

/** "#rrggbb" and an alpha as rgba(). */
export const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

// ---- points -----------------------------------------------------------------------------

const sum = (row) => Object.values(row || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const levelOf = (progress, skill) => Math.max(1, Math.min(LEVEL_MAX, Math.trunc(progress?.levels?.[skill]) || 1));
/** The locked points of a skill: what the save holds, never more than its level. */
export const lockedOf = (progress, skill) => cleanSkillPoints(skill, progress?.points?.[skill], levelOf(progress, skill));
const pendOf = (pending, skill) => pending?.[skill] || {};
const tidy = (pending) => {
  const out = {};
  for (const [skill, row] of Object.entries(pending || {})) {
    const cats = {};
    for (const [cat, n] of Object.entries(row || {})) if (n > 0) cats[cat] = n;
    if (Object.keys(cats).length) out[skill] = cats;
  }
  return out;
};
const setPend = (pending, skill, cat, n) => tidy({ ...pending, [skill]: { ...pendOf(pending, skill), [cat]: n } });

/** Locked plus pending points in one category. */
export const pointsIn = (progress, pending, skill, cat) => Math.min(POINT_MAX, (lockedOf(progress, skill)[cat] || 0) + (pendOf(pending, skill)[cat] || 0));
/** Locked plus pending points in a skill. */
export const totalPoints = (progress, pending, skill) => sum(lockedOf(progress, skill)) + sum(pendOf(pending, skill));
/** Points still to spend in a skill, pending counted as used. */
export const leftOf = (progress, pending, skill) => Math.max(0, levelOf(progress, skill) - totalPoints(progress, pending, skill));
export const totalUnspent = (progress, pending) => SKILL_ORDER.reduce((n, id) => n + leftOf(progress, pending, id), 0);
/** The same count from a character (the bag's badge): level minus locked points, every skill. */
export const unspentOnCharacter = (c) => SKILL_ORDER.reduce((n, id) => n + Math.max(0, (Number.isFinite(c?.levels?.[id]) ? c.levels[id] : 1) - sum(c?.points?.[id])), 0);
export const pendingCount = (pending, skill) => sum(pendOf(pending, skill));
export const clearPending = (pending, skill) => { const { [skill]: _gone, ...rest } = pending || {}; return rest; };

const canAddTo = (progress, pending, skill, cat) => leftOf(progress, pending, skill) > 0 && pointsIn(progress, pending, skill, cat) < POINT_MAX;
export function addPending(progress, pending, skill, cat) {
  if (!SKILL_CATEGORY_IDS[skill]?.includes(cat) || !canAddTo(progress, pending, skill, cat)) return pending || {};
  return setPend(pending, skill, cat, (pendOf(pending, skill)[cat] || 0) + 1);
}
export function takePending(progress, pending, skill, cat) {
  const have = pendOf(pending, skill)[cat] || 0;
  return have > 0 ? setPend(pending, skill, cat, have - 1) : (pending || {});
}

/**
 * A click on notch `j` (0 = first) of one path. Past what you hold, it fills up to there as pending
 * (as far as free points reach). On the last pending notch it takes that one back; on an earlier pending
 * notch it takes back down to it. On a locked notch nothing changes and the words say how to get it back.
 * Returns { pending, kind: 'add' | 'take' | 'locked' | 'none', fresh, words }.
 */
export function pressNotch(progress, pending, skill, cat, j) {
  const locked = lockedOf(progress, skill)[cat] || 0;
  const mine = pendOf(pending, skill)[cat] || 0;
  const held = locked + mine;
  if (j < locked) return { pending: pending || {}, kind: 'locked', fresh: -1, words: 'That point is locked in. To get it back, take a nap at your bunk.' };
  if (j < held) {
    const keep = j === held - 1 ? j : j + 1;
    return { pending: setPend(pending, skill, cat, keep - locked), kind: 'take', fresh: -1, words: '' };
  }
  const want = Math.min(POINT_MAX, j + 1) - held;
  let next = pending || {};
  for (let i = 0; i < want; i++) next = addPending(progress, next, skill, cat);
  const got = (next[skill]?.[cat] || 0) - mine;
  if (got <= 0) return { pending: pending || {}, kind: 'none', fresh: -1, words: leftOf(progress, pending, skill) <= 0 ? 'No free point. Level up to earn one.' : 'That path is full.' };
  return { pending: next, kind: 'add', fresh: held + got - 1, words: '' };
}

/** The whole new spread of a skill for the save's spend call: locked plus pending, every category. */
export function lockSpread(progress, pending, skill) {
  const out = {};
  for (const cat of SKILL_CATEGORY_IDS[skill]) { const n = pointsIn(progress, pending, skill, cat); if (n > 0) out[cat] = n; }
  return out;
}

/** Drop pending points the level no longer covers (after a death, a respec or a hub answer). */
export function tidyPending(progress, pending) {
  let out = {};
  for (const skill of Object.keys(pending || {})) {
    if (!SKILL_CATEGORY_IDS[skill]) continue;
    let free = Math.max(0, levelOf(progress, skill) - sum(lockedOf(progress, skill)));
    const row = {};
    for (const cat of SKILL_CATEGORY_IDS[skill]) {
      const n = Math.min(pending[skill][cat] || 0, free, POINT_MAX - (lockedOf(progress, skill)[cat] || 0));
      if (n > 0) { row[cat] = n; free -= n; }
    }
    if (Object.keys(row).length) out = { ...out, [skill]: row };
  }
  return out;
}

// ---- what the three path cards say ---------------------------------------------------------

/**
 * The three paths of a skill: { id, name, locked, pending, points, now, nextWords, canAdd }. `now` and
 * `nextWords` come from the mini-game's setup words for exactly the points you hold, pending included.
 */
export function catRows({ skill, level, locked = {}, pending = {} }) {
  const cats = CATEGORIES[skill].cats;
  const names = SKILL_UI[skill].cats;
  const used = sum(locked) + sum(pending);
  const free = Math.max(0, level - used);
  return cats.map((c, i) => {
    const lk = locked[c.id] || 0, pe = pending[c.id] || 0;
    const n = Math.min(POINT_MAX, lk + pe);
    const canAdd = free > 0 && n < POINT_MAX;
    let nextWords;
    if (n >= POINT_MAX) nextWords = 'Maxed out.';
    else {
      const next = cap(c.words(n + 1));
      if (c.words(n + 1) === c.words(n) && skill !== 'shooting') {
        let at = null;
        for (let k = n + 2; k <= POINT_MAX; k++) if (c.words(k) !== c.words(n)) { at = k; break; }
        nextWords = at ? `No change yet. At ${at} points: ${c.words(at)}` : 'No further change.';
      } else nextWords = canAdd ? next : `${next} (needs a free point)`;
    }
    return { id: c.id, name: names[i].name, locked: lk, pending: pe, points: n, now: n === 0 ? `No points yet: ${c.words(0)}` : cap(c.words(n)), nextWords, canAdd };
  });
}

// ---- hero, risk, training --------------------------------------------------------------------

/** The level ring, XP bar and points chip of the chosen skill. */
export function heroView(progress, pending, skill) {
  const level = levelOf(progress, skill);
  const left = leftOf(progress, pending, skill);
  const need = level >= LEVEL_MAX ? null : xpToNext(level, progress?.curve);
  const into = Math.max(0, Number(progress?.xp?.[skill]) || 0);
  return {
    level, index: SKILL_ORDER.indexOf(skill) + 1,
    ring: Array.from({ length: LEVEL_MAX }, (_, i) => ({ on: i < level })),
    xp: need === null ? 0 : into, xpNeed: need, nextLevel: need === null ? null : level + 1,
    pct: need === null ? 100 : Math.max(0, Math.min(100, Math.round(into / need * 100))),
    xpLine: need === null ? 'Top level. Nothing left to earn here.' : `${into} / ${need} XP to level ${level + 1}`,
    left, chip: left > 0 ? plural(left, 'point') + ' to spend' : 'All points spent',
  };
}

/** What a death would cost in this skill right now: { safe, line, pct, xp, levels, points }. */
export function riskView(progress, scan, skill) {
  const name = SKILL_UI[skill].name;
  const row = unscanned(progress, scan).rows.find((r) => r.skill === skill);
  const spentNow = sum(progress?.points?.[skill]), spentThen = sum(scan?.points?.[skill]);
  const pointsLost = Math.max(0, spentNow - spentThen);
  if (!row && !pointsLost) return { safe: true, line: `Nothing. Your ${name} is scanned and safe.`, pct: '0%', xp: 0, levels: 0, points: 0 };
  const xp = row?.xpGained || 0, levels = row?.levelsGained || 0;
  const parts = [`${xp} ${name} XP`];
  if (levels > 0) parts.push(levels === 1 ? 'drop back a level' : `drop back ${levels} levels`);
  if (pointsLost > 0) parts.push(plural(pointsLost, 'spent point') + ' come back');
  const line = `You lose ${parts[0]}${parts.length > 1 ? ' and ' + parts.slice(1).join(' and ') : ''}`;
  const level = levelOf(progress, skill);
  const span = level >= LEVEL_MAX ? 1 : xpToNext(level, progress?.curve);
  return { safe: false, line, pct: `${Math.min(100, Math.round(xp / span * 100))}%`, xp, levels, points: pointsLost };
}
export const riskShort = (r) => (r.safe ? 'Scanned and safe' : `Death costs ${r.xp} XP · Scan`);

/** The Train it panel: the skill's game and the holodeck price (the gym's own number). */
export function trainView(skill) {
  const ui = SKILL_UI[skill];
  const games = gymGamesFor(skill);
  return {
    game: ui.game, line: ui.gameLine, gameId: games[0]?.id || null, cost: GYM.cost,
    canTrain: games.length > 0,
    label: games.length ? `Train in the holodeck · ${GYM.cost} cr` : 'No mini-game to train',
  };
}
