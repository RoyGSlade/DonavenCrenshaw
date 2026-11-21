// Hacking v2 (Donaven 2026-11-18): mirrors you select and rotate by click and hold, a timed catch that opens a portal, a
// projectile that breaks one firewall per stage, timed per firewall. A missed firewall resets the mirrors and the portal on the
// same seed, up to the retries; failing them all raises world consequences by context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, setupHack, HACK_BASE, HACK_CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createLayout, trace, createMirrorHack, stepMirrors, holdMirror, rotateStep, releaseMirror, select, catchPortal, fire, preview, marker, markerAt, inWindow, catchFor, projectileAt, mirrorEnds, CONSEQUENCES, FIELD, STEPS, STEP_RAD, TURN_SECONDS, PROJECTILE_SPEED, CATCH_COOLDOWN, mirrorXp } from '../projects/Space-Shooter/voyage/minigames/mirrors.js';

// --- an independent tracer, written here from the law of reflection (not taken from the game) --------
function tracer(layout, angles) {
  const { emitter, target, mirrors } = layout;
  let p = { x: emitter.x, y: emitter.y }, d = { x: Math.cos(emitter.dir), y: Math.sin(emitter.dir) }; let last = -1; const bounces = [];
  for (let n = 0; n < 14; n++) {
    let best = { t: Infinity, kind: 'edge' };
    for (const t of [(d.x > 0 ? FIELD.w - p.x : -p.x) / (d.x || 1e-12), (d.y > 0 ? FIELD.h - p.y : -p.y) / (d.y || 1e-12)]) if (t > 1e-6 && t < best.t) best = { t, kind: 'edge' };
    const fx = p.x - target.x, fy = p.y - target.y, b = fx * d.x + fy * d.y, disc = b * b - (fx * fx + fy * fy - target.r ** 2);
    if (disc >= 0 && -b - Math.sqrt(disc) > 1e-6 && -b - Math.sqrt(disc) < best.t) best = { t: -b - Math.sqrt(disc), kind: 'target' };
    mirrors.forEach((m, i) => {
      if (i === last) return;
      const a = angles[i] * (Math.PI / 24), c = Math.cos(a), s = Math.sin(a); const half = 8.5;
      // solve p + t d = m + u (c, s), u in [-half, half]
      const det = d.x * -s - d.y * -c; if (Math.abs(det) < 1e-9) return;
      const rx = m.x - p.x, ry = m.y - p.y; const t = (rx * -s - ry * -c) / det; const u = (d.x * ry - d.y * rx) / det;
      if (t > 1e-6 && Math.abs(u) <= half && t < best.t) best = { t, kind: 'mirror', i, c, s };
    });
    p = { x: p.x + d.x * best.t, y: p.y + d.y * best.t };
    if (best.kind === 'target') return { hit: true, bounces };
    if (best.kind === 'edge') return { hit: false, bounces };
    // reflection: the incoming angle to the mirror equals the outgoing one
    const dot = d.x * best.c + d.y * best.s; d = { x: 2 * dot * best.c - d.x, y: 2 * dot * best.s - d.y }; last = best.i; bounces.push(best.i);
  }
  return { hit: false, bounces };
}
const solvedAngles = (l) => l.solved.map((s, i) => s ?? l.start[i]);
const run = (s, secs, dt = 1 / 60) => { for (let t = 0; t < secs / dt && !s.done; t++) stepMirrors(s, dt); return s; };
const setup = (o = {}) => setupHack({ tier: 0, level: 9, lock: 1, ...o });
const turnTo = (s, id, want) => { const d = (want - s.angles[id] + STEPS) % STEPS; const dir = d <= STEPS / 2 ? 1 : -1; const n = dir > 0 ? d : STEPS - d; for (let k = 0; k < n; k++) rotateStep(s, id, dir); return n; };

test('hack setup: exact numbers per category point at a steady roll', () => {
  const at = (cat, n, o = {}) => setupHack({ tier: 0, level: 9, lock: 4, points: { [cat]: n }, ...o });
  assert.deepEqual(setupHack({}), { firewalls: 1, mirrors: [2], decoys: [1], time: 26, spread: 12, retries: 1, catchWindow: 0.2, catchSpeed: 0.9, tier: 0, points: { time: 0, size: 0, retries: 0 }, label: 'Steady' });
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('time', n).time), [26, 28, 30, 36, 44]);
  assert.deepEqual([0, 1, 2, 3, 6, 9].map((n) => at('size', n).mirrors), [[2, 3, 3, 4], [2, 3, 3, 4], [2, 3, 3, 4], [1, 2, 2, 3], [1, 1, 1, 2], [1, 1, 1, 1]]);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((n) => at('size', n).decoys), [[1, 2, 3, 3], [1, 2, 3, 3], [0, 1, 2, 2], [0, 1, 2, 2], [0, 0, 1, 1], [0, 0, 0, 0]]);
  assert.deepEqual([0, 1, 2, 5, 9, 12].map((n) => at('size', n).spread), [12, 11, 10, 7, 3, 3]);
  assert.deepEqual([0, 1, 2, 9].map((n) => at('retries', n).retries), [1, 2, 3, 10]);
  assert.equal(at('time', 5, { level: 2 }).time, 30, 'points beyond the level do nothing');
});

test('hack setup: lock grade 1 to 4 sets the firewalls (grade 1 has one); a roll sets time, decoys, retries and the catch window', () => {
  assert.deepEqual([1, 2, 3, 4].map((g) => setupHack({ lock: g }).firewalls), [1, 2, 3, 4]);
  assert.equal(setupHack({ lock: { level: 3 } }).firewalls, 3);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupHack({ tier: k }).time), [18.2, 22.1, 26, 29.9, 33.8]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupHack({ tier: k }).retries), [0, 1, 1, 2, 2]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupHack({ tier: k }).decoys[0]), [2, 1, 1, 1, 0]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupHack({ tier: k }).catchWindow), [0.16, 0.18, 0.2, 0.22, 0.24]);
  assert.equal(setupHack({ tier: -2, level: 1, points: {} }).time >= HACK_BASE.minTime, true);
  const run2 = (roll) => setupHack({ tier: tierOf({ total: roll + 3, dc: 12, natural: roll === 20 }), points: { time: 2 }, level: 3 });
  assert.ok(run2(18).time > run2(8).time && run2(8).time > run2(1).time, 'a high roll gives more time');
});

test('every board is solvable: an independent tracer sends the beam through the solved mirrors into the firewall, in order', () => {
  let n = 0;
  for (const mirrors of [1, 2, 3, 4]) for (const decoys of [0, 1, 2, 3, 4]) for (let seed = 1; seed <= 30; seed++) for (const stage of [0, 1, 2, 3]) {
    const l = createLayout({ seed, stage, mirrors, decoys });
    assert.equal(l.mirrors.length, mirrors + decoys);
    const a = tracer(l, solvedAngles(l)), b = trace(l, solvedAngles(l));
    assert.equal(a.hit, true, `m${mirrors} d${decoys} seed ${seed} stage ${stage}`);
    assert.deepEqual(a.bounces, Array.from({ length: mirrors }, (_, i) => i), 'the beam visits the path mirrors in order');
    assert.deepEqual([b.hit, b.via], [a.hit, a.bounces], 'the game agrees with the independent tracer');
    assert.equal(tracer(l, l.start).hit, false, 'the starting board does not already break the firewall');
    assert.equal(trace(l, l.start).hit, false);
    for (const m of l.mirrors) { assert.ok(m.x >= 15 && m.x <= FIELD.w - 15 && m.y >= 15 && m.y <= FIELD.h - 15, 'inside the field'); assert.equal(Number.isInteger(m.start) && m.start >= 0 && m.start < STEPS, true); }
    for (let i = 0; i < l.mirrors.length; i++) for (let j = i + 1; j < l.mirrors.length; j++) assert.ok(Math.hypot(l.mirrors[i].x - l.mirrors[j].x, l.mirrors[i].y - l.mirrors[j].y) >= 26, 'boxes do not overlap');
    for (const m of l.mirrors.filter((x) => !x.decoy)) { const off = Math.min((m.start - m.solved + STEPS) % STEPS, (m.solved - m.start + STEPS) % STEPS); assert.ok(off >= 3, 'every path mirror starts well off its solution'); }
    n++;
  }
  assert.equal(n, 2400);
});

test('reflection obeys the law: the angle in equals the angle out at every bounce (checked from the traced points)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const l = createLayout({ seed, stage: 0, mirrors: 3, decoys: 2 }); const t = trace(l, solvedAngles(l));
    for (let k = 0; k < t.via.length; k++) {
      const [x0, y0] = t.pts[k], [x1, y1] = t.pts[k + 1], [x2, y2] = t.pts[k + 2];
      const a = l.mirrors[t.via[k]]; const ang = (a.solved) * STEP_RAD; const mx = Math.cos(ang), my = Math.sin(ang);
      const din = { x: x1 - x0, y: y1 - y0 }, dout = { x: x2 - x1, y: y2 - y1 };
      const ni = Math.hypot(din.x, din.y), no = Math.hypot(dout.x, dout.y);
      const tin = (din.x * mx + din.y * my) / ni, tout = (dout.x * mx + dout.y * my) / no; // along the mirror: unchanged
      const nin = (-din.x * my + din.y * mx) / ni, nout = (-dout.x * my + dout.y * mx) / no; // across the mirror: flipped
      assert.ok(Math.abs(tin - tout) < 1e-6 && Math.abs(nin + nout) < 1e-6, `seed ${seed} bounce ${k}`);
    }
  }
});

test('the same seed gives the same board; another stage or seed gives another', () => {
  const a = createLayout({ seed: 7, stage: 1, mirrors: 3, decoys: 2 }), b = createLayout({ seed: 7, stage: 1, mirrors: 3, decoys: 2 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(createLayout({ seed: 7, stage: 2, mirrors: 3, decoys: 2 }), a);
  assert.notDeepEqual(createLayout({ seed: 8, stage: 1, mirrors: 3, decoys: 2 }), a);
  assert.deepEqual(catchFor({ seed: 5, stage: 0, window: 0.2 }), catchFor({ seed: 5, stage: 0, window: 0.2 }));
});

test('selecting and turning: one step is 7.5 degrees, holding turns a step every 0.09 s, both ways, wrapping; the preview follows', () => {
  const s = createMirrorHack({ seed: 3, setup: setup() });
  assert.equal(select(s, 0), true); assert.equal(s.selected, 0); assert.equal(select(s, 99), false);
  const a0 = s.angles[0];
  assert.equal(rotateStep(s, 0, 1), true); assert.equal(s.angles[0], (a0 + 1) % STEPS);
  assert.equal(rotateStep(s, 0, -1), true); assert.equal(s.angles[0], a0);
  for (let k = 0; k < STEPS; k++) rotateStep(s, 0, 1); assert.equal(s.angles[0], a0, 'a full half turn of steps comes back');
  rotateStep(s, 0, -1); for (let k = 0; k < STEPS; k++) rotateStep(s, 0, -1); assert.equal(s.angles[0], (a0 - 1 + STEPS) % STEPS);
  // holding
  const b0 = s.angles[1] ?? s.angles[0]; const id = s.layout.mirrors.length > 1 ? 1 : 0; const from = s.angles[id];
  let steps = 0; for (let f = 0; f < 60; f++) steps += holdMirror(s, id, 1, 1 / 60); // one second
  assert.equal(steps, Math.floor(1 / TURN_SECONDS)); assert.equal(s.angles[id], (from + steps) % STEPS);
  assert.equal(s.selected, id, 'holding a mirror selects it');
  releaseMirror(s); assert.equal(s.held, 0);
  assert.ok(b0 !== undefined);
  // the preview traces what the mirrors say now
  const l = s.layout; s.angles = solvedAngles(l).slice(); assert.equal(preview(s).hit, true);
  rotateStep(s, 0, 1); assert.equal(preview(s).hit, false, 'turn the first mirror and the beam leaves the path');
  // mirror ends sit on the box
  const [x0, y0, x1, y1] = mirrorEnds(l.mirrors[0], 0); assert.deepEqual([x0, y0, x1, y1], [l.mirrors[0].x - 8.5, l.mirrors[0].y, l.mirrors[0].x + 8.5, l.mirrors[0].y]);
});

test('the catch: the marker sweeps 0 to 1 and back; inside the window the portal opens; outside it a short cooldown; open stays open', () => {
  assert.deepEqual([0, 0.25, 1, 1.25, 2, 2.5, -0.5].map(markerAt), [0, 0.25, 1, 0.75, 0, 0.5, 0.5]);
  const s = createMirrorHack({ seed: 4, setup: setup() });
  const c = s.portal;
  // walk the marker until it is inside, then outside
  let guard = 0; while (!inWindow(s) && guard++ < 6000) stepMirrors(s, 1 / 120);
  assert.equal(inWindow(s), true);
  assert.equal(Math.abs(marker(s) - c.centre) <= c.width / 2, true);
  assert.equal(catchPortal(s), 'open'); assert.equal(s.portal.open, true);
  assert.equal(catchPortal(s), null, 'already open');
  const t = createMirrorHack({ seed: 4, setup: setup() });
  guard = 0; while (inWindow(t) && guard++ < 6000) stepMirrors(t, 1 / 120);
  while (inWindow(t) || t.portal.cooldown > 0) stepMirrors(t, 1 / 120); // first moment outside
  assert.equal(inWindow(t), false);
  assert.equal(catchPortal(t), 'miss'); assert.equal(t.portal.open, false); assert.equal(t.catchMisses, 1);
  assert.equal(catchPortal(t), null, 'a catch during the cooldown does nothing');
  stepMirrors(t, CATCH_COOLDOWN + 0.01); assert.equal(t.portal.cooldown, 0);
  // the window is where the seed says, inside the bar, and wider for an easier roll
  for (let seed = 1; seed <= 40; seed++) { const k = catchFor({ seed, stage: 0, window: 0.2 }); assert.ok(k.centre - 0.1 >= 0.1 && k.centre + 0.1 <= 0.9); }
  assert.ok(setupHack({ tier: 2 }).catchWindow > setupHack({ tier: -2 }).catchWindow);
});

test('fire needs the open portal and spends it; a good shot flies the path and breaks the firewall; a bad one fizzles', () => {
  const s = createMirrorHack({ seed: 2, setup: setup() });
  assert.equal(fire(s), null, 'no portal, no shot');
  s.portal.open = true; s.angles = solvedAngles(s.layout).slice();
  const tr = fire(s); assert.equal(tr.hit, true); assert.equal(s.portal.open, false, 'the portal closes behind the shot'); assert.equal(s.shots, 1);
  assert.equal(rotateStep(s, 0, 1), false, 'mirrors are locked while the projectile flies');
  assert.equal(fire(s), null, 'one at a time');
  const [x0, y0] = projectileAt(s); assert.ok(Math.abs(x0 - s.layout.emitter.x) < 1e-6 && Math.abs(y0 - s.layout.emitter.y) < 1e-6, 'it leaves the emitter');
  const flight = tr.length / PROJECTILE_SPEED; run(s, flight + 0.1, 1 / 120);
  assert.equal(s.done, true, 'one firewall: breaking it finishes the hack');
  assert.equal(s.result.success, true);
  // a wrong shot fizzles
  const m = createMirrorHack({ seed: 2, setup: setup({ points: { time: 9 } }) });
  m.portal.open = true; const miss = fire(m); assert.equal(miss.hit, false);
  run(m, 6);
  assert.equal(m.fizzles, 1); assert.equal(m.done, false); assert.equal(m.portal.open, false, 'the portal is spent: catch again');
});

test('stages: a hack has one firewall per lock grade; each stage is its own board; clearing one starts the next with a fresh clock', () => {
  const s = createMirrorHack({ seed: 9, setup: setup({ lock: 3 }) });
  assert.equal(s.stages, 3);
  const boards = [];
  for (let k = 0; k < 3; k++) {
    boards.push(JSON.stringify(s.layout));
    assert.equal(s.stage, k);
    run(s, 4); const used = s.left; assert.ok(used < s.total);
    s.angles = solvedAngles(s.layout).slice(); s.portal.open = true; fire(s); run(s, 8);
  }
  assert.equal(s.done, true); assert.equal(s.result.success, true); assert.equal(new Set(boards).size, 3, 'three different boards');
  assert.equal(s.result.firewalls, 3); assert.equal(s.result.broken, 3);
  // stage sizes follow the setup: the mirror count grows with the stage
  const st = setup({ lock: 4 }); assert.deepEqual(st.mirrors, [2, 3, 3, 4]);
  const g = createMirrorHack({ seed: 9, setup: st }); for (let k = 0; k < 3; k++) { g.angles = solvedAngles(g.layout).slice(); g.portal.open = true; fire(g); run(g, 8); }
  assert.equal(g.stage, 3); assert.equal(g.layout.mirrors.filter((m) => !m.decoy).length, 4);
});

test('timing and retries: the clock runs per firewall; running out resets the board on the SAME seed and spends a retry', () => {
  const s = createMirrorHack({ seed: 11, setup: setup({ lock: 2, points: { retries: 2 } }) }); // 1 + 2 = 3 retries
  assert.equal(s.retriesLeft, 3);
  const layout0 = JSON.stringify(s.layout), phase0 = s.portal.phase, centre0 = s.portal.centre;
  // scramble the board a little and open the portal, then run out the clock
  rotateStep(s, 0, 1); rotateStep(s, 0, 1); s.portal.open = true;
  run(s, s.total - 0.01); assert.equal(s.retriesLeft, 3, 'still on the first try');
  assert.equal(s.done, false);
  stepMirrors(s, 0.02);
  assert.deepEqual([s.retriesLeft, s.retriesUsed, s.done, s.stage], [2, 1, false, 0]);
  assert.deepEqual(s.events.map((e) => e.type), ['reset']);
  assert.equal(JSON.stringify(s.layout), layout0, 'the same board');
  assert.deepEqual(s.angles, s.layout.start, 'the mirrors are back where they started');
  assert.equal(s.portal.open, false, 'the portal is closed again');
  assert.equal(s.portal.phase, phase0, 'the catch starts over'); assert.equal(s.portal.centre, centre0, 'the window is where it was');
  assert.equal(s.left, s.total, 'a fresh clock');
  // the second stage's retry returns to ITS board, not the first
  s.angles = solvedAngles(s.layout).slice(); s.portal.open = true; fire(s); run(s, 8);
  assert.equal(s.stage, 1);
  const l1 = JSON.stringify(s.layout); run(s, s.total + 0.1);
  assert.equal(JSON.stringify(s.layout), l1); assert.equal(s.stage, 1); assert.equal(s.retriesLeft, 1);
  // a shot already flying when the clock runs out still lands if it gets there first
  const f = createMirrorHack({ seed: 11, setup: { ...setup(), retries: 0 } });
  f.angles = solvedAngles(f.layout).slice(); f.portal.open = true; fire(f); f.left = 0.01; run(f, 3);
  assert.equal(f.result.success, false, 'time ran out while the shot was still in the air');
});

test('failing every retry is a world result: security alerted, and by context the terminal locks, a port closes, or you target a new section', () => {
  const expect = {
    foot: { terminal: 'locked', port: undefined, section: undefined },
    ship: { terminal: undefined, port: 'closed', section: undefined },
    combat: { terminal: undefined, port: undefined, section: 'changed' },
  };
  for (const context of ['foot', 'ship', 'combat']) {
    const s = createMirrorHack({ seed: 3, context, setup: setup({ points: { retries: 0 } }) }); // 1 retry
    run(s, s.total * 3);
    assert.equal(s.done, true, context);
    const r = s.result;
    assert.deepEqual({ success: r.success, how: r.how, security: r.security, context: r.context, xp: r.xp, retriesUsed: r.retriesUsed, broken: r.broken },
      { success: false, how: 'locked-out', security: 'alerted', context, xp: 0, retriesUsed: 1, broken: 0 });
    assert.deepEqual({ terminal: r.terminal, port: r.port, section: r.section }, expect[context]);
    assert.equal(r.world.security, 'alerted'); assert.equal(r.world.line, CONSEQUENCES[context].line);
  }
  assert.match(CONSEQUENCES.foot.line, /terminal is locked/); assert.match(CONSEQUENCES.ship.line, /closed its ports/); assert.match(CONSEQUENCES.combat.line, /new section/);
  // zero retries: the first time out ends it
  const z = createMirrorHack({ seed: 3, setup: setup({ tier: -2, points: {}, level: 1 }) });
  assert.equal(z.retriesLeft, 0); run(z, z.total + 1); assert.equal(z.result.success, false); assert.equal(z.result.retriesUsed, 0);
  // an unknown context counts as on foot
  assert.equal(createMirrorHack({ seed: 1, context: 'nope' }).context, 'foot');
  // a win raises nothing
  const w = createMirrorHack({ seed: 3, context: 'ship', setup: setup() }); w.angles = solvedAngles(w.layout).slice(); w.portal.open = true; fire(w); run(w, 8);
  assert.deepEqual({ ok: w.result.success, security: w.result.security, port: w.result.port, terminal: w.result.terminal, world: w.result.world }, { ok: true, security: 'quiet', port: undefined, terminal: undefined, world: { security: 'quiet' } });
  assert.equal(mirrorXp(w.result), 3 + 2 + 1); assert.equal(mirrorXp({ success: true, firewalls: 3, retriesUsed: 1 }), 9); assert.equal(mirrorXp({ success: false }), 0);
});

// --- a person at the board: select, turn, wait for the catch, fire (public calls only) ---------------
function player(s, { think = 1.2, react = 0.08, learn = 1, dt = 1 / 60 } = {}) {
  let clock = 0;
  const tick = (secs) => { for (let t = 0; t < secs / dt && !s.done; t++) { stepMirrors(s, dt); clock += dt; } };
  while (!s.done && clock < 900) {
    const stage = s.stage, tries = s.retriesUsed;
    const same = () => !s.done && s.stage === stage && s.retriesUsed === tries;
    const solved = solvedAngles(s.layout);
    for (const m of s.layout.mirrors) {
      if (m.decoy || !same() || s.angles[m.id] === solved[m.id]) continue;
      tick(think * learn ** s.retriesUsed); if (!same()) break; select(s, m.id); // find it and click its box
      let d = (solved[m.id] - s.angles[m.id] + STEPS) % STEPS; const dir = d <= STEPS / 2 ? 1 : -1; d = dir > 0 ? d : STEPS - d;
      let taken = 0; while (taken < d && same()) { taken += holdMirror(s, m.id, dir, dt); tick(dt); }
      releaseMirror(s);
    }
    // the catch: wait for the marker to reach the window, react, press; a miss waits out the cooldown and tries the next sweep
    while (same() && !s.portal.open) {
      let guard = 0; while (same() && !inWindow(s) && guard++ < 4000) tick(dt);
      tick(react); if (!same()) break;
      catchPortal(s);
      if (!s.portal.open) tick(CATCH_COOLDOWN);
    }
    if (same() && s.portal.open && fire(s)) tick(s.projectile.length / PROJECTILE_SPEED + 0.05);
  }
  return s;
}

test('a steady person clears every firewall at a steady roll: 1.2 s to pick each mirror, an 0.08 s catch reaction', () => {
  const rows = [];
  for (const [label, tier, lock, floor] of [['rough g1', -2, 1, 0.6], ['steady g1', 0, 1, 1], ['steady g2', 0, 2, 1], ['steady g4', 0, 4, 0.9], ['smooth g4', 2, 4, 1]]) {
    let wins = 0, boards = 0, retries = 0, used = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = player(createMirrorHack({ seed, setup: setupHack({ tier, lock, level: 1, points: {} }) }));
      boards++; if (s.result.success) { wins++; used += s.result.time; } retries += s.result.retriesUsed;
    }
    rows.push(`${label} ${wins}/${boards} (${(used / Math.max(1, wins)).toFixed(1)} s, ${retries} retries)`);
    assert.ok(wins >= boards * floor, `${label}: ${wins} of ${boards}`);
  }
  console.log('hack bot:', rows.join('; '));
});

test('a hand that does nothing loses every board, spends every retry, and the world answers', () => {
  for (let seed = 1; seed <= 20; seed++) for (const lock of [1, 2, 4]) {
    const s = createMirrorHack({ seed, context: 'combat', setup: setup({ lock, points: { retries: 1 } }) });
    run(s, 1200); assert.equal(s.result.success, false); assert.equal(s.result.retriesUsed, 2); assert.equal(s.result.section, 'changed');
  }
});

test('every point visibly changes something: time, how far the mirrors start from their place, decoys, mirrors and retries (many-run sums)', () => {
  const lvl = (p, o = {}) => setupHack({ tier: 0, level: 9, lock: 4, points: p, ...o });
  // time: a slow person (3 s to pick each mirror) clears more boards with more time per firewall
  const slow = (setupObj, seeds = 40) => { let wins = 0; for (let seed = 1; seed <= seeds; seed++) { const s = player(createMirrorHack({ seed, setup: { ...setupObj, retries: 0 } }), { think: 5, react: 0.1, learn: 0.5 }); if (s.result.success) wins++; } return wins; };
  const t0 = slow(lvl({})), t9 = slow(lvl({ time: 9 }));
  assert.ok(t9 > t0, `more time clears more (${t9} vs ${t0})`);
  // retries: the same slow person with 4 retries clears more boards than with none
  const r0 = slow(lvl({})), r4 = (() => { let wins = 0; for (let seed = 1; seed <= 40; seed++) { const s = player(createMirrorHack({ seed, setup: lvl({ retries: 4 }) }), { think: 5, react: 0.1, learn: 0.5 }); if (s.result.success) wins++; } return wins; })();
  assert.ok(r4 > r0, `retries clear more (${r4} vs ${r0})`);
  // each size point: the mirrors start nearer their place, so there is less turning to do (mean steps to turn over many boards)
  const work = (spread) => { let sum = 0, n = 0; for (let seed = 1; seed <= 60; seed++) { const l = createLayout({ seed, stage: 1, mirrors: 3, decoys: 1, spread }); for (const m of l.mirrors.filter((x) => !x.decoy)) { const d = (m.start - m.solved + STEPS) % STEPS; sum += Math.min(d, STEPS - d); n++; } } return sum / n; };
  let prev = Infinity; for (let n = 0; n <= 9; n++) { const w = work(lvl({ size: n }).spread); assert.ok(w < prev, `size point ${n}: ${w.toFixed(2)} steps < ${prev.toFixed(2)}`); prev = w; }
  for (let seed = 1; seed <= 40; seed++) for (const sp of [3, 6, 12]) for (const m of createLayout({ seed, stage: 0, mirrors: 3, decoys: 0, spread: sp }).mirrors) { const d = (m.start - m.solved + STEPS) % STEPS; const dist = Math.min(d, STEPS - d); assert.ok(dist >= 3 && dist <= sp, `spread ${sp}: ${dist}`); }
  // mirror and decoy counts change at the stated points, one at a time
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const a = lvl({ size: n - 1 }), b = lvl({ size: n });
    const changed = b.spread !== a.spread || JSON.stringify(b.mirrors) !== JSON.stringify(a.mirrors) || JSON.stringify(b.decoys) !== JSON.stringify(a.decoys);
    assert.equal(changed, true, `size point ${n} changes something`);
  }
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.equal(lvl({ time: n }).time > lvl({ time: n - 1 }).time, true, `time point ${n}`);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.equal(lvl({ retries: n }).retries, lvl({ retries: n - 1 }).retries + 1, `retry point ${n}`);
  assert.deepEqual(HACK_CATEGORIES, ['time', 'size', 'retries']);
});
