// Doors built into the walls and two-door entries (launch doors lane). Pure rules, run headless with the real walker:
//   a door opens on approach and closes behind you; a locked door stays shut until unlocked; in a vestibule the map change
//   only happens with both doors shut; the entry data is sound on both sides; every existing room link still connects the
//   same rooms and no existing map opted in. The page is in stardust-doors-browser.test.mjs.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';
import { checkMaps, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { createWalker, stepWalker } from '../projects/Space-Shooter/voyage/onfoot/rules/walk.js';
import { MAP_DEFS, enterMap } from '../projects/Space-Shooter/voyage/maps/index.js';
import { registerWorkbench, WORKBENCH_DEF, ANNEX_DEF, WORKBENCH_ID, ANNEX_ID } from '../projects/Space-Shooter/voyage/workbench/map.js';
import { TUNING, stepOpen, doorWants, createEntry, stepEntry, leaves, rectDistance, bodyInGap } from '../projects/Space-Shooter/voyage/onfoot/doors/rules.js';
import { doorIssues, entryPairIssues, compileDoors } from '../projects/Space-Shooter/voyage/onfoot/doors/compile.js';
import { createDoorSystem } from '../projects/Space-Shooter/voyage/onfoot/doors/system.js';

registerWorkbench();
const BENCH = enterMap(WORKBENCH_ID), ANNEX = enterMap(ANNEX_ID);
const DT = 1 / 60;

/** Walk a body toward waypoints with the real walker and the door system until each is reached (or give up). */
function runner(map, spawn, { locked = () => false, arrive = null } = {}) {
  const sys = createDoorSystem(); sys.load(map, { arrive });
  const w = createWalker(map.spawns[spawn]);
  const log = { swaps: [], frames: 0, amounts: [] };
  let m = map, lockedFn = locked, t = 0;
  const tick = (mv) => {
    stepWalker(w, mv, sys.walkMap(m), DT);
    const r = sys.step(DT, { walker: w, bodies: [w], locked: lockedFn });
    t += DT; log.frames++;
    for (const ev of r.events) {
      // both doors of that entry must be shut at the instant of the swap
      const e = sys.entries.find(x => x.id === ev.entry);
      log.swaps.push({ t, ...ev, room: sys.amount(e.roomDoor.id), far: sys.amount(e.farDoor.id) });
    }
    return r;
  };
  const toward = (px, py, within = 10, maxSecs = 12) => {
    for (let i = 0; i < maxSecs * 60; i++) {
      const dx = px - w.x, dy = py - w.y, d = Math.hypot(dx, dy);
      if (d <= within) return true;
      tick({ x: dx / d, y: dy / d });
      if (log.swaps.length && log.stop) return false;
    }
    return false;
  };
  const idle = (secs) => { for (let i = 0; i < secs * 60; i++) tick({ x: 0, y: 0 }); };
  return { sys, w, log, tick, toward, idle, setLocked: f => { lockedFn = f; }, load(map2, opts) { m = map2; sys.load(map2, opts); }, get t() { return t; } };
}
const T = BENCH.tile;
const center = (d) => ({ x: d.x + d.w / 2, y: d.y + d.h / 2 });

// ---- the rules ------------------------------------------------------------------------------------------------------
test('rules: panels take about a third of a second to open and a bit longer to close; reduced motion snaps', () => {
  let o = 0; for (let i = 0; i < 60 * TUNING.openSecs + 1; i++) o = stepOpen(o, true, DT);
  assert.equal(o, 1);
  let c = 1; for (let i = 0; i < 20; i++) c = stepOpen(c, false, DT);
  assert.ok(c > 0 && c < 1, 'still closing after a third of a second');
  assert.equal(stepOpen(0, true, DT, true), 1);
});
test('rules: want open on approach; never when locked or far; a shut hold only stays open for a body in the gap', () => {
  assert.equal(doorWants({ near: true }), true);
  assert.equal(doorWants({ near: false }), false);
  assert.equal(doorWants({ near: true, locked: true }), false);
  assert.equal(doorWants({ near: true, far: true }), false);
  assert.equal(doorWants({ mode: 'shut', near: true }), false, 'sealing: closes even with someone near');
  assert.equal(doorWants({ mode: 'shut', near: true, gap: true }), true, 'never closes on someone');
  assert.equal(doorWants({ mode: 'open' }), true);
  assert.equal(doorWants({ mode: 'open', locked: true }), true, 'arriving lets you out even through a sealed door');
  assert.equal(doorWants({ mode: 'open', far: true }), false);
});
test('rules: slide leaves tuck into the wall (never wider apart than the gap); swing leaves turn toward 85 degrees', () => {
  const [a, b] = leaves(96, 1, 'slide');
  assert.equal(a.x1, -48, 'left leaf is fully out of the gap');
  assert.equal(b.x0, 48);
  const [c0] = leaves(96, 0, 'slide'); assert.equal(c0.x1 + 0, 0);
  const [s] = leaves(96, 1, 'swing'); assert.ok(Math.abs(s.angle) > 1.4 && Math.abs(s.angle) < 1.6);
});

// ---- the data -------------------------------------------------------------------------------------------------------
test('data: the workbench and its annex have sound doors and entries on both sides', () => {
  assert.deepEqual(doorIssues(WORKBENCH_DEF), []);
  assert.deepEqual(doorIssues(ANNEX_DEF), []);
  assert.deepEqual(entryPairIssues([WORKBENCH_DEF, ANNEX_DEF]), []);
  const { doors, entries } = compileDoors(BENCH);
  assert.equal(entries.length, 1); assert.ok(doors.find(d => d.far), 'the far door');
  const a = compileDoors(ANNEX);
  assert.deepEqual(a.doors.filter(d => !d.entry).map(d => d.style).sort(), ['slide', 'slide'], 'sliding doorways (Erik: slide everywhere)');
});
test('data: bad doors and entries are caught', () => {
  const clone = () => JSON.parse(JSON.stringify(WORKBENCH_DEF));
  let d = clone(); d.wallDoors[0].at = [3, 5]; assert.ok(doorIssues(d).length, 'a door in the middle of a room has no pockets');
  d = clone(); d.entries[0].zone.size = [2, 5]; assert.ok(doorIssues(d).some(s => /2 or 3 tiles/.test(s)), 'a vestibule is short');
  d = clone(); d.entries[0].spawn = 'default'; assert.ok(doorIssues(d).some(s => /outside the vestibule/.test(s)));
  d = clone(); d.wallDoors[1].far = false; assert.ok(doorIssues(d).some(s => /marked far/.test(s)));
  const other = JSON.parse(JSON.stringify(ANNEX_DEF)); other.entries[0].zone.size = [2, 2];
  assert.ok(entryPairIssues([WORKBENCH_DEF, other]).some(s => /cut would show/.test(s)), 'unequal vestibules would show the cut');
  const lost = JSON.parse(JSON.stringify(ANNEX_DEF)); lost.entries[0].arrive = 'nowhere';
  assert.ok(entryPairIssues([WORKBENCH_DEF, lost]).length);
});
test('data: the gap is floor, a shut door is a wall, and the vestibule is open floor', () => {
  const { doors } = compileDoors(BENCH);
  for (const d of doors) { const c = center(d); assert.ok(walkable(BENCH, c.x, c.y, 8), `${d.id} gap is floor`); }
  const sys = createDoorSystem(); sys.load(BENCH);
  const room = doors.find(d => d.id === 'annex-room'), c = center(room);
  assert.equal(walkable(sys.walkMap(BENCH), c.x, c.y, 8), false, 'a shut door blocks (solids added)');
  assert.equal(sys.walkMap(BENCH), sys.walkMap(BENCH), 'cached while nothing moves');
});

// ---- opens on approach, closes behind -------------------------------------------------------------------------------
test('door: opens as you walk up, you pass, and it closes behind you', () => {
  const R = runner(ANNEX, 'default');
  const door = R.sys.get('cargo-door'), c = center(door);
  assert.equal(R.sys.amount('cargo-door'), 0);
  R.toward(c.x + 3.2 * T, c.y);                    // standing a few tiles off: still shut
  assert.equal(R.sys.amount('cargo-door'), 0, 'far away it stays shut');
  R.toward(c.x + 1.0 * T, c.y);                    // walk up
  R.idle(0.5);
  assert.equal(R.sys.amount('cargo-door'), 1, 'open on approach');
  assert.ok(R.toward(c.x - 1.6 * T, c.y, 8), 'walked through the gap');
  R.toward(c.x - 4 * T, c.y);
  R.idle(1.2);
  assert.equal(R.sys.amount('cargo-door'), 0, 'closed behind');
  assert.equal(walkable(R.sys.walkMap(ANNEX), c.x, c.y, 8), false, 'and solid again');
});
test('door: a shut door blocks the walker until the panels are apart', () => {
  const R = runner(ANNEX, 'default');
  const c = center(R.sys.get('cargo-door'));
  R.w.x = c.x + 1.7 * T; R.w.y = c.y; R.w.vx = R.w.vy = 0;
  let minX = R.w.x;
  for (let i = 0; i < 8; i++) { R.tick({ x: -1, y: 0 }); minX = Math.min(minX, R.w.x); }
  assert.ok(R.w.x > c.x, 'still on the near side after 8 frames: the door is not open yet');
});
test('door: a locked door stays shut next to you, then opens once unlocked', () => {
  const opened = new Set();
  const R = runner(ANNEX, 'default', { locked: d => d.id === 'store-door' && !opened.has('k') });
  const c = center(R.sys.get('store-door'));
  R.toward(c.x - 1.0 * T, c.y); R.idle(1.2);
  assert.equal(R.sys.amount('store-door'), 0, 'locked: shut with you standing at it');
  assert.ok(R.sys.gated(R.w, d => d.id === 'store-door' && !opened.has('k')).some(g => g.id === 'store-door'), 'E can try it (an interact point)');
  assert.equal(R.sys.gated(R.w, () => false).length, 0, 'unlocked doors need no E');
  opened.add('k'); R.idle(0.6);
  assert.equal(R.sys.amount('store-door'), 1, 'unlocked: opens on approach');
});
test('door: nobody is crushed (a body in the gap holds it open)', () => {
  const R = runner(ANNEX, 'default');
  const c = center(R.sys.get('cargo-door'));
  R.w.x = c.x; R.w.y = c.y; R.idle(0.6);
  assert.ok(bodyInGap(R.sys.get('cargo-door'), [R.w]));
  assert.equal(R.sys.amount('cargo-door'), 1);
});

// ---- the vestibule --------------------------------------------------------------------------------------------------
test('entry: the outer door closes first; the map change only happens with both doors shut; the next door opens last', () => {
  const R = runner(BENCH, 'default');
  const room = R.sys.get('annex-room'), far = R.sys.get('annex-far'), c = center(room);
  const timeline = [];
  const watch = () => { const r = R.sys.amount('annex-room'), f = R.sys.amount('annex-far'); timeline.push([R.t, r, f, R.sys.phase('annex')]); };
  R.log.stop = true;
  // walk up to the outer door and in
  R.toward(c.x, c.y - 1.3 * T); R.idle(0.1);
  let openedFirst = false;
  for (let i = 0; i < 6 * 60 && !R.log.swaps.length; i++) {
    const tx = c.x, ty = c.y + 3.2 * T, dx = tx - R.w.x, dy = ty - R.w.y, d = Math.hypot(dx, dy);
    R.tick(d > 6 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }); watch();
    if (R.sys.amount('annex-room') === 1) openedFirst = true;
  }
  assert.ok(openedFirst, 'the outer door opened on approach');
  assert.equal(R.log.swaps.length, 1, 'exactly one map change');
  const sw = R.log.swaps[0];
  assert.equal(sw.to, ANNEX_ID); assert.equal(sw.arrive, 'from-bench');
  assert.ok(sw.room <= TUNING.eps && sw.far <= TUNING.eps, `both doors shut at the swap (room ${sw.room}, far ${sw.far})`);
  assert.equal(R.sys.amount('annex-far'), 0, 'the far door never opened');
  // the room door closed (passed through passable=false) before the cycle ran its time
  const closedAt = timeline.find(r => r[1] <= TUNING.eps && r[3] === 'cycling');
  assert.ok(closedAt && sw.t - closedAt[0] >= TUNING.cycleSecs - 0.05, 'doors were shut for the whole cycle');
  assert.ok(timeline.every(r => !(r[1] > 0.3 && r[3] === 'cycling')), 'the outer door is shut before the cycle begins');
  // now arrive in the annex: both doors shut, settle, then the annex room door opens
  const B = runner(ANNEX, 'from-bench', { arrive: 'from-bench' });
  assert.equal(B.sys.phase('bench'), 'arrived');
  const bRoom = B.sys.get('bench-room'), bc = center(bRoom);
  B.idle(TUNING.settleSecs - 0.15);
  assert.equal(B.sys.amount('bench-room'), 0, 'still shut during the settle beat');
  B.idle(0.9);
  assert.equal(B.sys.amount('bench-room'), 1, 'the next room door is open');
  assert.equal(B.sys.amount('bench-far'), 0, 'the other door stays shut');
  assert.ok(B.toward(bc.x, bc.y + 1.5 * T, 10), 'walk out through it into the room');
  B.toward(bc.x, bc.y + 5 * T); B.idle(1.2);
  assert.equal(B.sys.amount('bench-room'), 0, 'closes behind');
  assert.equal(B.sys.phase('bench'), 'idle', 're-armed');
});
test('entry: stepping back out before the sealing point changes nothing; the far door never takes anyone anywhere', () => {
  const R = runner(BENCH, 'default');
  const room = R.sys.get('annex-room'), c = center(room);
  R.toward(c.x, c.y + 0.4 * T); R.idle(0.2);                    // standing in the gap
  assert.equal(R.sys.phase('annex'), 'idle');
  R.toward(c.x, c.y - 2 * T); R.idle(1);
  assert.equal(R.log.swaps.length, 0);
  assert.equal(R.sys.amount('annex-room'), 0);
});
test('entry: the pure sequence swaps only when shut, and a body in the gap delays sealing', () => {
  const st = createEntry(false);
  stepEntry(st, { dt: DT, inTrigger: true, roomOpen: 1, farOpen: 0, gap: true });
  assert.equal(st.phase, 'sealing');
  let ev = stepEntry(st, { dt: DT, roomOpen: 0.5, gap: true });
  assert.equal(st.phase, 'sealing'); assert.equal(ev.hold, 'shut');
  stepEntry(st, { dt: DT, roomOpen: 0, gap: false });
  assert.equal(st.phase, 'cycling');
  ev = stepEntry(st, { dt: TUNING.cycleSecs + 0.1, roomOpen: 0.4, farOpen: 0 });
  assert.equal(ev.events.length, 0, 'a door that is not shut never allows the swap');
  ev = stepEntry(st, { dt: DT, roomOpen: 0, farOpen: 0 });
  assert.deepEqual(ev.events.map(e => e.type), ['swap']);
});

// ---- the rollout: the Duchess and the hangar connectors --------------------------------------------------------------
const OUTV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const ROLLED = Object.values(MAP_DEFS).filter(d => d.entries?.length);
const ROLLED_IDS = ['duchess-corridor', 'duchess-mess', 'duchess-holodeck', 'duchess-quarters', 'duchess-bridge', 'duchess-airlock', 'duchess-engine', 'duchess-cargo', 'duchess-pad', 'hangar', 'workshop', 'mel-bay', 'edna-den', 'cantina'];
test('rollout: the Duchess rooms and the hangar connectors have entries; the validators are green on every map and every pair', () => {
  assert.deepEqual(ROLLED.map(d => d.id).sort(), [...ROLLED_IDS].sort());
  assert.equal(ROLLED.reduce((n, d) => n + d.entries.length, 0), 24, '12 links, 2 doors each');
  for (const def of ROLLED) assert.deepEqual(doorIssues(def), [], def.id);
  assert.deepEqual(entryPairIssues(ROLLED), []);
  // the airlock and Berth 7 are among them
  assert.ok(MAP_DEFS['duchess-corridor'].entries.some(e => e.door === 'airlock'));
  assert.ok(MAP_DEFS.hangar.entries.some(e => e.door === 'berth') && MAP_DEFS['duchess-pad'].entries.some(e => e.door === 'hangar'));
  assert.deepEqual(MAP_DEFS.hangar.entries.map(e => e.door).sort(), ['backroom', 'berth', 'concourse', 'mel-bay', 'workshop']);
});
test('rollout: sliding everywhere (swing stays in the code, never in the data)', () => {
  for (const def of [...Object.values(MAP_DEFS), WORKBENCH_DEF, ANNEX_DEF]) for (const d of compileDoors(enterMap(def.id)).doors) assert.equal(d.style, 'slide', `${def.id}/${d.id}`);
});
test('rollout: every entry in every rolled map takes you to the same room the old door did, with both doors shut at the swap', () => {
  let walked = 0;
  for (const def of ROLLED) {
    const map = enterMap(def.id);
    const { entries } = compileDoors(map);
    for (const e of entries) {
      const link = def.doors.find(d => d.id === e.room);
      assert.equal(e.to, link.to); assert.equal(e.arrive, link.arrive);
      const R = runner(map, 'default'), room = e.roomDoor, out = OUTV[e.side], c = center(room);
      // stand a step inside the room (a step the old door's apron guarantees is clear) and walk in through the vestibule
      const lane = (door, o, tile, k) => Array.from({ length: Math.max(door.w, door.h) / tile }, (_, a) => ({ x: o[0] ? door.x + door.w / 2 : door.x + (a + 0.5) * tile, y: o[1] ? door.y + door.h / 2 : door.y + (a + 0.5) * tile })).map(p => ({ x: p.x - o[0] * k * tile, y: p.y - o[1] * k * tile, lx: p.x, ly: p.y }));
      const far = center(e.farDoor);
      const start = lane(room, out, map.tile, 1.5).find(p => walkable(map, p.x, p.y, 12));
      assert.ok(start, `${def.id}/${e.id}: the approach is open floor`);
      R.w.x = start.x; R.w.y = start.y;
      R.log.stop = true;
      for (let i = 0; i < 12 * 60 && !R.log.swaps.length; i++) {
        const tx = out[0] ? far.x - out[0] * 0.8 * map.tile : start.lx, ty = out[1] ? far.y - out[1] * 0.8 * map.tile : start.ly;
        const dx = tx - R.w.x, dy = ty - R.w.y, d = Math.hypot(dx, dy);
        R.tick(d > 5 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 });
      }
      assert.equal(R.log.swaps.length, 1, `${def.id}/${e.id}: one map change`);
      const sw = R.log.swaps[0];
      assert.equal(sw.to, link.to); assert.equal(sw.arrive, link.arrive);
      assert.ok(sw.room <= TUNING.eps && sw.far <= TUNING.eps, `${def.id}/${e.id}: both doors shut at the swap`);
      // arrive on the other side: shut, then the room door opens and you can walk out into that room
      const dest = enterMap(link.to), B = runner(dest, link.arrive, { arrive: link.arrive });
      const eb = B.sys.entries.find(x => x.spawn === link.arrive), back = eb.roomDoor, ob = OUTV[eb.side], cb = center(back);
      assert.equal(B.sys.phase(eb.id), 'arrived');
      B.idle(TUNING.settleSecs + 0.9);
      assert.equal(B.sys.amount(back.id), 1, `${link.to}: the next door is open`);
      const outPt = lane(back, ob, dest.tile, 1.5).find(p => walkable(dest, p.x, p.y, 12));
      assert.ok(outPt && B.toward(outPt.x, outPt.y, 12), `${link.to}: you can walk out into the room`);
      walked++;
    }
  }
  assert.equal(walked, 24);
});
test('rollout: arriving at Berth 7 with the pad door sealed still lets you out; once out, the sealed door stays shut', () => {
  const pad = enterMap('duchess-pad');
  const R = runner(pad, 'from-hangar', { arrive: 'from-hangar', locked: d => d.id === 'hangar' });
  R.idle(TUNING.settleSecs + 0.9);
  assert.equal(R.sys.amount('hangar'), 1, 'the sealed door opens for the arrival');
  const e = R.sys.entries.find(x => x.id === 'hangar'), o = OUTV[e.side], c = center(e.roomDoor);
  const lane = [0, 1].map(a => ({ x: o[0] ? c.x : e.roomDoor.x + (a + 0.5) * pad.tile, y: o[1] ? c.y : e.roomDoor.y + (a + 0.5) * pad.tile })).map(p => ({ x: p.x - o[0] * 1.5 * pad.tile, y: p.y - o[1] * 1.5 * pad.tile })).find(p => walkable(pad, p.x, p.y, 12));
  assert.ok(R.toward(lane.x, lane.y, 12), 'walked out into the pad');
  R.toward(lane.x - o[0] * 2 * pad.tile, lane.y - o[1] * 2 * pad.tile); R.idle(1.2);
  assert.equal(R.sys.amount('hangar'), 0, 'out in the room, the seal holds again');
  R.toward(c.x - o[0] * 1.0 * pad.tile, c.y - o[1] * 1.0 * pad.tile); R.idle(1);
  assert.equal(R.sys.amount('hangar'), 0, 'and it stays shut with you at it');
});
test('rollout: a sealed door stays shut (the airlock sealed by a state) and a state does not break the entry', () => {
  const sealed = { ...enterMap('duchess-corridor') };
  const R = runner(sealed, 'default', { locked: d => d.id === 'airlock' });
  const e = R.sys.entries.find(x => x.id === 'airlock'), c = center(e.roomDoor), o = OUTV[e.side];
  R.w.x = c.x - o[0] * T; R.w.y = c.y - o[1] * T; R.idle(1.2);
  assert.equal(R.sys.amount('airlock'), 0, 'sealed: stays shut with you at it');
  assert.ok(R.sys.gated(R.w, d => d.id === 'airlock').some(g => g.id === 'airlock'), 'E reports why');
});

// ---- what must not change -------------------------------------------------------------------------------------------
test('guard: every existing room link still connects the same rooms; the new game stays off', () => {
  assert.deepEqual(checkMaps(MAP_DEFS).problems, []);
  const links = Object.values(MAP_DEFS).flatMap(def => (def.doors || []).map(d => `${def.id}:${d.id}->${d.to}@${d.arrive || 'default'}`)).sort();
  assert.deepEqual(links, JSON.parse(readFileSync(new URL('./fixtures/stardust-door-links.json', import.meta.url), 'utf8')), 'the room links are the ones the slice walk was proven on');
  // every entry is one of those links (the door list still names where it goes), and every link door that became an entry has its other side as an entry too
  for (const def of ROLLED) for (const e of def.entries) assert.ok(def.doors.some(d => d.id === e.door), `${def.id}: ${e.door} is a link door`);
  const sys = createDoorSystem(); const ship = enterMap('ship'); sys.load(ship);
  assert.equal(sys.walkMap(ship), ship, 'a map without wall doors is handed back untouched');
  assert.equal(runtimeConfig.newGame, false);
});
