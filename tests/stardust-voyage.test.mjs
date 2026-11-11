// The new game's core rules (projects/Space-Shooter/voyage/): the captain,
// money and rep, ship upgrades, the save and its account sync, and the
// cut-over switch. Everything runs against fakes: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacter, rollStats, canLearn, learn, unspentPoints, treePoints, die, check, effect, skillBonus,
  cleanCharacter, cleanName, addEarned,
} from '../projects/Space-Shooter/voyage/character.js';
import { grant, spend, canAfford, meets, missing, priceFor, discount, repBand } from '../projects/Space-Shooter/voyage/economy.js';
import {
  voyageShipStats, canUpgrade, upgrade, visualTier, raceStats, combatStats, writesBoard, buildFeel,
} from '../projects/Space-Shooter/voyage/upgrades.js';
import { emptySave, cleanSave, encodeSave, decodeSave, hasProgress, MAX_SAVE_BYTES, LOCAL_KEY } from '../projects/Space-Shooter/voyage/save.js';
import { createVoyageStore, BACKUP_KEY } from '../projects/Space-Shooter/voyage/store.js';
import { createVoyageSync, readVoyageSave, VOYAGE_SLOT } from '../projects/Space-Shooter/voyage/sync.js';
import { voyageFlag, cutOverTarget, FLAG_KEY } from '../projects/Space-Shooter/voyage/flag.js';
import { cleanFriends } from '../projects/Space-Shooter/voyage/crew.js';
import { STATS, TREES, SKILLS, GIVERS, ITEMS, UPGRADES, MAX_REP_REWARDS, REP_MAX, START_POINTS, ACTIVITIES } from '../projects/Space-Shooter/voyage/data.js';
import { buildStats } from '../projects/Space-Shooter/engine/shipStats.js';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';

// A repeatable rng: the values in turn, round and round.
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const memoryStore = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const captain = (over = {}) => ({ ...createCharacter({ name: 'Vela Quint' }, seq(0.5), () => 1000), ...over });
const withCaptain = (over = {}, save = {}) => cleanSave({ ...emptySave(), ...save, character: captain(over) });

// --- data -------------------------------------------------------------------------

test('data: four stats, three trees with a small overlap, every skill in a known tree, ids unique', () => {
  assert.deepEqual(STATS.map((s) => s.id), ['cha', 'con', 'dex', 'wis']);
  assert.equal(TREES.length, 3);
  const trees = new Set(TREES.map((t) => t.id));
  for (const s of SKILLS) for (const t of s.trees) assert.ok(trees.has(t), `${s.id} in unknown tree ${t}`);
  const overlap = SKILLS.filter((s) => s.trees.length > 1);
  assert.ok(overlap.length >= 1 && overlap.length <= 4, 'a touch of overlap, not a merge');
  for (const list of [STATS, TREES, SKILLS, GIVERS, ITEMS, UPGRADES]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  for (const g of GIVERS) assert.ok(MAX_REP_REWARDS[g.id], `${g.id} has a max-rep reward`);
  assert.equal(runtimeConfig.voyage, false, 'the new game stays off on main until Donaven switches it on');
});

// --- character --------------------------------------------------------------------

test('character: a name, a look and four 1d6 stats; bad names are refused or cleaned', () => {
  const c = createCharacter({ name: '  Vela   <b>Quint</b>  ', look: { portrait: 'p3', color: '#FFAD72' } }, seq(0, 0.99, 0.5, 0.2, 0.7), () => 1234);
  assert.equal(c.name, 'Vela bQuint/b');
  assert.deepEqual(c.look, { portrait: 'p3', color: '#ffad72' });
  for (const v of Object.values(c.stats)) assert.ok(v >= 1 && v <= 6);
  assert.equal(c.earned, START_POINTS);
  assert.equal(c.createdAt, 1234);
  assert.equal(createCharacter({ name: '   ' }), null);
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  const stats = rollStats(seq(0, 0.999));
  assert.deepEqual(stats, { cha: 1, con: 6, dex: 1, wis: 6 });
});

test('character: spending points, tree requirements and an overlap skill counting for both trees', () => {
  let c = captain({ earned: 6 });
  assert.equal(unspentPoints(c), 6);
  assert.equal(canLearn(c, 'star-charts').ok, false, 'needs 2 points in Helm first');
  assert.match(canLearn(c, 'star-charts').reason, /2 points in Helm/);
  c = learn(learn(c, 'smooth-burn'), 'tight-turns');
  assert.equal(treePoints(c, 'helm'), 2);
  assert.equal(canLearn(c, 'star-charts').ok, true);
  assert.equal(canLearn(c, 'strafe-run').ok, false, 'overlap needs a point in Guns too');
  c = learn(c, 'steady-aim');
  c = learn(c, 'strafe-run');
  assert.equal(c.skills['strafe-run'], 1);
  assert.equal(treePoints(c, 'helm'), 3, 'the overlap rank counts in Helm');
  assert.equal(treePoints(c, 'guns'), 2, 'and in Guns');
  assert.equal(unspentPoints(c), 2);
  c = learn(learn(c, 'smooth-burn'), 'smooth-burn');
  assert.equal(unspentPoints(c), 0);
  assert.equal(learn(c, 'patch-kit'), c, 'no points: nothing changes');
  assert.match(canLearn(c, 'patch-kit').reason, /No skill points/);
  assert.match(canLearn(captain({ earned: 9, skills: { 'smooth-burn': 3 } }), 'smooth-burn').reason, /top rank/);
});

test('character: death loses half the earned points (spent and unspent), refunds skills, rerolls stats, keeps permanent points', () => {
  const c = captain({ earned: 7, permanent: 2, skills: { 'smooth-burn': 3, 'patch-kit': 2 }, stats: { cha: 6, con: 6, dex: 6, wis: 6 } });
  const { character, lost } = die(c, seq(0));
  assert.equal(lost, 3, 'half of 7, rounded down');
  assert.equal(character.earned, 4);
  assert.equal(character.permanent, 2, 'max-rep points are safe');
  assert.deepEqual(character.skills, {});
  assert.equal(unspentPoints(character), 6);
  assert.deepEqual(character.stats, { cha: 1, con: 1, dex: 1, wis: 1 }, 'fresh 1d6 rolls');
  assert.equal(character.deaths, 1);
  assert.equal(character.name, c.name);
  assert.equal(die(captain({ earned: 1 }), seq(0.5)).lost, 0, 'one point: nothing to halve away');
});

test('character: checks are 1d6 + stat + skill bonus; stat effects count from a baseline of 3', () => {
  const c = captain({ stats: { cha: 5, con: 1, dex: 3, wis: 3 }, skills: { 'smooth-talk': 2 }, earned: 4 });
  assert.equal(skillBonus(c, 'talk'), 2);
  assert.deepEqual(check(c, { stat: 'cha', tag: 'talk', dc: 10 }, seq(0.5)), { roll: 4, bonus: 7, total: 11, dc: 10, pass: true });
  assert.equal(check(null, { stat: 'cha', dc: 7 }, seq(0)).total, 4, 'no captain counts the stat as 3');
  assert.equal(effect(c, 'price'), 4, 'charisma 5 is two over the baseline at 2% each');
  assert.equal(effect(c, 'ship.hp'), -10, 'constitution 1 costs hull');
  assert.equal(effect(c, 'rep'), 20, 'two over baseline at 5%, plus Smooth Talker 2 x 5%');
});

test('character: cleaning repairs bad saves and refunds ranks that no longer fit the points', () => {
  assert.equal(cleanCharacter(null), null);
  assert.equal(cleanCharacter({ name: '' }), null);
  const c = cleanCharacter({ name: 'Ash', stats: { cha: 9, con: 'x' }, skills: { 'smooth-burn': 7, nope: 1 }, earned: 10 });
  assert.equal(c.stats.cha, 3);
  assert.equal(c.stats.con, 3);
  assert.deepEqual(c.skills, { 'smooth-burn': 3 });
  assert.deepEqual(cleanCharacter({ name: 'Ash', skills: { 'smooth-burn': 3 }, earned: 1 }).skills, {});
  assert.deepEqual(addEarned(captain({ earned: 2, skills: { 'smooth-burn': 2 } }), -2).skills, {}, 'taking points back refunds');
});

// --- money and rep ----------------------------------------------------------------

test('economy: a reward pays money, rep, items, points and flags and says so in events', () => {
  const { save, events } = grant(withCaptain(), { money: 120, rep: { 'relay-guild': 10 }, items: { scrap: 4, railgun: 1 }, skillPoints: 1, flags: { 'met-ossa': 1 } });
  assert.equal(save.money, 120);
  assert.equal(save.rep['relay-guild'], 10);
  assert.deepEqual(save.items, { scrap: 4, railgun: 1 });
  assert.equal(save.character.earned, START_POINTS + 1);
  assert.equal(save.flags['met-ossa'], 1);
  assert.deepEqual(events.map((e) => e.type), ['money', 'rep', 'item', 'item', 'skill-points', 'flag']);
});

test('economy: fines and losses clamp at zero; rep clamps 0..100; stacks clamp to the item max', () => {
  const start = cleanSave({ money: 50, rep: { 'relay-guild': 5 }, items: { permit: 1 } });
  const { save } = grant(start, { money: -80, rep: { 'relay-guild': -20, 'hollow-choir': 500 }, items: { permit: 3, scrap: -2 } });
  assert.equal(save.money, 0);
  assert.equal(save.rep['relay-guild'], undefined, 'zero rep is not stored');
  assert.equal(save.rep['hollow-choir'], REP_MAX);
  assert.equal(save.items.permit, 1, 'a key item stacks to 1');
  assert.equal(save.items.scrap, undefined);
});

test('economy: max rep pays permanent points and account unlocks once; banked without a captain', () => {
  let { save, events } = grant(withCaptain(), { rep: { 'relay-guild': 100 } });
  assert.equal(save.character.permanent, MAX_REP_REWARDS['relay-guild'].permanent);
  assert.deepEqual(save.account.unlocks, MAX_REP_REWARDS['relay-guild'].unlocks);
  assert.ok(events.some((e) => e.type === 'max-rep'));
  ({ save } = grant(grant(save, { rep: { 'relay-guild': -50 } }).save, { rep: { 'relay-guild': 50 } }));
  assert.equal(save.character.permanent, MAX_REP_REWARDS['relay-guild'].permanent, 'paid once per save');
  assert.equal(grant(emptySave(), { rep: { 'ember-syndicate': 100 } }).save.account.bank, 2);
  assert.ok(grant(withCaptain(), { rep: { 'relay-guild': 1 }, unlocks: ['badge:first-run', 'bogus'] }).save.account.unlocks.includes('badge:first-run'));
  assert.equal(grant(withCaptain(), { unlocks: ['bogus'] }).events.length, 0);
});

test('economy: rep gains are raised by the captain rep bonus; prices lowered by the discount', () => {
  const s = withCaptain({ stats: { cha: 6, con: 3, dex: 3, wis: 3 } });
  assert.equal(grant(s, { rep: { 'relay-guild': 10 } }).save.rep['relay-guild'], 11, '+15% rounded down');
  assert.equal(grant(s, { rep: { 'relay-guild': -10 } }).save.rep['relay-guild'], undefined, 'losses are not raised');
  assert.equal(discount(s), 6);
  assert.equal(priceFor(s, 100), 94);
});

test('economy: spend, canAfford, meets and missing', () => {
  const s = withCaptain({ stats: { cha: 4, con: 3, dex: 3, wis: 3 }, skills: { 'patch-kit': 1 }, earned: 2 }, { money: 100, items: { scrap: 3 }, rep: { 'relay-guild': 20 }, flags: { 'met-ossa': 1 } });
  assert.equal(canAfford(s, { money: 100, items: { scrap: 3 } }), true);
  assert.equal(canAfford(s, { money: 101 }), false);
  const paid = spend(s, { money: 40, items: { scrap: 3 } });
  assert.equal(paid.ok, true);
  assert.equal(paid.save.money, 60);
  assert.equal(paid.save.items.scrap, undefined);
  const refused = spend(s, { items: { ore: 1 } });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /1 Ore/);
  assert.equal(refused.save.money, 100);
  assert.equal(meets(s, { rep: { 'relay-guild': 20 }, stats: { cha: 4 }, skills: { 'patch-kit': 1 }, trees: { wrench: 1 }, flags: { 'met-ossa': 1 }, notFlags: ['betrayed'] }), true);
  assert.equal(meets(s, { notFlags: ['met-ossa'] }), false);
  assert.equal(meets(s, { anyOf: [{ items: { permit: 1 } }, { rep: { 'relay-guild': 10 } }] }), true);
  assert.equal(meets(s, { anyOf: [{ items: { permit: 1 } }, { rep: { 'relay-guild': 50 } }] }), false);
  assert.deepEqual(missing(s, { rep: { 'relay-guild': 40 }, upgrades: { engine: 1 } }), ['Needs 40 rep with Relay Guild.', 'Needs Engine tier 1.']);
  assert.equal(repBand(0), 'Stranger');
  assert.equal(repBand(100), 'Sworn');
});

// --- ship upgrades ----------------------------------------------------------------

test('upgrades: tiers cost money and parts, tier 3 guns needs the railgun, stats rise', () => {
  let s = cleanSave({ money: 5000, items: { scrap: 20, ore: 10, circuit: 4 } });
  const stock = voyageShipStats(s);
  assert.deepEqual(stock, { hp: 100, speed: 1, accel: 1, turn: 1, damage: 10, heat: 100, cargo: 4 });
  for (let i = 0; i < 2; i++) { const r = upgrade(s, 'guns'); assert.equal(r.ok, true, r.reason); s = r.save; }
  const third = canUpgrade(s, 'guns');
  assert.equal(third.ok, false);
  assert.match(third.reasons.join(' '), /Railgun/);
  s = grant(s, { items: { railgun: 1 } }).save;
  s = upgrade(s, 'guns').save;
  assert.equal(s.upgrades.guns, 3);
  assert.equal(s.items.railgun, undefined, 'the railgun is fitted');
  assert.equal(canUpgrade(s, 'guns').reasons[0], 'Fully upgraded.');
  assert.equal(voyageShipStats(s).damage, 21);
  assert.equal(s.money, 5000 - 200 - 500 - 1000);
  assert.equal(visualTier(s), 0);
  assert.equal(visualTier(cleanSave({ upgrades: { hull: 3, engine: 3, thrusters: 2, guns: 1 } })), 2);
  assert.equal(upgrade(cleanSave({}), 'hull').ok, false);
});

test('upgrades: the equipped build gives the ship its feel (read only) and the captain adds on top', () => {
  const needle = buildFeel('needle:0-0-0-0');
  const raw = buildStats('needle:0-0-0-0');
  assert.equal(needle.speed, 1 + (raw.topSpeed - 1) * 0.5);
  assert.deepEqual(buildFeel(null), { speed: 1, accel: 1, turn: 1 });
  const s = withCaptain({ stats: { cha: 3, con: 5, dex: 3, wis: 3 }, skills: { reinforced: 2 }, earned: 2 });
  assert.equal(voyageShipStats(s).hp, 100 + 10 + 20);
  assert.deepEqual(buildStats('needle:0-0-0-0'), raw, 'the racing stat table is never changed');
});

test('upgrades: classic boards fly the build exactly as today; new races and fights get the upgrades', () => {
  const s = withCaptain({}, { upgrades: { engine: 2, thrusters: 1, guns: 1 } });
  const build = 'manta:0-0-0-0';
  assert.deepEqual(raceStats(s, build, 'classic-race'), { ...buildStats(build) });
  assert.deepEqual(raceStats(cleanSave({}), build, 'race'), { ...buildStats(build) }, 'stock save: same as the build');
  const race = raceStats(s, build, 'race');
  assert.ok(race.topSpeed > buildStats(build).topSpeed && race.grip > buildStats(build).grip);
  assert.equal(combatStats(s, null, 'arena').damage, 10, 'the Dogfight arena stays level');
  assert.equal(combatStats(s, null, 'ship-fight').damage, 12);
  assert.equal(writesBoard('race', 'classic'), false);
  assert.equal(writesBoard('classic-race', 'classic'), true);
  for (const [id, a] of Object.entries(ACTIVITIES)) if (a.upgrades) assert.notEqual(a.boards, 'classic', `${id} must not write the classic boards`);
});

// --- the save ---------------------------------------------------------------------

test('save: cleaning keeps good fields, drops bad ones, keeps unknown keys and quest state', () => {
  const s = cleanSave({
    updatedAt: 5, money: -3, rep: { 'relay-guild': 140, 'Bad Id': 3 }, items: { scrap: 2.7, ore: 0 },
    upgrades: { hull: 9, engine: -1, junk: 2 }, flags: { a: 2 }, account: { unlocks: ['title:x', 'nope', 'title:x'], maxRep: { 'relay-guild': 3 } },
    quests: { q1: { step: 2 } }, future: { keep: true }, character: { name: 'Ash' },
  });
  assert.equal(s.money, 0);
  assert.deepEqual(s.rep, { 'relay-guild': 100 });
  assert.deepEqual(s.items, { scrap: 2 });
  assert.deepEqual(s.upgrades, { hull: 3, engine: 0, thrusters: 0, guns: 0 });
  assert.deepEqual(s.account.unlocks, ['title:x']);
  assert.deepEqual(s.account.maxRep, { 'relay-guild': 1 });
  assert.deepEqual(s.quests, { q1: { step: 2 } });
  assert.deepEqual(s.future, { keep: true });
  assert.equal(s.character.name, 'Ash');
  assert.deepEqual(cleanSave(cleanSave(s)), s, 'cleaning is stable');
  assert.deepEqual(decodeSave('not json'), emptySave());
  assert.deepEqual(decodeSave(encodeSave(s)), s);
  assert.deepEqual(cleanSave({ quests: { big: 'x'.repeat(40 * 1024) } }).quests, {}, 'quest state over its 32 KB budget is dropped');
  assert.equal(encodeSave({ ...s, huge: 'x'.repeat(MAX_SAVE_BYTES) }), null, 'too big for the account slot');
  assert.equal(hasProgress(emptySave()), false);
  assert.equal(hasProgress(s), true);
});

test('store: changes save at once in this browser, stamp the clock, and survive a reload', () => {
  const storage = memoryStore();
  let t = 1000;
  const store = createVoyageStore({ storage, now: () => t });
  const seen = [];
  store.subscribe((save, source) => seen.push(source));
  assert.equal(store.createCharacter({ name: '' }).ok, false);
  assert.equal(store.createCharacter({ name: 'Vela' }, seq(0.5)).ok, true);
  assert.equal(store.createCharacter({ name: 'Again' }).ok, false, 'one captain per save');
  t = 900; // a clock that went backwards still moves the stamp forward
  store.grant({ money: 300, items: { scrap: 4 } });
  assert.equal(store.get().updatedAt, 1001);
  assert.equal(store.upgrade('hull').ok, true);
  assert.equal(store.learn('patch-kit'), true);
  const copy = store.get();
  copy.money = 1e6;
  assert.equal(store.get().money, 153, 'get() hands out a copy (300 less hull tier 1 at 150 with charisma 4\'s 2% off)');
  const lost = store.die(seq(0));
  assert.equal(lost, 1);
  assert.deepEqual(seen, ['local', 'local', 'local', 'local', 'local']);
  const reloaded = createVoyageStore({ storage, now: () => t });
  assert.deepEqual(reloaded.get(), store.get());
  assert.ok(storage.getItem(LOCAL_KEY));
  assert.equal(store.update((s) => ({ ...s, quests: { q1: { step: 1 } } })), true);
  assert.deepEqual(createVoyageStore({ storage }).get().quests, { q1: { step: 1 } });
});

test('store: max-rep points banked before there was a captain go to the new captain', () => {
  const store = createVoyageStore({ storage: memoryStore(), now: () => 1 });
  store.grant({ rep: { 'relay-guild': 100 } });
  assert.equal(store.get().account.bank, 2);
  store.createCharacter({ name: 'Late' }, seq(0.5));
  assert.equal(store.get().character.permanent, 2);
  assert.equal(store.get().account.bank, 0);
});

test('store: a browser that refuses storage still plays for the session', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const store = createVoyageStore({ storage: broken, now: () => 1 });
  store.grant({ money: 10 });
  assert.equal(store.get().money, 10);
  assert.equal(store.stored, false);
});

// --- account sync -----------------------------------------------------------------

function fakeHub({ remote = null, putStatus = 200, getStatus = null } = {}) {
  const calls = [];
  let slot = remote ? { version: 1, data: remote } : null;
  return {
    calls,
    get slot() { return slot; },
    api: async (path, { method = 'GET', body } = {}) => {
      calls.push({ method, path });
      if (method === 'GET') {
        if (getStatus) return { ok: false, status: getStatus, data: null };
        return slot ? { ok: true, status: 200, data: { slot: VOYAGE_SLOT, ...slot } } : { ok: false, status: 404, data: { error: 'not_found' } };
      }
      if (putStatus !== 200) return { ok: false, status: putStatus, data: putStatus === 409 ? { error: 'no_free_slot' } : null };
      slot = body;
      return { ok: true, status: 200, data: {} };
    },
  };
}
const timers = () => { const q = []; return { q, setTimer: (fn) => { q.push(fn); return q.length; }, clearTimer: () => {}, run: () => { while (q.length) q.shift()(); } }; };
const quiet = { warn() {} };

test('sync: a signed-in captain with no account copy pushes theirs to the voyage slot', async () => {
  const hub = fakeHub();
  const store = createVoyageStore({ storage: memoryStore(), now: () => 50 });
  store.createCharacter({ name: 'Vela' }, seq(0.5));
  const statuses = [];
  const sync = createVoyageSync({ api: hub.api, gamePath: (p) => `/api/games/stardust${p}`, signedIn: () => true, store, emit: (s) => statuses.push(s), log: quiet });
  await sync.onSession();
  assert.deepEqual(hub.calls.map((c) => `${c.method} ${c.path}`), ['GET /api/games/stardust/saves/voyage', 'PUT /api/games/stardust/saves/voyage']);
  assert.equal(hub.slot.version, 1);
  assert.equal(hub.slot.data.character.name, 'Vela');
  assert.equal(statuses.at(-1), 'saved');
});

test('sync: a newer account copy replaces this browser, keeping a backup of local progress', async () => {
  const storage = memoryStore();
  const store = createVoyageStore({ storage, now: () => 10 });
  store.grant({ money: 5 });
  const remote = { ...emptySave(), updatedAt: 999, money: 700, character: captain() };
  const hub = fakeHub({ remote });
  const sync = createVoyageSync({ api: hub.api, gamePath: (p) => p, signedIn: () => true, store, log: quiet });
  await sync.onSession();
  assert.equal(store.get().money, 700);
  assert.equal(store.get().updatedAt, 999, 'the account copy keeps its stamp');
  assert.equal(JSON.parse(storage.getItem(BACKUP_KEY)).money, 5);
  assert.equal(hub.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('sync: a newer local save is pushed; changes go up after a pause; guests never call the hub', async () => {
  const store = createVoyageStore({ storage: memoryStore(), now: () => 5000 });
  store.grant({ money: 9 });
  const hub = fakeHub({ remote: { ...emptySave(), updatedAt: 100, money: 1 } });
  const t = timers();
  const sync = createVoyageSync({ api: hub.api, gamePath: (p) => p, signedIn: () => true, store, log: quiet, setTimer: t.setTimer, clearTimer: t.clearTimer });
  await sync.onSession();
  assert.equal(hub.slot.data.money, 9);
  store.grant({ money: 1 });
  sync.changed();
  assert.equal(sync.status(), 'saving');
  t.run();
  await sync.flush();
  await new Promise((r) => setImmediate(r));
  assert.equal(hub.slot.data.money, 10);

  const guestHub = fakeHub();
  const guest = createVoyageSync({ api: guestHub.api, gamePath: (p) => p, signedIn: () => false, store, log: quiet });
  await guest.onSession();
  guest.changed();
  assert.equal(guestHub.calls.length, 0);
  assert.equal(guest.status(), 'guest');
});

test('sync: no free slot keeps the save on this device; an unreachable hub reads offline', async () => {
  const store = createVoyageStore({ storage: memoryStore(), now: () => 5 });
  store.grant({ money: 3 });
  const full = fakeHub({ putStatus: 409 });
  const sync = createVoyageSync({ api: full.api, gamePath: (p) => p, signedIn: () => true, store, log: quiet });
  await sync.onSession();
  assert.equal(sync.blocked, true);
  assert.equal(sync.status(), 'no-slot');
  assert.equal(store.get().money, 3);
  const down = fakeHub({ getStatus: 503 });
  const off = createVoyageSync({ api: down.api, gamePath: (p) => p, signedIn: () => true, store, log: quiet });
  await off.onSession();
  assert.equal(off.status(), 'offline');
  assert.equal(readVoyageSave({ data: [] }), null);
  assert.equal(readVoyageSave({ data: { money: 4 } }).money, 4);
});

// --- the switch -------------------------------------------------------------------

test('flag: off by default; ?voyage=on opens the tab for its session; dev tools only with the override', () => {
  const session = memoryStore();
  assert.deepEqual(voyageFlag({ config: { voyage: false }, search: '', session }), { enabled: false, override: false, dev: false });
  assert.equal(voyageFlag({ config: {}, search: '?voyage=on&dev=1', session }).dev, true);
  assert.equal(session.getItem(FLAG_KEY), 'on');
  assert.equal(voyageFlag({ config: {}, search: '', session }).enabled, true, 'remembered for the session');
  assert.equal(voyageFlag({ config: {}, search: '?voyage=off', session }).enabled, false);
  assert.equal(session.getItem(FLAG_KEY), null);
  assert.deepEqual(voyageFlag({ config: { voyage: true }, search: '?dev=1', session }), { enabled: true, override: false, dev: false });
});

test('cut-over: with the switch on a bare visit goes to the new hangar; deep links keep today\'s pages', () => {
  assert.equal(cutOverTarget({ config: { voyage: false }, search: '' }), null);
  assert.equal(cutOverTarget({ config: { voyage: true }, search: '' }), './voyage/');
  for (const search of ['?weekly=weekly-02', '?vs=pilot', '?import=ship&from=x', '?challenge=abc', '?lab=grip', '?activity=classic'])
    assert.equal(cutOverTarget({ config: { voyage: true }, search }), null, search);
});

test('crew: friends from the hub are cleaned and capped', () => {
  assert.deepEqual(cleanFriends(null), []);
  const many = Array.from({ length: 80 }, (_, i) => ({ username: `p${i}` }));
  assert.equal(cleanFriends({ friends: [...many, { username: 7 }, { username: 'x'.repeat(65) }] }).length, 50);
});
