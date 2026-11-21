// Five hands for Ralph, driven through the model only (no DOM). Each hand is a function (sim) -> action list per step.
import { createRalph, tick, press, move, release, dropItem, finish, layout } from '../model.js';
import { hashSeed, step } from '../rng.js';

export const FRIEND = { now: 1790000000000, ralph: { mood: 50, bond: 2, lastSeen: 1789900000000, favourite: 'scrap', spot: 'behind-ear', tricks: ['sit', 'paw'], finds: [{ item: 'loose-bolt', chance: 0.2 }] }, save: { items: { bone: 1, kibble: 2, ball: 1 } } };

export function rngOf(seed) { let st = hashSeed('hand', seed); return () => { const [v, n] = step(st); st = n; return v; }; }

// A session: the hand acts through `act(sim, dt)` each 1/30 s for `secs` seconds.
export function session({ seed = 1, w = 16, h = 10, context = FRIEND, quick = false, secs = 90, hand }) {
  const s = createRalph({ seed, w, h, context, quick });
  const r = rngOf(seed * 7 + 3); const sim = { s, r, now: 0, held: null, L: s.L, log: { gettable: true, minMood: 100, maxAwayRun: 0, stuckBall: 0 } };
  const dt = 1 / 30; let awayRun = 0, ballLost = 0;
  for (let i = 0; i < secs * 30; i++) {
    sim.now = i * dt;
    hand(sim, dt);
    tick(s, dt);
    sim.log.minMood = Math.min(sim.log.minMood, s.ralph.mood);
    awayRun = s.ralph.mode === 'away' ? awayRun + dt : 0; sim.log.maxAwayRun = Math.max(sim.log.maxAwayRun, awayRun);
    // the ball must always be gettable: at rest in the yard and not inside anything, or in the air, or in his mouth for a bounded time
    if (s.ball.state === 'carried') { ballLost += dt; sim.log.stuckBall = Math.max(sim.log.stuckBall, ballLost); } else ballLost = 0;
    const b = s.ball; if (b.x < 0 || b.y < 0 || b.x > s.L.w || b.y > s.L.h || s.L.rects.some((o) => b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h && b.state === 'rest')) sim.log.gettable = false;
  }
  return { sim, result: finish(s) };
}

const throwAt = (sim, tx, ty, P = 2.4, noise = 0) => { // press the ball, pull away from the target, let go
  const { s, r } = sim, b = s.ball; const a = Math.atan2(ty - b.y, tx - b.x) + (noise ? (r() - 0.5) * noise : 0);
  press(s, b.x, b.y); const px = b.x - Math.cos(a) * P, py = b.y - Math.sin(a) * P; move(s, px, py, 0.1); tick(s, 0.1); return release(s, px, py);
};

export function niceHand() { // throws at the scrap pile and the kennel, finds the spot, gives the bone and the kibble
  let plan = 0, nextAt = 3, rubbing = null;
  return (sim, dt) => {
    const { s } = sim, r = s.ralph, b = s.ball, L = s.L, t = sim.now;
    if (rubbing) { // rub round the spot
      const a = t * 9; const sp = s.rec.spot; const cx = r.x + (Math.cos(r.heading) * sp.y + -Math.sin(r.heading) * sp.x) * 0.95, cy = r.y + (Math.sin(r.heading) * sp.y + Math.cos(r.heading) * sp.x) * 0.95;
      move(s, cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.25, dt);
      if (t > rubbing) { release(s, 0, 0); rubbing = null; nextAt = t + 1; }
      return;
    }
    if (t < nextAt) return;
    const idleish = ['idle', 'wander', 'wait', 'come', 'lean', 'glance', 'search', 'showoff', 'keep', 'chew'].includes(r.mode);
    if (plan === 4) { if (r.mode === 'keep') { press(s, r.x, r.y); release(s, r.x, r.y); nextAt = t + 1.5; } else if (b.state === 'rest' && idleish) { plan = 0; } }
    if (b.state === 'rest' && s.ball && !s.fetchDone && idleish && r.mode !== 'keep' && r.mode !== 'chew') {
      if (plan < 4) { throwAt(sim, plan % 2 ? L.kennel.x + 1.5 : L.scrap.x + 1.5, plan % 2 ? L.kennel.y + 1.4 : L.scrap.y + 1.2, 2.6); plan++; nextAt = t + 2; return; }
    }
    if (plan >= 4 && !s.stat.goodRub && ['idle', 'wander', 'come', 'lean', 'wait', 'keep', 'search'].includes(r.mode)) { press(s, r.x, r.y); rubbing = t + 4.5; return; }
    if (s.stat.goodRub && !s.stat.boneGiven && r.mode === 'idle') { dropItem(s, 'bone', r.x, r.y); nextAt = t + 2; return; }
    if (s.stat.boneGiven && s.stat.usedKibble < 1 && r.mode === 'chew') { dropItem(s, 'kibble', L.bowl.x, L.bowl.y); nextAt = t + 2; }
  };
}
export function wobblyHand() { // clumsy flicks with noise, taps and misses, reaction lag
  let nextAt = 4;
  return (sim) => {
    const { s, r } = sim, t = sim.now, b = s.ball, L = s.L; if (t < nextAt) return; nextAt = t + 2 + r() * 4;
    const pick = r();
    if (pick < 0.6 && b.state === 'rest') throwAt(sim, r() * L.w, r() * L.h, 0.6 + r() * 3.5, 1.6);
    else if (pick < 0.8) { press(s, r() * L.w, r() * L.h); release(s, s.touch ? s.touch.x : 0, 0); }
    else if (pick < 0.9) dropItem(s, 'kibble', s.ralph.x + (r() - 0.5) * 3, s.ralph.y + (r() - 0.5) * 3);
    else { press(s, s.ralph.x + (r() - 0.5), s.ralph.y + (r() - 0.5)); for (let i = 0; i < 12; i++) { move(s, s.ralph.x + (r() - 0.5) * 1.2, s.ralph.y + (r() - 0.5) * 1.2, 0.05); tick(s, 0.05); } release(s, 0, 0); }
  };
}
export const lazyHand = () => () => {}; // only watches
export function mashHand() { // a tap, a flick or a drag every few frames, anywhere
  return (sim) => {
    const { s, r } = sim, L = s.L; const k = r();
    if (k < 0.15) { press(s, r() * L.w, r() * L.h); move(s, r() * L.w, r() * L.h, 0.03); release(s, r() * L.w, r() * L.h); }
    else if (k < 0.25) throwAt(sim, r() * L.w, r() * L.h, r() * 5, 3);
    else if (k < 0.3) dropItem(s, r() < 0.5 ? 'bone' : 'kibble', r() * L.w, r() * L.h);
    else if (k < 0.33) { press(s, s.ralph.x, s.ralph.y); for (let i = 0; i < 5; i++) { move(s, s.ralph.x + r() - 0.5, s.ralph.y + r() - 0.5, 0.03); tick(s, 0.03); } release(s, 0, 0); }
  };
}
export function thinkerHand() { // holds the pointer still on him for two to four seconds between small moves
  let phase = 'wait', until = 2, held = false;
  return (sim, dt) => {
    const { s, r } = sim, t = sim.now, rr = s.ralph;
    if (t < until) { if (held && phase === 'move') { move(s, s.touch.x + (r() - 0.5) * 0.15, s.touch.y + (r() - 0.5) * 0.15, dt); } return; }
    if (!held) { if (['idle', 'wander', 'come', 'search', 'keep', 'lean'].includes(rr.mode)) { press(s, rr.x, rr.y); held = true; phase = 'rest'; until = t + 2 + r() * 2; } else until = t + 1; }
    else if (phase === 'rest') { phase = 'move'; until = t + 1.5; }
    else { phase = 'rest'; until = t + 2 + r() * 2; if (r() < 0.2) { release(s, 0, 0); held = false; until = t + 1; } }
  };
}
export const HANDS = { nice: niceHand, wobbly: wobblyHand, lazy: lazyHand, mash: mashHand, thinker: thinkerHand };
