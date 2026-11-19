// A simple burn search for Perihelion: used by the entry to re-draw a field sector the bot cannot clear, and by the tests to
// prove every generated sector (and all five trainer sectors) can be cleared. A beam search over whole turns: from each kept
// state try every angle at a few thrusts, run the burn with the real engine (no trims, no marks), score by how close the ship
// got to the next gate, and keep the best few. It sees the shards (it is an oracle); a player gets a warning instead.
import { cloneSim, setPlan, launch, runBurn, planCosts, maxThrust, nextGate, DT } from './perihelion.js';

const d2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function score(c, hull0) {
  if (c.done) return c.result.success ? 1e6 - c.turn * 1000 : -1e6;
  const g = nextGate(c, 1.75);
  const sh = c.ship;
  const cleared = c.gates.filter((x) => x.cleared).length;
  const speed = Math.hypot(sh.vx, sh.vy);
  // Reward closing on the gate with a ship that is not already leaving the arena.
  let s = -d2(sh.x, sh.y, g.x, g.y) + cleared * 220 - (hull0 - sh.hull) * 160 + sh.fuel * 0.4 - (sh.overheated ? 120 : 0);
  const toX = g.x - sh.x, toY = g.y - sh.y, tl = Math.hypot(toX, toY) || 1;
  s += ((sh.vx * toX + sh.vy * toY) / tl) * 0.35 - speed * 0.05;
  return s;
}

/**
 * Search for a clear. Returns { win, plans: [{ angle, thrust }], turns } where plans fly the sector turn by turn with no trims.
 * `angles` and `thrusts` set how many burns are tried per state; `beam` how many states survive each turn.
 */
export function solve(s0, { angles = 24, thrusts = [40, 70, 100], beam = 4 } = {}) {
  const root = cloneSim(s0); root.noTrail = true;
  let front = [{ s: root, plans: [] }];
  for (let depth = 0; depth < s0.maxTurns - s0.turn + 1; depth++) {
    const next = [];
    for (const node of front) {
      const cap = maxThrust(node.s);
      const hull0 = node.s.ship.hull;
      const set = new Set(thrusts.map((t) => Math.min(t, cap)));
      for (let i = -1; i < angles; i++) {
        const angle = i < 0 ? 0 : -Math.PI + ((i + 0.5) * Math.PI * 2) / angles;
        for (const thrust of i < 0 ? [0] : set) {
          const c = cloneSim(node.s); c.noTrail = true;
          setPlan(c, { angle, thrust });
          if (!launch(c)) continue;
          const used = { angle: c.plan.angle, thrust: c.plan.thrust };
          runBurn(c);
          const plans = [...node.plans, used];
          if (c.done && c.result.success) return { win: true, plans, turns: plans.length };
          if (c.done) continue;
          next.push({ s: c, plans, v: score(c, hull0) });
        }
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.v - a.v);
    front = next.slice(0, beam);
  }
  return { win: false, plans: [], turns: 0 };
}

export { DT, planCosts };
