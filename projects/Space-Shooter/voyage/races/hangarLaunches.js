// The races lane's entries for the hangar's Launch menu at the `hatch` station
// (hangar's `voyage/hangarApi.js` addLaunch, ROUND2-CONTRACT.md "Proposed by
// hangar" 1 and "Proposed by races"). Each one is
//   { id, label, blurb, order, available(save) -> { ok, reason }, run(ctx) }
// with ctx = { store, toast, bus }. The hangar calls
//   registerRaceLaunches(hangarApi)
// once; nothing here imports hangar files.
import { CIRCUITS, ARENA } from './data.js';
import { flyCircuit, openArena } from './launch.js';
import { practiceBest } from './questRace.js';

const needCaptain = (save) => (save?.character ? { ok: true, reason: '' } : { ok: false, reason: 'Sign on a captain first.' });
const secs = (ms) => `${(ms / 1000).toFixed(2)} s`;

export const RACE_LAUNCHES = Object.freeze([
  ...CIRCUITS.map((c, i) => Object.freeze({
    id: `circuit-${c.id}`,
    label: `Practice circuit: ${c.title}`,
    blurb: `${c.blurb} Your upgraded ship, no boards.`,
    order: 20 + i,
    available: needCaptain,
    best: (save) => practiceBest(save, c.id),
    run: ({ store, toast = () => {}, bus = null }) => {
      bus?.emit?.('race:launched', { kind: 'circuit', track: c.id });
      return flyCircuit(c.id, {
        store,
        onResult: (r) => {
          bus?.emit?.('race:finished', { kind: 'circuit', track: c.id, timeMs: r.timeMs, finished: r.finished, best: r.best });
          if (r.finished) toast(r.best ? `New practice best on ${c.title}: ${secs(r.timeMs)}.` : `${c.title}: ${secs(r.timeMs)}.`);
        },
      });
    },
  })),
  Object.freeze({
    id: 'arena',
    label: ARENA.title,
    blurb: ARENA.blurb,
    order: 30,
    // Today's Dogfight as it is: no captain needed, classes and records are Dogfight's own.
    available: () => ({ ok: true, reason: '' }),
    run: ({ bus = null } = {}) => { bus?.emit?.('race:launched', { kind: 'arena' }); openArena(); },
  }),
]);

/** Adds every race launch to the hangar's menu. Returns one function that removes them all. */
export function registerRaceLaunches(hangarApi) {
  const offs = RACE_LAUNCHES.map((l) => hangarApi?.addLaunch?.(l)).filter((off) => typeof off === 'function');
  return () => offs.forEach((off) => off());
}

