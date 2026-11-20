// The star base on the page: registers its maps once the base is yours. Everything else (panels, units) is in units.js.
import { registerMap } from '../maps/index.js';
import { buildMaps } from './maps.js';
import { BASE_MAPS } from './base.js';

let registeredSeed = null;
/** Register the four maps for a base block (again only when the seed changes). Returns the map ids. */
export function registerStarbase(base) {
  if (!base) return [];
  if (registeredSeed !== base.seed) {
    for (const def of buildMaps(base)) registerMap(def);
    registeredSeed = base.seed;
  }
  return Object.values(BASE_MAPS);
}
export { BASE_MAPS };
