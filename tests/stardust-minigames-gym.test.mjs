// Little extra 3: the holodeck gym trainer. Numbers from PLAN.md section 4 (placeholders for the economy tune).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GYM, GYM_GAMES, gymGame, gymSetup, gymXp, canTrain, trainRun, paidThisHour, leftThisHour, newGymLog } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { setupRepair, setupPilot, setupPersuade } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { CATEGORY_SKILLS } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('the gym offers every minigame, one row each, for a skill the game has', () => {
  assert.deepEqual(GYM_GAMES.map((g) => g.id), ['repair', 'hack', 'haggle', 'persuade', 'intimidate', 'craft', 'nav', 'stealth', 'pilot']);
  for (const g of GYM_GAMES) { assert.ok(CATEGORY_SKILLS.includes(g.skill), g.skill); assert.ok(g.name.length > 2); }
  assert.equal(new Set(GYM_GAMES.map((g) => g.id)).size, 9);
  assert.equal(gymGame('pilot').skill, 'piloting'); assert.equal(gymGame('nope'), null);
});

test('a gym run is always Steady with the player\'s own level and points', () => {
  for (const g of GYM_GAMES) {
    const s = gymSetup(g.id, { level: 5, points: Object.fromEntries(g.cats.map((c, i) => [c, i === 0 ? 3 : 2])) });
    assert.equal(s.tier, 0, g.id); assert.equal(s.label, 'Steady');
    assert.equal(Object.values(s.points).reduce((a, b) => a + b, 0), 5, `${g.id} uses all 5 points`);
  }
  assert.deepEqual(gymSetup('repair', { level: 4, points: { time: 4 } }), setupRepair({ tier: 0, level: 4, points: { time: 4 } }));
  assert.deepEqual(gymSetup('pilot', { level: 9, points: { landing: 9 } }), setupPilot({ tier: 0, level: 9, points: { landing: 9 } }));
  assert.deepEqual(gymSetup('persuade', { level: 3, points: { persuade: 3 } }), setupPersuade({ tier: 0, level: 3, points: { persuade: 3 } }));
  assert.equal(gymSetup('nope'), null);
});

test('XP: a quarter of the real thing, rounded down, at least 1 for a win, none for nothing', () => {
  assert.deepEqual([0, 1, 3, 4, 5, 8, 12, 20].map(gymXp), [0, 1, 1, 1, 1, 2, 3, 5]);
});

test('entry costs credits; too poor is a plain sentence', () => {
  assert.deepEqual(canTrain('repair', { credits: 10 }), { ok: true, reason: '' });
  assert.equal(canTrain('repair', { credits: 9 }).ok, false);
  assert.equal(canTrain('repair', { credits: 9 }).reason, 'The gym costs 10 credits and you have 9.');
  assert.equal(canTrain('nope', { credits: 99 }).ok, false);
  const poor = trainRun('repair', { credits: 5, result: { success: true, xp: 8 } });
  assert.deepEqual([poor.ok, poor.credits, poor.paid], [false, 5, 0]);
});

test('a win pays a quarter, a loss pays nothing but still costs the credits', () => {
  const win = trainRun('repair', { credits: 50, now: 1000, result: { success: true, xp: 8 } });
  assert.deepEqual([win.ok, win.credits, win.paid, win.said], [true, 40, 2, '+2 repair XP.']);
  const lose = trainRun('repair', { credits: 50, now: 1000, result: { success: false, xp: 0 } });
  assert.deepEqual([lose.credits, lose.paid, lose.said], [40, 0, 'No XP this time. The gym took 10 credits.']);
  assert.deepEqual(lose.log, {});
});

test('the hourly cap per skill: pays up to 6, then says so; other skills are unaffected; the hour rolls', () => {
  let log = newGymLog(), credits = 1000, now = 0, got = 0;
  for (let i = 0; i < 4; i++) { const r = trainRun('hack', { credits, log, now: now += 60000, result: { success: true, xp: 12 } }); credits = r.credits; log = r.log; got += r.paid; }
  assert.equal(got, 6, 'two runs of 3, the rest nothing');
  assert.equal(leftThisHour(log, 'hacking', now), 0);
  const capped = trainRun('hack', { credits, log, now: now + 1000, result: { success: true, xp: 12 } });
  assert.deepEqual([capped.paid, capped.credits], [0, credits - 10]);
  assert.match(capped.said, /all the gym will pay for hacking this hour/);
  assert.equal(leftThisHour(log, 'repair', now), 6, 'another skill has its own cap');
  assert.equal(leftThisHour(log, 'hacking', 60000 + GYM.windowMs + 1), 3, 'the first payment ages out of the hour, the second has not yet');
  // a partial pay at the edge of the cap
  let l2 = newGymLog(); const a = trainRun('repair', { credits: 99, log: l2, now: 5, result: { success: true, xp: 20 } }); // 5
  const b = trainRun('repair', { credits: a.credits, log: a.log, now: 6, result: { success: true, xp: 20 } }); // only 1 left
  assert.deepEqual([a.paid, b.paid], [5, 1]); assert.match(b.said, /limit/);
  // after the hour it pays again
  const later = trainRun('repair', { credits: b.credits, log: b.log, now: 6 + GYM.windowMs + 1, result: { success: true, xp: 20 } });
  assert.equal(later.paid, 5);
  assert.equal(paidThisHour(b.log, 'repair', 7), 6);
});

test('inputs are never changed', () => {
  const log = { repair: [{ at: 0, xp: 2 }] }, frozen = JSON.stringify(log);
  trainRun('repair', { credits: 50, log, now: 10, result: { success: true, xp: 8 } });
  assert.equal(JSON.stringify(log), frozen);
});

test('a gym is no money printer: a perfect pilot earns less XP an hour than the cap, and each run costs credits', () => {
  let log = newGymLog(), credits = 1000, now = 0, xp = 0;
  for (let i = 0; i < 50; i++) { const r = trainRun('pilot', { credits, log, now: now += 30000, result: { success: true, xp: 6 } }); credits = r.credits; log = r.log; xp += r.paid; if (now >= GYM.windowMs - 1) break; }
  assert.ok(xp <= GYM.capXp * 2, `an hour of nonstop gym is ${xp} XP at most`);
  assert.ok(1000 - credits >= GYM.cost * 5);
});
