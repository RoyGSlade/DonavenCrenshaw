// The approved skills menu in the new game's datapad (skills-menu lane, 2026-11-18).
// Written before the build, against the outcome in launch/SKILLSBUILD-LANE.md:
//   - every effect line is the mini-game setup's own number, for every skill and point count
//   - points you add are pending until Lock in; "-" takes back only pending ones; points never pass the level
//   - after a lock, getting points back is a nap at the bunk (10 credits a point, free in the tutorial)
//   - the risk panel and the XP bar come from the skill save's numbers
//   - every art piece is behind one hook; the old node tree is gone from the new game, today's game is untouched
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ready as modulesReady } from '../projects/Space-Shooter/voyage/modules/registry.js';
await modulesReady(); // gym games and scene hooks come from the module registry

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = '../projects/Space-Shooter/voyage';
const M = await import(`${V}/skills/model.js`);
const A = await import(`${V}/skills/art.js`);
const { ROLL_SKILL_IDS, SKILL_CATEGORY_IDS, POINT_MAX } = await import(`${V}/data.js`);
const { CATEGORIES, describeCategory } = await import(`${V}/minigames/picker.js`);
const S = await import(`${V}/minigames/setup.js`);
const { createCharacter } = await import(`${V}/character.js`);
const { emptySave } = await import(`${V}/save.js`);
const { toProgress, scanProgress, scan: scanChar, XP_CURVE } = await import(`${V}/skillSave.js`);
const { runtimeConfig } = await import('../projects/Space-Shooter/runtime-config.js');
const Nap = await import(`${V}/datapad/nap.js`);
const { BASICS_DATA } = await import(`${V}/datapad/data.js`);
const { HANGAR_DATA } = await import(`${V}/hangarData.js`);

// The design's sample captain (Main.dc.html): who has which level, with some points spent.
const LEVELS = { shooting: 3, piloting: 2, stealth: 1, hacking: 2, repair: 4, crafting: 1, social: 3, navigation: 1 };
const SPENT = { shooting: { reload: 1, ammo: 1 }, piloting: { handling: 1 }, hacking: { time: 1 }, repair: { time: 1, size: 1 }, social: { persuade: 1, haggle: 1 } };
const captain = (extra = {}) => {
  const c = createCharacter({ name: 'Vela', look: { portrait: 'p1', color: '#81e6df' } }, () => 0.5, () => 1);
  const xp = Object.fromEntries(Object.entries(LEVELS).map(([id, l]) => [id, XP_CURVE[l - 1] + 7]));
  return scanChar({ ...c, levels: { ...c.levels, ...LEVELS }, xp, points: SPENT, ...extra }, 5);
};
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const progress = (c = captain()) => toProgress(c);
const scanOf = (c = captain()) => scanProgress(c);

test('eight skills in the design order, each with its own colour, emblem and plain words', () => {
  assert.deepEqual(M.SKILL_ORDER, ['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation']);
  assert.deepEqual(M.SKILL_ORDER, [...ROLL_SKILL_IDS]);
  const colours = { shooting: '#FF7A59', piloting: '#4FC3F7', stealth: '#9C8CFF', hacking: '#3DDC97', repair: '#5EE6E6', crafting: '#FFB547', social: '#FF8AC4', navigation: '#C8E06B' };
  for (const id of M.SKILL_ORDER) {
    const look = M.SKILL_UI[id];
    assert.equal(look.color.toUpperCase(), colours[id], `${id} keeps the design colour`);
    assert.ok(look.icon && look.tagline && look.short && look.name, `${id} has an emblem path and words`);
    assert.deepEqual(look.cats.map((c) => c.id), [...SKILL_CATEGORY_IDS[id]], `${id} paths are the save's categories, in order`);
    assert.ok(look.cats.every((c) => c.name), `${id} paths have names`);
  }
  assert.equal(new Set(M.SKILL_ORDER.map((id) => M.SKILL_UI[id].icon)).size, 8, 'no two emblems alike');
});

test('every effect line equals the mini-game setup, for every skill, category and point count', () => {
  for (const skill of M.SKILL_ORDER) {
    const ids = SKILL_CATEGORY_IDS[skill];
    assert.deepEqual(CATEGORIES[skill].cats.map((c) => c.id), [...ids]);
    ids.forEach((cat, ci) => {
      for (let n = 0; n <= POINT_MAX; n++) {
        const row = M.catRows({ skill, level: 9, locked: {}, pending: { [cat]: n } })[ci];
        const words = CATEGORIES[skill].cats[ci].words;
        const picker = describeCategory(skill, { [cat]: n }, 9, cat);
        assert.equal(row.now, n === 0 ? `No points yet: ${words(0)}` : cap(words(n)), `${skill}.${cat}@${n}`);
        if (n > 0) assert.equal(row.now.toLowerCase(), picker.now.toLowerCase(), 'the picker says the same');
        if (n < POINT_MAX) assert.ok(row.nextWords.toLowerCase().includes(picker.next.toLowerCase()) || /^No (change yet|further change)/.test(row.nextWords), `${skill}.${cat} next at ${n}`);
      }
    });
  }
  // And against the setups directly, so the card cannot drift from the game.
  const words = (skill, cat, n) => M.catRows({ skill, level: 9, locked: {}, pending: { [cat]: n } })[SKILL_CATEGORY_IDS[skill].indexOf(cat)].now;
  for (let n = 0; n <= 9; n++) {
    const size = S.setupRepair({ points: { size: n } }).size;
    assert.match(words('repair', 'size', n), new RegExp(`${size} x ${size} board`, 'i'));
    assert.match(words('repair', 'time', n), new RegExp(`\\(${S.setupRepair({ points: { time: n } }).capacity} s( of one leak)?\\)`, 'i'));
    assert.match(words('piloting', 'handling', n), new RegExp(`drift power ${(Math.round(S.setupPilot({ points: { handling: n }, level: 9 }).drift * 10) / 10)}`, 'i'));
    assert.match(words('piloting', 'landing', n), new RegExp(`touchdown speed ${S.setupPilot({ points: { landing: n }, level: 9 }).safe}`, 'i'));
    assert.match(words('social', 'persuade', n), new RegExp(`trust needed ${S.setupPersuade({ points: { persuade: n }, level: 9 }).goal}`, 'i'));
    assert.match(words('social', 'intimidate', n), new RegExp(`first push ${S.setupIntimidate({ points: { intimidate: n }, level: 9 }).chances[0]}%`, 'i'));
  }
  // The rest of the skills against their setups' own fields (repair v2 is merged: no clock, a pool).
  const f1 = (x) => String(Math.round(x * 10) / 10);
  for (let n = 0; n <= 9; n++) {
    const one = (setup, skill, cat) => setup({ points: { [cat]: n }, level: 9 });
    assert.match(words('hacking', 'time', n), new RegExp(`${n ? '\\+' : ''}${f1(one(S.setupHack, 'hacking', 'time').time - S.HACK_BASE.time)} s on every firewall`, 'i'));
    assert.match(words('hacking', 'size', n), new RegExp(`mirrors start up to ${one(S.setupHack, 'hacking', 'size').spread} steps off, ${Math.floor(n / 2)} fewer decoy`, 'i')); // hacking v2 (mirrors) wording, from picker.js
    assert.ok(one(S.setupHack, 'hacking', 'size').mirrors.every((m) => m >= 1), 'the v2 setup never goes under 1 path mirror');
    assert.match(words('hacking', 'retries', n), new RegExp(`${n ? '\\+' : ''}${one(S.setupHack, 'hacking', 'retries').retries - 1} ${n === 1 ? 'retry' : 'retries'} on the same board`, 'i')); // v2: retries = 1 + points
    // navigation is Perihelion on this branch (picker.js words), not the lane run's old cost lines
    assert.match(words('navigation', 'time', n), new RegExp(`fires ${f1(S.setupPerihelion({ points: { time: n }, level: 9 }).window)} s of each burn`, 'i'));
    assert.match(words('navigation', 'fuel', n), new RegExp(`cost ${f1(4 * n)}% less fuel`, 'i'));
    assert.match(words('navigation', 'warning', n), new RegExp(`the arc shows ${Math.round(S.setupPerihelion({ points: { warning: n }, level: 9 }).arc * 100)}% of the burn`, 'i'));
    assert.match(words('stealth', 'quiet', n), new RegExp(`adds ${f1(12 * one(S.setupStealth, 'stealth', 'quiet').noiseFactor)} heat`, 'i'));
    assert.match(words('stealth', 'range', n), new RegExp(`cones ${f1(4 * one(S.setupStealth, 'stealth', 'range').rangeFactor)} cells`, 'i'));
    assert.match(words('stealth', 'decay', n), new RegExp(`cools ${one(S.setupStealth, 'stealth', 'decay').decay} heat`, 'i'));
    assert.match(words('crafting', 'quality', n), new RegExp(`${n ? '\\+' : ''}${one(S.setupCraft, 'crafting', 'quality').qualityBonus} quality`, 'i'));
    assert.match(words('crafting', 'speed', n), new RegExp(`${one(S.setupCraft, 'crafting', 'speed').strikes} shaping steps`, 'i'));
    assert.match(words('social', 'haggle', n), new RegExp(`${n ? '\\+' : ''}${f1(one(S.setupHaggle, 'social', 'haggle').priceBonus * 100)}% better final price`, 'i'));
  }
  assert.match(words('shooting', 'reload', 3), /reload takes/i); // shooting is built now (trainer gallery)
});

test('"now" and "one more point" follow the points you hold, locked plus pending', () => {
  const c = captain();
  const rows = M.catRows({ skill: 'repair', level: 4, locked: c.points.repair, pending: { quality: 1 } });
  assert.deepEqual(rows.map((r) => [r.id, r.locked, r.pending, r.points]), [['time', 1, 0, 1], ['size', 1, 0, 1], ['quality', 0, 1, 1]]);
  assert.match(rows[2].now, /\+4 quality/);
  assert.match(rows[2].nextWords, /\+8 quality/);
  assert.equal(rows[0].canAdd, true, 'one free point left (4 - 2 locked - 1 pending)');
  // With no free point, one more still shows its number but says it needs a point.
  const full = M.catRows({ skill: 'repair', level: 4, locked: c.points.repair, pending: { quality: 2 } });
  assert.equal(full[0].canAdd, false);
  assert.match(full[0].nextWords, /needs a free point/);
  assert.equal(M.catRows({ skill: 'repair', level: 9, locked: { time: 9 }, pending: {} })[0].nextWords, 'Maxed out.');
});

test('pending points: add, take back only pending, never past the level or 9 in a category', () => {
  const p = progress();
  let pend = {};
  // Repair is level 4 with 2 locked: two free.
  assert.equal(M.leftOf(p, pend, 'repair'), 2);
  pend = M.addPending(p, pend, 'repair', 'quality');
  pend = M.addPending(p, pend, 'repair', 'quality');
  assert.deepEqual(pend, { repair: { quality: 2 } });
  assert.equal(M.leftOf(p, pend, 'repair'), 0);
  assert.deepEqual(M.addPending(p, pend, 'repair', 'time'), pend, 'no free point: nothing added');
  // Minus takes back pending only.
  pend = M.takePending(p, pend, 'repair', 'quality');
  assert.deepEqual(pend, { repair: { quality: 1 } });
  assert.deepEqual(M.takePending(p, pend, 'repair', 'time'), pend, 'a locked point stays: no pending in that category');
  pend = M.takePending(p, pend, 'repair', 'quality');
  assert.deepEqual(pend, {}, 'an empty skill leaves no clutter');
  assert.equal(M.totalPoints(p, {}, 'repair'), 2);
  // Property: random walks never break the level cap, the category cap or the locked floor.
  let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (const skill of M.SKILL_ORDER) {
    const pr = { ...p, levels: { ...p.levels, [skill]: 9 }, points: { ...p.points, [skill]: {} } };
    let pe = {};
    for (let i = 0; i < 200; i++) {
      const cat = SKILL_CATEGORY_IDS[skill][Math.floor(rnd() * 3)];
      pe = rnd() < 0.7 ? M.addPending(pr, pe, skill, cat) : M.takePending(pr, pe, skill, cat);
      const total = Object.values(pe[skill] || {}).reduce((a, b) => a + b, 0);
      assert.ok(total <= 9 && Object.values(pe[skill] || {}).every((n) => n >= 0 && n <= 9), 'caps hold');
    }
  }
});

test('clicking a notch: fills up to it as pending, takes back by clicking the last pending one, never touches locked', () => {
  const p = progress(); // repair: time 1, size 1 locked; level 4
  let r = M.pressNotch(p, {}, 'repair', 'quality', 2); // notch index 2 = third notch
  assert.equal(r.kind, 'add');
  assert.deepEqual(r.pending, { repair: { quality: 2 } }, 'fills to the third notch, capped by the 2 free points');
  assert.equal(r.fresh, 1, 'the pulse is on the notch that just filled last');
  r = M.pressNotch(p, r.pending, 'repair', 'quality', 1); // click the last pending notch
  assert.equal(r.kind, 'take');
  assert.deepEqual(r.pending, { repair: { quality: 1 } });
  r = M.pressNotch(p, r.pending, 'repair', 'time', 0); // a locked notch
  assert.equal(r.kind, 'locked');
  assert.match(r.words, /locked in/i);
  assert.match(r.words, /bunk/i);
  r = M.pressNotch(p, {}, 'repair', 'size', 5); // fills past the locked 1 with only 2 free
  assert.deepEqual(r.pending, { repair: { size: 2 } });
  assert.equal(M.pressNotch(p, {}, 'repair', 'size', 0).kind, 'locked');
});

test('lock in sends the whole spread and clears pending; undo clears without a call', () => {
  const p = progress();
  const pend = { repair: { quality: 2 } };
  assert.deepEqual(M.lockSpread(p, pend, 'repair'), { time: 1, size: 1, quality: 2 });
  assert.equal(M.pendingCount(pend, 'repair'), 2);
  assert.equal(M.pendingCount(pend, 'shooting'), 0);
  assert.deepEqual(M.clearPending(pend, 'repair'), {});
  assert.deepEqual(M.clearPending({ ...pend, shooting: { reload: 1 } }, 'repair'), { shooting: { reload: 1 } });
  // A save that moved on (level lost to a death) drops pending the level no longer covers.
  const dead = { ...p, levels: { ...p.levels, repair: 2 } };
  assert.deepEqual(M.tidyPending(dead, pend), {}, 'repair is level 2 with 2 locked: nothing is free');
  assert.deepEqual(M.tidyPending(p, { repair: { quality: 5 } }), { repair: { quality: 2 } });
});

test('the header and the rail count unspent points the same way the page does', () => {
  const p = progress();
  const left = Object.fromEntries(M.SKILL_ORDER.map((id) => [id, M.leftOf(p, {}, id)]));
  assert.deepEqual(left, { shooting: 1, piloting: 1, stealth: 1, hacking: 1, repair: 2, crafting: 1, social: 1, navigation: 1 });
  assert.equal(M.totalUnspent(p, {}), 9);
  assert.equal(M.totalUnspent(p, { repair: { quality: 2 }, social: { intimidate: 1 } }), 6, 'pending counts as used on the page');
  assert.equal(M.unspentOnCharacter(captain()), 9, 'the bag badge reads the same numbers from the character');
});

test('level ring, XP bar and the points chip say real numbers', () => {
  const p = progress();
  const v = M.heroView(p, {}, 'repair');
  assert.equal(v.level, 4);
  assert.deepEqual(v.ring.map((s) => s.on), [true, true, true, true, false, false, false, false, false]);
  assert.equal(v.xp, 7, 'XP into the level, from the save');
  assert.equal(v.xpNeed, XP_CURVE[4] - XP_CURVE[3], 'the hub curve, not 20 x level');
  assert.equal(v.nextLevel, 5);
  assert.equal(v.pct, Math.round(7 / v.xpNeed * 100));
  assert.equal(v.chip, '2 points to spend');
  assert.equal(M.heroView(p, { shooting: { reload: 2 } }, 'shooting').chip, '2 pending, lock them in', 'pending is said, not "all spent"');
  assert.equal(M.heroView(p, { repair: { quality: 1 } }, 'repair').chip, '1 pending, lock them in');
  assert.equal(M.heroView({ ...p, levels: { ...p.levels, repair: 2 } }, {}, 'repair').chip, 'All points spent', 'once locked and nothing is free');
  assert.equal(M.heroView(p, {}, 'stealth').chip, '1 point to spend');
  const top = M.heroView({ ...p, levels: { ...p.levels, repair: 9 }, xp: { ...p.xp, repair: 0 } }, {}, 'repair');
  assert.equal(top.nextLevel, null);
  assert.match(top.xpLine, /top level/i);
  assert.equal(v.index, 5);
});

test('if you die now: XP, levels and points since the last scan, in plain words', () => {
  let c = captain();
  assert.equal(M.riskView(progress(c), scanOf(c), 'repair').safe, true);
  assert.match(M.riskView(progress(c), scanOf(c), 'repair').line, /scanned and safe/);
  assert.equal(M.riskView(progress(c), scanOf(c), 'repair').pct, '0%');
  // Earn 30 XP and a level, spend the new point.
  c = { ...c, levels: { ...c.levels, repair: 5 }, xp: { ...c.xp, repair: c.xp.repair + 30 + 300 }, points: { ...c.points, repair: { ...c.points.repair, quality: 1 } } };
  const r = M.riskView(progress(c), scanOf(c), 'repair');
  assert.equal(r.safe, false);
  assert.match(r.line, /You lose 330 Repair XP/);
  assert.match(r.line, /drop back a level/);
  assert.match(r.line, /1 spent point/);
  assert.equal(r.pct, '100%', 'capped at a full bar');
  assert.equal(M.riskView(progress(c), scanOf(c), 'hacking').safe, true, 'other skills are untouched');
  assert.equal(M.riskShort(r), 'Death costs 330 XP · Scan');
  assert.equal(M.riskShort(M.riskView(progress(captain()), scanOf(captain()), 'repair')), 'Scanned and safe');
  const small = M.riskView(progress({ ...c, levels: { ...c.levels, repair: 4 }, xp: { ...c.xp, repair: c.xp.repair - 300 }, points: SPENT }), scanOf(c), 'repair');
  assert.doesNotMatch(small.line, /drop back/);
});

test('train it: each skill names its mini-game and the holodeck price; shooting has none', () => {
  const g = M.trainView('repair');
  assert.equal(g.game, 'Coolant line');
  assert.equal(g.canTrain, true);
  assert.equal(g.label, 'Train in the holodeck · 10 cr');
  assert.equal(g.cost, 10, 'the gym price is the gym\'s own number');
  assert.equal(M.trainView('shooting').canTrain, false);
  assert.match(M.trainView('shooting').line, /no mini-game/i);
  assert.equal(M.trainView('social').game, 'Read the room · Stare down · Haggle');
  assert.equal(M.SCAN_COST, 40);
});

test('every art piece is behind one hook; with none set the CSS and SVG stand-ins draw', () => {
  const pieces = A.ART_PIECES;
  for (const id of M.SKILL_ORDER) { assert.ok(pieces.includes(`emblem-${id}-lit`)); assert.ok(pieces.includes(`emblem-${id}-dim`)); }
  for (const p of ['ring-frame', 'card-frame', 'notch-empty', 'notch-filled', 'notch-pending']) assert.ok(pieces.includes(p), p);
  assert.equal(new Set(pieces).size, pieces.length);
  assert.match(A.skillArt('emblem-repair-lit'), /ui\/kit\/skills\/emblem-repair-lit\.webp$/, 'the FLUX pick is the default');
  assert.equal(A.skillArt('notch-pending'), null, 'pending is drawn by the code');
  assert.equal(A.createArt({}).get('emblem-repair-lit'), null, 'no file: the stand-in draws');
  assert.equal(A.skillArt('no-such-piece'), null);
  const set = A.createArt({ 'emblem-repair-lit': 'x/y.webp' });
  assert.match(set.get('emblem-repair-lit'), /x\/y\.webp$/);
  assert.equal(set.get('emblem-repair-dim'), null);
  assert.equal(set.get('nope'), null);
  for (const [piece, file] of Object.entries(A.KIT_URLS)) {
    assert.ok(pieces.includes(piece), `${piece} is a named piece`);
    assert.ok(fs.existsSync(path.join(ROOT, 'projects/Space-Shooter/voyage/ui/kit/skills', file)), `${file} is in the repo`);
  }
  assert.equal(Object.keys(A.KIT_URLS).length, pieces.length - 1, 'every piece but pending has its picture');
});

// ---- respec at the bunk: category points -------------------------------------------------

test('the nap takes points back by category: you pick which, 10 credits a point, free in the tutorial', () => {
  const c = captain();
  const save = (money, extra = {}) => ({ ...emptySave(), character: { ...c, ...extra }, money });
  const fee = HANGAR_DATA.respec.feePerPoint;
  assert.equal(fee, 10);
  assert.equal(Nap.napQuote(save(500), false, {}).ok, false, 'nothing picked: no nap');
  assert.equal(Nap.napQuote(save(500), false, {}).reason, BASICS_DATA.nap.pickFirst);
  const plan = { repair: { size: 1 }, shooting: { reload: 1 } };
  const q = Nap.napQuote(save(500), false, plan);
  assert.equal(q.ok, true);
  assert.equal(q.points, 2);
  assert.equal(q.cost, 2 * fee);
  assert.equal(Nap.napQuote(save(0), true, plan).cost, 0, 'free in the tutorial');
  assert.equal(Nap.napQuote(save(0), true, plan).ok, true);
  assert.equal(Nap.napQuote(save(5), false, plan).ok, false, 'not enough credits says so');
  assert.match(Nap.napQuote(save(5), false, plan).reason, /20 credits/);
  assert.equal(Nap.napQuote({ ...save(500), character: { ...c, points: {} } }, false, {}).reason, BASICS_DATA.nap.nothing);
  // The home server holds the points; a local take-back would be overwritten.
  const hub = Nap.napQuote(save(500), false, plan, { hub: true });
  assert.equal(hub.ok, false);
  assert.equal(hub.reason, BASICS_DATA.nap.hub);
});

test('a nap plan only takes points that are there, and applyPlan leaves the rest', () => {
  const c = captain();
  assert.equal(Nap.canTake(c, {}, 'repair', 'size').ok, true);
  assert.equal(Nap.canTake(c, { repair: { size: 1 } }, 'repair', 'size').ok, false, 'only one point is there');
  assert.equal(Nap.canTake(c, {}, 'repair', 'quality').ok, false, 'none spent there');
  assert.equal(Nap.canTake(c, {}, 'repair', 'nope').ok, false);
  assert.equal(Nap.canKeep({ repair: { size: 1 } }, 'repair', 'size').ok, true);
  assert.equal(Nap.canKeep({}, 'repair', 'size').ok, false);
  const out = Nap.applyPlan(c, { repair: { size: 1 }, shooting: { reload: 1, ammo: 1 } });
  assert.deepEqual(out.points.repair, { time: 1 });
  assert.equal(out.points.shooting, undefined, 'all of a skill\'s points gone leaves no empty row');
  assert.deepEqual(out.points.social, SPENT.social);
  assert.equal(Nap.planPoints({ repair: { size: 1 }, shooting: { reload: 1, ammo: 1 } }), 3);
  assert.equal(Nap.planPoints({}), 0);
  assert.equal(Nap.applyPlan(c, { repair: { size: 9 } }).points.repair.size, undefined, 'asking for more takes what is there, never below zero');
});

test('the page line about the bunk uses the same price', () => {
  assert.match(Nap.napLine(false), /10 credits a point/);
  assert.match(Nap.napLine(true), /free/i);
  assert.match(Nap.napLine(false), /nap/i);
  assert.equal(Nap.napLine(false, { hub: true }), BASICS_DATA.nap.hub, 'with the Hub on the line says the nap cannot take points back yet');
  assert.match(Nap.napLine(true, { hub: true }), /Guild bank/);
});

// ---- the old tree is gone from the new game; today's game is untouched ---------------------

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
test('the old node tree is gone from the new game', () => {
  const pages = read('projects/Space-Shooter/voyage/datapad/pages.js');
  assert.doesNotMatch(pages, /createSkillTree|skillTree\.js/);
  assert.equal(fs.existsSync(path.join(ROOT, 'projects/Space-Shooter/voyage/ui/skillTree.js')), false, 'the tree drawer is deleted');
  assert.deepEqual(BASICS_DATA.pages.map((p) => p.id), ['captain', 'skills', 'pack', 'jobs', 'map']);
  assert.equal(BASICS_DATA.pages.find((p) => p.id === 'skills').keyLabel, 'L');
  const hangar = read('projects/Space-Shooter/voyage/hangar.js');
  assert.doesNotMatch(hangar, /unspentPoints|spentPoints|canPick|canUnpick/, 'the bunk and the station read category points, not tree ranks');
});

test('only the new game\'s own files changed: no import of the skills menu from outside voyage/, switches still off', () => {
  assert.equal(runtimeConfig.newGame, false);
  assert.equal(runtimeConfig.voyageServer, false);
  for (const dir of ['projects/Space-Shooter/dogfight', 'projects/Space-Shooter/engine', 'projects/Space-Shooter/systems', 'projects/Space-Shooter/ui']) {
    const stack = [path.join(ROOT, dir)];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) stack.push(f);
        else if (/\.(js|mjs|html)$/.test(e.name)) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /voyage\/skills\//, `${path.relative(ROOT, f)} does not reach into the skills menu`);
      }
    }
  }
});

test('no new file carries a second dice notation the d20 scan reads (lesson from the mini-games lane)', () => {
  const dir = path.join(ROOT, 'projects/Space-Shooter/voyage/skills');
  for (const f of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /2d6/i, f);
});

test('hacking Size is called "Puzzle size" in the menu, the same name picker.js gives it (and the words under it are hacking v2)', () => {
  const menu = M.SKILL_UI.hacking.cats.find((c) => c.id === 'size').name;
  const pick = CATEGORIES.hacking.cats.find((c) => c.id === 'size').name;
  assert.equal(menu, 'Puzzle size');
  assert.equal(menu, pick);
});
