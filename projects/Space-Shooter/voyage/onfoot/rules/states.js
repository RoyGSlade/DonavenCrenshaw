// Things that change while you play (a door locks, the goo is cleaned up, the
// reactor comes back to life) as map data. Pure: no DOM. The world resolves a
// map against the save's flags (and any scripted overrides), compiles the
// result, and does it again when a watched flag changes (onfoot/world.js).
//
// A map names its switchable things once, in `tags`:
//   "tags": { "holo-goo": { "states": ["dirty", "clean"], "state": "dirty",
//                           "by": [{ "flag": "goo-cleared", "state": "clean" }] } }
//   by: rules in order, the LAST one that matches wins. A rule matches when every
//   flag in `flag`/`flags` is set and no flag in `notFlag`/`notFlags` is.
// Then any prop, npc, door or look entry (decal, light, mount, clutter, emitter) can follow a tag:
//   "tag": "holo-goo", "states": { "clean": { "hidden": true } }     per-state changes (any field; hidden removes it)
//   "when": { "airlock-outer": "breached" }                           only there in that state (or a list of states)
// A door's per-state `sealed: "reason"` locks it with that reason (world.js doorGate).
// Scripts force a state with world.setState(tag, state); that override beats the flags.

const LOOK_LISTS = ['decals', 'lights', 'mounts', 'clutter', 'emitters'];
const ITEM_LISTS = ['props', 'npcs', 'doors'];
const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** True when the map has anything that switches. */
export function hasStates(def) {
  return Boolean(def?.tags && Object.keys(def.tags).length);
}

function matches(rule, flags) {
  const need = [...list(rule.flag), ...list(rule.flags)];
  const not = [...list(rule.notFlag), ...list(rule.notFlags)];
  return need.every(f => Boolean(flags?.[f])) && not.every(f => !flags?.[f]);
}

/** Each tag's current state: { tag: state }. flags = save.flags; overrides = { tag: state } from scripts. */
export function resolveStates(def, flags = {}, overrides = {}) {
  const out = {};
  for (const [tag, spec] of Object.entries(def?.tags || {})) {
    let state = spec.state ?? list(spec.states)[0] ?? null;
    for (const rule of list(spec.by)) if (matches(rule, flags)) state = rule.state;
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, tag) && list(spec.states).includes(overrides[tag])) state = overrides[tag];
    out[tag] = state;
  }
  return out;
}

/** A short string that changes when any tag's state changes (the world compares it each tick). */
export const stateSignature = states => Object.entries(states || {}).map(([k, v]) => `${k}=${v}`).sort().join('&');

const allowed = (when, states) => Object.entries(when || {}).every(([tag, want]) => list(want).includes(states[tag]));

/** One entry in its current state: merged, or null when it is hidden or not there in this state. */
function resolveItem(item, states) {
  if (!item || typeof item !== 'object') return item;
  if (item.when && !allowed(item.when, states)) return null;
  let out = item;
  if (item.tag && item.states && states[item.tag] != null && item.states[states[item.tag]]) {
    const { states: _s, ...base } = item;
    out = { ...base, ...item.states[states[item.tag]] };
  }
  if (out.hidden) return null;
  return out;
}

/** The map definition as it stands in these states (a new object; the original is untouched). */
export function applyStates(def, states) {
  if (!hasStates(def)) return def;
  const out = { ...def };
  for (const key of ITEM_LISTS) if (Array.isArray(def[key])) out[key] = def[key].map(i => resolveItem(i, states)).filter(Boolean);
  if (def.look) {
    out.look = { ...def.look };
    for (const key of LOOK_LISTS) if (Array.isArray(def.look[key])) out.look[key] = def.look[key].map(i => resolveItem(i, states)).filter(Boolean);
  }
  out.stateOf = { ...states };
  return out;
}

/** Problems with a map's tags (empty = fine): unknown tags, unknown states, rules that name a state the tag does not have. */
export function checkStates(def) {
  const problems = [];
  const tags = def?.tags || {};
  for (const [tag, spec] of Object.entries(tags)) {
    const states = list(spec.states);
    if (!states.length) problems.push(`${def.id}: tag ${tag} has no states`);
    if (spec.state != null && !states.includes(spec.state)) problems.push(`${def.id}: tag ${tag} starts in unknown state ${spec.state}`);
    for (const r of list(spec.by)) {
      if (!states.includes(r.state)) problems.push(`${def.id}: tag ${tag} rule goes to unknown state ${r.state}`);
      if (!list(r.flag).length && !list(r.flags).length && !list(r.notFlag).length && !list(r.notFlags).length) problems.push(`${def.id}: tag ${tag} has a rule with no flag`);
    }
  }
  const items = [...ITEM_LISTS.flatMap(k => list(def?.[k]).map(i => [k, i])), ...LOOK_LISTS.flatMap(k => list(def?.look?.[k]).map(i => [`look.${k}`, i]))];
  for (const [where, item] of items) {
    if (item?.tag) {
      if (!tags[item.tag]) problems.push(`${def.id}: ${where} ${item.art || item.id || item.kind} follows unknown tag ${item.tag}`);
      else for (const s of Object.keys(item.states || {})) if (!list(tags[item.tag].states).includes(s)) problems.push(`${def.id}: ${where} ${item.art || item.id || item.kind} has unknown state ${item.tag}:${s}`);
    }
    for (const [tag, want] of Object.entries(item?.when || {})) {
      if (!tags[tag]) problems.push(`${def.id}: ${where} ${item.art || item.id || item.kind} waits on unknown tag ${tag}`);
      else for (const s of list(want)) if (!list(tags[tag].states).includes(s)) problems.push(`${def.id}: ${where} ${item.art || item.id || item.kind} waits on unknown state ${tag}:${s}`);
    }
  }
  return problems;
}

/** Every state combination worth checking: each tag in each of its states, the others at their start (for the map tests). */
export function stateVariants(def) {
  const base = resolveStates(def);
  const out = [{ ...base }];
  for (const [tag, spec] of Object.entries(def?.tags || {})) for (const s of list(spec.states)) if (s !== base[tag]) out.push({ ...base, [tag]: s });
  return out;
}
