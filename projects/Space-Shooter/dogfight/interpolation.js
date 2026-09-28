// Guest-side smoothing of host snapshots.
//
// The host publishes about every 50 ms and the guest draws a fixed delay
// behind the newest arrival, so there is normally a snapshot on each side of
// the moment being drawn. Keeping only the last two snapshots is not enough:
// with a 75 ms delay and 50 ms spacing the drawn moment falls before the older
// of the two, which froze every ship for ~30 ms, crept, and then jumped most
// of a step each packet. A short buffer always holds the bracketing pair.

export const INTERPOLATION_DELAY_MS = 75;
const BUFFER_SIZE = 8;

export function createSnapshotBuffer({ delayMs = INTERPOLATION_DELAY_MS, size = BUFFER_SIZE } = {}) {
  let entries = [];
  return {
    // Snapshots must arrive with rising ticks; stale or repeated ones are ignored.
    push(state, at) {
      const last = entries.at(-1);
      if (last && state.tick <= last.state.tick) return false;
      entries.push({ state, at });
      if (entries.length > size) entries = entries.slice(-size);
      return true;
    },
    clear() { entries = []; },
    get newest() { return entries.at(-1)?.state ?? null; },
    get newestAt() { return entries.at(-1)?.at ?? 0; },
    // The pair around (now - delay) and how far between them, 0..1. Before the
    // buffer covers that moment it shows the oldest snapshot; when snapshots
    // stop it holds the newest rather than guessing ahead.
    sample(now) {
      if (!entries.length) return null;
      const target = now - delayMs;
      let i = entries.length - 1;
      while (i > 0 && entries[i].at > target) i -= 1;
      const from = entries[i];
      const to = entries[i + 1];
      if (!to) return { from: from.state, to: from.state, t: 0 };
      if (target <= from.at) return { from: from.state, to: from.state, t: 0 };
      return { from: from.state, to: to.state, t: Math.min(1, (target - from.at) / ((to.at - from.at) || 1)) };
    },
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// Positions and angles come from the interpolated pair; everything else (hull,
// clock, phase, cooldowns) from the newest snapshot so the HUD is not delayed.
// A ship that moved more than `snap` units between the pair (a respawn or a
// teleport) is drawn at its new place instead of sliding across the map.
export function blendSnapshots({ from, to, t }, newest = to, { snap = 3 } = {}) {
  const ships = to.ships.map((ship, i) => {
    const old = from.ships[i] || ship;
    const k = Math.hypot(ship.x - old.x, ship.y - old.y) > snap ? 1 : t;
    return {
      ...(newest.ships[i] || ship),
      x: lerp(old.x, ship.x, k),
      y: lerp(old.y, ship.y, k),
      angle: lerpAngle(old.angle, ship.angle, t),
    };
  });
  const moving = (list, oldList) => list.map((item) => {
    const old = oldList.find((o) => o.id === item.id);
    return old ? { ...item, x: lerp(old.x, item.x, t), y: lerp(old.y, item.y, t) } : item;
  });
  return { ...newest, ships, traps: moving(to.traps, from.traps), bullets: moving(to.bullets, from.bullets) };
}
