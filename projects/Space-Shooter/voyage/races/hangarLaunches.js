// The races lane's entries for the hangar's Launch menu at the `hatch` station
// (hangar's `voyage/hangarApi.js` addLaunch, ROUND2-CONTRACT.md "Proposed by
// hangar" 1 and "Proposed by races"). Each one is
//   { id, label, blurb, order, available(save) -> { ok, reason }, run(ctx) }
// with ctx = { store, toast, bus }. The hangar calls
//   registerRaceLaunches(hangarApi)
// once; nothing here imports hangar files.
//
// Launch (Nov 28), arena lane: the speeders on two tracks and one fighter on two
// arenas, all paid through the Guild bank (voyage/races/activity.js); a third track
// and more arenas read "coming soon". The practice circuits stay as they were
// (unpaid). Today's Dogfight page (4 arenas, 3 classes) is no longer offered here;
// the new game's arena entries open `dogfight/?launch=1`.
import { CIRCUITS, LAUNCH_TRACKS, LAUNCH_ARENAS, COMING_SOON_TRACKS, COMING_SOON_ARENAS, ACTIVITY_PAY, SHIP_LOSS } from './data.js';
import { flyCircuit, flyPaidRace, openLaunchArena } from './launch.js';
import { practiceBest } from './questRace.js';
import { createActivityPay } from './activity.js';

const needCaptain = (save) => (save?.character ? { ok: true, reason: '' } : { ok: false, reason: 'Sign on a captain first.' });
const secs = (ms) => `${(ms / 1000).toFixed(2)} s`;
const soon = (note) => () => ({ ok: false, reason: note });

// One pay pipeline per page: it asks the hub who is flying, and pays through the
// home server when the new game's server mode is on, the local save when it is off.
let shared = null;
async function sharedPay(store) {
  if (shared) return shared;
  const [{ createRunRecorder }, { economy }] = await Promise.all([import('../../systems/hubRuns.js'), import('../account.js')]);
  const recorder = createRunRecorder();
  const connected = recorder.connect().catch(() => null);
  shared = { pay: createActivityPay({ api: (p, o) => recorder.api(p, o), gamePath: (p) => recorder.gamePath(p), serverOn: () => economy.on, signedIn: () => Boolean(recorder.player), ready: () => connected, store }), economy };
  return shared;
}

const payNote = (r) => `Pays up to ${r.max} cr (finish ${r.finish}, beat the rival +${r.win}). A wreck costs the ship's upgrades and ${SHIP_LOSS.fee} cr.`;
const arenaNote = (r) => `Pays up to ${r.max} cr (round ${r.played}, a win +${r.win}, hull left up to +${r.hullBonus}). Lose your ship and you lose its upgrades and ${SHIP_LOSS.fee} cr.`;

export const RACE_LAUNCHES = Object.freeze([
  ...CIRCUITS.map((c, i) => Object.freeze({
    id: `circuit-${c.id}`,
    label: `Practice circuit: ${c.title}`,
    blurb: `${c.blurb} Your upgraded ship, no boards, no pay.`,
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
  // The two launch tracks, flown for pay.
  ...LAUNCH_TRACKS.map((t, i) => Object.freeze({
    id: `race-${t.id}`,
    label: `Race: ${t.title}`,
    blurb: `${t.blurb} ${payNote(ACTIVITY_PAY[t.job])}`,
    order: 22 + i,
    available: needCaptain,
    best: (save) => practiceBest(save, t.id),
    run: async ({ store, toast = () => {}, bus = null }) => {
      bus?.emit?.('race:launched', { kind: 'race', track: t.id });
      const { pay, economy } = await sharedPay(store);
      const opened = flyPaidRace(t.id, {
        store, pay, toast,
        onPaid: ({ payout, result, line }) => {
          bus?.emit?.('race:paid', { kind: 'race', track: t.id, credits: payout.credits, fee: payout.fee, died: payout.died, source: result.source });
          if (line) toast(`${t.title}: ${line}`);
          if (result.source === 'server') economy.pull().catch(() => {});
        },
      });
      if (!opened) toast('The track is busy. Try again in a moment.');
      return opened;
    },
  })),
  Object.freeze({
    id: 'race-more',
    label: `Race: ${COMING_SOON_TRACKS.title}`,
    blurb: COMING_SOON_TRACKS.blurb,
    order: 24,
    available: soon(COMING_SOON_TRACKS.note),
    run: () => null,
  }),
  // The two launch arenas: the new game's Dogfight, one fighter, AI or friends.
  ...LAUNCH_ARENAS.map((a, i) => Object.freeze({
    id: `arena-${a.id}`,
    label: `Dogfight: ${a.title}`,
    blurb: `${a.blurb} One fighter, AI or friends. ${arenaNote(ACTIVITY_PAY[a.job])}`,
    order: 30 + i,
    // Racing and Dogfight stay open to guests (Q2.1): no captain needed to fly.
    available: () => ({ ok: true, reason: '' }),
    run: ({ bus = null, assign = null } = {}) => {
      bus?.emit?.('race:launched', { kind: 'arena', arena: a.id });
      return openLaunchArena(a.id, assign ? { assign } : {});
    },
  })),
  Object.freeze({
    id: 'arena-more',
    label: `Dogfight: ${COMING_SOON_ARENAS.title}`,
    blurb: COMING_SOON_ARENAS.blurb,
    order: 32,
    available: soon(COMING_SOON_ARENAS.note),
    run: () => null,
  }),
]);

/** Adds every race launch to the hangar's menu. Returns one function that removes them all. */
export function registerRaceLaunches(hangarApi) {
  const offs = RACE_LAUNCHES.map((l) => hangarApi?.addLaunch?.(l)).filter((off) => typeof off === 'function');
  return () => offs.forEach((off) => off());
}
