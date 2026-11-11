// Seeded randomness for quests. Every roll in a quest comes from here, so a quest
// played again with the same seed and the same actions ends the same way.
// The state is one uint32, so it lives inside the saved run as a plain number.

// FNV-1a over the joined parts: turns 'q-beacon', 1234, 'intro' into a uint32 seed.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const text = parts.map(part => String(part)).join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: one step returns [value in [0,1), next state].
export function step(state) {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

// A small roller over a mutable holder ({ rng: uint32 }). Use it inside one
// action, then the holder carries the new state forward.
export function roller(holder, key = 'rng') {
  const next = () => {
    const [value, state] = step(holder[key] >>> 0);
    holder[key] = state;
    return value;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = list => list[Math.floor(next() * list.length)];
  return {
    next,
    int,
    pick,
    chance: p => next() < p,
    d6: () => int(1, 6),
    shuffle(list) {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    pickN(list, n) { return this.shuffle(list).slice(0, Math.max(0, Math.min(n, list.length))); },
  };
}
