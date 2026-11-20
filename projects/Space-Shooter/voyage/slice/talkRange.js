// Watches how far the player is from whoever is talking (opening B, outcome 1) and runs the talk state machine on it.
// jobTalk announces 'talk:open' { speaker } and 'talk:close'; this answers 'talk:pause', 'talk:resume' and calls leave() when the
// talk ends for good. It also hands out the ambient barks as you walk past people. All words come from ./barks.js.
import { createTalkState } from './talkState.js';
import { createBarker } from './barks.js';

/**
 * bus: the story bus. world(): the on-foot world (npcsHere, tilesTo, map, bark, stage) or null. leave(): end the talk as "Later".
 * canBark(): true when nothing else owns the screen. now(): ms clock. rand(): rng.
 */
export function createTalkRange({ bus, world, leave = () => {}, canBark = () => true, now = () => Date.now(), rand = Math.random, tickMs = 100 }) {
  const state = createTalkState();
  const barker = createBarker({ rand });
  let mapId = null, hasBody = false, speaker = null;

  const off = [
    bus.on('talk:open', (d) => {
      const w = world();
      speaker = d?.speaker || null;
      mapId = w?.map?.id || null;
      hasBody = Boolean(w && speaker && w.tilesTo(speaker) != null);
      state.open(speaker);
      w?.stage?.talking(hasBody ? speaker : null);
    }),
    bus.on('talk:close', () => { state.close(); world()?.stage?.talking(null); speaker = null; }),
  ];

  function tick() {
    const w = world();
    if (!w) return;
    if (state.active) {
      // The speaker is "far" once the player has left their room.
      const dist = !hasBody ? null : w.map?.id !== mapId ? Infinity : w.tilesTo(speaker);
      for (const e of state.step(dist, tickMs)) {
        if (e.type === 'pause') { bus.emit('talk:pause', { speaker }); w.bark(speaker, barker.talkLine('pause', speaker)); }
        else if (e.type === 'resume') { bus.emit('talk:resume', { speaker }); w.bark(speaker, barker.talkLine('resume', speaker)); }
        else if (e.type === 'end') {
          bus.emit('talk:end', { speaker: e.speaker, why: e.why });
          w.stage?.talking(null);
          if (w.map?.id === mapId) w.bark(e.speaker, barker.talkLine('end', e.speaker));
          leave();
        }
      }
      return;
    }
    if (!canBark()) return;
    const t = now();
    for (const n of w.npcsHere()) {
      const line = barker.passing(n.id, w.tilesTo(n.id), t);
      if (line) { w.bark(n.id, line); break; }
    }
  }
  const timer = setInterval(tick, tickMs);
  return { state, tick, barker, destroy() { clearInterval(timer); off.forEach((o) => o?.()); } };
}
