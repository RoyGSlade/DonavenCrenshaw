// The Tin Duchess (launch map lane): the opening slice's ship, one map per room. Every room in every
// state links up and passes procgen's hard rules, every scene beat has its spot, and the things that
// switch in play (doors, the goo, the reactor) are data the world resolves from the save's flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_DEFS, PUZZLES } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap, checkMaps, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { hasStates, resolveStates, applyStates, checkStates, stateVariants, stateSignature } from '../projects/Space-Shooter/voyage/onfoot/rules/states.js';
import { validateMap } from '../projects/Space-Shooter/voyage/procgen/index.js';
import { STATIONS } from '../projects/Space-Shooter/voyage/onfoot/events.js';
import { LOOK_ART } from '../projects/Space-Shooter/voyage/onfoot/look/lookArt.js';
import { lookFor } from '../projects/Space-Shooter/voyage/onfoot/look/look.js';

const SHIP = JSON.parse(readFileSync(new URL('../projects/Space-Shooter/voyage/maps/tin-duchess.json', import.meta.url), 'utf8'));
const T = 48;
const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ---- the state rules, on a small made-up room ---------------------------------------------
const ROOM = {
  id: 'state-room', tile: 48, grid: ['#####', '#...#', '#...#', '##.##'],
  tags: {
    goo: { states: ['dirty', 'clean'], state: 'dirty', by: [{ flag: 'goo-cleared', state: 'clean' }] },
    reactor: { states: ['running', 'broken', 'fixed'], state: 'running', by: [{ flag: 'busted', state: 'broken' }, { flags: ['busted', 'fixed-it'], state: 'fixed' }] },
    hatch: { states: ['open', 'sealed'], state: 'open', by: [{ flag: 'seal', notFlag: 'unseal', state: 'sealed' }] },
  },
  props: [
    { art: 'goo-splat-a', at: [1, 1], size: [1, 1], block: false, layer: 'floor', tag: 'goo', states: { clean: { hidden: true } } },
    { art: 'reactor-core-fixed', at: [2, 1], size: [1, 1], tag: 'reactor', states: { broken: { art: 'reactor-core-broken' } } },
    { art: 'breach-scorch-a', at: [3, 2], size: [1, 1], block: false, layer: 'floor', when: { reactor: ['broken'] } },
  ],
  npcs: [{ id: 'pip', at: [1, 2], tag: 'reactor', states: { broken: { hidden: true } } }],
  doors: [{ id: 'out', at: [2, 3], size: [1, 1], to: 'state-room', tag: 'hatch', states: { sealed: { sealed: 'Sealed for the fight.' } } }],
  spawns: { default: [2, 2, 'up'] },
  look: { set: 'freighter', lights: [{ kind: 'lamp', at: [2, 1], color: 'warm', when: { reactor: ['running', 'fixed'] } }, { kind: 'lamp', at: [2, 1], color: '#ff4d4d', when: { reactor: 'broken' } }] },
};

test('states: a tag starts at its state; the last matching flag rule wins; a script override beats the flags', () => {
  assert.deepEqual(resolveStates(ROOM), { goo: 'dirty', reactor: 'running', hatch: 'open' });
  assert.equal(resolveStates(ROOM, { busted: 1 }).reactor, 'broken');
  assert.equal(resolveStates(ROOM, { busted: 1, 'fixed-it': 1 }).reactor, 'fixed');
  assert.equal(resolveStates(ROOM, { seal: 1 }).hatch, 'sealed');
  assert.equal(resolveStates(ROOM, { seal: 1, unseal: 1 }).hatch, 'open', 'notFlag stops a rule');
  assert.equal(resolveStates(ROOM, {}, { reactor: 'fixed' }).reactor, 'fixed');
  assert.equal(resolveStates(ROOM, {}, { reactor: 'melted' }).reactor, 'running', 'an override to a state the tag lacks is ignored');
  assert.notEqual(stateSignature(resolveStates(ROOM)), stateSignature(resolveStates(ROOM, { busted: 1 })));
  assert.deepEqual(checkStates(ROOM), []);
});

test('states: things hide, swap art, appear, seal doors and move lights, without touching the map as made', () => {
  const clean = applyStates(ROOM, resolveStates(ROOM, { 'goo-cleared': 1 }));
  assert.equal(clean.props.some(p => p.art === 'goo-splat-a'), false, 'the goo is cleaned away');
  assert.equal(ROOM.props.length, 3, 'the original keeps every prop');
  const broken = applyStates(ROOM, resolveStates(ROOM, { busted: 1 }));
  assert.equal(broken.props.find(p => p.tag === 'reactor').art, 'reactor-core-broken');
  assert.ok(broken.props.some(p => p.art === 'breach-scorch-a'), 'scorch shows once broken');
  assert.equal(broken.npcs.length, 0, 'pip leaves');
  assert.deepEqual(broken.look.lights.map(l => l.color), ['#ff4d4d'], 'the red alarm light replaces the warm one');
  const sealed = applyStates(ROOM, resolveStates(ROOM, { seal: 1 }));
  assert.equal(sealed.doors[0].sealed, 'Sealed for the fight.');
  assert.ok(compileMap(sealed), 'a resolved room compiles');
  assert.equal(applyStates({ id: 'x' }, {}).id, 'x', 'maps without tags pass through');
  assert.equal(hasStates(ROOM), true);
});

test('states: checkStates names unknown tags and states', () => {
  const bad = { ...ROOM, props: [...ROOM.props, { art: 'x', at: [1, 1], tag: 'nope' }, { art: 'y', at: [1, 1], when: { goo: 'melted' } }] };
  const problems = checkStates(bad).join('\n');
  assert.match(problems, /unknown tag nope/);
  assert.match(problems, /unknown state goo:melted/);
});

// ---- the ship -------------------------------------------------------------------------------------
test('the Duchess: every room is a look map on the freighter set, and the manifest lists them all', () => {
  assert.equal(SHIP.rooms.length, 9);
  for (const id of SHIP.rooms) {
    const def = MAP_DEFS[id];
    assert.ok(def, `${id} is registered in maps/index.js`);
    assert.equal(def.look?.set, 'freighter', `${id} uses the freighter look`);
    const look = lookFor({ def });
    for (const d of look.decals || []) if (d.art) assert.ok(LOOK_ART.decal[d.art] || LOOK_ART.prop[d.art], `${id}: decal art ${d.art}`);
    for (const m of look.mounts || []) if (m.art) assert.ok(LOOK_ART.prop[m.art] || LOOK_ART.decal[m.art], `${id}: mount art ${m.art}`);
    for (const k of look.clutter || []) if (k.art) assert.ok(LOOK_ART.prop[k.art], `${id}: clutter art ${k.art}`);
  }
});

test('the Duchess: every room in every state compiles, links up and passes procgen (reachable interactables, no blocked door, no pocket)', () => {
  for (const id of SHIP.rooms) {
    const def = MAP_DEFS[id];
    assert.deepEqual(checkStates(def), [], `${id} tags`);
    for (const states of stateVariants(def)) {
      const live = applyStates(def, states);
      const label = `${id} [${stateSignature(states)}]`;
      const v = validateMap(live);
      assert.deepEqual(v.problems, [], `${label} breaks procgen's hard rules`);
      const { problems } = checkMaps({ ...MAP_DEFS, [id]: live }, { puzzles: PUZZLES, stations: STATIONS });
      assert.deepEqual(problems.filter(p => p.startsWith(`${id}:`)), [], label);
      const map = compileMap(live);
      for (const n of live.npcs || []) {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walkable(map, (n.at[0] + 0.5 + dx) * T, (n.at[1] + 0.5 + dy) * T, 13));
        assert.ok(near, `${label}: somebody can stand next to ${n.id}`);
      }
    }
  }
});

test('the Duchess: the rooms join up through the corridor and the pad', () => {
  const doors = Object.fromEntries(SHIP.rooms.map(id => [id, MAP_DEFS[id].doors.map(d => d.to)]));
  for (const id of SHIP.rooms.filter(r => r !== 'duchess-corridor' && r !== 'duchess-pad')) assert.ok(doors['duchess-corridor'].includes(id) || doors[id].includes('duchess-corridor'), `${id} joins the corridor`);
  for (const id of SHIP.rooms.filter(r => r !== 'duchess-corridor' && r !== 'duchess-pad')) assert.ok(doors[id].includes('duchess-corridor'), `${id} leads back to the corridor`);
  assert.ok(doors['duchess-cargo'].includes('duchess-pad') && doors['duchess-pad'].includes('duchess-cargo'), 'the cargo ramp and the pad');
  for (const id of SHIP.rooms) for (const d of MAP_DEFS[id].doors) if (SHIP.rooms.includes(d.to)) {
    const back = MAP_DEFS[d.to].doors.find(b => b.to === id);
    assert.ok(back, `${d.to} has a door back to ${id}`);
  }
});

const findProp = (def, name) => def.props.find(p => p.tag === name || p.name === name || p.interact?.id === name);

test('the Duchess: every scene beat has its spot, and the states it needs exist', () => {
  assert.ok(SHIP.beats.length >= 20);
  for (const scene of [1, 2, 3, 4, 5, 6]) assert.ok(SHIP.beats.some(b => b.scene === scene), `scene ${scene} has beats`);
  for (const b of SHIP.beats) {
    const def = MAP_DEFS[b.map];
    assert.ok(def, `${b.id}: map ${b.map}`);
    if (b.npc) assert.ok(def.npcs.some(n => n.id === b.npc), `${b.id}: ${b.npc} stands in ${b.map}`);
    if (b.prop) assert.ok(findProp(def, b.prop), `${b.id}: prop ${b.prop} in ${b.map}`);
    if (b.zone) assert.ok((def.zones || []).some(z => z.id === b.zone), `${b.id}: zone ${b.zone} in ${b.map}`);
    if (b.door) assert.ok(def.doors.some(d => d.id === b.door), `${b.id}: door ${b.door} in ${b.map}`);
    for (const [tag, states] of Object.entries(b.needs || {})) {
      const spec = def.tags?.[tag];
      assert.ok(spec, `${b.id}: tag ${tag} in ${b.map}`);
      for (const s of states) assert.ok(spec.states.includes(s), `${b.id}: ${tag} can be ${s}`);
    }
  }
});

test('the Duchess: every flag a room listens to is in the manifest, and every manifest flag switches something', () => {
  const heard = new Set();
  for (const id of SHIP.rooms) for (const spec of Object.values(MAP_DEFS[id].tags || {})) for (const r of list(spec.by)) for (const f of [...list(r.flag), ...list(r.flags), ...list(r.notFlag), ...list(r.notFlags)]) heard.add(f);
  for (const f of heard) assert.ok(SHIP.flags[f], `flag ${f} is described in tin-duchess.json`);
  for (const f of Object.keys(SHIP.flags)) assert.ok(heard.has(f), `flag ${f} switches something in a room`);
});

test('the Duchess: the fight rooms have cover, and the usable things are lit', () => {
  const cover = id => MAP_DEFS[id].props.filter(p => p.block === 'low' || (p.block === true && p.cover)).length;
  assert.ok(cover('duchess-corridor') >= 6, `corridor cover ${cover('duchess-corridor')}`);
  assert.ok(cover('duchess-cargo') >= 5, `cargo cover ${cover('duchess-cargo')}`);
  // Every usable prop stands in some light (a pool within its radius), so it reads as the brightest thing.
  for (const id of SHIP.rooms) {
    const def = MAP_DEFS[id];
    for (const states of stateVariants(def)) {
      const live = applyStates(def, states);
      for (const p of live.props.filter(q => q.interact)) {
        const [w, h] = p.size || [1, 1], cx = p.at[0] + w / 2, cy = p.at[1] + h / 2;
        const lit = (live.look.lights || []).some(l => { const [px, py] = l.pool || [l.at[0] + (l.size?.[0] || 0) / 2, l.at[1] + (l.size?.[1] || 0) / 2]; return Math.hypot(px - cx, py - cy) <= (l.r || 3) * 0.85; });
        assert.ok(lit, `${id} [${stateSignature(states)}]: ${p.interact.label} stands in a light`);
      }
    }
  }
});
