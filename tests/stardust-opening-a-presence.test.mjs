// Opening track A, outcome 1: the crew live somewhere and walk through doors (presence ledger, routes, schedule). Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { SLICE_ORDER } from '../projects/Space-Shooter/voyage/slice/rules.js';
import {
  ROOMS, NPC_SPEED, roomMap, doorsOf, roomRoute, pathIn, planTrip, positionAt, spotIn, exitPoint, createPresence,
} from '../projects/Space-Shooter/voyage/slice/presence.js';
import { SCHEDULE, INTERCOM, NPC_IDS, FLAG_RULES, AWAY, DOWNED } from '../projects/Space-Shooter/voyage/slice/presenceData.js';
import { castAt, needsIn, startPoint } from '../projects/Space-Shooter/voyage/slice/presenceCast.js';


// ---- 1. NPCs live somewhere and walk through doors --------------------------------------------------------------------------

test('presence: every pair of rooms has a route made only of real doors', () => {
  for (const a of ROOMS) for (const b of ROOMS) {
    const hops = roomRoute(a, b);
    assert.ok(hops, `${a} -> ${b} has a route`);
    assert.equal(hops[0].room, a);
    assert.equal(hops.at(-1).room, b);
    for (let i = 0; i < hops.length - 1; i++) {
      const door = (MAP_DEFS[hops[i].room].doors || []).find((d) => d.id === hops[i].door);
      assert.ok(door, `${hops[i].room} has door ${hops[i].door}`);
      assert.equal(door.to, hops[i + 1].room, 'the door leads to the next room on the route');
    }
  }
});

test('presence: a path inside a room never crosses a wall, and exists from every spot to every door', () => {
  for (const room of ROOMS) {
    const m = roomMap(room);
    for (const npc of NPC_IDS) {
      const spot = spotIn(room, npc);
      if (!spot) continue;
      assert.ok(walkable(m, spot.x, spot.y, 14), `${npc} spot in ${room} is open floor`);
      for (const d of doorsOf(room)) {
        const out = exitPoint(room, d.id);
        const pts = pathIn(room, spot, out);
        assert.ok(pts, `${npc} in ${room} can reach door ${d.id}`);
        for (let i = 1; i < pts.length; i++) {
          const n = Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / 8);
          for (let k = 0; k <= n; k++) {
            const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / n, y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / n;
            assert.ok(walkable(m, x, y, 13), `${room}: path ${npc}->${d.id} is open floor at ${Math.round(x)},${Math.round(y)}`);
          }
        }
      }
    }
  }
});

test('presence: a trip crosses the rooms of its route in order, at walking speed, and is continuous', () => {
  const from = { room: 'duchess-mess', ...spotIn('duchess-mess', 'tull') };
  const dest = spotIn('duchess-bridge', 'tull');
  const trip = planTrip(from, { room: 'duchess-bridge', spot: dest }, { t0: 10 });
  assert.deepEqual(trip.segments.map((s) => s.room), ['duchess-mess', 'duchess-corridor', 'duchess-bridge']);
  assert.ok(trip.t1 - trip.t0 > 8 && trip.t1 - trip.t0 < 30, `a believable walk (${(trip.t1 - trip.t0).toFixed(1)} s)`);
  let prev = positionAt(trip, 10);
  assert.equal(prev.room, 'duchess-mess');
  for (let t = 10.05; t <= trip.t1 + 0.5; t += 0.05) {
    const p = positionAt(trip, t);
    if (p.room === prev.room) assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) <= NPC_SPEED * 0.05 * 1.01 + 0.5, `no jump at t=${t.toFixed(2)}`);
    prev = p;
  }
  assert.equal(prev.room, 'duchess-bridge');
  assert.ok(Math.hypot(prev.x - dest.x, prev.y - dest.y) < 1, 'ends on the spot');
});

test('presence: nobody is in a room before they could have walked there', () => {
  let clock = 0;
  const p = createPresence({ now: () => clock });
  p.settle('tull', 'duchess-mess');
  const eta = p.send('tull', 'duchess-bridge', 0);
  assert.ok(eta > 5, 'the walk takes time');
  for (let t = 0; t < eta - 0.01; t += 0.1) {
    assert.equal(p.isIn('tull', 'duchess-bridge', t), false, `not settled on the bridge at ${t.toFixed(1)}`);
    const onBridge = p.entries('duchess-bridge', t).find((e) => e.id === 'tull');
    if (onBridge) assert.equal(onBridge.puppet, true, 'if he is on the bridge before he arrives he is walking in (puppet), through the door');
  }
  assert.equal(p.entries('duchess-bridge', 5).length, 0, 'the bridge is empty while he is still crossing the mess and corridor');
  assert.equal(p.isIn('tull', 'duchess-bridge', eta + 0.1), true);
  // He is in the mess at the start and the corridor on the way, never anywhere else.
  const seen = new Set();
  for (let t = 0; t <= eta + 1; t += 0.1) seen.add(p.room('tull', t));
  assert.deepEqual([...seen], ['duchess-mess', 'duchess-corridor', 'duchess-bridge']);
});

test('presence: a person already in the target room stays put; away leaves by the cargo ramp and is gone', () => {
  const p = createPresence();
  p.settle('nessa', 'duchess-bridge');
  assert.equal(p.send('nessa', 'duchess-bridge', 0), 0);
  const eta = p.send('nessa', AWAY, 0);
  assert.ok(eta > 15);
  const rooms = new Set();
  for (let t = 0; t <= eta + 1; t += 0.2) rooms.add(p.room('nessa', t));
  assert.deepEqual([...rooms].sort(), ['duchess-bridge', 'duchess-cargo', 'duchess-corridor', null].sort());
  assert.equal(p.room('nessa', eta + 1), null);
  p.down('reck');
  assert.equal(p.send('reck', 'duchess-bridge', 0), null, 'a body does not walk');
});

test('presence: if the player is in the target room, the person comes in through the door (the entry spawn), not from nowhere', () => {
  const p = createPresence();
  p.settle('tull', 'duchess-mess');
  const eta = p.send('tull', 'duchess-bridge', 0);
  const entering = p.entries('duchess-bridge', eta - 3).find((e) => e.id === 'tull');
  assert.ok(entering, 'a few seconds before he arrives he is on the bridge');
  assert.equal(entering.puppet, true);
  const door = MAP_DEFS['duchess-bridge'].spawns['from-corridor'];
  const first = p.entries('duchess-bridge', eta - (planTrip({ room: 'duchess-bridge', x: (door[0] + 0.5) * 48, y: (door[1] + 0.5) * 48 }, { room: 'duchess-bridge', spot: spotIn('duchess-bridge', 'tull') }).t1) + 0.01).find((e) => e.id === 'tull');
  assert.ok(first && Math.hypot(first.x - (door[0] + 0.5) * 48, first.y - (door[1] + 0.5) * 48) < 6, 'he appears at the door spawn');
});

// ---- the schedule -------------------------------------------------------------------------------------------------------------

test('schedule: every scene has a full default cast of known rooms', () => {
  assert.deepEqual(Object.keys(SCHEDULE).sort(), [...SLICE_ORDER].sort());
  for (const [scene, plan] of Object.entries(SCHEDULE)) {
    for (const id of NPC_IDS) assert.ok(plan.default[id], `${scene}: a default place for ${id}`);
    for (const place of [plan.default, ...Object.values(plan.steps || {}), ...Object.values(plan.nodes || {})]) {
      for (const [id, room] of Object.entries(place)) {
        assert.ok(NPC_IDS.includes(id), `${scene}: ${id} is a known person`);
        assert.ok(ROOMS.includes(room) || room === AWAY || room === DOWNED, `${scene}: ${id} -> ${room}`);
        if (ROOMS.includes(room)) assert.ok(spotIn(room, id), `${room} has a spot for ${id} (${scene})`);
      }
    }
    for (const step of Object.keys(plan.steps || {})) assert.ok(QUESTS[scene].steps.some((s) => s.id === step), `${scene}: step ${step} exists`);
    for (const node of Object.keys(plan.nodes || {})) assert.ok(QUESTS[scene].nodes[node], `${scene}: node ${node} exists`);
  }
});

test('schedule: the speaker of every dialogue node is in its room, unless the node is a voice on the intercom', () => {
  const missing = [];
  for (const scene of SLICE_ORDER) {
    const quest = QUESTS[scene];
    for (const [id, n] of Object.entries(quest.nodes)) {
      if (n.type !== 'dialogue' || !NPC_IDS.includes(n.portrait)) continue;
      const cast = castAt({ scene, node: id, flags: {} });
      const there = cast[n.portrait] === n.room;
      const voice = INTERCOM.includes(`${scene}:${id}`);
      if (!there && !voice) missing.push(`${scene}:${id} (${n.portrait} is in ${cast[n.portrait]}, the beat is in ${n.room})`);
      if (there && voice) missing.push(`${scene}:${id} is listed as intercom but ${n.portrait} is in the room`);
    }
  }
  assert.deepEqual(missing, []);
});

test('schedule: every intercom node really is a voice (the scene text says intercom or speaker)', () => {
  for (const key of INTERCOM) {
    const [scene, node] = key.split(':');
    const n = QUESTS[scene].nodes[node];
    const said = `${n.beat || ''} ${n.direction || ''}`.toLowerCase();
    // end-sealed: the approved text does not say intercom; Nessa speaks after you seal the door from the airlock (judgment call, in READY).
    if (key !== 'hold-the-corridor:end-sealed') assert.match(said, /intercom|speaker|comm/, key);
  }
});

test('schedule: the people a beat needs are in its room and nobody else is asked', () => {
  assert.deepEqual(needsIn({ scene: 'visitors', node: 'bridge' }).sort(), ['nessa', 'reck', 'tull']);
  assert.deepEqual(needsIn({ scene: 'third-shift', node: 'brief' }), ['tull']);
  assert.deepEqual(needsIn({ scene: 'third-shift', node: 'goo' }).sort(), ['nessa', 'pip']);
  assert.deepEqual(needsIn({ scene: 'visitors', node: 'breach' }), [], 'an intercom voice needs nobody there');
  assert.deepEqual(needsIn({ scene: 'gunners-week', node: 'engine-brief-2' }).sort(), ['pip', 'tull'], 'Tull walks to the engine room for this beat');
  assert.deepEqual(needsIn({ scene: 'visitors', node: 'end-hidden' }), [], 'a result card needs nobody');
  assert.deepEqual(needsIn({ scene: 'visitors', node: 'reck-falls', flags: { 'reck-down': 1 } }).sort(), ['nessa', 'tull'], 'once Reck is down, the beat does not wait for him');
});

test('schedule: flags move people for good (Reck down, Nessa and Pip quit)', () => {
  assert.equal(castAt({ scene: 'visitors', node: 'bridge' }).reck, 'duchess-bridge');
  assert.equal(castAt({ scene: 'visitors', node: 'bridge', flags: { 'reck-down': 1 } }).reck, DOWNED);
  assert.equal(castAt({ scene: 'gunners-week', node: 'nessa-quits', flags: {} }).nessa, 'duchess-bridge');
  assert.equal(castAt({ scene: 'gunners-week', node: 'nessa-quits-2', flags: { 'nessa-quit': 1 } }).nessa, AWAY);
  assert.equal(castAt({ scene: 'day-five', node: 'handover', flags: { 'pip-quit': 1 } }).pip, AWAY);
  assert.equal(FLAG_RULES.length, 3);
});

test('schedule: where the crew are across the six scenes (the table the design note prints)', () => {
  const rows = [];
  for (const scene of SLICE_ORDER) {
    const quest = QUESTS[scene];
    for (const step of quest.steps) {
      const c = castAt({ scene, node: step.nodes[0], flags: {} });
      rows.push(`${scene}/${step.id}: ${NPC_IDS.map((id) => `${id}=${String(c[id]).replace('duchess-', '')}`).join(' ')}`);
    }
  }
  assert.equal(rows.length, SLICE_ORDER.reduce((n, s) => n + QUESTS[s].steps.length, 0));
  assert.match(rows.join('\n'), /gunners-week\/engine: tull=engine nessa=away pip=engine reck=down/);
});

test('schedule: a page load stands in the scene in progress, else the next scene', () => {
  assert.deepEqual(startPoint({ flags: {}, quests: { active: {}, done: {} } }), { scene: 'third-shift', node: 'brief' });
  assert.deepEqual(startPoint({ flags: {}, quests: { active: { visitors: { node: 'reck-chat' } }, done: { 'third-shift': {} } } }), { scene: 'visitors', node: 'reck-chat' });
});


// ---- doors and people: nobody holds the player up --------------------------------------------------------------------------
import { createDoorSystem } from '../projects/Space-Shooter/voyage/onfoot/doors/system.js';
import { gapBodies, DOOR_PAUSE } from '../projects/Space-Shooter/voyage/slice/presence.js';
import { compileMap as compileRoom } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';

// Seconds until the vestibule swaps the player into the corridor, with `others` standing in the door gap (the way the world calls the door system).
function swapTime(others, { crew = true } = {}) {
  const m = compileRoom(MAP_DEFS['duchess-holodeck']);
  const sys = createDoorSystem();
  sys.load(m, {});
  const e = sys.entries[0];
  const walker = { x: e.zone.x + e.zone.w / 2, y: e.zone.y + e.zone.h / 2, vx: 0, vy: 0 };
  const gap = e.roomDoor;
  const npcs = others.map((id) => ({ id, x: gap.x + gap.w / 2, y: gap.y + gap.h / 2 }));
  const managed = crew ? new Set(others) : null;
  for (let t = 0; t < 12; t += 1 / 60) {
    const r = sys.step(1 / 60, { walker, bodies: [walker, ...npcs], gapBodies: gapBodies(walker, npcs, managed), locked: () => false });
    if (r.events.some((x) => x.type === 'swap')) return t;
  }
  return Infinity;
}

test('doors: Nessa and Pip standing in the holodeck doorway never keep the player waiting more than a second', () => {
  const alone = swapTime([]);
  assert.ok(alone < 4, `the plain cycle works (${alone.toFixed(2)} s)`);
  const crowded = swapTime(['nessa', 'pip']);
  assert.ok(crowded - alone <= 1, `with the crew in the gap the player still passes (${crowded.toFixed(2)} s against ${alone.toFixed(2)} s alone)`);
  // The old behaviour, for the record: a body in the gap that the door waits for holds the cycle for ever.
  assert.equal(swapTime(['nessa', 'pip'], { crew: false }), Infinity, 'a non-crew body in the gap does hold it (a door never closes on someone)');
});

test('doors: nobody stops in a doorway; a trip has no pause at a door, and nobody idles in a door or its passage', () => {
  assert.equal(DOOR_PAUSE, 0);
  const T48 = 48;
  const bad = [];
  for (const room of ROOMS) {
    const def = MAP_DEFS[room];
    const zones = (def.doors || []).map((d) => {
      const entry = (def.entries || []).find((e) => e.door === d.id);
      const s = entry && def.spawns?.[entry.spawn];
      return { id: d.id, x: (d.at[0] + 0.5) * T48, y: (d.at[1] + 0.5) * T48, sx: s ? (s[0] + 0.5) * T48 : null, sy: s ? (s[1] + 0.5) * T48 : null };
    });
    for (const npc of NPC_IDS) {
      const spot = spotIn(room, npc);
      if (!spot) continue;
      for (const z of zones) {
        const reach = (spot.wander ?? 0) * T48 + 2.2 * T48; // where they idle, plus the door's trigger band
        if (Math.hypot(spot.x - z.x, spot.y - z.y) < reach) bad.push(`${npc} idles near ${room}/${z.id}`);
        if (z.sx != null && Math.hypot(spot.x - z.sx, spot.y - z.sy) < (spot.wander ?? 0) * T48 + T48) bad.push(`${npc} idles in the passage of ${room}/${z.id}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('doors: arriving in a passage and turning straight round is never a dead end (pressing on the door you came by takes you back)', () => {
  const m = compileRoom(MAP_DEFS['duchess-holodeck']);
  const sys = createDoorSystem();
  sys.load(m, { arrive: 'from-corridor' }); // the player has just come in by this entry
  const e = sys.entries[0];
  const spawn = MAP_DEFS['duchess-holodeck'].spawns['from-corridor'];
  const walker = { x: (spawn[0] + 0.5) * 48, y: (spawn[1] + 0.5) * 48, vx: 0, vy: 0 };
  const run = (secs) => { for (let t = 0; t < secs; t += 1 / 60) { if (sys.step(1 / 60, { walker, bodies: [walker], locked: () => false }).events.some((x) => x.type === 'swap')) return t; } return Infinity; };
  assert.equal(run(2), Infinity, 'standing where you arrived does nothing');
  assert.equal(sys.phase(e.id), 'exiting');
  walker.y = e.farDoor.y + e.farDoor.h + 6; // up against the far door
  assert.ok(run(5) < 3.5, 'pushing on the far door cycles you back');
});
