// The people who can be talked into things: one sheet file per person (pip.js), a registry, and the items their wants hand out.
// Tull and Nessa get sheets next: add a file, import it here, and the checker in check.js tells you what is missing.
import pip from './pip.js';

export const PEOPLE = Object.freeze({ pip });
export const personSheet = (id) => PEOPLE[id] || null;

/** Items a want can give or a push can spend (workbench level; the real items list is not touched). max is how many you can hold. */
export const ITEMS = Object.freeze({
  'good-cutter': Object.freeze({ id: 'good-cutter', name: 'Good cutter', kind: 'tool', max: 1, note: 'Cuts a line 15 wide where the worn bench cutter cuts 9.' }),
  'circuit-board': Object.freeze({ id: 'circuit-board', name: 'Clean circuit board', kind: 'part', max: 9, note: 'A part. Pip wants one for the projector.' }),
});

/** Every want in every sheet by id: { id, person, label, sheet }. */
export const WANTS = Object.freeze(Object.fromEntries(Object.values(PEOPLE).flatMap((p) => Object.entries(p.wants || {}).map(([id, w]) => [id, Object.freeze({ id, person: p.id, label: w.label, item: w.item || null })]))));
export const wantInfo = (id) => WANTS[id] || null;

/** The cut line's width by what you hold (the Cut station's stand-in game, workbench/cut.js). */
export const WORN_CUT = 9;
export const GOOD_CUT = 15;
