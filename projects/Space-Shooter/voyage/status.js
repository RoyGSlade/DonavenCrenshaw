// Short status effects on the player (playtest 1, item 7: coffee makes you "Wired"). Pure: the clock is passed in.
// Runtime only (not saved): a status is a few minutes of play, a reload clears it.
//
//   const statuses = createStatuses({ now: () => Date.now() })
//   statuses.add('wired') · statuses.active() -> [{ id, name, left }] · statuses.speedMult() -> 1.05 while Wired
export const STATUS_DEFS = Object.freeze({
  wired: { id: 'wired', name: 'Wired', speed: 1.05, ms: 3 * 60 * 1000, text: 'You move 5% faster.' },
  // Opening track A: tea, the quiet cup. Colour only: it changes nothing yet, and says so.
  steady: { id: 'steady', name: 'Steady', speed: 1, ms: 3 * 60 * 1000, text: 'Your hands are steady. That is all it does, for now.' },
});

/** The words for the little flavour line after a coffee. A tease only: not a system. */
export const COFFEE_WORDS = Object.freeze({
  drink: 'Wired. You move 5% faster for a few minutes. Bodily functions coming soon.',
  take: 'A cup of coffee goes in your pack. Drink it from the bag when you want it.',
  menuTitle: 'The coffee machine',
  drinkLabel: 'Drink a cup now',
  takeLabel: 'Take a cup with you',
  leaveLabel: 'Leave it',
});

/** Tea at the same machine (opening track A). */
export const TEA_WORDS = Object.freeze({
  drink: 'Steady. Warm hands, calm head. It does nothing else yet.',
  take: 'A cup of tea goes in your pack. Drink it from the bag when you want it.',
});

export function createStatuses({ now = () => Date.now(), defs = STATUS_DEFS } = {}) {
  const until = new Map();
  const live = () => { const t = now(); for (const [id, end] of until) if (end <= t) until.delete(id); return t; };
  return {
    /** Start (or refresh) a status. Returns its definition, or null for an unknown id. */
    add(id) { const d = defs[id]; if (!d) return null; until.set(id, now() + d.ms); return d; },
    active() { const t = live(); return [...until].map(([id, end]) => ({ id, name: defs[id].name, text: defs[id].text, left: end - t, total: defs[id].ms })); },
    has(id) { live(); return until.has(id); },
    /** The walking speed multiplier from every status that is on. */
    speedMult() { live(); let m = 1; for (const id of until.keys()) m *= defs[id].speed || 1; return m; },
    clear() { until.clear(); },
  };
}

/** m:ss for a status chip. */
export const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
