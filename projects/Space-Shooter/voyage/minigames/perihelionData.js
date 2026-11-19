// The five Perihelion trainer sectors: Donaven's hand-made Gemini AI Studio sectors, rebuilt as Stardust data (2026-11-19).
// Same numbers as his sectors.ts (positions, wells, gates, asteroids, flares, fog, turn limits, par turns and par fuel),
// flattened for the vanilla model. Dropped from his data because none of his sectors used them: gate rotation and
// directional gates. Added: meteorEvery on sectors 4 and 5 (his sectors never spawned any) so the Hazard warning path has
// something to warn about: 0 = none, 2 = one shard on the even turns. Arena is 1000 x 680; y grows downward.
// gate: kind exit|waypoint, mod standard|refuel|slipstream|unstable; motion = a sine rail; pulse/open = the open ratio.
export const TRAINER_SECTORS = Object.freeze([
 Object.freeze({
  id: 'lagrange-approach', number: 1, name: "Lagrange Approach", subtitle: "Orbital Slingshot & Moving Jump Gate",
  briefing: "Skim the upper slingshot ring of Lagrange Anchor to curve through the Refuel checkpoint, then intercept the patrolling Jump Gate along its orbital rail.",
  maxTurns: 4, parTurns: 2, parFuel: 28, meteorEvery: 0,
  ship: { x: 110, y: 465, vx: 45, vy: -15, fuel: 70, maxFuel: 85, hull: 3 },
  wells: [
    { id: "well-lagrange", label: "Lagrange Anchor", x: 470, y: 390, core: 34, sling: 106, reach: 245, strength: 540000, color: "#38bdf8" },
  ],
  gates: [
    { id: "g1-refuel", label: "Depot Waypoint", kind: "waypoint", mod: "refuel", x: 485, y: 205, r: 35, cap: 170 },
    { id: "g1-exit", label: "Jump Gate Alpha", kind: "exit", mod: "standard", x: 860, y: 310, r: 36, motion: { ox: 860, oy: 310, ax: 0, ay: 120, period: 7, phase: 0 } },
  ],
  asteroids: [
    { id: "ast-1", x: 675, y: 120, vx: 0, vy: 34, r: 19 },
    { id: "ast-2", x: 705, y: 540, vx: -12, vy: -32, r: 21 },
  ],
  flares: [],
  fog: [],
 }),
 Object.freeze({
  id: 'kepler-belt', number: 2, name: "Kepler Debris Belt", subtitle: "Moving Corridor & Unstable Bonus",
  briefing: "Optional Unstable Relay collapses after Turn 2. Thread the moving asteroid corridor with left and right trim to intercept the moving, pulsed Jump Gate.",
  maxTurns: 4, parTurns: 3, parFuel: 34, meteorEvery: 0,
  ship: { x: 100, y: 340, vx: 55, vy: 0, fuel: 74, maxFuel: 90, hull: 3 },
  wells: [
    { id: "well-kepler", label: "Kepler Core", x: 500, y: 490, core: 32, sling: 96, reach: 215, strength: 480000, color: "#38bdf8" },
  ],
  gates: [
    { id: "g2-unstable", label: "Relay Beacon", kind: "waypoint", mod: "unstable", x: 385, y: 175, r: 34, required: false, expires: 2 },
    { id: "g2-exit", label: "Jump Gate Beta", kind: "exit", mod: "standard", x: 875, y: 335, r: 36, motion: { ox: 875, oy: 335, ax: 0, ay: 140, period: 6.5, phase: 0.4 }, pulse: 5, open: 0.68 },
  ],
  asteroids: [
    { id: "ast-2a", x: 560, y: 130, vx: 0, vy: 54, r: 20 },
    { id: "ast-2b", x: 635, y: 520, vx: 0, vy: -58, r: 22 },
    { id: "ast-2c", x: 715, y: 240, vx: 10, vy: 45, r: 18 },
  ],
  flares: [],
  fog: [],
 }),
 Object.freeze({
  id: 'binary-slingshot', number: 3, name: "Binary Slingshot", subtitle: "Twin Wells & Patrolling Gates",
  briefing: "Curve between Cygnus-A and Cygnus-B to catch the oscillating Slipstream Conduit, then ride the +55% thrust boost onto the moving Jump Gate.",
  maxTurns: 5, parTurns: 3, parFuel: 40, meteorEvery: 0,
  ship: { x: 95, y: 540, vx: 42, vy: -32, fuel: 80, maxFuel: 100, hull: 3 },
  wells: [
    { id: "well-cygnus-a", label: "Cygnus-A", x: 340, y: 385, core: 30, sling: 92, reach: 210, strength: 500000, color: "#38bdf8" },
    { id: "well-cygnus-b", label: "Cygnus-B", x: 660, y: 265, core: 30, sling: 92, reach: 210, strength: 500000, color: "#f59e0b" },
  ],
  gates: [
    { id: "g3-slip", label: "Slipstream Conduit", kind: "waypoint", mod: "slipstream", x: 495, y: 295, r: 34, motion: { ox: 495, oy: 295, ax: 0, ay: 60, period: 7.5, phase: 0 } },
    { id: "g3-exit", label: "Jump Gate Gamma", kind: "exit", mod: "standard", x: 870, y: 195, r: 36, motion: { ox: 870, oy: 195, ax: 35, ay: 115, period: 6.2, phase: 1 } },
  ],
  asteroids: [
    { id: "ast-3a", x: 250, y: 170, vx: 36, vy: 12, r: 20 },
    { id: "ast-3b", x: 780, y: 490, vx: -24, vy: -38, r: 22 },
  ],
  flares: [
    { id: "flare-3a", x: 660, y: 265, angle: 1.3, spin: 0.34, length: 235, width: 18 },
  ],
  fog: [],
 }),
 Object.freeze({
  id: 'shrouded-reef', number: 4, name: "Shrouded Reef", subtitle: "Sensor Pings & Hidden Shortcuts",
  briefing: "Use Sensor Ping to reveal the hidden Refuel Tanker and debris lanes, clear the Slipstream Relay, and intercept Jump Gate Delta on its vertical rail.",
  maxTurns: 5, parTurns: 3, parFuel: 44, meteorEvery: 2,
  ship: { x: 100, y: 185, vx: 48, vy: 20, fuel: 76, maxFuel: 100, hull: 3 },
  wells: [
    { id: "well-reef", label: "Reef Singularity", x: 520, y: 340, core: 34, sling: 100, reach: 225, strength: 520000, color: "#38bdf8" },
  ],
  gates: [
    { id: "g4-refuel", label: "Hidden Tanker", kind: "waypoint", mod: "refuel", x: 425, y: 505, r: 35, required: false, cap: 170 },
    { id: "g4-slip", label: "Slipstream Relay", kind: "waypoint", mod: "slipstream", x: 690, y: 420, r: 34 },
    { id: "g4-exit", label: "Jump Gate Delta", kind: "exit", mod: "standard", x: 880, y: 230, r: 36, motion: { ox: 880, oy: 230, ax: 0, ay: 130, period: 6, phase: 0.2 }, pulse: 4.8, open: 0.68 },
  ],
  asteroids: [
    { id: "ast-4a", x: 310, y: 370, vx: 15, vy: 40, r: 19 },
    { id: "ast-4b", x: 740, y: 160, vx: -20, vy: 48, r: 21 },
    { id: "ast-4c", x: 780, y: 310, vx: 18, vy: -44, r: 18 },
  ],
  flares: [],
  fog: [
    { id: "fog-4a", x: 425, y: 505, r: 135, hint: "Anomalous Depot Signal" },
    { id: "fog-4b", x: 745, y: 220, r: 130, hint: "Uncharted Debris Cluster" },
  ],
 }),
 Object.freeze({
  id: 'aphelion-gauntlet', number: 5, name: "Aphelion Gauntlet", subtitle: "Full Orbital Synthesis",
  briefing: "Snag the optional Unstable Node early for bonus fuel, thread the moving Slipstream Core between twin gravity wells, and catch the patrolling Aphelion Jump Gate.",
  maxTurns: 5, parTurns: 4, parFuel: 48, meteorEvery: 2,
  ship: { x: 90, y: 340, vx: 55, vy: 0, fuel: 84, maxFuel: 100, hull: 3 },
  wells: [
    { id: "well-aphelion-a", label: "Aphelion Alpha", x: 360, y: 230, core: 30, sling: 90, reach: 205, strength: 470000, color: "#f59e0b" },
    { id: "well-aphelion-b", label: "Aphelion Beta", x: 640, y: 450, core: 32, sling: 94, reach: 215, strength: 510000, color: "#38bdf8" },
  ],
  gates: [
    { id: "g5-unstable", label: "Collapse Node", kind: "waypoint", mod: "unstable", x: 365, y: 395, r: 34, required: false, expires: 2 },
    { id: "g5-slip", label: "Slipstream Core", kind: "waypoint", mod: "slipstream", x: 635, y: 265, r: 34, motion: { ox: 635, oy: 265, ax: 0, ay: 75, period: 6.8, phase: 0.6 } },
    { id: "g5-exit", label: "Aphelion Jump Gate", kind: "exit", mod: "standard", x: 885, y: 345, r: 36, motion: { ox: 885, oy: 345, ax: 0, ay: 145, period: 5.8, phase: 0 }, pulse: 4.8, open: 0.65 },
  ],
  asteroids: [
    { id: "ast-5a", x: 240, y: 500, vx: 25, vy: -42, r: 20 },
    { id: "ast-5b", x: 500, y: 150, vx: 18, vy: 46, r: 19 },
    { id: "ast-5c", x: 775, y: 490, vx: -12, vy: -52, r: 21 },
  ],
  flares: [
    { id: "flare-5a", x: 360, y: 230, angle: -0.9, spin: -0.36, length: 225, width: 18 },
  ],
  fog: [
    { id: "fog-5a", x: 760, y: 345, r: 135, hint: "High-Density Interference" },
  ],
 }),
]);
