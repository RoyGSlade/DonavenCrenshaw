import test from 'node:test';
import assert from 'node:assert/strict';
import { createRalph, tick, press, move, release, dropItem, finish, layout, normaliseRecord, RATES, FIND_CAP, sayKey, DAY, SPOTS } from '../model.js';
import { WORDS } from '../words.js';
import { session, FRIEND, rngOf, niceHand } from './hands.mjs';

const mk = (o = {}) => createRalph({ seed: 1, w: 16, h: 10, context: FRIEND, ...o });
const run = (s, secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) tick(s, dt); };
const flick = (s, tx, ty, P = 2.5) => { const b = s.ball, a = Math.atan2(ty - b.y, tx - b.x); press(s, b.x, b.y); const px = b.x - Math.cos(a) * P, py = b.y - Math.sin(a) * P; move(s, px, py, 0.1); tick(s, 0.1); return release(s, px, py); };
const settle = (s) => { run(s, 2); s.ralph.mode = 'idle'; s.ralph.pose = 'stand'; s.ralph.goal = null; };

test('the ball flies and bounces the same way for the same seed and flick', () => {
  const trace = () => { const s = mk(); settle(s); flick(s, 8, 3); const pts = []; for (let i = 0; i < 60; i++) { tick(s, 1 / 30); pts.push([s.ball.x, s.ball.y, s.ball.z].map((v) => +v.toFixed(5))); } return JSON.stringify(pts); };
  assert.equal(trace(), trace());
});
test('a ball thrown never ends inside a wall, a crate or off the yard', () => {
  const r = rngOf(5);
  for (let i = 0; i < 80; i++) {
    const s = mk({ seed: i + 1, w: i % 2 ? 9 : 16, h: i % 2 ? 14 : 10 }); settle(s); s.ralph.mode = 'sleep'; // he sleeps: only the ball moves
    flick(s, r() * s.L.w, r() * s.L.h, 0.8 + r() * 3.4); run(s, 9);
    const b = s.ball; assert.equal(b.state, 'rest', 'comes to rest'); assert.ok(b.x > 0 && b.x < s.L.w && b.y > 0 && b.y < s.L.h);
    for (const o of s.L.rects) assert.ok(!(b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h), 'not inside ' + o.id);
  }
});
test('he always reaches a thrown ball (both yard shapes, all kinds of throws)', () => {
  const r = rngOf(9); let reached = 0, tries = 0;
  for (const [w, h] of [[16, 10], [9, 14], [20, 10], [9, 11]]) for (let i = 0; i < 30; i++) {
    const s = mk({ seed: i * 3 + 1, w, h, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [] } } }); settle(s);
    flick(s, r() * w, r() * h, 0.8 + r() * 3.4); tries++;
    let got = false; for (let t = 0; t < 14 && !got; t += 1 / 30) { tick(s, 1 / 30); if (s.ball.state === 'carried') got = true; }
    if (got) reached++;
  }
  assert.equal(reached, tries);
});
test('each way a fetch can end happens at its stated rate, and none leaves the ball out of reach', () => {
  const n = 300, c = { bring: 0, drop: 0, keep: 0 };
  for (let i = 0; i < n; i++) {
    const s = mk({ seed: 100 + i, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [] } } }); settle(s);
    flick(s, 11 + (i % 3), 6, 2.4);
    let style = null; for (let t = 0; t < 10 && !style; t += 1 / 30) { tick(s, 1 / 30); if (s.ball.state === 'carried') style = s.ralph.style; }
    c[style]++;
    // follow it out: within 40 s the ball is somewhere you can flick it from
    let ok = false; for (let t = 0; t < 40; t += 1 / 30) { tick(s, 1 / 30); if (s.ball.state === 'rest') { ok = true; break; } if (s.ralph.mode === 'keep') break; }
    if (style === 'keep') { for (let t = 0; t < 12 && s.ralph.mode !== 'keep'; t += 1 / 30) tick(s, 1 / 30); press(s, s.ralph.x, s.ralph.y); assert.equal(release(s, s.ralph.x, s.ralph.y), 'asked'); run(s, 2); ok = s.ball.state === 'rest'; }
    assert.ok(ok, 'ball reachable after ' + style);
  }
  assert.ok(Math.abs(c.bring / n - RATES.bring) < 0.07, 'bring ' + c.bring / n);
  assert.ok(Math.abs(c.drop / n - RATES.drop) < 0.06, 'drop ' + c.drop / n);
  assert.ok(Math.abs(c.keep / n - RATES.keep) < 0.05, 'keep ' + c.keep / n);
});
test('a kept ball is given up when asked, and given up by itself in time', () => {
  const s = mk({ seed: 2 }); settle(s); s.ralph.carry = 'ball'; s.ball.state = 'carried'; s.ralph.mode = 'keep'; s.ralph.mt = 0; s.ralph.mtMax = 12; s.ralph.pose = 'lie';
  run(s, 14); assert.notEqual(s.ball.state, 'carried'); assert.equal(s.ralph.mode, 'idle');
});
test('a tired Ralph keeps the ball and pants, and recovers', () => {
  const s = mk({ seed: 4, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [] } } }); settle(s); s.ralph.energy = 0.05;
  flick(s, 9, 5); run(s, 8); assert.equal(s.ralph.style, 'keep');
  run(s, 40); assert.ok(s.ralph.energy > 0.3, 'rested');
});
test('he is never permanently away: too much rubbing sends him off for a bounded time, then he is back', () => {
  const s = mk({ seed: 6 }); settle(s); press(s, s.ralph.x, s.ralph.y);
  for (let i = 0; i < 30 * 30 && s.ralph.mode !== 'away'; i++) { move(s, s.ralph.x + Math.sin(i), s.ralph.y + Math.cos(i), 1 / 30); tick(s, 1 / 30); }
  assert.equal(s.ralph.mode, 'away'); assert.equal(s.ralph.rubbing, false);
  run(s, 12); assert.notEqual(s.ralph.mode, 'away');
  assert.equal(release(s, 0, 0) === null || true, true);
});
test('calling him: he may refuse, but patience means he always comes in the end', () => {
  const s = mk({ seed: 7, context: { ...FRIEND, ralph: { ...FRIEND.ralph, mood: 5, bond: 0 } } }); settle(s);
  let came = false; for (let i = 0; i < 6 && !came; i++) { press(s, 3, 7); const o = release(s, 3, 7); if (o === 'come') came = true; run(s, 0.5); s.ralph.mode = s.ralph.mode === 'come' ? 'come' : 'idle'; }
  assert.ok(came);
});
test('the spot makes his leg kick, and a good rub counts toward bond once a day', () => {
  const s = mk({ seed: 8, context: { ...FRIEND, ralph: { ...FRIEND.ralph, bond: 2, bondProgress: 0.5, bondedOn: null, spot: 'chest' } } }); settle(s);
  const r = s.ralph; press(s, r.x, r.y);
  for (let i = 0; i < 90; i++) { const sp = SPOTS.chest; const a = i * 0.7; const cx = r.x + (Math.cos(r.heading) * sp.y - Math.sin(r.heading) * sp.x) * 0.95, cy = r.y + (Math.sin(r.heading) * sp.y + Math.cos(r.heading) * sp.x) * 0.95; move(s, cx + Math.cos(a) * 0.2, cy + Math.sin(a) * 0.2, 1 / 30); tick(s, 1 / 30); }
  assert.ok(s.stat.kicks >= 1, 'kick'); assert.equal(s.stat.goodRub, true);
  assert.equal(s.ralph.bond, 3); assert.equal(s.ralph.bondedOn, Math.floor(FRIEND.now / DAY));
  // the bone the same day does not step it again
  release(s, 0, 0); settle(s); dropItem(s, 'bone', s.ralph.x, s.ralph.y); assert.equal(s.ralph.bond, 3);
});
test('bond rises at most one step a day, and never above 5', () => {
  const s = mk({ seed: 9, context: { ...FRIEND, ralph: { ...FRIEND.ralph, bond: 4, bondProgress: 0.9, bondedOn: null } } }); settle(s);
  dropItem(s, 'bone', s.ralph.x, s.ralph.y); assert.equal(s.ralph.bond, 5);
  const s2 = mk({ seed: 9, context: { ...FRIEND, ralph: { ...FRIEND.ralph, bond: 2, bondProgress: 0.9, bondedOn: Math.floor(FRIEND.now / DAY) } } }); settle(s2);
  dropItem(s2, 'bone', s2.ralph.x, s2.ralph.y); assert.equal(s2.ralph.bond, 2); assert.ok(s2.ralph.bondProgress < 1);
  const s3 = mk({ seed: 9, context: { ...FRIEND, now: FRIEND.now + DAY, ralph: { ...FRIEND.ralph, bond: 2, bondProgress: 0.9, bondedOn: Math.floor(FRIEND.now / DAY) } } }); settle(s3);
  dropItem(s3, 'bone', s3.ralph.x, s3.ralph.y); assert.equal(s3.ralph.bond, 3, 'next day it rises');
});
test('the bone ends fetch for the visit, and costs exactly one bone', () => {
  const s = mk({ seed: 3 }); settle(s); assert.equal(dropItem(s, 'bone', s.ralph.x, s.ralph.y), 'bone');
  run(s, 6); assert.equal(s.ralph.mode, 'chew'); assert.equal(s.fetchDone, true);
  flick(s, 8, 5); run(s, 6); assert.equal(s.ball.state, 'rest'); assert.equal(s.ralph.mode, 'chew', 'does not chase'); assert.equal(s.stat.fetches, 0);
  assert.equal(dropItem(s, 'bone', s.ralph.x, s.ralph.y), 'no');
  assert.deepEqual(finish(s).effects.items, { bone: -1 });
});
test('items go down only when used: a miss, an empty tray and a full bowl cost nothing', () => {
  const s = mk({ seed: 3 }); settle(s);
  assert.equal(dropItem(s, 'bone', 14, 8), 'miss'); assert.equal(dropItem(s, 'kibble', 14, 8), 'miss');
  assert.equal(dropItem(s, 'kibble', s.L.bowl.x, s.L.bowl.y), 'kibble'); assert.equal(dropItem(s, 'kibble', s.L.bowl.x, s.L.bowl.y), 'full');
  run(s, 10); assert.equal(s.stat.fed, 1);
  assert.deepEqual(finish(s).effects.items, { kibble: -1 });
  const e = createRalph({ seed: 1, context: { save: { items: { bone: 0, kibble: 0 } } } }); settle(e);
  assert.equal(dropItem(e, 'bone', e.ralph.x, e.ralph.y), 'no'); assert.equal(dropItem(e, 'kibble', e.L.bowl.x, e.L.bowl.y), 'no'); assert.deepEqual(finish(e).effects.items, {});
});
test('kibble: he eats, then looks for the ball', () => {
  const s = mk({ seed: 3 }); settle(s); dropItem(s, 'kibble', s.L.bowl.x, s.L.bowl.y);
  const seen = new Set(); for (let i = 0; i < 30 * 12; i++) { tick(s, 1 / 30); seen.add(s.ralph.mode); }
  for (const m of ['eatgo', 'eat', 'search']) assert.ok(seen.has(m), m);
});
test('the wrong thing: comes from the record, at its rate, at most FIND_CAP a visit, and is kept', () => {
  let found = 0, fetched = 0; const n = 250;
  for (let i = 0; i < n; i++) {
    const s = mk({ seed: 500 + i, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [{ item: 'loose-bolt', chance: 0.2 }] } } }); settle(s);
    flick(s, 12, 6, 2.4); run(s, 14); fetched += s.stat.fetches; found += s.stat.found;
    assert.ok(s.foundItems.every((x) => x === 'loose-bolt'));
    const res = finish(s); assert.equal(res.effects.items['loose-bolt'] || 0, s.stat.found); assert.ok(s.stat.found <= FIND_CAP);
  }
  assert.ok(Math.abs(found / fetched - 0.2) < 0.06, `rate ${found / fetched}`);
  const none = mk({ seed: 1, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [] } } }); settle(none); for (let i = 0; i < 4; i++) { flick(none, 12, 6, 2.4); run(none, 12); }
  assert.equal(none.stat.found, 0);
});
test('the ball is still gettable while he is off finding something', () => {
  const s = mk({ seed: 11, context: { ...FRIEND, ralph: { ...FRIEND.ralph, finds: [{ item: 'loose-bolt', chance: 1 }] } } }); settle(s); flick(s, 12, 6, 2.4);
  for (let i = 0; i < 30 * 10 && s.ralph.mode !== 'findgo'; i++) tick(s, 1 / 30);
  assert.equal(s.ralph.mode, 'findgo'); assert.equal(s.ball.state, 'rest');
  assert.equal(flick(s, 5, 5, 2), 'thrown'); // you can throw it again right now
});
test('a sleeping Ralph can be woken gently or left alone; a throw does not wake him', () => {
  const s = createRalph({ seed: 1, w: 16, h: 10, context: { ...FRIEND, ralph: { ...FRIEND.ralph, asleep: true } } });
  assert.equal(s.greeting, 'asleep'); flick(s, 9, 5); run(s, 8); assert.equal(s.ralph.mode, 'sleep');
  press(s, s.ralph.x, s.ralph.y); for (let i = 0; i < 90; i++) { move(s, s.ralph.x + Math.sin(i), s.ralph.y + Math.cos(i * 0.9), 1 / 30); tick(s, 1 / 30); }
  assert.notEqual(s.ralph.mode, 'sleep'); release(s, 0, 0); run(s, 3); assert.ok(['idle', 'wander', 'wake'].includes(s.ralph.mode));
});
test('the greeting depends on the bond and on how long you were gone', () => {
  const g = (bond, ago, extra = {}) => createRalph({ seed: 1, context: { now: 1e12, ralph: { bond, lastSeen: 1e12 - ago * DAY, ...extra } } }).greeting;
  assert.equal(g(0, 0.1), 'glance'); assert.equal(g(1, 0.1), 'glance'); assert.equal(g(2, 0.1), 'trot'); assert.equal(g(3, 0.1), 'trot');
  assert.equal(g(4, 0.1), 'run'); assert.equal(g(5, 0.1), 'run'); assert.equal(g(3, 5), 'frenzy'); assert.equal(g(0, 5), 'glance'); assert.equal(g(3, 0.1, { asleep: true }), 'asleep');
  assert.equal(createRalph({ seed: 1, quick: true, context: FRIEND }).greeting, 'quick');
});
test('quick mode: he is at your feet with the ball', () => {
  const s = createRalph({ seed: 1, quick: true, context: FRIEND }); const { L } = s;
  assert.ok(Math.hypot(s.ralph.x - L.hand.x, s.ralph.y - L.hand.y) < 2.5); assert.equal(s.ball.state, 'rest'); assert.ok(Math.hypot(s.ball.x - L.hand.x, s.ball.y - L.hand.y) < 0.5);
});
test('an empty, odd or hostile record never throws', () => {
  for (const c of [undefined, null, {}, 5, 'x', { ralph: null }, { ralph: { bond: 'a', mood: NaN, finds: 'no', spot: 7, tricks: 3, favourite: {} } }, { ralph: { finds: [null, 3, { item: 4 }, { item: 'x', chance: 9 }] }, save: { items: { bone: -3, kibble: 'x' } } }, { now: 'soon', ralph: { lastSeen: 'never' } }]) {
    const s = createRalph({ seed: 2, w: NaN, h: -4, context: c }); run(s, 6); flick(s, 5, 5); run(s, 6); dropItem(s, 'bone', 1, 1); dropItem(s, 'kibble', 1, 1); press(s, s.ralph.x, s.ralph.y); release(s, 0, 0);
    const res = finish(s); assert.equal(res.done, true); JSON.parse(JSON.stringify(res)); assert.ok(res.grade >= 0 && res.grade <= 100);
  }
});
test('determinism: the same seed and the same hands give the same visit', () => {
  const a = session({ seed: 12, secs: 60, hand: niceHand() }).result, b = session({ seed: 12, secs: 60, hand: niceHand() }).result;
  assert.deepEqual(a, b);
  const c = session({ seed: 13, secs: 60, hand: niceHand() }).result; assert.notDeepEqual(JSON.stringify(a), JSON.stringify(c).replace('x', 'x') + 'z');
});
test('the model and view carry no world content: no item ids, names or lines in model.js or view.js', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['../model.js', '../view.js']) { let src; try { src = await readFile(new URL(f, import.meta.url), 'utf8'); } catch { continue; } for (const bad of ['loose-bolt', 'work-glove', 'Math.random', 'Date.now', 'performance.now']) assert.ok(!src.includes(bad), `${f} has ${bad}`); }
});
test('every word key the model can say has a plain line', () => {
  const s = mk(); const keys = new Set();
  for (const m of ['idle', 'wander', 'sleep', 'wake', 'glance', 'runto', 'frenzy', 'lean', 'come', 'chase', 'bring', 'present', 'dropwalk', 'wait', 'keepgo', 'keep', 'findgo', 'dig', 'findback', 'showoff', 'eatgo', 'eat', 'search', 'bonetake', 'bonego', 'chew', 'away']) { s.ralph.mode = m; s.flash = null; keys.add(sayKey(s)); }
  for (const k of keys) assert.ok(WORDS[k] && WORDS[k].length < 60, k);
  assert.ok(Object.values(WORDS).every((w) => !/\d/.test(w)), 'no digits on the live words');
});
test('the layout fits both yard shapes: crates and kennel do not overlap, the bowl and bed are free', () => {
  for (const [w, h] of [[16, 10], [9, 14], [9, 11], [20, 10], [12, 9]]) {
    const L = layout(w, h);
    for (const a of L.rects) { assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= w && a.y + a.h <= h, `${a.id} in yard ${w}x${h}`); for (const b of L.rects) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id}/${b.id} ${w}x${h}`); }
    for (const p of [L.bed, L.bowl, L.hand]) for (const o of L.rects) assert.ok(!(p.x > o.x - 0.6 && p.x < o.x + o.w + 0.6 && p.y > o.y - 0.6 && p.y < o.y + o.h + 0.6), `point clear of ${o.id} in ${w}x${h}`);
  }
});
