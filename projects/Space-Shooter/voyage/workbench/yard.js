// The patrol yard: the workbench's live-stealth annex. A door in the workbench bay leads in, a door at the other end leads back.
// Three guards, cover props and a vault console to reach unseen. The rules are onfoot/rules/stealth.js; the page layer is
// onfoot/stealthLayer.js; this file is the map and what the yard pays (placeholder XP, the same 10 cap as every workbench action).
import def from './yard.json' with { type: 'json' };

export const YARD_ID = def.id;
export const YARD_DEF = def;
export const YARD_GOAL = 'wb-yard-goal';
export const YARD_START = 'from-bay';

/**
 * Placeholder Stealth XP for reaching the console (a failed or abandoned run pays nothing):
 * 4 for getting there, +3 if no guard ever sounded the alarm, +2 if none ever inspected your spot, +1 if you took a guard down. Capped at 10.
 */
export function yardXp({ outcome, inspects = 0, alarms = 0, takedowns = 0 } = {}) {
  if (outcome !== 'goal') return 0;
  return Math.min(10, 4 + (alarms === 0 ? 3 : 0) + (inspects === 0 ? 2 : 0) + (takedowns > 0 ? 1 : 0));
}

/** One plain line for the result. */
export function yardSaid(run = {}, xp = 0) {
  const { inspects = 0, alarms = 0, takedowns = 0 } = run;
  const how = alarms ? `The alarm went ${alarms === 1 ? 'once' : `${alarms} times`}.` : inspects ? `${inspects} guard${inspects === 1 ? '' : 's'} came to look, but no alarm.` : 'Not one guard noticed you.';
  const tk = takedowns ? ` ${takedowns} takedown${takedowns === 1 ? '' : 's'}.` : '';
  return `Vault open. ${how}${tk} ${xp ? `+${xp} Stealth XP.` : 'No XP.'}`;
}
