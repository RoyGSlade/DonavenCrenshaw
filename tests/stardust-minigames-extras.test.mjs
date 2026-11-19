// Minigames lane piece 3: the unscanned-progress meter and the level-up point
// picker (progress.js, picker.js). Written against PLAN.md section 4: a death
// costs exactly the skill progress since the last scan, shown in plain words;
// points = level, any split, max 9 in a category; the picker's numbers are the
// minigames' own numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, addXp, totalXp, xpToNext, scanSnapshot, reprint, unscanned, riskLine, riskTone } from '../projects/Space-Shooter/voyage/minigames/progress.js';
import { CATEGORIES, CATEGORY_SKILLS, cleanSkillPoints, unspent, canAdd, addPoint, removePoint, describeCategory, describeSkill } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { setupRepair, setupHack } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { ROLL_SKILL_IDS } from '../projects/Space-Shooter/voyage/data.js';

test('xp curve is a placeholder: 20 x level to the next; level 9 is the top', () => {
  assert.deepEqual([1, 2, 3, 8].map(xpToNext), [20, 40, 60, 160]);
  assert.equal(xpToNext(9), Infinity);
  assert.equal(totalXp(1, 0), 0); assert.equal(totalXp(3, 5), 65); assert.equal(totalXp(9, 0), 20 * 36);
});

test('addXp: levels up across several thresholds, stops at 9, ignores bad input', () => {
  let p = newProgress();
  let r = addXp(p, 'repair', 65); assert.deepEqual([r.progress.levels.repair, r.progress.xp.repair, r.gained], [3, 5, 2]);
  r = addXp(p, 'repair', 100000); assert.deepEqual([r.progress.levels.repair, r.progress.xp.repair], [9, 0]);
  assert.equal(addXp(p, 'nope', 5).progress, p); assert.equal(addXp(p, 'repair', -3).gained, 0);
  assert.equal(p.levels.repair, 1); // the input is never changed
});

test('a fresh or just-scanned character is safe', () => {
  const p = newProgress();
  const u = unscanned(p, scanSnapshot(p));
  assert.equal(u.safe, true); assert.equal(riskLine(u), 'Safe. Nothing unscanned.'); assert.equal(riskTone(u), 'safe');
});

test('unscanned: XP and levels gained since the scan, biggest first, in plain words', () => {
  let p = newProgress(); const snap = scanSnapshot(p);
  p = addXp(p, 'hacking', 5).progress;           // 5 XP, no level
  let u = unscanned(p, snap);
  assert.deepEqual(u.rows.map((r) => [r.skill, r.xpGained, r.levelsGained]), [['hacking', 5, 0]]);
  assert.equal(riskLine(u), '5 XP at risk since your last scan.'); assert.equal(riskTone(u), 'low');
  p = addXp(p, 'repair', 65).progress;           // two levels, 65 XP
  u = unscanned(p, snap);
  assert.deepEqual(u.rows.map((r) => [r.skill, r.xpGained, r.fromLevel, r.toLevel, r.pointsAtRisk]), [['repair', 65, 1, 3, 2], ['hacking', 5, 1, 1, 0]]);
  assert.deepEqual([u.xp, u.points], [70, 2]);
  assert.equal(riskLine(u), '2 skill points and 70 XP at risk since your last scan.'); assert.equal(riskTone(u), 'high');
  p = addXp(newProgress(), 'social', 20).progress;
  assert.equal(riskLine(unscanned(p, scanSnapshot(newProgress()))), '1 skill point and 20 XP at risk since your last scan.');
});

test('scan then die: progress goes back to the scan, points spent since are gone, the snapshot never moves', () => {
  let p = newProgress();
  p = addXp(p, 'repair', 30).progress; p.points = { repair: { time: 2 } };
  const snap = scanSnapshot(p);
  p = addXp(p, 'repair', 100).progress; p = { ...p, points: { repair: { time: 2, quality: 3 } } };
  p = addXp(p, 'hacking', 12).progress;
  assert.equal(unscanned(p, snap).safe, false);
  const back = reprint(p, snap);
  assert.deepEqual(back, snap);
  assert.equal(unscanned(back, snap).safe, true);
  assert.deepEqual(snap.points, { repair: { time: 2 } });
  back.points.repair.time = 9; assert.equal(snap.points.repair.time, 2);
});

test('picker: points = level, any split, never more than 9 in one category or the level in all', () => {
  assert.equal(unspent('repair', {}, 1), 1);
  assert.equal(unspent('repair', { time: 3 }, 5), 2);
  assert.deepEqual(cleanSkillPoints('repair', { time: 9, size: 9, quality: 9 }, 9), { time: 9, size: 0, quality: 0 });
  assert.deepEqual(cleanSkillPoints('repair', { time: 5, size: 5 }, 7), { time: 5, size: 2, quality: 0 });
  assert.equal(canAdd('repair', { time: 9 }, 9, 'time'), false);
  assert.equal(canAdd('repair', {}, 1, 'size'), true);
  assert.equal(canAdd('repair', { size: 1 }, 1, 'time'), false);
  assert.equal(canAdd('repair', {}, 3, 'nope'), false);
  let p = {}; for (let i = 0; i < 12; i++) p = addPoint('hacking', p, 4, ['time', 'size', 'retries'][i % 3]);
  assert.deepEqual(p, { time: 2, size: 1, retries: 1 });
  assert.deepEqual(removePoint('hacking', p, 4, 'time'), { time: 1, size: 1, retries: 1 });
  assert.deepEqual(removePoint('hacking', { time: 0 }, 4, 'time'), { time: 0, size: 0, retries: 0 });
});

test('every skill has three categories; the ids match the eight roll skills', () => {
  assert.deepEqual([...CATEGORY_SKILLS].sort(), [...ROLL_SKILL_IDS].sort());
  for (const s of CATEGORY_SKILLS) assert.equal(CATEGORIES[s].cats.length, 3, s);
});

test('picker numbers ARE the minigames numbers: repair and hacking', () => {
  for (let n = 0; n <= 9; n++) {
    const r = setupRepair({ points: { time: n } });
    assert.match(CATEGORIES.repair.cats[0].words(n), new RegExp(`\\(${r.capacity} s\\)`));
    const sz = setupRepair({ points: { size: n } }).size;
    assert.equal(CATEGORIES.repair.cats[1].words(n), `${sz} x ${sz} board`);
    const q = setupRepair({ points: { quality: n } }).qualityBonus;
    assert.equal(CATEGORIES.repair.cats[2].words(n), `${q ? '+' : ''}${q} quality on every patch`);
    const lock = { time: 16, tumblers: 9, misses: 2 };
    const h = setupHack({ points: { size: n }, lock });
    const hr = setupHack({ points: { retries: n }, lock });
    assert.equal(CATEGORIES.hacking.cats[1].words(n), `${9 - h.tumblers} fewer tumbler${9 - h.tumblers === 1 ? '' : 's'} (never under 2), lit window ${n ? '+' : ''}${Math.round((h.window - 1) * 100)}% wider`);
    assert.equal(CATEGORIES.hacking.cats[2].words(n), `${hr.misses - 2 ? '+' : ''}${hr.misses - 2} spare miss${hr.misses - 2 === 1 ? '' : 'es'}`);
    const ht = setupHack({ points: { time: n } }).time;
    assert.equal(CATEGORIES.hacking.cats[0].words(n), `${n ? '+' : ''}${Math.round((ht - 16) * 10) / 10} s on every hack`);
  }
});

test('describeCategory: now, next, and when a stepped category next changes', () => {
  let d = describeCategory('repair', { size: 0 }, 5, 'size');
  assert.deepEqual([d.now, d.next, d.nextChange, d.canAdd], ['no bonus yet', '5 x 5 board', { at: 3 }, true]);
  d = describeCategory('repair', { size: 2 }, 5, 'size');
  assert.deepEqual([d.now, d.next, d.nextChange], ['5 x 5 board', '4 x 4 board', null]);
  d = describeCategory('repair', { time: 9 }, 9, 'time');
  assert.deepEqual([d.next, d.canAdd], [null, false]);
  assert.equal(describeCategory('repair', {}, 3, 'nope'), null);
  d = describeCategory('hacking', { retries: 0 }, 5, 'retries');
  assert.deepEqual(d.nextChange, { at: 2 });
  assert.equal(describeSkill('social', {}, 4).length, 3);
});
