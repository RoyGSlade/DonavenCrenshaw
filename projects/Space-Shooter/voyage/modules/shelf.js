// The module shelf, pure: the rows the workbench menu (and the controller) list for the registry's modules, grouped by kind.
// Reads the registry only, so a module added to modules/list.js shows up here with no change to this file.
import { list, pickerLineOf } from './registry.js';

const KIND_ORDER = ['minigame', 'screen', 'scene'];
const KIND_WORD = { minigame: 'Mini-games', screen: 'Screens', scene: 'Scenes' };

/** [{ id, title, verb, skill, kind, status, line }] for every registered module, mini-games first, in list order. */
export function shelfRows() {
  return [...list()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).map((m) => ({ id: m.id, title: m.title, verb: m.verb, skill: m.skill || null, kind: m.kind, status: m.status || 'draft', line: pickerLineOf(m.id) }));
}
/** The rows split into { kind, word, rows } groups (empty groups left out). */
export const shelfGroups = () => KIND_ORDER.map((kind) => ({ kind, word: KIND_WORD[kind], rows: shelfRows().filter((r) => r.kind === kind) })).filter((g) => g.rows.length);
