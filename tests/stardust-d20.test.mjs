// Launch tech lane, outcome 1: the d20 replaces 2d6 everywhere in the new game
// (design doc Section 5, "The d20", confirmed Nov 15). Written before the build,
// against the outcome: d20 + skill level vs a difficulty, advantage = roll two
// and keep the higher, a natural 20 always passes, every DC on the d20 scale,
// old saves still load. Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK, ROLL_SKILLS, ROLL_SKILL_IDS, LEVEL_MAX, CHECK_SKILL, STAT_IDS } from '../projects/Space-Shooter/voyage/data.js';
import { check, attemptChance, checkChance, rollText, createCharacter, cleanCharacter, checkSkill, rollLevel } from '../projects/Space-Shooter/voyage/character.js';
import { cleanSave, emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { attemptWords } from '../projects/Space-Shooter/voyage/ui/attemptRoll.js';
import { upgradeRun, RUN_VERSION, dcFrom2d6 } from '../projects/Space-Shooter/voyage/quests/runUpgrade.js';
import { crewCard, cleanCrewCard } from '../projects/Space-Shooter/voyage/crew/card.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { EVENTS } from '../projects/Space-Shooter/voyage/quests/data/events.js';
import { SHOPS_DATA as SHOPS } from '../projects/Space-Shooter/voyage/quests/data/shops.js';
import { ENEMIES } from '../projects/Space-Shooter/voyage/quests/data/enemies.js';
import { TUTORIAL_DATA } from '../projects/Space-Shooter/voyage/story/data/tutorial.js';
import { HOW_CHECKS_WORK, statCard } from '../projects/Space-Shooter/voyage/story/stats.js';

const VOYAGE = join(dirname(fileURLToPath(import.meta.url)), '../projects/Space-Shooter/voyage');
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
// rng value that lands a d20 on face f (rollDie: floor(r * 20) + 1).
const face = (f) => (f - 0.5) / 20;
const captain = (over = {}) => ({ ...createCharacter({ name: 'Vela Quint' }, seq(0.5), () => 1000), ...over });

test('d20: the rule is one d20 plus the skill level against a difficulty; data says so', () => {
  assert.equal(CHECK.dice, 1);
  assert.equal(CHECK.sides, 20);
  assert.equal(CHECK.alwaysPass, 20, 'a natural 20 always passes (replaces the double six)');
  assert.equal(CHECK.alwaysFail, 0, 'a natural 1 is just a low roll, as alwaysFail was before');
  assert.equal(CHECK.addStat, false, 'the doc rule: d20 + skill level, stats do not add');
  assert.deepEqual(ROLL_SKILL_IDS, ['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation']);
  assert.equal(ROLL_SKILLS.length, 8);
  assert.equal(LEVEL_MAX, 9);
  for (const [name, dc] of Object.entries(CHECK.levels)) assert.ok(dc >= 2 && dc <= 30, `${name} ${dc} on the d20 scale`);
});

test('d20: a roll is d20 + level (+ extra) vs dc, and the shape says what happened', () => {
  const c = captain({ levels: { social: 4 } });
  const r = check(c, { skill: 'social', tag: 'talk', dc: 15 }, seq(face(11)));
  assert.equal(r.kind, 'attempt');
  assert.equal(r.sides, 20);
  assert.deepEqual(r.dice, [11]);
  assert.equal(r.roll, 11);
  assert.equal(r.skill, 'social');
  assert.equal(r.level, 4);
  assert.equal(r.bonus, 4);
  assert.equal(r.total, 15);
  assert.equal(r.pass, true, 'meeting the target passes');
  assert.equal(r.natural, false);
  assert.equal(r.advantage, false);
  assert.equal(check(c, { skill: 'social', dc: 16 }, seq(face(11))).pass, false);
  assert.equal(check(c, { skill: 'social', dc: 12, extra: 2 }, seq(face(6))).total, 12, 'an extra bonus (a ship) adds on');
  assert.equal(check(null, { skill: 'social', dc: 10 }, seq(face(9))).total, 10, 'no captain rolls at level 1');
});

test('d20: a natural 20 always passes; a natural 1 is just a low roll', () => {
  const weak = captain();
  const nat = check(weak, { skill: 'hacking', dc: 40 }, seq(face(20)));
  assert.equal(nat.pass, true);
  assert.equal(nat.natural, true);
  const one = check(captain({ levels: { repair: 9 } }), { skill: 'repair', dc: 10 }, seq(face(1)));
  assert.equal(one.total, 10);
  assert.equal(one.pass, true, 'no automatic fail: 1 + 9 meets 10');
  assert.equal(one.natural, false);
});

test('d20: advantage rolls twice and keeps the higher', () => {
  const c = captain();
  const r = check(c, { skill: 'piloting', dc: 12, advantage: true }, seq(face(4), face(17)));
  assert.deepEqual(r.dice, [4, 17], 'both dice are kept for the UI');
  assert.equal(r.roll, 17, 'the higher one counts');
  assert.equal(r.total, 18);
  assert.equal(r.advantage, true);
  assert.equal(r.pass, true);
  const nat = check(c, { skill: 'piloting', dc: 40, advantage: true }, seq(face(20), face(2)));
  assert.equal(nat.natural, true, 'either die landing a 20 is a natural');
  assert.equal(check(c, { skill: 'piloting', dc: 12 }, seq(face(4), face(17))).dice.length, 1, 'no advantage, one die');
});

test('d20: chances are exact, advantage included', () => {
  assert.equal(attemptChance(1, 10), 12 / 20, 'd20 + 1 meets 10 on a 9 or better');
  assert.equal(attemptChance(0, 40), 1 / 20, 'only a natural 20');
  assert.equal(attemptChance(9, 10), 1, 'level 9 always makes a normal check');
  assert.equal(attemptChance(1, 12, { advantage: true }), 1 - (10 / 20) ** 2, 'fails only when both dice show 1..10');
  const c = captain({ levels: { social: 3 } });
  assert.equal(checkChance(c, { skill: 'social', dc: 10 }), 14 / 20);
  assert.ok(checkChance(c, { skill: 'social', dc: 10, advantage: true }) > checkChance(c, { skill: 'social', dc: 10 }));
});

test('d20: a check finds its skill by name, then tag, then stat; Strength and Health have none', () => {
  assert.equal(checkSkill({ skill: 'stealth', stat: 'cha' }), 'stealth');
  assert.equal(checkSkill({ stat: 'dex', tag: 'nav' }), 'piloting');
  assert.equal(checkSkill({ stat: 'dex', tag: 'hack' }), 'hacking');
  assert.equal(checkSkill({ stat: 'wis', tag: 'scan' }), 'navigation');
  assert.equal(checkSkill({ stat: 'cha' }), 'social');
  assert.equal(checkSkill({ stat: 'str' }), null);
  assert.equal(checkSkill({ skill: 'none', stat: 'cha', tag: 'talk' }), null, "content can say 'none': the bare d20");
  assert.equal(checkSkill({ stat: 'con', tag: 'fight' }), 'shooting');
  for (const id of Object.values(CHECK_SKILL.byTag)) assert.ok(ROLL_SKILL_IDS.includes(id), id);
  for (const id of Object.values(CHECK_SKILL.byStat)) assert.ok(id === null || ROLL_SKILL_IDS.includes(id), id);
  for (const id of STAT_IDS) assert.ok(id in CHECK_SKILL.byStat, `every stat is mapped (even to none): ${id}`);
  const bare = check(captain({ levels: { repair: 5 } }), { stat: 'str', dc: 10 }, seq(face(9)));
  assert.equal(bare.skill, null);
  assert.equal(bare.bonus, 0, 'no skill: the bare d20');
  assert.equal(rollLevel(captain({ levels: { social: 6 } }), 'social'), 6);
  assert.equal(rollLevel(captain(), null), 0);
});

test('d20: the stat switch adds the stat bonus on top only when turned on (off by default)', () => {
  const c = captain({ stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 6 } });
  assert.equal(check(c, { stat: 'cha', dc: 10 }, seq(face(9))).statMod, 0, 'stats do not add with addStat off');
});

test('d20: the words are d20 words, never 2d6', () => {
  const r = check(captain({ levels: { social: 2 } }), { skill: 'social', tag: 'talk', dc: 12 }, seq(face(14)));
  const w = attemptWords({ ...r, label: 'Talk him down' });
  assert.match(w.sum, /^14 \+ Social 2 = 16$/);
  assert.equal(w.target, 'needs 12');
  assert.match(w.verdict, /Made it/);
  assert.match(w.what, /Talk him down/);
  const nat = attemptWords(check(captain(), { skill: 'social', dc: 30 }, seq(face(20))));
  assert.match(nat.verdict, /Natural 20/);
  const adv = attemptWords(check(captain(), { skill: 'social', dc: 10, advantage: true }, seq(face(3), face(15))));
  assert.match(adv.sum, /^15 \(3 dropped\) \+ Social 1 = 16$/);
  assert.match(adv.what, /advantage$/);
  assert.match(attemptWords(check(captain(), { stat: 'dex', tag: 'nav', dc: 12, extra: 2 }, seq(face(9)))).sum, /^9 \+ Piloting 1 \+ 2 ship = 12$/);
  assert.match(attemptWords(check(captain(), { stat: 'str', dc: 12 }, seq(face(9)))).sum, /^9 \+ 0 = 9$/, 'a bare d20 reads + 0');
  assert.match(rollText(r), /^d20 14 \+ 2 = 16 vs 12$/);
  assert.match(rollText(check(captain(), { dc: 30 }, seq(face(20)))), /natural 20!/);
  for (const t of HOW_CHECKS_WORK) assert.doesNotMatch(t, /2d6|double six/i, t);
  assert.ok(HOW_CHECKS_WORK.some((t) => /d20/.test(t)));
  assert.ok(HOW_CHECKS_WORK.some((t) => /natural 20/i.test(t)));
  assert.doesNotMatch(JSON.stringify(statCard('cha', 6)), /2d6|double six/i);
});

// Every DC written in content, on the d20 scale (2..30), and the converted odds.
function dcsIn(node, out = [], path = '') {
  if (Array.isArray(node)) node.forEach((n, i) => dcsIn(n, out, `${path}[${i}]`));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'dc' || k === 'parleyDc') && typeof v === 'number') out.push([`${path}.${k}`, v]);
      else dcsIn(v, out, `${path}.${k}`);
    }
  }
  return out;
}

test('d20: every content DC is on the d20 scale', () => {
  const all = dcsIn({ QUESTS, EVENTS, SHOPS, ENEMIES, TUTORIAL_DATA });
  assert.ok(all.length > 80, `found the content DCs (${all.length})`);
  for (const [where, dc] of all) {
    assert.ok(Number.isInteger(dc) && dc >= 8 && dc <= 30, `${where} = ${dc} is not a d20 DC`);
  }
});

// Every check written in content names the skill it rolls (or 'none'), so nothing rides on the fallback map.
function checksIn(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => checksIn(n, out));
  else if (node && typeof node === 'object') {
    if (node.check && typeof node.check === 'object') out.push({ ...node.check, label: node.label || node.name });
    else if ('stat' in node && 'dc' in node) out.push({ ...node });
    for (const v of Object.values(node)) checksIn(v, out);
  }
  return out;
}

test('d20: every content check names its skill, and its label never names a stat', () => {
  const all = checksIn({ QUESTS, EVENTS, SHOPS, TUTORIAL_DATA });
  assert.ok(all.length >= 70, `found the content checks (${all.length})`);
  for (const c of all) {
    assert.ok(c.skill === 'none' || ROLL_SKILL_IDS.includes(c.skill), `${c.label}: skill ${c.skill}`);
    assert.doesNotMatch(String(c.label || ''), /\((Dexterity|Charisma|Wisdom|Strength|Health|Constitution)( check[^)]*)?\)/, c.label);
  }
});

test('d20: the 2d6 to d20 conversion keeps a level-1 captain near the old average odds', () => {
  assert.deepEqual([6, 7, 8, 9, 10, 11].map(dcFrom2d6), [8, 10, 12, 14, 16, 18]);
  assert.equal(dcFrom2d6(12), 20);
  assert.equal(dcFrom2d6(3), 2);
  for (const old of [6, 7, 8, 9]) {
    const was = [...Array(36)].filter((_, i) => Math.floor(i / 6) + (i % 6) + 2 >= old).length / 36;
    const now = attemptChance(1, dcFrom2d6(old));
    assert.ok(Math.abs(now - was) <= 0.13, `old ${old}: was ${was.toFixed(2)}, now ${now.toFixed(2)}`);
  }
});

test('d20: old saves still load; captains gain skill levels at 1', () => {
  const old = { id: 'c-abc', name: 'Old Hand', look: { portrait: 'p1', color: '#81e6df' }, stats: { str: 2, con: 3, dex: 6, wis: 3, cha: 5 }, earned: 3, permanent: 0, skills: { pilot: 1 }, deaths: 0, createdAt: 5 };
  const c = cleanCharacter(old);
  assert.equal(c.name, 'Old Hand');
  assert.deepEqual(c.stats, old.stats);
  assert.deepEqual(c.skills, { pilot: 1 });
  assert.deepEqual(c.levels, Object.fromEntries(ROLL_SKILL_IDS.map((id) => [id, 1])));
  const kept = cleanCharacter({ ...old, levels: { social: 7, hacking: 99, nonsense: 4, piloting: 0 } });
  assert.equal(kept.levels.social, 7);
  assert.equal(kept.levels.hacking, LEVEL_MAX, 'clamped to 9');
  assert.equal(kept.levels.piloting, 1, 'never below 1');
  assert.ok(!('nonsense' in kept.levels));
  const save = cleanSave({ ...emptySave(), character: old, money: 120 });
  assert.equal(save.money, 120);
  assert.equal(save.character.levels.navigation, 1);
  assert.deepEqual(createCharacter({ name: 'New' }, seq(0.5), () => 1).levels, Object.fromEntries(ROLL_SKILL_IDS.map((id) => [id, 1])));
});

test('d20: a quest run saved mid-job on the 2d6 scale has its stored DCs moved to the d20 scale, once', () => {
  assert.equal(RUN_VERSION, 2);
  const oldRun = { v: 1, quest: 'teapot', node: 'party', part: { kind: 'skirmish', state: { enemy: { name: 'Raider', parleyDc: 8 }, dc: 7, round: 2 } }, lastCheck: { dc: 8, total: 9 }, log: [] };
  const run = upgradeRun(oldRun);
  assert.equal(run.v, 2);
  assert.equal(run.part.state.dc, 10);
  assert.equal(run.part.state.enemy.parleyDc, 12);
  assert.equal(run.part.state.round, 2, 'other numbers untouched');
  assert.equal(run.lastCheck.dc, 8, 'a roll already made stays as it was rolled');
  assert.deepEqual(upgradeRun(run), run, 'a d20 run is left alone');
  const save = cleanSave({ ...emptySave(), quests: { active: { teapot: oldRun } } });
  assert.equal(save.quests.active.teapot.part.state.dc, 10, 'the save loader upgrades runs in progress');
  assert.equal(oldRun.part.state.dc, 7, 'the input is not mutated');
});

test('d20: a crewmate rolls with their own skill levels', () => {
  const card = crewCard(captain({ levels: { navigation: 5 } }));
  assert.equal(card.levels.navigation, 5);
  const clean = cleanCrewCard({ ...card, levels: { navigation: 50, social: -3, junk: 2 } });
  assert.equal(clean.levels.navigation, LEVEL_MAX);
  assert.equal(clean.levels.social, 1);
  assert.ok(!('junk' in clean.levels));
  assert.equal(cleanCrewCard({ name: 'Old Guest', stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 3 }, skills: {} }).levels.navigation, 1, 'an older guest card still works');
  assert.equal(check(clean, { stat: 'wis', tag: 'scan', dc: 12 }, seq(face(3))).total, 3 + LEVEL_MAX);
});

// Nothing left in the new game's code says 2d6, "double six" or "2d6 + stat" for a check.
// (The cantina's bone-dice game in "The Missing Page" is fiction, not the rule, and stays.)
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|json|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

test('d20: no 2d6 wording left in the voyage code', () => {
  const bad = [];
  for (const file of walk(VOYAGE)) {
    if (file.endsWith('missing-page.js')) continue;
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      // Comments may say where the d20 came from; code and words a player reads may not say 2d6.
      const code = line.replace(/\/\/.*$/, '').replace(/dcFrom2d6/g, '');
      if (/^\s*\*/.test(code)) return;
      if (/2d6|double six|double-six|boxcars/i.test(code)) bad.push(`${file.slice(VOYAGE.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('d20: the drawn die is a real d20 and lands on the decided face', async () => {
  const { FACES, orientFor, frontFace, rotate } = await import('../projects/Space-Shooter/voyage/ui/d20.js');
  assert.equal(FACES.length, 20);
  assert.deepEqual(FACES.map((f) => f.value).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const f of FACES) {
    const opp = FACES.find((g) => g.n.every((c, i) => Math.abs(c + f.n[i]) < 1e-9));
    assert.equal(f.value + opp.value, 21, 'opposite faces add to 21');
  }
  for (let v = 1; v <= 20; v++) {
    assert.equal(frontFace(orientFor(v)), v, `lands on ${v}`);
    assert.equal(frontFace(orientFor(v, 0.7)), v, `a twist keeps ${v} in front`);
  }
  const n = rotate(orientFor(7), FACES.find((f) => f.value === 7).n);
  assert.ok(n[2] > 0.9, 'the face looks at the camera');
});
