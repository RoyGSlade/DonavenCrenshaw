// Playtest lab: alternative boost, fuel and rail rules to compare side by side
// in friend playtests (Phase 3 of the engagement plan: "compare a small number
// of models in playtests; do not commit to one without testing feel").
//
// Only a game URL with ?lab=... turns it on, for example
//   games/stardust/?lab=boost:charge,fuel:lean,rails:impact
// A lab session never starts run saving, so no lab time can reach the
// leaderboard or be compared with real records. The flight code only changes
// when these config keys are set; Dogfight never reads them.

// Each option: [short name, one line on how it plays].
export const LAB_OPTIONS = Object.freeze({
  boost: Object.freeze({
    pips: ['Pips (current)', 'Tap for a push; three charges that refill.'],
    charge: ['Charge', 'Hold to build a push, release to fire it. A tap does nothing.'],
    heat: ['Heat', 'No charges. Each boost heats the drive; a hot drive pushes weaker.'],
  }),
  fuel: Object.freeze({
    current: ['Current tank', 'Fuel as it is today.'],
    lean: ['Lean tank', 'Burn ×2.5 and each boost costs 4 fuel, so the station matters.'],
  }),
  rails: Object.freeze({
    current: ['Current rails', 'Bounce off the rails; no damage.'],
    impact: ['Impact rails', 'Head-on hits scrub speed and hurt; scrapes barely do.'],
  }),
});
const DEFAULTS = Object.freeze({ boost: 'pips', fuel: 'current', rails: 'current' });
export const LEAN_FUEL = Object.freeze({ BURN_SCALE: 2.5, BOOST_COST: 4 });

// ?lab=boost:charge,rails:impact → { boost: 'charge', fuel: 'current', rails: 'impact' }.
// ?lab or ?lab=1 is the current rules under lab conditions, as a fair baseline.
// Anything unknown falls back to the current rule. No ?lab at all → null.
export function parseLab(search) {
  let raw;
  try { raw = new URLSearchParams(search || '').get('lab'); } catch { return null; }
  if (raw === null) return null;
  const lab = { ...DEFAULTS };
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':').map((s) => s.trim().toLowerCase());
    if (Object.hasOwn(LAB_OPTIONS, key) && Object.hasOwn(LAB_OPTIONS[key], value)) lab[key] = value;
  }
  return lab;
}

export function labQuery(lab) {
  return Object.keys(DEFAULTS).map((key) => `${key}:${lab[key]}`).join(',');
}

export function labLabel(lab) {
  return `boost ${lab.boost} · fuel ${lab.fuel} · rails ${lab.rails}`;
}

// Settings the flight code reads. Undefined means "as today".
export function labConfig(lab) {
  return {
    BOOST_MODEL: lab.boost === 'pips' ? undefined : lab.boost,
    FUEL_BURN_SCALE: lab.fuel === 'lean' ? LEAN_FUEL.BURN_SCALE : 1,
    BOOST_FUEL_COST: lab.fuel === 'lean' ? LEAN_FUEL.BOOST_COST : 0,
    RAIL_MODEL: lab.rails === 'impact' ? 'impact' : undefined,
  };
}

// What happened in one lab session, for the playtest notes.
export function createLabLog() {
  const log = {
    boosts: 0,
    boostStrength: 0,
    railHits: 0,
    hardRailHits: 0,
    railDamage: 0,
    docks: 0,
    fuelOuts: 0,
    hullLosses: 0,
    lowestFuel: Infinity,
    circuits: [],
  };
  return {
    get data() { return log; },
    boost(scale = 1) { log.boosts += 1; log.boostStrength += scale; },
    rail({ impact, damage }) {
      if (impact < 0.5) return;
      log.railHits += 1;
      if (damage > 0) { log.hardRailHits += 1; log.railDamage += damage; }
    },
    fuel(level) { log.lowestFuel = Math.min(log.lowestFuel, level); },
    dock() { log.docks += 1; },
    fuelOut() { log.fuelOuts += 1; },
    hullLoss() { log.hullLosses += 1; },
    circuit(level, ms) { log.circuits.push({ level, ms }); },
    reset() {
      Object.assign(log, { boosts: 0, boostStrength: 0, railHits: 0, hardRailHits: 0, railDamage: 0, docks: 0, fuelOuts: 0, hullLosses: 0, lowestFuel: Infinity, circuits: [] });
    },
  };
}

// The active session's log, or null outside the lab. The engine calls these
// through labHooks so a normal game pays nothing.
let active = null;
export function startLabLog() { active = createLabLog(); return active; }
export const labHooks = {
  boost: (scale) => active?.boost(scale),
  rail: (hit) => active?.rail(hit),
  fuel: (level) => active?.fuel(level),
  dock: () => active?.dock(),
  fuelOut: () => active?.fuelOut(),
  hullLoss: () => active?.hullLoss(),
  circuit: (level, ms) => active?.circuit(level, ms),
};

const CIRCUITS = ['Alpha Relay', 'Beacon Prime', 'Dustfall Station', 'Nether Crossing', 'Iron Veil'];
const clock = (ms) => {
  const t = Math.max(0, Math.round(Number(ms) || 0));
  const two = (n) => String(n).padStart(2, '0');
  return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
};

// Plain text a tester can paste back: rules, time, circuit times and counts.
export function labReport(lab, data, totalMs) {
  const avg = data.boosts ? (data.boostStrength / data.boosts).toFixed(2) : '–';
  return [
    `Stardust playtest lab: ${labLabel(lab)}`,
    `Total ${clock(totalMs)} (not saved)`,
    ...data.circuits.map((c) => `  ${CIRCUITS[c.level - 1] || `Circuit ${c.level}`}: ${clock(c.ms)}`),
    `Boosts ${data.boosts} (average strength ×${avg})`,
    `Rail hits ${data.railHits}, hard ${data.hardRailHits}, rail damage ${Math.round(data.railDamage)}`,
    `Docked ${data.docks}, ran out of fuel ${data.fuelOuts}, lowest fuel ${Number.isFinite(data.lowestFuel) ? Math.round(data.lowestFuel) : '–'}`,
    `Hull lost ${data.hullLosses}`,
    'How did it feel? ',
  ].join('\n');
}
