import { session, HANDS } from './hands.mjs';
for (const [n, f] of Object.entries(HANDS)) {
  const { sim, result } = session({ seed: 3, secs: 90, hand: f() });
  console.log(n, JSON.stringify({ g: result.grade, f: result.fetches, p: result.petted, fed: result.fed, found: result.found, bond: result.effects.world.ralph.bond, items: result.effects.items }), sim.log, sim.s.ralph.mode);
}
