// The workbench room's map. It is NOT in maps/index.js's MAP_DEFS (no door, link or quest can reach it): the page registers
// it at run time only when the room is asked for (entry.js wantsWorkbench), through the same registerMap the Studio uses.
import def from './workbench.json' with { type: 'json' };
import { registerMap } from '../maps/index.js';
import { YARD_DEF } from './yard.js';

export const WORKBENCH_ID = def.id;
export const WORKBENCH_DEF = def;
let registered = null;
/** Register the room and its patrol yard annex (once) and return the room's compiled map. */
export function registerWorkbench() {
  if (!registered) { registerMap(YARD_DEF); registered = registerMap(def); }
  return registered;
}
