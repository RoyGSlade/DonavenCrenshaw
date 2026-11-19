// Round-3 look: a map opts in with a `look` block; maps without one draw exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS, getMap } from '../projects/Space-Shooter/voyage/maps/index.js';
import { lookFor } from '../projects/Space-Shooter/voyage/onfoot/look/look.js';
import { cameraFor } from '../projects/Space-Shooter/voyage/onfoot/viewport.js';
import { LOOK_ART } from '../projects/Space-Shooter/voyage/onfoot/look/lookArt.js';
import { existsSync, statSync } from 'node:fs';

test('only the hangar and the Tin Duchess rooms opt into the round-3 look; the hangar grid is a clean rectangle', () => {
  for (const id of Object.keys(MAP_DEFS)) {
    const look = lookFor(getMap(id));
    if (id === 'hangar' || id.startsWith('duchess-')) assert.ok(look, `${id} has a look`); else assert.equal(look, null, `${id} draws as before`);
  }
  const grid = MAP_DEFS.hangar.grid;
  assert.ok(grid.every(r => r.length === grid[0].length), 'every row the same width');
});

test('the hangar look resolves its set, accents and art ids', () => {
  const look = lookFor(getMap('hangar'));
  assert.ok(look.wall.lipLitPx >= 3 && look.wall.shadow > 0.3);
  for (const d of look.decals) {
    if (d.art) assert.ok(LOOK_ART.decal[d.art], `decal art ${d.art} is in lookArt.js`);
    if (d.tint) assert.ok(look.accents[d.tint] || d.tint.startsWith('#'), `tint ${d.tint}`);
  }
  for (const set of Object.values(look.floorSets)) for (const id of [].concat(set.art || [])) assert.ok(LOOK_ART.floor[id], `floor ${id}`);
  for (const [kind, files] of Object.entries(LOOK_ART)) for (const f of Object.values(files)) {
    const p = new URL(`../projects/Space-Shooter/voyage/onfoot/art/look/${f}`, import.meta.url);
    assert.ok(existsSync(p), `${kind} ${f} exists`);
  }
});

test('the hangar camera fits the whole room on a desktop and follows on a phone; other maps keep theirs', () => {
  const hangar = getMap('hangar');
  const desk = cameraFor(hangar, hangar.w / 2, hangar.h / 2, 1440, 900, 1.35);
  const [bx0, by0, bx1, by1] = (hangar.def.roomBox || [0, 0, hangar.cols, hangar.rows]).map((v, i) => v * hangar.tile); // the room itself (vestibule stubs sit outside it)
  assert.ok(desk.x <= bx0 && desk.y <= by0 && desk.x + desk.vw >= bx1 && desk.y + desk.vh >= by1, 'the whole hangar is in view at 1440x900');
  const phone = cameraFor(hangar, hangar.w / 2, hangar.h / 2, 390, 844, 0.886);
  assert.ok(phone.zoom * hangar.tile >= 40, 'tiles stay readable on a phone');
  const ship = getMap('ship');
  const cam = cameraFor(ship, ship.w / 2, ship.h / 2, 1440, 900, 1.35);
  assert.equal(cam.zoom, 1.35, 'a map without a look keeps the old zoom');
});

test('look art stays small', () => {
  let bytes = 0;
  for (const files of Object.values(LOOK_ART)) for (const f of Object.values(files)) bytes += statSync(new URL(`../projects/Space-Shooter/voyage/onfoot/art/look/${f}`, import.meta.url)).size;
  assert.ok(bytes < 1.5e6, `${bytes} bytes`);
});
