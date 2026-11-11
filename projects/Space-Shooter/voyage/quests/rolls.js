// Roll specs: how quest data says "this piece is random".
//   { pick: [a, b, c] }          one of the list
//   { range: [min, max] }        a whole number in the range
//   { pickN: 2, from: [...] }    n different items from the list
//   { chance: 0.3 }              true or false
//   { enemy: 'raider', ... }     an enemy rolled from a template; other keys override
// Any other plain object is rolled key by key; anything else is kept as written.
import { ENEMIES } from './data/enemies.js';

const isPlain = value => value && typeof value === 'object' && !Array.isArray(value);

export function isSpec(value) {
  return isPlain(value) && ('pick' in value || 'range' in value || 'pickN' in value || 'chance' in value || 'enemy' in value);
}

export function roll(spec, rng) {
  if (Array.isArray(spec)) return spec.map(item => roll(item, rng));
  if (!isPlain(spec)) return spec;
  if ('pick' in spec) return roll(rng.pick(spec.pick), rng);
  if ('range' in spec) return rng.int(spec.range[0], spec.range[1]);
  if ('pickN' in spec) return rng.pickN(spec.from, spec.pickN).map(item => roll(item, rng));
  if ('chance' in spec) return rng.chance(spec.chance);
  if ('enemy' in spec) return rollEnemy(spec.enemy, rng, spec);
  const out = {};
  for (const [key, value] of Object.entries(spec)) out[key] = roll(value, rng);
  return out;
}

export function rollEnemy(templateId, rng, overrides = {}) {
  const template = ENEMIES[templateId];
  if (!template) throw new Error(`Unknown enemy template: ${templateId}`);
  const { enemy: _id, ...rest } = overrides;
  const merged = { ...template, ...rest };
  const rolled = roll(merged, rng);
  rolled.template = templateId;
  return rolled;
}

// Fill {path.to.value} in quest text from the run's rolls (and the player).
export function fill(text, scope) {
  if (typeof text !== 'string') return '';
  return text.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, path) => {
    const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), scope);
    return value == null || typeof value === 'object' ? match : String(value);
  });
}
