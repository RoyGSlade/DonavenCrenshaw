// Arriving by hop must not put you on a door's doorstep. The three givers' rooms (Garrity, Hask, Vey) used to
// spawn the captain 10 px short of the door back to the ship, so the first tap of "down" (or a walk toward a
// spot below the giver) bounced them straight back aboard: the round-2 end-to-end test lost Vey that way
// ("could not reach npc vey ... on ship") whenever the giver stood low enough in their wander. Pure rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enterMap, SECTOR_MAP } from '../projects/Space-Shooter/voyage/maps/index.js';
import { walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { WALK } from '../projects/Space-Shooter/voyage/onfoot/rules/walk.js';

const TRIGGER = 14; // world.js: a walk-in door fires when the walker's centre is within 14 px of its rect
/** Distance from the spawn point to the nearest walk-in door trigger band (0 = already inside it). */
function doorGap(map, s) {
  let best = Infinity;
  for (const d of map.doors) {
    const dx = Math.max(d.x - TRIGGER - s.x, 0, s.x - (d.x + d.w + TRIGGER));
    const dy = Math.max(d.y - TRIGGER - s.y, 0, s.y - (d.y + d.h + TRIGGER));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

const places = SECTOR_MAP.places.filter((p) => p.map);
test('there are hop destinations to check', () => assert.ok(places.length >= 3));

for (const p of places) {
  test(`${p.map}: the hop arrival spawn is clear of every door and on open floor`, () => {
    const map = enterMap(p.map);
    for (const name of ['from-dock', 'default']) {
      const s = map.spawns[name];
      if (!s) continue;
      assert.ok(walkable(map, s.x, s.y, WALK.radius), `${name} spawn is on open floor`);
      // One tile of room: a held "down" for a moment, or a walk toward something low, must not reach the door.
      assert.ok(doorGap(map, s) >= map.tile, `${p.map} ${name}: ${Math.round(doorGap(map, s))} px from the door trigger, needs ${map.tile}`);
    }
  });
}
