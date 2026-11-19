// The wall-door runtime for one world: panel amounts, entry sequences, the solids a shut door adds, and the
// interact point of a locked door. No DOM; world.js owns the clock, the fade and the drawing hook.
import { compileDoors } from './compile.js';
import { TUNING, bodyNear, bodyInGap, insideRect, rectDistance, stepOpen, passable, doorWants, createEntry, stepEntry } from './rules.js';

export function createDoorSystem() {
  let map = null, doors = [], byId = new Map(), entries = [];
  const open = new Map(), want = new Map(), est = new Map(), pulse = new Map();
  let solidKey = '', solidMap = null;

  function load(m, { arrive = null, keep = false } = {}) {
    const same = keep && map && map.id === m.id;
    map = m;
    ({ doors, byId, entries } = compileDoors(m));
    solidKey = ''; solidMap = null;
    if (same) return;
    open.clear(); want.clear(); est.clear(); pulse.clear();
    for (const d of doors) { open.set(d.id, 0); want.set(d.id, false); }
    for (const e of entries) est.set(e.id, createEntry(Boolean(arrive) && e.spawn === arrive));
  }

  /** One frame. `bodies` are the walker and the people; returns { events: [{ type: 'swap', to, arrive, entry }], sounds }. */
  function step(dt, { walker, bodies = [], locked = () => false, still = false } = {}) {
    const events = [], sounds = [];
    if (!map || !doors.length) return { events, sounds };
    const T = map.tile, hold = new Map();
    for (const e of entries) {
      const room = e.roomDoor, far = e.farDoor;
      const inZone = insideRect(walker.x, walker.y, e.zone, 2);
      const inTrigger = inZone && rectDistance(walker.x, walker.y, room) >= TUNING.trigger * T;
      const r = stepEntry(est.get(e.id), { dt, inTrigger, inZone, roomOpen: open.get(room.id), farOpen: open.get(far.id), gap: bodyInGap(room, bodies) });
      hold.set(room.id, r.hold); hold.set(far.id, 'shut'); pulse.set(room.id, r.pulse); pulse.set(far.id, r.pulse);
      for (const ev of r.events) if (ev.type === 'swap') events.push({ type: 'swap', to: e.to, arrive: e.arrive, entry: e.id });
    }
    for (const d of doors) {
      const w = doorWants({ mode: hold.get(d.id) || 'free', near: bodyNear(d, bodies, T), locked: !d.far && locked(d), far: d.far, gap: bodyInGap(d, bodies) });
      if (w !== want.get(d.id)) { want.set(d.id, w); if (open.get(d.id) !== (w ? 1 : 0)) sounds.push(w ? 'open' : 'close'); }
      open.set(d.id, stepOpen(open.get(d.id), w, dt, still));
    }
    return { events, sounds };
  }

  /** The map with the shut doors added as solids (a door with its panels together is a wall). */
  function walkMap(m) {
    if (!doors.length || m !== map) return m;
    const key = doors.map(d => (passable(open.get(d.id)) ? 0 : 1)).join('');
    if (key === solidKey && solidMap) return solidMap;
    const extra = doors.filter(d => !passable(open.get(d.id))).map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, door: d.id }));
    solidKey = key;
    solidMap = extra.length ? { ...m, solids: [...m.solids, ...extra], blockers: [...m.solids, ...extra] } : m;
    return solidMap;
  }

  /** Interact points for locked doors in reach (E opens them: a key, a hack). */
  function gated(walker, locked) {
    if (!map) return [];
    const T = map.tile, out = [];
    for (const d of doors) {
      if (d.far || !locked(d) || rectDistance(walker.x, walker.y, d) > T * 1.7) continue;
      out.push({ kind: 'wdoor', id: d.id, label: d.label || 'Door', x: d.x + d.w / 2, y: d.y + d.h / 2, reach: Math.max(d.w, d.h) / 2 + T * 0.8 });
    }
    return out;
  }

  const view = d => ({ id: d.id, open: open.get(d.id) ?? 0, entry: d.entry, far: d.far, pulse: pulse.get(d.id) ?? 0, style: d.style, axis: d.axis });
  return {
    load, step, walkMap, gated,
    get(id) { return byId.get(id) || null; },
    get doors() { return doors; },
    get entries() { return entries; },
    amount: id => open.get(id) ?? 0,
    phase: id => est.get(id)?.phase ?? null,
    /** For tests and the proof: every door's open amount, entry and phase. */
    snapshot() { return { map: map?.id ?? null, doors: doors.map(view), entries: entries.map(e => ({ id: e.id, phase: est.get(e.id).phase })) }; },
    views() { return doors.map(d => ({ door: d, ...view(d) })); },
  };
}
