// Stardust skill-save lane (2026-11-18): skill category points and mini-game XP
// that are actually stored and validated. The save holds `points`, `xp` and a
// scan next to `levels` on the character; the picker reads and writes them; a
// mini-game win claims its XP from the Hub (server mode) or locally, inside the
// same caps; a death goes back to the scan. Written before the build.
// The Hub side is the sibling PR (stardust.skill-save.test.js); the numbers here
// mirror its rules.json "voyage" block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';
import { createCharacter, cleanCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { cleanSave, emptySave, encodeSave, decodeSave } from '../projects/Space-Shooter/voyage/save.js';
import { SKILL_CATEGORY_IDS, POINT_MAX, ROLL_SKILL_IDS } from '../projects/Space-Shooter/voyage/data.js';
import { CATEGORIES, cleanSkillPoints } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { GYM_GAMES } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { newProgress, addXp, unscanned, riskLine } from '../projects/Space-Shooter/voyage/minigames/progress.js';
import { applyAccount, createEconomy } from '../projects/Space-Shooter/voyage/account.js';
import * as SS from '../projects/Space-Shooter/voyage/skillSave.js';

const HOUR = 3600 * 1000;
const captain = (extra = {}) => cleanCharacter({ ...createCharacter({ name: 'Mae', look: { portrait: 'p1', color: '#81e6df' } }, () => 0.5, () => 1), ...extra });
const withChar = (extra) => ({ ...emptySave(), character: captain(extra) });
function memStore(save) {
  let s = cleanSave(save);
  return { get: () => structuredClone(s), update: (fn) => { s = cleanSave(fn(structuredClone(s))); return true; } };
}

test('the switches stay off: newGame and voyageServer are false', () => {
  assert.equal(runtimeConfig.newGame, false);
  assert.equal(runtimeConfig.voyageServer, false);
});

test('category ids: data.js holds the same three per skill as the picker, and POINT_MAX is 9', () => {
  assert.equal(POINT_MAX, 9);
  assert.deepEqual(Object.keys(SKILL_CATEGORY_IDS), ROLL_SKILL_IDS);
  for (const [skill, def] of Object.entries(CATEGORIES)) assert.deepEqual(SKILL_CATEGORY_IDS[skill], def.cats.map((c) => c.id), skill);
});

test('XP curve: nine thresholds from 0, rising; the Hub rules.json table', () => {
  assert.deepEqual(SS.XP_CURVE, [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500]);
  assert.equal(SS.levelFromXp(0), 1);
  assert.equal(SS.levelFromXp(99), 1);
  assert.equal(SS.levelFromXp(100), 2);
  assert.equal(SS.levelFromXp(320), 3);
  assert.equal(SS.levelFromXp(1e9), 9);
});

test('mini-games: every gym game has a skill the claim table knows, with a per-claim max of 8', () => {
  assert.deepEqual(Object.keys(SS.GAME_SKILL).sort(), GYM_GAMES.map((g) => g.id).sort());
  for (const g of GYM_GAMES) assert.equal(SS.GAME_SKILL[g.id], g.skill, g.id);
  assert.equal(SS.LIMITS.maxXp, 8);
  assert.equal(SS.LIMITS.xpPerSkillPerHour, 30);
  assert.equal(SS.LIMITS.levelsPerSkillPerHour, 1);
});

// ---- the save --------------------------------------------------------------------

test('a new captain has no points, no XP, and a scan of the start', () => {
  const c = createCharacter({ name: 'Mae', look: { portrait: 'p1', color: '#81e6df' } }, () => 0.5, () => 1);
  assert.deepEqual(c.points, {});
  assert.deepEqual(c.xp, {});
  assert.equal(c.scan.levels.repair, 1);
  assert.deepEqual(c.scan.points, {});
});

test('an old save (no points, no XP, no scan) reads as zero points, nothing unspent lost', () => {
  const old = { id: 'c-abc', name: 'Old Hand', look: { portrait: 'p1', color: '#81e6df' }, stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 3 }, levels: { repair: 4 }, earned: 2, permanent: 0, skills: {}, deaths: 0, createdAt: 1 };
  const c = cleanCharacter(old);
  assert.deepEqual(c.points, {});
  assert.deepEqual(c.xp, {});
  assert.equal(c.scan, null);
  assert.equal(c.levels.repair, 4);
  assert.equal(SS.pointsLeft(c, 'repair'), 4, 'four levels, four points to spend');
});

test('cleanCharacter repairs points: known ids, whole 0..9, never more than the level, last category trimmed first', () => {
  const c = captain({
    levels: { repair: 3, hacking: 9, social: 2 },
    points: { repair: { time: 2, size: 2, quality: 5, luck: 4 }, hacking: { time: 12, size: -1, retries: 2.5 }, welding: { time: 3 }, social: 'lots' },
  });
  assert.deepEqual(c.points.repair, { time: 2, size: 1 }, 'level 3: time 2, then size trimmed to 1, quality 0');
  assert.deepEqual(c.points.hacking, { time: 9 }, '12 clamps to 9; negative and fractional dropped');
  assert.equal(c.points.welding, undefined);
  assert.equal(c.points.social, undefined);
});

test('the save round trip keeps points, XP and the scan', () => {
  const s = withChar({ levels: { repair: 3 }, points: { repair: { time: 2 } }, xp: { repair: 270 }, scan: { levels: { repair: 2 }, xp: { repair: 100 }, points: { repair: { time: 1 } }, at: 5 } });
  const back = decodeSave(encodeSave(s));
  assert.deepEqual(back.character.points, { repair: { time: 2 } });
  assert.deepEqual(back.character.xp, { repair: 270 });
  assert.equal(back.character.scan.levels.repair, 2);
  assert.equal(back.character.scan.levels.hacking, 1, 'the rest of the levels fill in');
  assert.deepEqual(back.character.scan.xp, { repair: 100 });
  assert.deepEqual(back.character.scan.points, { repair: { time: 1 } });
  assert.equal(back.character.scan.at, 5);
  assert.ok(encodeSave(s).length < 6000, 'a few hundred bytes more than before');
});

test('a scan is repaired too: bad levels and points fall back, a nonsense scan is dropped', () => {
  const c = captain({ scan: { levels: { repair: 99, hacking: 'x' }, xp: { repair: -4 }, points: { repair: { time: 50 } }, at: 'now' } });
  assert.equal(c.scan.levels.repair, 9);
  assert.equal(c.scan.levels.hacking, 1);
  assert.equal(c.scan.xp.repair, undefined);
  assert.deepEqual(c.scan.points.repair, { time: 9 });
  assert.equal(c.scan.at, 0);
  assert.equal(captain({ scan: 'yes' }).scan, null);
});

// ---- the Hub's numbers replace the save's -------------------------------------------

test('applyAccount: the Hub\'s points, XP and scan replace the save\'s; a tampered local value never survives', () => {
  const tampered = withChar({ levels: { repair: 9 }, points: { repair: { time: 9 } }, xp: { repair: 99999 } });
  const server = { credits: 80, holdings: {}, levels: { repair: 3 }, points: { repair: { size: 2 } }, xp: { repair: 260 }, scan: { levels: { repair: 2 }, xp: { repair: 100 }, points: {}, at: 7 }, upgrades: {} };
  const out = applyAccount(tampered, server);
  assert.equal(out.character.levels.repair, 3);
  assert.deepEqual(out.character.points, { repair: { size: 2 } });
  assert.equal(out.character.xp.repair, 260);
  assert.equal(out.character.scan.levels.repair, 2);
  assert.deepEqual(applyAccount(cleanSave({ ...out, character: { ...out.character, points: { repair: { time: 3 } } } }), server).character.points, { repair: { size: 2 } }, 'the next pull puts it back');
});

test('applyAccount: an account with no points field (an old Hub row) reads as zero points', () => {
  const out = applyAccount(withChar({ levels: { repair: 3 }, points: { repair: { time: 3 } } }), { credits: 5, holdings: {}, levels: { repair: 3 }, upgrades: {} });
  assert.deepEqual(out.character.points, {});
});

// ---- the local rules (server mode off) mirror the Hub's --------------------------------

test('local spend: one point per level, nine in a category, only adds, known ids only', () => {
  let c = captain({ levels: { repair: 3 } });
  let r = SS.spendPoints(c, 'repair', { time: 2 });
  assert.equal(r.ok, true); c = r.character;
  assert.deepEqual(c.points, { repair: { time: 2 } });
  assert.equal(SS.spendPoints(c, 'repair', { time: 2, size: 2 }).reason, 'over_level');
  assert.equal(SS.spendPoints(c, 'repair', { time: 1 }).reason, 'cannot_take_back');
  assert.equal(SS.spendPoints(c, 'repair', { time: 2 }).reason, 'no_change');
  assert.equal(SS.spendPoints(c, 'welding', { time: 3 }).reason, 'unknown_skill');
  assert.equal(SS.spendPoints(c, 'repair', { luck: 3 }).reason, 'unknown_category');
  assert.equal(SS.spendPoints(c, 'repair', { time: 10 }).reason, 'bad_points');
  assert.equal(SS.spendPoints(c, 'repair', { time: 1.5 }).reason, 'bad_points');
  assert.equal(SS.spendPoints(c, 'repair', 'lots').reason, 'bad_points');
  assert.deepEqual(c.points, { repair: { time: 2 } }, 'the input is never changed');
  assert.deepEqual(SS.spendPoints(c, 'repair', { time: 2, size: 1 }).character.points.repair, { time: 2, size: 1 });
});

test('local claim: the skill is the game\'s, 8 at most a claim, a run pays once, 30 XP an hour per skill', () => {
  let c = captain();
  const t0 = 1_000_000;
  let r = SS.claimXp(c, { game: 'repair', runId: 'run-aaaa01', xp: 6 }, t0);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paid, { repair: 6 });
  c = r.character;
  assert.equal(c.xp.repair, 6);
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'run-aaaa01', xp: 6 }, t0).reason, 'already_claimed');
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'run-aaaa02', xp: 9 }, t0).reason, 'over_max');
  assert.equal(SS.claimXp(c, { game: 'bogus', runId: 'run-aaaa03', xp: 3 }, t0).reason, 'unknown_game');
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'bad', xp: 3 }, t0).reason, 'bad_run');
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'run-aaaa04', xp: 0 }, t0).reason, 'bad_xp');
  let total = 6;
  for (let i = 0; i < 3; i++) { r = SS.claimXp(c, { game: 'repair', runId: `run-bbbb0${i}`, xp: 8 }, t0 + i); c = r.character; total += r.paid.repair; }
  assert.equal(total, 30, '6 + 8 + 8 + 8 = 30, the hour\'s cap exactly');
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'run-cccc01', xp: 1 }, t0 + 10).reason, 'hour_cap');
  assert.equal(SS.claimXp(c, { game: 'hack', runId: 'run-cccc02', xp: 8 }, t0 + 10).ok, true, 'another skill has its own hour');
  assert.equal(SS.claimXp(c, { game: 'repair', runId: 'run-cccc03', xp: 8 }, t0 + HOUR + 20).ok, true, 'a new hour, a fresh cap');
});

test('local claim: the last claim of an hour is trimmed to the room left, not refused', () => {
  let c = captain();
  for (let i = 0; i < 3; i++) c = SS.claimXp(c, { game: 'repair', runId: `run-dddd0${i}`, xp: 8 }, 100 + i).character; // 24
  const r = SS.claimXp(c, { game: 'repair', runId: 'run-dddd09', xp: 8 }, 200);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paid, { repair: 6 });
  assert.ok(r.flags.includes('hour-cap'));
});

test('local claim: levels follow XP at one level per skill per hour', () => {
  let c = captain();
  c = { ...c, xp: { repair: 95 } };
  let r = SS.claimXp(c, { game: 'repair', runId: 'run-eeee01', xp: 8 }, 1000);
  assert.equal(r.character.levels.repair, 2, '103 XP is level 2');
  c = { ...r.character, xp: { repair: 449 } };
  r = SS.claimXp(c, { game: 'repair', runId: 'run-eeee02', xp: 8 }, 2000);
  assert.equal(r.character.xp.repair, 457);
  assert.equal(r.character.levels.repair, 2, '457 is level 4 but a level landed under an hour ago: only the XP is kept');
  r = SS.claimXp(r.character, { game: 'repair', runId: 'run-eeee03', xp: 1 }, 2000 + HOUR + 1);
  assert.equal(r.character.levels.repair, 3, 'one more level next hour');
});

test('local scan and restore: back to the scan\'s levels, XP and points; credits are not touched', () => {
  let s = { ...withChar({ levels: { repair: 3 }, xp: { repair: 270 }, points: { repair: { time: 2 } } }), money: 77 };
  s = { ...s, character: SS.scan(s.character, 5) };
  assert.equal(s.character.scan.levels.repair, 3);
  assert.deepEqual(s.character.scan.points.repair, { time: 2 });
  let c = { ...s.character, levels: { ...s.character.levels, repair: 5 }, xp: { repair: 700, hacking: 40 }, points: { repair: { time: 2, size: 3 } } };
  const out = SS.restore(c);
  assert.equal(out.ok, true);
  assert.equal(out.character.levels.repair, 3);
  assert.equal(out.character.xp.repair, 270);
  assert.equal(out.character.xp.hacking, undefined);
  assert.deepEqual(out.character.points.repair, { time: 2 });
  assert.equal(out.lost.levels.repair, 2);
  assert.equal(SS.restore(out.character).ok, true, 'a second death goes to the same place');
  assert.equal(SS.restore({ ...c, scan: null }).reason, 'no_scan');
});

test('the unscanned meter reads the save: XP and levels since the scan, in plain words', () => {
  const c = captain({ levels: { repair: 3 }, xp: { repair: 270 }, scan: { levels: { repair: 2 }, xp: { repair: 100 }, points: {}, at: 1 } });
  const u = unscanned(SS.toProgress(c), SS.scanProgress(c));
  assert.equal(u.safe, false);
  assert.equal(riskLine(u), '1 skill point and 170 XP at risk since your last scan.');
  const safe = captain({ scan: SS.scan(captain(), 1).scan });
  assert.equal(unscanned(SS.toProgress(safe), SS.scanProgress(safe)).safe, true);
});

test('toProgress: XP shown as into-the-level on the Hub\'s curve; level 9 keeps none', () => {
  const p = SS.toProgress(captain({ levels: { repair: 3, hacking: 9 }, xp: { repair: 270, hacking: 9999 }, points: { repair: { time: 1 } } }));
  assert.equal(p.levels.repair, 3);
  assert.equal(p.xp.repair, 20, '270 - 250');
  assert.equal(p.xp.hacking, 0);
  assert.deepEqual(p.points, { repair: { time: 1 } });
  assert.ok(p.curve, 'the progress carries its curve so the bar uses the Hub\'s table');
});

// ---- the facade: Hub when the economy is on, local otherwise ----------------------------

function fakeHub(initial = {}) {
  const calls = [];
  const account = { credits: 80, holdings: {}, levels: { repair: 2 }, points: {}, xp: { repair: 100 }, scan: { levels: { repair: 1 }, xp: {}, points: {}, at: 1 }, upgrades: {}, ...initial };
  const api = async (path, opts) => {
    const body = opts?.body ?? null;
    calls.push([opts?.method || 'GET', path.replace('/api/games/stardust/v1', ''), body]);
    if (path.endsWith('/v1/account')) return { ok: true, status: 200, data: { ok: true, ...structuredClone(account) } };
    if (path.endsWith('/v1/skill-points')) {
      if ((body.points.time || 0) > account.levels.repair) return { ok: false, status: 400, data: { ok: false, reason: 'over_level' } };
      account.points = { [body.skill]: body.points };
      return { ok: true, status: 200, data: { ok: true } };
    }
    if (path.endsWith('/v1/xp')) { account.xp.repair += body.xp; return { ok: true, status: 200, data: { ok: true, paid: { xp: { repair: body.xp } } } }; }
    if (path.endsWith('/v1/scan')) { account.scan = { levels: { ...account.levels }, xp: { ...account.xp }, points: structuredClone(account.points), at: 9 }; return { ok: true, status: 200, data: { ok: true } }; }
    if (path.endsWith('/v1/scan/restore')) { account.levels = { ...account.scan.levels }; account.xp = { ...account.scan.xp }; account.points = structuredClone(account.scan.points); return { ok: true, status: 200, data: { ok: true, lost: { levels: { repair: 1 } } } }; }
    return { ok: true, status: 200, data: { ok: true } };
  };
  return { api, calls, account, gamePath: (p) => `/api/games/stardust${p}` };
}

test('facade, server mode off: it works on the save and never calls the Hub', async () => {
  const store = memStore(withChar({ levels: { repair: 3 } }));
  const eco = createEconomy();
  const calls = [];
  const sk = SS.createSkillSave({ store, economy: eco, now: () => 5000 });
  assert.equal((await sk.spend('repair', { time: 2 })).ok, true);
  assert.deepEqual(store.get().character.points, { repair: { time: 2 } });
  const claim = await sk.claim('repair', 6);
  assert.equal(claim.ok, true);
  assert.equal(store.get().character.xp.repair, 6);
  assert.equal((await sk.scan()).ok, true);
  await sk.claim('repair', 8);
  const back = await sk.restore();
  assert.equal(back.ok, true);
  assert.equal(store.get().character.xp.repair, 6, 'back to the scan');
  assert.equal(calls.length, 0);
});

test('facade, server mode on: spend, claim, scan and restore go to the Hub and the save takes the Hub\'s answer', async () => {
  const hub = fakeHub();
  const store = memStore(withChar({ levels: { repair: 2 } }));
  const eco = createEconomy();
  eco.enable({ api: hub.api, gamePath: hub.gamePath, store, toast: () => {} });
  const sk = SS.createSkillSave({ store, economy: eco });
  assert.deepEqual((await sk.spend('repair', { time: 1 })).ok, true);
  assert.deepEqual(hub.calls.find((c) => c[1] === '/skill-points'), ['POST', '/skill-points', { skill: 'repair', points: { time: 1 } }]);
  assert.deepEqual(store.get().character.points, { repair: { time: 1 } }, 'the save shows what the Hub stored');
  const claim = await sk.claim('repair', 6);
  assert.equal(claim.ok, true);
  const xpCall = hub.calls.find((c) => c[1] === '/xp');
  assert.equal(xpCall[2].game, 'repair');
  assert.equal(xpCall[2].xp, 6);
  assert.match(xpCall[2].runId, /^[A-Za-z0-9-]{6,64}$/);
  assert.equal(xpCall[2].skill, undefined, 'the browser never names the skill');
  assert.equal(store.get().character.xp.repair, 106);
  await sk.scan();
  assert.ok(hub.calls.some((c) => c[1] === '/scan'));
  hub.account.xp.repair += 50; hub.account.levels.repair = 2;
  const back = await sk.restore();
  assert.equal(back.ok, true);
  assert.ok(hub.calls.some((c) => c[1] === '/scan/restore'));
  assert.equal(store.get().character.xp.repair, 106);
});

test('facade, server mode on: a refused spend changes nothing and says why in plain words', async () => {
  const hub = fakeHub();
  const store = memStore(withChar({ levels: { repair: 2 }, points: {} }));
  const eco = createEconomy();
  eco.enable({ api: hub.api, gamePath: hub.gamePath, store, toast: () => {} });
  await eco.pull();
  const sk = SS.createSkillSave({ store, economy: eco });
  const r = await sk.spend('repair', { time: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'over_level');
  assert.match(r.words, /more points than that skill's level/);
  assert.deepEqual(store.get().character.points, {});
});

test('facade, server mode on: a claim the Hub refuses says so, and the XP does not move', async () => {
  const hub = fakeHub();
  hub.api0 = hub.api;
  const refusing = async (path, opts) => (path.endsWith('/v1/xp') ? { ok: false, status: 400, data: { ok: false, reason: 'hour_cap' } } : hub.api(path, opts));
  const store = memStore(withChar({ levels: { repair: 2 }, xp: { repair: 100 } }));
  const eco = createEconomy();
  eco.enable({ api: refusing, gamePath: hub.gamePath, store, toast: () => {} });
  await eco.pull();
  const sk = SS.createSkillSave({ store, economy: eco });
  const r = await sk.claim('repair', 8);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'hour_cap');
  assert.match(r.words, /all the XP this skill pays out for now/);
  assert.equal(store.get().character.xp.repair, 100);
});

test('economy.died(): a death on the Hub also restores the scan', async () => {
  const hub = fakeHub();
  const store = memStore(withChar());
  const eco = createEconomy();
  eco.enable({ api: hub.api, gamePath: hub.gamePath, store, toast: () => {} });
  await eco.died();
  assert.deepEqual(hub.calls.filter((c) => c[0] === 'POST').map((c) => c[1]), ['/death', '/scan/restore']);
});

// the picker's own arithmetic still agrees with the stored rules
test('the picker\'s cleaner and the save\'s cleaner agree on every skill', () => {
  const messy = { time: 4, size: 4, quality: 4, reload: 2, ammo: 2, spray: 2, persuade: 3, intimidate: 3, haggle: 3, handling: 2, boost: 2, landing: 2, quiet: 1, range: 1, decay: 1, speed: 1, material: 1, fuel: 1, warning: 1, retries: 1 };
  for (const skill of ROLL_SKILL_IDS) for (const level of [1, 3, 9]) {
    const c = captain({ levels: { [skill]: level }, points: { [skill]: messy } });
    const stored = c.points[skill] || {};
    const viaPicker = Object.fromEntries(Object.entries(CATEGORIES[skill].cats.reduce((a, d) => ({ ...a, [d.id]: messy[d.id] }), {})).filter(([, n]) => n));
    const clean = Object.fromEntries(Object.entries(cleanSkillPoints(skill, viaPicker, level)).filter(([, n]) => n));
    assert.deepEqual(stored, clean, `${skill} at level ${level}`);
  }
});
