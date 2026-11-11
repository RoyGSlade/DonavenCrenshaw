// Stardust procgen (projects/Space-Shooter/voyage/procgen/): the room dresser
// and the outdoor dresser. Property tests over many seeds for the hard
// guarantees (paths, doors, overlaps, bounds, interact reach), determinism,
// must-haves, locks and rerolls, and the shared validator. Pure node: no
// browser, no network. PROCGEN_SEEDS=2000 runs a heavier sweep.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dressRoom, rerollRoom, lockAndReroll, suggestShell, dressArea, rerollArea, validateMap, assessMap, designChecks,
  ROOM_TYPES, THEMES, BIOME_TYPES, nextSeed,
} from '../projects/Space-Shooter/voyage/procgen/index.js';

const SEEDS = Number(process.env.PROCGEN_SEEDS || 500);
const AREA_SEEDS = Math.max(50, Math.round(SEEDS / 5));
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

// ---- an independent checker (does not use the procgen validator) -------------
const DIRS = { down: [0, 1], left: [-1, 0], up: [0, -1], right: [1, 0] };
function independentCheck(map) {
  const errors = [];
  const H = map.grid.length, W = Math.max(...map.grid.map(r => r.length));
  const solidChars = new Set(['#', '|', ' ', ...Object.entries(map.legend || {}).filter(([, v]) => v.solid).map(([k]) => k)]);
  const ch = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? (map.grid[y][x] ?? ' ') : ' ');
  const doorCell = new Set();
  for (const d of map.doors) for (let y = d.at[1]; y < d.at[1] + d.size[1]; y++) for (let x = d.at[0]; x < d.at[0] + d.size[0]; x++) doorCell.add(`${x},${y}`);
  const cells = (p) => {
    const out = [];
    const x0 = Math.floor(p.at[0] + 1e-6), y0 = Math.floor(p.at[1] + 1e-6);
    const x1 = Math.ceil(p.at[0] + p.size[0] - 1e-6), y1 = Math.ceil(p.at[1] + p.size[1] - 1e-6);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push([x, y]);
    return out;
  };
  const obj = new Map(), flr = new Map(), blocked = new Set();
  for (const p of map.props) {
    for (const [x, y] of cells(p)) {
      const k = `${x},${y}`;
      if (solidChars.has(ch(x, y))) errors.push(`bounds: ${p.art} on solid ${k}`);
      if (doorCell.has(k)) errors.push(`door: ${p.art} in doorway ${k}`);
      const layer = p.layer === 'floor' ? flr : obj;
      if (layer.has(k)) errors.push(`overlap: ${p.art} and ${layer.get(k)} at ${k}`);
      layer.set(k, p.art);
      if (p.layer !== 'floor' && p.block) blocked.add(k);
    }
  }
  for (const p of map.props) if (p.layer === 'floor' && !p.under) for (const [x, y] of cells(p)) if (obj.has(`${x},${y}`)) errors.push(`hidden: ${p.art} under ${obj.get(`${x},${y}`)}`);
  const walk = (x, y) => !solidChars.has(ch(x, y)) && !blocked.has(`${x},${y}`);
  const seen = new Set();
  const queue = [...doorCell].map(k => k.split(',').map(Number)).filter(([x, y]) => walk(x, y));
  for (const [x, y] of queue) seen.add(`${x},${y}`);
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (!seen.has(k) && walk(nx, ny)) { seen.add(k); queue.push([nx, ny]); }
    }
  }
  for (const d of map.doors) {
    let any = false;
    for (let y = d.at[1]; y < d.at[1] + d.size[1]; y++) for (let x = d.at[0]; x < d.at[0] + d.size[0]; x++) if (seen.has(`${x},${y}`)) any = true;
    if (!any) errors.push(`doors: ${d.id} unreachable`);
    // the tile just inside each door is open
    const inside = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      for (let y = d.at[1]; y < d.at[1] + d.size[1]; y++) for (let x = d.at[0]; x < d.at[0] + d.size[0]; x++) if (!solidChars.has(ch(x + dx, y + dy)) && !doorCell.has(`${x + dx},${y + dy}`) && !blocked.has(`${x + dx},${y + dy}`)) return true;
      return false;
    });
    if (!inside) errors.push(`doors: ${d.id} is blocked inside`);
  }
  for (const p of map.props) {
    if (!p.interact) continue;
    const r = { x: p.at[0], y: p.at[1], w: p.size[0], h: p.size[1] };
    const sideOf = (dir) => {
      const [dx, dy] = DIRS[dir];
      const out = [];
      if (dy === 1) for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y + r.h]);
      if (dy === -1) for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y - 1]);
      if (dx === -1) for (let y = r.y; y < r.y + r.h; y++) out.push([r.x - 1, y]);
      if (dx === 1) for (let y = r.y; y < r.y + r.h; y++) out.push([r.x + r.w, y]);
      return out;
    };
    const opp = { down: 'up', up: 'down', left: 'right', right: 'left' };
    const sides = p.use === 'front' ? [p.face] : p.use === 'back' ? [opp[p.face]] : Object.keys(DIRS);
    if (!sides.some(s => sideOf(s).some(([x, y]) => seen.has(`${Math.floor(x)},${Math.floor(y)}`)))) errors.push(`interact: ${p.interact.label} not reachable from its ${p.use} side`);
  }
  for (const n of map.npcs) if (!seen.has(`${Math.floor(n.at[0])},${Math.floor(n.at[1])}`)) errors.push(`npc: ${n.id} unreachable`);
  for (const [name, s] of Object.entries(map.spawns)) if (!seen.has(`${Math.floor(s[0])},${Math.floor(s[1])}`)) errors.push(`spawn: ${name} unreachable`);
  return errors;
}

function shapeCheck(map) {
  assert.match(map.id, ID);
  assert.ok(Array.isArray(map.grid) && map.grid.length > 0);
  assert.ok(map.spawns.default, 'needs a default spawn');
  for (const p of map.props) {
    assert.equal(typeof p.art, 'string');
    assert.equal(p.at.length, 2); assert.equal(p.size.length, 2);
    assert.ok(Number.isFinite(p.rot));
    assert.ok([true, false, 'low'].includes(p.block));
  }
  for (const d of map.doors) assert.ok(d.to || d.external, `door ${d.id} needs a destination or external`);
}

// ---- rooms -------------------------------------------------------------------
test(`every room type holds the hard guarantees over ${SEEDS} seeds (themes and shells vary)`, () => {
  const fails = [];
  for (const type of ROOM_TYPES) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const theme = THEMES[seed % THEMES.length];
      const map = dressRoom({ type, seed, theme, shell: suggestShell(type, seed) });
      const v = validateMap(map);
      const ind = independentCheck(map);
      if (!v.ok || ind.length || !map.procgen.valid) fails.push(`${type} seed ${seed} ${theme}: ${[...v.problems.map(p => p.text), ...ind].slice(0, 3).join('; ')}`);
      if (seed % 50 === 0) shapeCheck(map);
    }
  }
  assert.deepEqual(fails.slice(0, 10), []);
});

test('same seed and input give the same room; another seed gives another room', () => {
  for (const type of ROOM_TYPES) {
    for (const seed of [1, 77, 'edna']) {
      const input = { type, seed, theme: 'lived-in', shell: suggestShell(type, 3) };
      assert.deepEqual(dressRoom(input), dressRoom(structuredClone(input)), `${type} ${seed}`);
    }
    const a = dressRoom({ type, seed: 1, shell: suggestShell(type, 3) });
    const b = dressRoom({ type, seed: 2, shell: suggestShell(type, 3) });
    assert.notDeepEqual(a.props, b.props, `${type}: seeds 1 and 2 should differ`);
  }
});

test('anchors land where a designer puts them', () => {
  for (let seed = 0; seed < 60; seed++) {
    // bar: against a wall with a bartender lane behind, stools in front, facing into the room
    const cantina = dressRoom({ type: 'cantina', seed, shell: { w: 14, h: 10, doors: [{ side: 's' }] } });
    const bar = cantina.props.filter(p => p.rule === 'bar' && p.art === 'bar-counter');
    assert.ok(bar.length >= 2, 'a bar of 2-3 counters');
    assert.ok(cantina.props.some(p => p.art === 'bar-stool'), 'stools at the bar');
    // reactor: dead centre of the engine room (within a tile)
    const engine = dressRoom({ type: 'engine-room', seed, shell: { w: 13, h: 11, doors: [{ side: 's' }] } });
    const core = engine.props.find(p => p.art === 'reactor-core');
    assert.ok(core, 'a reactor');
    assert.ok(Math.abs(core.at[0] + 1.5 - 6.5) <= 1.01 && Math.abs(core.at[1] + 1.5 - 5.5) <= 1.01, `reactor near centre (${core.at})`);
    // helm: pilot seats in front of the nav console, facing it
    const cockpit = dressRoom({ type: 'cockpit', seed, shell: { w: 10, h: 8, doors: [{ side: 's' }] } });
    const helm = cockpit.props.find(p => p.rule === 'helm' && p.art === 'nav-console');
    const seats = cockpit.props.filter(p => p.rule === 'helm' && p.art === 'pilot-seat');
    assert.ok(helm && seats.length >= 1, 'helm with seats');
    const opp = { down: 'up', up: 'down', left: 'right', right: 'left' };
    for (const s of seats) assert.equal(s.face, opp[helm.face], 'seat faces the console');
  }
});

test('most rooms put the main anchor on the wall facing the door', () => {
  let facing = 0, total = 0;
  for (let seed = 0; seed < 100; seed++) {
    for (const [type, rule] of [['cantina', 'bar'], ['fitting-bay', 'counter'], ['relay-office', 'desk'], ['cockpit', 'helm']]) {
      const map = dressRoom({ type, seed, shell: { w: 12, h: 10, doors: [{ side: 's' }] } });
      const a = map.props.find(p => p.rule === rule && !p.sat);
      total++;
      const presents = rule === 'desk' ? { up: 'down', down: 'up', left: 'right', right: 'left' }[a.face] : a.face;
      if (presents === 'down') facing++;
    }
  }
  assert.ok(facing / total >= 0.85, `${facing}/${total} anchors face the door`);
});

test('must-haves: Edna\'s counter with Edna behind it, Chibby\'s workbench', () => {
  for (let seed = 0; seed < 100; seed++) {
    const den = dressRoom({ type: 'den', seed, must: [{ id: 'edna-counter', prop: 'shop-counter', npc: 'edna', interact: { kind: 'station', id: 'backroom', label: "Edna's counter" } }] });
    const counter = den.props.find(p => p.must === 'edna-counter');
    assert.ok(counter, 'counter placed');
    assert.equal(counter.interact.label, "Edna's counter");
    const edna = den.npcs.find(n => n.id === 'edna');
    assert.ok(edna, 'Edna placed');
    const behind = { down: [0, -1], up: [0, 1], left: [1, 0], right: [-1, 0] }[counter.face];
    const ex = edna.at[0], ey = edna.at[1];
    const inBackRow = counter.face === 'down' || counter.face === 'up'
      ? ey === (behind[1] < 0 ? counter.at[1] - 1 : counter.at[1] + counter.size[1]) && ex >= counter.at[0] && ex < counter.at[0] + counter.size[0]
      : ex === (behind[0] < 0 ? counter.at[0] - 1 : counter.at[0] + counter.size[0]) && ey >= counter.at[1] && ey < counter.at[1] + counter.size[1];
    assert.ok(inBackRow, `Edna stands behind her counter (seed ${seed})`);
    assert.deepEqual(independentCheck(den), []);
    const shop = dressRoom({ type: 'workshop', seed, must: [{ id: 'chibby-bench', prop: 'workbench', npc: 'chibby', interact: { kind: 'station', id: 'pad', label: "Chibby's workbench" } }] });
    assert.ok(shop.props.some(p => p.must === 'chibby-bench' && p.interact.label === "Chibby's workbench"));
    assert.ok(shop.npcs.some(n => n.id === 'chibby'));
    assert.deepEqual(independentCheck(shop), []);
  }
  // a must-have for a prop the room type does not list is added as an anchor
  const office = dressRoom({ type: 'relay-office', seed: 4, must: [{ id: 'jukebox', prop: 'jukebox', interact: { kind: 'console', id: 'jb', label: 'Hask\'s jukebox' } }] });
  assert.ok(office.props.some(p => p.must === 'jukebox'));
});

test('spots: quest spots and npcs are reachable and kept clear', () => {
  for (let seed = 0; seed < 100; seed++) {
    const map = dressRoom({ type: 'cantina', seed, spots: [{ id: 'informant', near: 'bar', npc: 'informant' }, { id: 'drop', near: 'center' }] });
    assert.equal(map.zones.length, 2);
    assert.ok(map.npcs.some(n => n.id === 'informant'));
    assert.deepEqual(independentCheck(map), []);
    for (const z of map.zones) assert.ok(!map.props.some(p => p.layer !== 'floor' && z.at[0] >= p.at[0] && z.at[0] < p.at[0] + p.size[0] && z.at[1] >= p.at[1] && z.at[1] < p.at[1] + p.size[1]), 'spot kept clear');
  }
});

test('reroll and lock-and-reroll (the Studio buttons)', () => {
  const map = dressRoom({ type: 'workshop', seed: 5, theme: 'lived-in' });
  const again = rerollRoom(map);
  assert.equal(again.procgen.seed, nextSeed(5));
  assert.notDeepEqual(again.props, map.props);
  assert.deepEqual(rerollRoom(map), again, 'reroll is deterministic too');
  const keepIdx = map.props.map((p, i) => [p, i]).filter(([p]) => p.rule === 'bench' || p.art === 'dog-bed').map(([, i]) => i);
  assert.ok(keepIdx.length >= 2);
  for (let k = 0; k < 30; k++) {
    const locked = lockAndReroll(map, keepIdx, 1000 + k);
    for (const i of keepIdx) {
      const kept = locked.props.find(p => p.locked && p.art === map.props[i].art && p.at[0] === map.props[i].at[0] && p.at[1] === map.props[i].at[1]);
      assert.ok(kept, `locked ${map.props[i].art} stays put (k ${k})`);
      assert.equal(kept.rot, map.props[i].rot);
    }
    assert.equal(locked.props.filter(p => p.rule === 'bench' && !p.sat && p.art === 'workbench').length, 2, 'no second bench run when the bench is locked');
    assert.ok(locked.procgen.valid, JSON.stringify(locked.procgen.problems));
    assert.deepEqual(independentCheck(locked), []);
    // locks survive a plain reroll
    const next = rerollRoom(locked);
    assert.equal(next.props.filter(p => p.locked).length, locked.props.filter(p => p.locked).length);
  }
});

test('an existing onfoot map shell can be re-dressed (grid in, doors kept)', () => {
  const workshop = {
    grid: ['##############', '#............#', '#............#', '#............#', '#............#', '#............#', '#............#', '#............#', '#............#', '######..######'],
    doors: [{ id: 'out', at: [6, 9], size: [2, 1], to: 'hangar', arrive: 'from-workshop', label: 'Back to the hangar' }],
  };
  for (let seed = 0; seed < 50; seed++) {
    const map = dressRoom({ type: 'workshop', seed, shell: workshop, id: 'workshop', name: "Chibby's workshop" });
    assert.equal(map.id, 'workshop');
    assert.deepEqual(map.doors[0].at, [6, 9]);
    assert.equal(map.doors[0].to, 'hangar');
    assert.ok(map.spawns['from-hangar']);
    assert.deepEqual(independentCheck(map), []);
  }
});

test('L-shaped rooms, windows and several doors stay valid', () => {
  for (let seed = 0; seed < 100; seed++) {
    const map = dressRoom({ type: 'crew-deck', seed, shell: { w: 15, h: 11, shape: 'L', cut: { corner: seed % 2 ? 'ne' : 'nw', w: 5, h: 4 }, doors: [{ side: 's' }, { side: 'w' }, { side: 'e', to: 'cockpit', arrive: 'from-crew' }], windows: [{ side: 'n', len: 3 }] } });
    assert.equal(map.doors.length, 3);
    assert.ok(map.grid.some(r => r.includes('|')), 'window drawn');
    assert.deepEqual(independentCheck(map), [], `seed ${seed}`);
    for (const p of map.props) if (p.layer !== 'floor' && ['locker', 'parts-shelf', 'tool-rack', 'vending-machine'].includes(p.art)) {
      // tall props never stand against a window
      const touching = [[p.at[0] - 1, p.at[1]], [p.at[0] + p.size[0], p.at[1]], [p.at[0], p.at[1] - 1], [p.at[0], p.at[1] + p.size[1]]];
      assert.ok(!touching.some(([x, y]) => map.grid[y]?.[x] === '|' && p.size[0] === 1 && p.size[1] === 1), `${p.art} against a window`);
    }
  }
});

test('theme knob: wrecked is messier than tidy, tidy is calmer', () => {
  let tidy = 0, wrecked = 0, tidyRot = 0, wreckRot = 0;
  for (let seed = 0; seed < 60; seed++) {
    for (const type of ['workshop', 'cargo-hold', 'relay-office']) {
      const shell = suggestShell(type, seed);
      const t = dressRoom({ type, seed, theme: 'tidy', shell });
      const w = dressRoom({ type, seed, theme: 'wrecked', shell });
      tidy += t.props.filter(p => p.role === 'clutter').length;
      wrecked += w.props.filter(p => p.role === 'clutter').length;
      tidyRot += t.props.filter(p => Math.abs(p.rot % (Math.PI / 2)) > 0.01).length;
      wreckRot += w.props.filter(p => Math.abs(p.rot % (Math.PI / 2)) > 0.01).length;
    }
  }
  assert.ok(wrecked > tidy * 1.8, `clutter: wrecked ${wrecked} vs tidy ${tidy}`);
  assert.equal(tidyRot, 0, 'tidy rooms are square to the grid');
  assert.ok(wreckRot > 0, 'wrecked rooms knock things askew');
});

test('quality: no long lines of one prop, both halves used, variety', () => {
  let balance = 0, n = 0;
  for (const type of ROOM_TYPES) {
    for (let seed = 0; seed < 60; seed++) {
      const q = assessMap(dressRoom({ type, seed, shell: suggestShell(type, seed) }));
      assert.ok(q.maxIdenticalRun <= 4, `${type} ${seed}: ${q.maxIdenticalRun} identical props in a row`);
      assert.ok(q.distinctArt >= 4, `${type} ${seed}: only ${q.distinctArt} kinds of prop`);
      assert.ok(q.fill > 0.08 && q.fill < 0.6, `${type} ${seed}: fill ${q.fill}`);
      balance += Math.min(q.balanceLR, q.balanceTB); n++;
    }
  }
  assert.ok(balance / n > 0.45, `mean worst-axis balance ${(balance / n).toFixed(2)}`);
});

test('design checks: dressed rooms almost never break what a designer would flag; random scatter does', () => {
  let breaks = 0, rooms = 0, scatterBreaks = 0;
  for (const type of ROOM_TYPES) {
    for (let seed = 0; seed < 100; seed++) {
      for (const theme of ['tidy', 'lived-in']) {
        const map = dressRoom({ type, seed, theme, shell: suggestShell(type, seed) });
        breaks += designChecks(map).total; rooms++;
        if (theme === 'tidy' && seed < 10) {
          // the same props shuffled to random free tiles and turns
          const free = [];
          map.grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.') free.push([x, y]); }));
          const taken = new Set();
          let k = seed * 7919;
          const shuffled = { ...map, props: map.props.filter(p => p.layer !== 'floor' && p.size[0] === 1 && p.size[1] === 1).map((p) => {
            let cell;
            do { k = (k * 1103515245 + 12345) % 2147483648; cell = free[k % free.length]; } while (taken.has(`${cell}`) && taken.size < free.length);
            taken.add(`${cell}`);
            const { face, ...rest } = p; void face;
            return { ...rest, at: cell, rot: (k % 4) * Math.PI / 2 };
          }) };
          scatterBreaks += designChecks(shuffled).total;
        }
      }
    }
  }
  assert.ok(breaks / rooms < 0.01, `${breaks} design breaks over ${rooms} rooms`);
  assert.ok(scatterBreaks > breaks * 10, `random scatter should break far more (${scatterBreaks} vs ${breaks})`);
});

// ---- the validator itself ---------------------------------------------------------
test('the validator catches broken hand edits', () => {
  const base = dressRoom({ type: 'relay-office', seed: 2, shell: { w: 10, h: 8, doors: [{ side: 's' }] } });
  assert.ok(validateMap(base).ok);
  const door = base.doors[0];
  const blockDoor = structuredClone(base);
  blockDoor.props.push({ art: 'crate-small', at: [door.at[0], door.at[1] - 1], size: [1, 1], rot: 0, block: 'low' });
  assert.ok(validateMap(blockDoor).problems.some(p => p.code === 'door-blocked' || p.code === 'overlap'));
  const overlap = structuredClone(base);
  const first = overlap.props.find(p => p.layer !== 'floor');
  overlap.props.push({ ...first, interact: undefined });
  assert.ok(validateMap(overlap).problems.some(p => p.code === 'overlap'));
  const wall = structuredClone(base);
  wall.props.push({ art: 'safe', at: [0, 0], size: [1, 1], rot: 0, block: true });
  assert.ok(validateMap(wall).problems.some(p => p.code === 'bounds'));
  // seal the whole room off behind a line of lockers just inside the door
  const sealed = structuredClone(base);
  sealed.props = sealed.props.filter(p => p.layer === 'floor');
  const W = sealed.grid[0].length;
  for (let x = 1; x < W - 1; x++) sealed.props.push({ art: 'locker', at: [x, door.at[1] - 2], size: [1, 1], rot: 0, block: true });
  sealed.props.push({ art: 'desk', at: [3, 2], size: [2, 1], rot: 0, block: true, face: 'down', use: 'front', interact: { kind: 'npc', id: 'desk', label: 'desk' } });
  const codes = validateMap(sealed).problems.map(p => p.code);
  assert.ok(codes.includes('interact') && codes.includes('pocket'), codes.join(','));
});

// ---- outdoors -------------------------------------------------------------------------
test(`outdoor areas hold the guarantees over ${AREA_SEEDS} seeds per biome; pad and paths stay clear`, () => {
  const fails = [];
  for (const biome of BIOME_TYPES) {
    for (let seed = 0; seed < AREA_SEEDS; seed++) {
      const map = dressArea({ biome, seed });
      const v = validateMap(map);
      const ind = independentCheck(map);
      if (!v.ok || ind.length) fails.push(`${biome} ${seed}: ${[...v.problems.map(p => p.text), ...ind].slice(0, 3).join('; ')}`);
      const pad = map.props.find(p => p.role === 'pad');
      if (!pad) fails.push(`${biome} ${seed}: no landing pad`);
      if (map.props.filter(p => p.role === 'landmark').length < 2) fails.push(`${biome} ${seed}: fewer than 2 landmarks`);
      for (const p of map.props) {
        if (p.layer === 'floor') continue;
        const x0 = Math.floor(p.at[0] + 1e-6), y0 = Math.floor(p.at[1] + 1e-6);
        for (let y = y0; y < Math.ceil(p.at[1] + p.size[1] - 1e-6); y++) for (let x = x0; x < Math.ceil(p.at[0] + p.size[0] - 1e-6); x++) {
          const c = map.grid[y][x];
          if (c === ':' || c === 'p') fails.push(`${biome} ${seed}: ${p.art} on ${c === ':' ? 'the pad ring' : 'a path'}`);
        }
      }
      if (seed % 20 === 0) shapeCheck(map);
    }
  }
  assert.deepEqual(fails.slice(0, 10), []);
});

test('outdoor determinism, reroll and locks', () => {
  for (const biome of BIOME_TYPES) {
    assert.deepEqual(dressArea({ biome, seed: 9 }), dressArea({ biome, seed: 9 }));
    const a = dressArea({ biome, seed: 9 });
    const b = rerollArea(a);
    assert.notDeepEqual(a.props, b.props);
    const keep = a.props.map((p, i) => [p, i]).filter(([p]) => p.role === 'landmark' || p.role === 'pad').map(([, i]) => i);
    const c = rerollArea(a, 4242, keep);
    for (const i of keep) assert.ok(c.props.some(p => p.locked && p.art === a.props[i].art && p.at[0] === a.props[i].at[0] && p.at[1] === a.props[i].at[1]));
    assert.ok(c.procgen.valid, JSON.stringify(c.procgen.problems));
  }
});

// ---- the JSON door the Studio calls ---------------------------------------------------
test('cli.mjs: JSON in, the same map out', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = new URL('../projects/Space-Shooter/voyage/procgen/cli.mjs', import.meta.url).pathname;
  const run = (q) => JSON.parse(spawnSync(process.execPath, [cli], { input: JSON.stringify(q), encoding: 'utf8' }).stdout);
  const input = { type: 'cantina', seed: 12, theme: 'tidy' };
  const out = run({ op: 'dressRoom', input });
  assert.equal(out.ok, true);
  assert.deepEqual(out.result, dressRoom(input));
  const locked = run({ op: 'lockAndReroll', map: out.result, keep: [0], seed: 5 });
  assert.equal(locked.ok, true);
  assert.ok(locked.result.props.some(p => p.locked));
  assert.equal(run({ op: 'validate', map: out.result }).result.ok, true);
  assert.equal(run({ op: 'bogus' }).ok, false);
});

// ---- dress.js: the shape the Studio and onfoot call (STUDIO-SCHEMA.md section 6) ----------
test('dress.js: dressRoom(map, { seed, locked, art }) keeps locks, stations, npcs, walls and doors', async () => {
  const { dressRoom: studioDress } = await import('../projects/Space-Shooter/voyage/procgen/dress.js');
  const workshop = {
    id: 'workshop', name: "Chibby's workshop", kind: 'interior', tile: 48, floor: 'deck',
    grid: ['##############', '#............#', '#............#', '#....====....#', '#....====....#', '#............#', '#............#', '#............#', '#............#', '######..######'],
    props: [
      { art: 'workbench', at: [1, 1], size: [3, 1], block: 'low', station: 'pad', interact: { kind: 'station', id: 'pad', label: "Chibby's bench: ship upgrades" } },
      { art: 'tool-rack', at: [5, 1], size: [3, 0.6], block: true },
      { art: 'engine-stand', at: [5.5, 3.2], size: [3, 1.6], block: true },
      { art: 'dog-bed', at: [11, 5], size: [1.4, 1], block: false, station: 'kennel' },
      { art: 'mystery-console', at: [12, 7], size: [1, 1], block: true, interact: { kind: 'console', id: 'odd', label: 'Odd console' } },
    ],
    npcs: [{ id: 'chibby', at: [2, 2], face: 'down', wander: 0.5 }, { id: 'ralph', at: [11, 5], face: 'left', wander: 1.2 }],
    doors: [{ id: 'out', at: [6, 9], size: [2, 1], to: 'hangar', arrive: 'from-workshop', label: 'Back to the hangar' }],
    spawns: { default: [6.5, 8, 'up'], 'from-hangar': [6.5, 8, 'up'] },
  };
  const frozen = JSON.stringify(workshop);
  for (let seed = 1; seed <= 60; seed++) {
    const r = studioDress(workshop, { seed, locked: [1] });
    assert.equal(JSON.stringify(workshop), frozen, 'the input map is not touched');
    assert.ok(r.props.length > 5 && r.props.length <= 300);
    assert.ok(Array.isArray(r.notes) && r.notes.length);
    assert.deepEqual(r.props.find(p => p.art === 'tool-rack' && p.at[0] === 5), workshop.props[1], 'locked prop comes back unchanged');
    assert.ok(r.props.some(p => p.station === 'pad' && p.interact?.id === 'pad'), 'the bench station survives');
    assert.ok(r.props.some(p => p.station === 'kennel'), 'Ralph\'s kennel survives');
    assert.deepEqual(r.props.find(p => p.art === 'mystery-console'), workshop.props[4], 'an interactive prop with no catalog art stays put');
    const after = { ...workshop, props: r.props };
    const v = validateMap(after, { strictPockets: false });
    const base = new Set(validateMap(workshop, { strictPockets: false }).problems.map(p => p.text));
    assert.deepEqual(v.problems.filter(p => !base.has(p.text)).map(p => p.text), [], `seed ${seed}: no new problems`);
    assert.deepEqual(studioDress(workshop, { seed, locked: [1] }), r, 'deterministic');
  }
  // art filter: only ids the studio can draw
  const onlyBench = studioDress(workshop, { seed: 3, art: ['workbench', 'crate-small', 'locker'] });
  for (const p of onlyBench.props) assert.ok(['workbench', 'crate-small', 'locker', 'tool-rack', 'engine-stand', 'dog-bed', 'mystery-console'].includes(p.art), p.art);
});

test('dress.js: a multi-room map (the ship) is dressed room by room', async () => {
  const { dressRoom: studioDress, subShell } = await import('../projects/Space-Shooter/voyage/procgen/dress.js');
  const ship = {
    id: 'ship', name: 'Your ship', kind: 'interior', tile: 48, floor: 'deck',
    rooms: [{ room: 'cockpit', at: [0, 0], size: [13, 7] }, { room: 'crew-deck', at: [0, 7], size: [13, 7] }, { room: 'cargo-hold', at: [0, 14], size: [13, 8] }],
    grid: [
      '#############', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#####..######',
      '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '######..#####',
      '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#...........#', '#####...#####',
    ],
    props: [],
    npcs: [],
    doors: [{ id: 'ramp', at: [5, 21], size: [3, 1], to: 'hangar', arrive: 'ship-ramp', label: 'Down the ramp' }],
    spawns: { default: [6, 20, 'up'] },
  };
  const sub = subShell(ship, { x: 0, y: 7, w: 13, h: 7 });
  assert.equal(sub.doors.length, 2, 'the crew deck links up to the cockpit and down to the hold');
  for (let seed = 1; seed <= 30; seed++) {
    const r = studioDress(ship, { seed });
    const after = { ...ship, props: r.props };
    const v = validateMap(after);
    assert.ok(v.ok, `seed ${seed}: ${v.problems.map(p => p.text).join('; ')}`);
    assert.ok(r.props.some(p => p.art === 'nav-console' && p.at[1] < 7), 'helm in the cockpit');
    assert.ok(r.props.some(p => p.art === 'bunk' && p.at[1] >= 7 && p.at[1] < 14), 'bunks on the crew deck');
    assert.ok(r.props.some(p => p.art === 'cargo-container' && p.at[1] >= 14), 'containers in the hold');
  }
});
