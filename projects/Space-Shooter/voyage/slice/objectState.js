// What the object screens show (opening track A, outcome 6). Pure: no DOM. Each reads the real save where it has the state and says
// plainly when a number is flavour: `real: true` marks a value that comes from the game, `real: false` one that is only colour.
//
//   engineState(flags)         the reactor's bars (output, heat, coolant) and what is wrong right now
//   gunState(flags, items)     the guns aboard, each one's status and ammo, and the tracking mode
//   courseState(save, role)    the star map's places and whether plotting a course is allowed
//   DRINKS                     what the drinks machine pours
import { roleOf } from './role.js';
import { SECTOR_MAP } from '../maps/index.js';

const on = (flags, k) => Boolean(flags?.[k]);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** The engine core. The bars follow the flags the repair jobs set; the numbers inside a state are colour. */
export function engineState(flags = {}) {
  const busted = on(flags, 'duchess-busted');
  const leaking = (on(flags, 'coolant-leaking') || busted) && !on(flags, 'coolant-fixed');
  const reactorDead = busted && !on(flags, 'reactor-fixed');
  const problems = [];
  if (reactorDead) problems.push({ id: 'reactor', text: 'The reactor is dead. Nothing is making power.', where: 'the reactor core' });
  if (busted && !on(flags, 'power-fixed')) problems.push({ id: 'conduit', text: 'The power conduit panel is open and sparking.', where: 'the conduit panel' });
  if (leaking) problems.push({ id: 'coolant', text: 'The coolant line is leaking onto the grating.', where: 'the coolant line' });
  if (busted && !on(flags, 'hull-patched')) problems.push({ id: 'hull', text: 'A hull plate is blown. You can see stars through it.', where: 'the hull plate' });
  const output = reactorDead ? 0 : busted ? 62 : 84;
  const coolant = leaking ? (busted ? 22 : 41) : 96;
  // Heat climbs when the coolant is short and falls with the reactor off.
  const heat = reactorDead ? 8 : clamp(38 + (100 - coolant) * 0.55);
  return {
    bars: [
      { id: 'output', label: 'Output', value: clamp(output), unit: '%', tone: output > 50 ? 'good' : output > 0 ? 'warn' : 'bad', real: true },
      { id: 'heat', label: 'Heat', value: heat, unit: '%', tone: heat > 70 ? 'bad' : heat > 55 ? 'warn' : 'good', real: false },
      { id: 'coolant', label: 'Coolant', value: coolant, unit: '%', tone: coolant < 30 ? 'bad' : coolant < 60 ? 'warn' : 'good', real: true },
    ],
    problems,
    status: reactorDead ? 'DEAD' : problems.length ? 'FAULT' : 'RUNNING',
  };
}

/** The guns aboard. The turret's condition and Reck's rifle come from the story's flags; ammo is colour; tracking is a real saved choice. */
export function gunState(flags = {}) {
  const broken = on(flags, 'reck-down') && !on(flags, 'turret-repaired');
  const rifleTaken = on(flags, 'reck-rifle-taken');
  const auto = on(flags, 'duchess-guns-auto');
  const guns = [
    { id: 'turret', name: 'Gunner turret', status: broken ? 'DAMAGED' : 'READY', note: broken ? 'The targeting arm is bent. It will point, badly.' : 'Arm tracks fine. Reck kept it clean.', ammo: broken ? 35 : 78, ammoReal: false, equipped: true },
  ];
  if (rifleTaken) guns.push({ id: 'rifle', name: "Reck's rifle", status: 'IN HAND', note: 'A cheerful sticker, peeling.', ammo: 54, ammoReal: false, equipped: true });
  else if (on(flags, 'reck-down')) guns.push({ id: 'rifle', name: "Reck's rifle", status: 'ON THE DECK', note: 'By the gunner seat. Nobody has moved it.', ammo: 54, ammoReal: false, equipped: false });
  return { guns, tracking: auto ? 'auto' : 'manual', trackingNote: auto ? 'Auto: the arm follows what it sees. It cannot tell a Reaver from a mop.' : 'Manual: you aim, you fire. It does what the gunner does.' };
}

/** The star map: where the Drift's places are, and whether this person may plot a course. */
export function courseState(save) {
  const role = roleOf(save);
  const authorised = role === 'captain';
  const flags = save?.flags || {};
  const scanned = new Set(SECTOR_MAP.pois.filter((p) => flags[`poi-${p.id}`]).map((p) => p.id));
  return {
    role,
    authorised,
    reason: authorised ? null : "Pilot's console: authorised crew only.",
    places: SECTOR_MAP.places.map((p) => ({ id: p.id, name: p.name, at: p.at, giver: p.giver, known: Boolean(flags[`met-${p.giver}`]) || authorised })),
    home: { id: 'home', name: SECTOR_MAP.start.name, at: SECTOR_MAP.start.at },
    size: { w: SECTOR_MAP.w, h: SECTOR_MAP.h },
    pois: SECTOR_MAP.pois.map((p) => ({ id: p.id, name: p.name, at: p.at, kind: p.kind, scanned: scanned.has(p.id) })),
    rocks: SECTOR_MAP.rocks,
    here: [58, 62],
  };
}

/** The drinks machine. Coffee is the playtest-1 cup (Wired); tea is the quieter one. */
export const DRINKS = Object.freeze({
  coffee: { id: 'coffee', name: 'Coffee', blurb: 'Black, hot, and certainly a liquid.', status: 'wired', item: 'coffee' },
  tea: { id: 'tea', name: 'Tea', blurb: 'Pale and patient. Hask would approve.', status: 'steady', item: 'tea' },
});
