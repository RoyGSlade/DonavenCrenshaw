// The workbench room's maps. They are NOT in maps/index.js's MAP_DEFS (no door, link or quest can reach them): the page registers
// them at run time only when the room is asked for (entry.js wantsWorkbench), through the same registerMap the Studio uses.
// The annex is the second room of the workbench: the other side of the vestibule entry (voyage/onfoot/doors) plus two plain doorways.
import def from './workbench.json' with { type: 'json' };
import annex from './annex.json' with { type: 'json' };
import { registerMap } from '../maps/index.js';

export const WORKBENCH_ID = def.id;
export const WORKBENCH_DEF = def;
export const ANNEX_ID = annex.id;
export const ANNEX_DEF = annex;
let registered = null;
/** Register the room and its annex (once) and return the workbench's compiled map. */
export function registerWorkbench() {
  if (!registered) { registered = registerMap(def); registerMap(annex); }
  return registered;
}
