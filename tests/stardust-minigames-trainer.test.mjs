// The trainer (Donaven 2026-11-19): the shooting gallery, the three books, and how training pays XP (never skill points). Pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGallery, stepGallery, shoot, reload, targetAt, hittable, canShoot, bloomOf, bloomMax, scoreLines, RANGE, LANES } from '../projects/Space-Shooter/voyage/minigames/gallery.js';
import { setupShooting, SHOOTING_LESSONS, SHOOTING_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { describeSkill, CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { PAGES, BOOK_SKILLS, pagesOf, unlockedPages, nextPage, shuffledOrder, isRight, rereadWords, pageWords, pageXp, lineParts } from '../projects/Space-Shooter/voyage/minigames/books.js';
import { FACTS, FACT_IDS, factHolds } from '../projects/Space-Shooter/voyage/minigames/bookFacts.js';
import { answerPage, settleGallery, trainingOf, gallerySetup, lessonsFor, canStart, TRAINING, RAIL } from '../projects/Space-Shooter/voyage/minigames/trainer.js';
import { GYM } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { cleanState, freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

// ---- shooting setup: every point changes what you can see ---------------------------------------------------------------
test('shooting setup: each path changes its own number with every point, never the others', () => {
  const base = setupShooting({});
  assert.deepEqual([base.reloadSeconds, base.magazine, base.spread, base.kick], [1.8, 6, 3.2, 1.6]);
  let prev = base;
  for (let n = 1; n <= 9; n++) { const s = setupShooting({ points: { reload: n }, level: 9 }); assert.ok(s.reloadSeconds < prev.reloadSeconds, `reload ${n}`); assert.equal(s.magazine, 6); assert.equal(s.spread, 3.2); prev = s; }
  prev = base; for (let n = 1; n <= 9; n++) { const s = setupShooting({ points: { ammo: n }, level: 9 }); assert.equal(s.magazine, prev.magazine + 1); assert.equal(s.reloadSeconds, 1.8); prev = s; }
  prev = base; for (let n = 1; n <= 9; n++) { const s = setupShooting({ points: { spray: n }, level: 9 }); assert.ok(s.spread < prev.spread && s.kick < prev.kick, `spray ${n}`); prev = s; }
  assert.deepEqual([setupShooting({ points: { reload: 9 }, level: 9 }).reloadSeconds, setupShooting({ points: { ammo: 9 }, level: 9 }).magazine, setupShooting({ points: { spray: 9 }, level: 9 }).spread], [0.54, 15, 1.22]);
  assert.equal(setupShooting({ points: { ammo: 9 }, level: 3 }).magazine, 9, 'never more points than the level');
});
test('picker words for shooting are real numbers, no longer "not set yet"', () => {
  assert.equal(CATEGORIES.shooting.built, true);
  for (const lvl of [0, 4, 9]) for (const d of describeSkill('shooting', { reload: lvl, ammo: 0, spray: 0 }, 9)) assert.doesNotMatch(d.now + (d.next || ''), /not set yet/);
  const d = describeSkill('shooting', {}, 9);
  assert.match(d[0].now, /1\.8 s/); assert.match(d[1].now, /6 rounds/); assert.match(d[2].now, /3\.2 wide/);
  assert.ok(d.every((x) => x.nextChange === null), 'every point changes something');
});

// ---- the gallery --------------------------------------------------------------------------------------------------------
const aimAt = (s) => { const c = s.targets.filter((t) => hittable(t, s.t)).sort((a, b) => b.y - a.y)[0]; return c ? targetAt(c, s.t) : null; };
function play(seed, lesson, setup, { gap = 1, noise = () => 0 } = {}) {
  const s = createGallery({ seed, lesson, setup }); let next = 0.3;
  while (!s.done && s.t < 90) { stepGallery(s, 1 / 60); if (s.t >= next && canShoot(s)) { const a = aimAt(s); if (a) { shoot(s, a.x + noise(), a.y + noise()); next = s.t + gap; } } }
  return s;
}
test('gallery: seeded paths repeat, sit on three depths, and stay on the range', () => {
  const a = createGallery({ seed: 5, lesson: 2 }), b = createGallery({ seed: 5, lesson: 2 }), c = createGallery({ seed: 6, lesson: 2 });
  assert.deepEqual(a.targets, b.targets); assert.notDeepEqual(a.targets, c.targets);
  assert.equal(a.targets.length, 12);
  assert.ok(new Set(a.targets.map((t) => t.lane)).size === 3, 'all three depths');
  assert.ok(a.targets.some((t) => t.kind === 'popup') && a.targets.some((t) => t.kind === 'slider'));
  const radius = (id) => LANES.find((l) => l.id === id).r;
  assert.ok(radius('far') < radius('mid') && radius('mid') < radius('near'), 'nearer is bigger');
  for (const t of a.targets) for (let x = 0; x < 20; x += 0.37) { const p = targetAt(t, x); assert.ok(p.x - t.r >= -0.01 && p.x + t.r <= RANGE.w + 0.01, `target ${t.id} at ${x}`); assert.ok(p.up >= 0 && p.up <= 1); }
  const slide = a.targets.find((t) => t.kind === 'slider'); assert.notEqual(targetAt(slide, 0).x, targetAt(slide, 1).x, 'sliders move');
  const pop = a.targets.find((t) => t.kind === 'popup'); const ups = Array.from({ length: 80 }, (_, i) => targetAt(pop, i * 0.1).up); assert.ok(ups.some((u) => u === 0) && ups.some((u) => u === 1), 'pop-ups rise and drop');
});
test('gallery: the rings, the bullseye and a hit flips the target', () => {
  const s = createGallery({ seed: 1, lesson: 1, setup: { ...setupShooting({}), spread: 0, kick: 0 } });
  const t = s.targets.find((x) => x.kind === 'slider'); const p = targetAt(t, s.t);
  const r = shoot(s, p.x, p.y); assert.equal(r.ring, 'bull'); assert.equal(s.hits, 1); assert.equal(t.hit, true); assert.ok(t.flip > 0);
  assert.equal(s.rings.bull, 1);
  const u = s.targets.find((x) => x.kind === 'slider' && !x.hit); stepGallery(s, 0.3); const q = targetAt(u, s.t);
  assert.equal(shoot(s, q.x + u.r * 0.9, q.y).ring, 'outer'); stepGallery(s, 0.3);
  const w = s.targets.find((x) => x.kind === 'slider' && !x.hit); const z = targetAt(w, s.t); assert.equal(shoot(s, z.x + w.r * 0.5, z.y).ring, 'inner');
  stepGallery(s, 0.3); assert.equal(shoot(s, 1, 99).target, null); assert.equal(s.shots, 4);
});
test('gallery: the magazine, the reload and the fire gap', () => {
  const s = createGallery({ seed: 2, lesson: 1, setup: setupShooting({ points: { ammo: 0, reload: 0 } }) });
  assert.equal(s.ammo, 6);
  assert.equal(shoot(s, 10, 10).ok, true); assert.equal(shoot(s, 10, 10).why, 'cooldown');
  for (let i = 0; i < 5; i++) { stepGallery(s, 0.25); shoot(s, 1, 1); }
  assert.equal(s.ammo, 0); assert.ok(s.reloading > 0, 'an empty magazine reloads on its own'); assert.equal(shoot(s, 1, 1).why, 'reloading');
  stepGallery(s, 1.7); assert.ok(s.reloading > 0); stepGallery(s, 0.2); assert.equal(s.ammo, 6);
  assert.equal(reload(s), false, 'a full magazine does not reload');
  const fast = createGallery({ seed: 2, setup: setupShooting({ points: { reload: 9 }, level: 9 }) }); for (let i = 0; i < 6; i++) { stepGallery(fast, 0.25); shoot(fast, 1, 1); } stepGallery(fast, 0.55); assert.equal(fast.ammo, 15 - 15 + 6, 'the shorter bar is done in 0.55 s');
});
test('gallery: the bloom grows with each shot, settles, and spray points shrink it', () => {
  const mk = (spray) => createGallery({ seed: 3, setup: setupShooting({ points: { spray }, level: 9 }) });
  const s = mk(0); const rest = bloomOf(s); shoot(s, 5, 5); assert.ok(bloomOf(s) > rest); stepGallery(s, 0.22); shoot(s, 5, 5); const two = bloomOf(s); assert.ok(two > rest + 1.6);
  stepGallery(s, 3); assert.equal(bloomOf(s), rest, 'it settles');
  for (let i = 0; i < 4; i++) { stepGallery(s, 0.23); shoot(s, 5, 5); } assert.ok(bloomOf(s) <= bloomMax(s));
  const tight = mk(9); assert.ok(bloomOf(tight) < rest && bloomMax(tight) < bloomMax(mk(0)));
  // a wider bloom misses more: shots land within the bloom radius of the aim
  const w = mk(0); for (let i = 0; i < 6; i++) { stepGallery(w, 0.23); const r = shoot(w, 80, 50); if (r.ok) assert.ok(Math.hypot(r.x - 80, r.y - 50) <= bloomMax(w) + 1e-9); }
});
test('gallery: score lines (targets, bullseyes, accuracy, time) add to the XP and match the lesson', () => {
  const L = SHOOTING_LESSONS;
  assert.deepEqual(L.map((l) => [l.targets, l.time, l.par]), [[10, 30, 11], [12, 28, 14], [14, 26, 17]]);
  const good = play(1, 1, setupShooting({ points: { spray: 9 }, level: 9 }), { gap: 0.6 });
  assert.equal(good.result.how, 'cleared'); assert.deepEqual(good.result.lines.map((l) => l.id), ['targets', 'bullseye', 'accuracy', 'time']);
  assert.equal(good.result.xp, good.result.lines.reduce((a, l) => a + l.xp, 0)); assert.equal(good.result.lines[0].xp, 2); assert.equal(good.result.lines[3].xp, 2, 'under par');
  assert.equal(scoreLines(good).xp, good.result.xp);
  const none = createGallery({ seed: 1 }); for (let i = 0; i < 2000; i++) stepGallery(none, 1 / 60); assert.equal(none.result.how, 'time'); assert.equal(none.result.xp, 0); assert.equal(none.result.success, false);
  assert.equal(none.result.lines.find((l) => l.id === 'time').xp, 0);
});
test('gallery bots: a lazy bot earns little, a spammer pays in accuracy, skill and points show as a gradient', () => {
  let seedN = 0; const gauss = (sd) => () => { seedN++; return Math.sin(seedN * 12.9898) * sd; };
  const avg = (fn) => { let t = 0; for (let seed = 1; seed <= 30; seed++) t += fn(seed); return t / 30; };
  const spam = avg((seed) => { const s = createGallery({ seed, lesson: 2 }); let n = 0; while (!s.done && n++ < 5000) { stepGallery(s, 1 / 60); if (canShoot(s)) shoot(s, (n * 37) % 160, (n * 53) % 100); } return s.result.xp; });
  const careful = avg((seed) => play(seed, 2, setupShooting({ lesson: 2 }), { gap: 0.9, noise: gauss(2) }).result.xp);
  const sharp = avg((seed) => play(seed, 2, setupShooting({ points: { spray: 9 }, level: 9, lesson: 2 }), { gap: 0.7, noise: gauss(1) }).result.xp);
  assert.ok(spam < careful, `spamming (${spam}) is worse than aiming (${careful})`); assert.ok(careful <= sharp + 0.01, `points help (${careful} vs ${sharp})`); assert.ok(spam < 3);
  const slow = avg((seed) => play(seed, 3, setupShooting({ lesson: 3 }), { gap: 1.6, noise: gauss(3) }).result.xp), quick = avg((seed) => play(seed, 3, setupShooting({ points: { reload: 9 }, level: 9, lesson: 3 }), { gap: 0.6, noise: gauss(1) }).result.xp);
  assert.ok(slow < quick, `a slow hand (${slow}) earns less than a quick one (${quick})`);
});
test('gallery: reload points save real time on a run', () => {
  const t = (reloadPts) => { let sum = 0; for (let seed = 1; seed <= 20; seed++) sum += play(seed, 3, setupShooting({ points: { reload: reloadPts }, level: 9, lesson: 3 }), { gap: 0.45 }).t; return sum / 20; };
  assert.ok(t(9) < t(0), `${t(9)} < ${t(0)}`);
});

// ---- the books ----------------------------------------------------------------------------------------------------------
test('books: at least 8 pages for each of crafting, repair and hacking, grouped by level, 40 to 80 words, 3 or 4 choices', () => {
  assert.deepEqual([...BOOK_SKILLS].sort(), ['crafting', 'hacking', 'repair']);
  for (const skill of BOOK_SKILLS) {
    const pages = pagesOf(skill); assert.ok(pages.length >= 8, skill);
    assert.deepEqual([...new Set(pages.map((p) => p.level))], [1, 3, 6], `${skill} unlocks in three groups`);
    assert.equal(unlockedPages(skill, 1).length, 3); assert.ok(unlockedPages(skill, 3).length > 3); assert.equal(unlockedPages(skill, 9).length, pages.length);
  }
  assert.equal(new Set(PAGES.map((p) => p.id)).size, PAGES.length);
  for (const p of PAGES) {
    const words = pageWords(p).split(/\s+/).length; assert.ok(words >= 40 && words <= 80, `${p.id} has ${words} words`);
    assert.ok(p.choices.length >= 3 && p.choices.length <= 4, p.id); assert.ok(p.answer >= 0 && p.answer < p.choices.length);
    assert.equal(new Set(p.choices).size, p.choices.length, `${p.id}: choices differ`);
    assert.ok(p.line.every((n) => n >= 1 && n <= p.lines.length), `${p.id}: the answer line exists`);
    assert.ok(p.question.endsWith('?')); assert.ok(p.facts.length >= 1, `${p.id} quotes a checked fact`);
    assert.doesNotMatch(pageWords(p), /\b(quiz|test yourself|trivia)\b/i);
  }
  assert.ok(new Set(PAGES.map((p) => p.answer)).size >= 3, 'the right answer is not always in the same slot as written');
});
test('books: every fact a page quotes is tied to the code, and every fact is quoted', () => {
  const used = new Set(PAGES.flatMap((p) => p.facts));
  for (const id of used) assert.ok(FACTS[id], `page fact ${id} exists`);
  for (const id of FACT_IDS) { assert.ok(used.has(id), `fact ${id} is quoted by a page`); assert.equal(factHolds(id), true, `${id}: ${FACTS[id].claim}`); assert.equal(FACTS[id].skill, FACTS[id].skill); }
  for (const p of PAGES) for (const id of p.facts) assert.equal(FACTS[id].skill, p.skill, `${p.id} quotes its own skill's facts`);
  assert.equal(factHolds('nope'), false);
});
test('books: the numbers the pages quote are the numbers in the code', () => {
  const all = (skill) => pagesOf(skill).map((p) => p.lines.join(' ')).join(' ');
  assert.match(all('crafting'), /half the work time/); assert.match(all('crafting'), /quarter more time/); assert.match(all('crafting'), /a tenth of the job/); assert.match(all('crafting'), /fifteen and a half/);
  assert.match(all('hacking'), /twenty-six seconds/); assert.match(all('hacking'), /0\.6 seconds/); assert.match(all('hacking'), /0\.09 seconds/); assert.match(all('hacking'), /fifth of the bar/);
  assert.match(all('repair'), /Forty for sealing/); assert.match(all('repair'), /Ninety and over earns three stars/);
});
test('books: pages are picked in order, a wrong page returns after the others, and learned pages are skipped', () => {
  const first = nextPage('repair', 1, {}); assert.equal(first.level, 1);
  assert.equal(nextPage('repair', 1, {}, first.id).id, unlockedPages('repair', 1)[1].id, 'the next one, not the same one');
  const all = Object.fromEntries(unlockedPages('repair', 1).map((p) => [p.id, true])); assert.equal(nextPage('repair', 1, all), null);
  assert.equal(nextPage('repair', 3, all).level, 3, 'a higher level opens more pages');
  assert.equal(nextPage('repair', 1, { [first.id]: true }).id, unlockedPages('repair', 1)[1].id);
});
test('books: the choices are shuffled each time, never the written order or the last one shown', () => {
  const p = PAGES[0]; let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let last = null; const seen = new Set();
  for (let i = 0; i < 40; i++) { const o = shuffledOrder(p, rng, last); assert.deepEqual([...o].sort(), [0, 1, 2, 3]); assert.notDeepEqual(o, [0, 1, 2, 3]); if (last) assert.notDeepEqual(o, last); seen.add(o.join()); last = o; }
  assert.ok(seen.size >= 8, 'many different orders');
  assert.notDeepEqual(shuffledOrder(p, () => 0), [0, 1, 2, 3], 'a stuck rng still reorders');
  const o = shuffledOrder(p, rng); const right = o.indexOf(p.answer); assert.equal(isRight(p, o, right), true); assert.equal(isRight(p, o, (right + 1) % 4), false);
  assert.equal(rereadWords({ line: [2] }), 'Reread line 2.'); assert.equal(rereadWords({ line: [2, 3] }), 'Reread lines 2 and 3.');
  assert.deepEqual(lineParts('a [[b]] c'), [{ text: 'a ', redacted: false }, { text: 'b', redacted: true }, { text: ' c', redacted: false }]);
});

// ---- paying -------------------------------------------------------------------------------------------------------------
const pg = PAGES.find((p) => p.id === 'repair-tee'); const ord = [1, 0, 3, 2]; const rightPos = ord.indexOf(pg.answer), wrongPos = (rightPos + 1) % 4;
test('paying: a right page pays its XP once, costs the fee, and is then learned and pays nothing', () => {
  const a = answerPage({ pageId: pg.id, order: ord, position: rightPos, credits: 50, now: 1000 });
  assert.deepEqual([a.ok, a.right, a.paid, a.credits], [true, true, 2, 40]); assert.equal(a.learned[pg.id], true); assert.match(a.said, /\+2 repair XP/);
  assert.equal(a.log.repair[0].xp, 2);
  const b = answerPage({ pageId: pg.id, order: ord, position: rightPos, credits: a.credits, learned: a.learned, log: a.log, now: 2000 });
  assert.deepEqual([b.right, b.paid, b.credits], [true, 0, 40]); assert.match(b.said, /pays no more XP/);
  assert.equal(pageXp(pg), 2); assert.deepEqual([1, 3, 6].map((l) => pageXp({ level: l })), [2, 3, 4]);
});
test('paying: a wrong answer pays nothing, says which line to reread, and the page stays unlearned', () => {
  const w = answerPage({ pageId: pg.id, order: ord, position: wrongPos, credits: 50, now: 1000 });
  assert.deepEqual([w.ok, w.right, w.paid, w.credits, w.learned[pg.id]], [true, false, 0, 40, undefined]); assert.match(w.said, /Reread lines 2 and 3/); assert.deepEqual(w.reread, [2, 3]); assert.deepEqual(w.log, {});
  const learned = { [pg.id]: true }; const free = answerPage({ pageId: pg.id, order: ord, position: wrongPos, credits: 50, learned, now: 1 });
  assert.equal(free.credits, 50, 'a learned page is free');
});
test('paying: the hour\'s cap and the fee still apply; inputs are never changed', () => {
  const log = { repair: [{ at: 900, xp: 6 }] }, frozen = JSON.stringify(log);
  const capped = answerPage({ pageId: pg.id, order: ord, position: rightPos, credits: 50, log, now: 1000 });
  assert.deepEqual([capped.ok, capped.paid, capped.credits], [false, 0, 50]); assert.match(capped.said, /all it will for repair this hour/); assert.equal(JSON.stringify(log), frozen); assert.equal(capped.learned[pg.id], undefined, 'it stays in the pile');
  const poor = answerPage({ pageId: pg.id, order: ord, position: rightPos, credits: 9, now: 1 }); assert.equal(poor.ok, false); assert.match(poor.said, /costs 10 credits and you have 9/);
  const part = answerPage({ pageId: 'repair-lost', order: [0, 1, 2, 3], position: 2, credits: 50, log: { repair: [{ at: 990, xp: 5 }] }, now: 1000 }); assert.equal(part.paid, 1); assert.match(part.said, /hour's limit/);
  assert.equal(answerPage({ pageId: 'zzz', order: [], position: 0, credits: 5 }).ok, false);
  assert.equal(GYM.cost, 10); assert.equal(GYM.capXp, 6, 'the gym\'s own numbers are unchanged');
});
test('paying: no page, round or replay ever pays a skill point', () => {
  const src = (n) => JSON.stringify(n);
  for (const r of [answerPage({ pageId: pg.id, order: ord, position: rightPos, credits: 50 }), settleGallery({ credits: 50, result: { xp: 5 } })]) assert.ok(!('points' in r) && !/point/.test(src(Object.keys(r))));
});
test('paying: a gallery round costs the fee, pays up to the hour\'s cap, and a round with no XP still costs', () => {
  const a = settleGallery({ credits: 50, now: 5, result: { xp: 4 } }); assert.deepEqual([a.ok, a.paid, a.credits, a.said], [true, 4, 40, '+4 shooting XP.']);
  const b = settleGallery({ credits: 50, now: 6, log: a.log, result: { xp: 9 } }); assert.deepEqual([b.paid, b.credits], [2, 40]); assert.match(b.said, /hour's limit/);
  const z = settleGallery({ credits: 50, now: 5, result: { xp: 0 } }); assert.deepEqual([z.paid, z.credits], [0, 40]); assert.match(z.said, /took 10 credits/);
  const capped = settleGallery({ credits: 50, now: 7, log: b.log, result: { xp: 3 } }); assert.equal(capped.ok, false);
  assert.equal(settleGallery({ credits: 3, result: { xp: 3 } }).ok, false);
});
test('the trainer shows each skill its own training, with navigation left as a coming slot', () => {
  assert.deepEqual(RAIL.slice().sort(), Object.keys(TRAINING).sort());
  assert.equal(trainingOf('shooting'), 'gallery'); for (const s of ['crafting', 'repair', 'hacking']) assert.equal(trainingOf(s), 'book');
  assert.equal(trainingOf('navigation'), 'coming'); for (const s of ['stealth', 'piloting', 'social']) assert.equal(trainingOf(s), 'replay');
  assert.deepEqual(lessonsFor(1).map((l) => l.open), [true, false, false]); assert.deepEqual(lessonsFor(7).map((l) => l.open), [true, true, true]);
  assert.equal(gallerySetup({ level: 1, lesson: 3 }).lesson, 1, 'a lesson the level has not opened is not served');
  assert.equal(gallerySetup({ level: 7, lesson: 3, points: { ammo: 2 } }).magazine, 8);
  assert.equal(canStart('repair', { credits: 10 }).ok, true);
});
test('the workbench state keeps learned pages, drops unknown ones, and a fresh state has none', () => {
  assert.deepEqual(freshState().learned, {}); assert.deepEqual(cleanState({ learned: { 'repair-tee': true, nope: true, 'hacking-grade': 1 } }).learned, { 'repair-tee': true });
});
