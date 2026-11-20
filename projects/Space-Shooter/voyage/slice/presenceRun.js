// The crew ledger, running in the page (opening track A, outcome 1). The glue between the pure model (presence.js, presenceCast.js) and
// the world and the director: one clock that only runs while the floor is live, the cast for each beat, and a way to wait for people to
// walk in. No DOM.
//
//   const presence = createPresenceRun({ flags: () => save.flags })
//   presence.restore(save)                     stand everyone where the scene in progress puts them (a page load)
//   presence.arrange(scene, node)              start whoever has to walk for this beat; { needs, eta } (the people the beat waits for)
//   presence.ready(needs, room)                is everyone in that room, arrived
//   presence.whenReady(needs, room)            a promise for when they are
//   presence.hooks                             what world.js wants: { managed, entries(mapId), tick(dt) }
import { createPresence } from './presence.js';
import { castAt, needsIn, startPoint } from './presenceCast.js';
import { NPC_IDS, AWAY, DOWNED } from './presenceData.js';

export function createPresenceRun({ flags = () => ({}), speed } = {}) {
  let clock = 0; // seconds of live floor time
  const ledger = createPresence({ now: () => clock, speed });
  const waiters = [];

  function put(id, room) {
    if (room === DOWNED) ledger.down(id);
    else if (room === AWAY) ledger.gone(id);
    else ledger.settle(id, room);
  }

  /** A page load: everyone is where the scene in progress (or the next one) puts them, no walking. */
  function restore(save) {
    const { scene, node } = startPoint(save);
    const cast = castAt({ scene, node, flags: save?.flags || {} });
    ledger.clear();
    for (const id of NPC_IDS) put(id, cast[id]);
  }

  /** A beat is starting: whoever is not where this beat wants them starts walking. */
  function arrange(scene, node) {
    const f = flags();
    const cast = castAt({ scene, node, flags: f });
    for (const id of NPC_IDS) {
      const want = cast[id];
      if (!want) continue;
      if (want === DOWNED) { if (ledger.state(id) !== 'down') ledger.down(id); continue; }
      if (ledger.state(id) === 'down' || ledger.state(id) === 'gone') continue; // a body does not get up, and nobody who left comes back
      if (ledger.dest(id) === want) continue;
      if (want === AWAY) { if (ledger.send(id, AWAY) == null) ledger.gone(id); continue; }
      if (ledger.send(id, want) == null) ledger.settle(id, want); // no way on foot: they were always there
    }
    const needs = needsIn({ scene, node, flags: f });
    return { needs, eta: Math.max(clock, ...needs.map((id) => ledger.arrival(id))) };
  }

  const ready = (needs, room) => needs.every((id) => ledger.isIn(id, room));
  /** The ids not there yet (for the "on the way" line). */
  const late = (needs, room) => needs.filter((id) => !ledger.isIn(id, room));
  function whenReady(needs, room) {
    if (ready(needs, room)) return Promise.resolve();
    const eta = Math.max(...needs.map((id) => ledger.arrival(id)));
    return new Promise((resolve) => waiters.push({ at: eta, resolve }));
  }
  function tick(dt) {
    clock += dt;
    for (let i = waiters.length - 1; i >= 0; i--) if (clock >= waiters[i].at) { const w = waiters.splice(i, 1)[0]; w.resolve(); }
  }

  return {
    restore, arrange, ready, late, whenReady, tick, ledger,
    get clock() { return clock; },
    hooks: { get managed() { return ledger.managed; }, entries: (mapId) => ledger.entries(mapId), tick },
  };
}
