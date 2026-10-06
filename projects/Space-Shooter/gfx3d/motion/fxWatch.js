// Spots the moments the effects care about by watching the weekly scene and
// the pose from frame to frame: a shard picked up, a wreck appearing, a rail
// hit (stun onset), a boost firing. Read-only; it never touches the sim.
// Events are written into a reused array, so watching costs no allocation.
const MAX_EVENTS = 8;

export function createWatch() {
  const events = [];
  for (let i = 0; i < MAX_EVENTS; i++) events.push({ kind: '', x: 0, y: 0, dx: 0, dy: 0 });
  return { layout: null, shardCount: 0, flags: new Uint8Array(0), wreck: false, stun: 0, boostCd: 0, launched: false, events, count: 0 };
}

function push(w, kind, x, y, dx = 0, dy = 0) {
  if (w.count >= MAX_EVENTS) return;
  const e = w.events[w.count++];
  e.kind = kind; e.x = x; e.y = y; e.dx = dx; e.dy = dy;
}

/** Compare this frame with the last. Returns the number of events in w.events[0..n). */
export function watchFrame(w, lv, pose) {
  w.count = 0;
  if (!lv || !pose) return 0;
  if (w.layout !== lv.layout) {
    // A new track or a fresh attempt on it: forget everything and start from what's there.
    w.layout = lv.layout;
    w.flags = new Uint8Array(lv.shardList?.length || 0);
    w.shardCount = lv.shards?.size || 0;
    markCollected(w, lv);
    w.wreck = !!lv.wreck; w.stun = pose.stunTimer || 0; w.boostCd = pose._boostCd || 0; w.launched = !!lv.launched;
    return 0;
  }
  // Shards: anything newly in the collected set.
  const count = lv.shards?.size || 0;
  if (count !== w.shardCount) {
    if (count < w.shardCount) { w.flags.fill(0); markCollected(w, lv); }   // restart: the set was cleared
    else {
      const list = lv.shardList || [];
      for (let i = 0; i < list.length; i++) {
        if (!w.flags[i] && lv.shards.has(list[i].id)) { w.flags[i] = 1; push(w, 'shard', list[i].x, list[i].y); }
      }
    }
    w.shardCount = count;
  }
  // The wreck: the moment the ship is lost.
  const wreck = !!lv.wreck;
  if (wreck && !w.wreck) push(w, 'explosion', lv.wreck.x, lv.wreck.y);
  w.wreck = wreck;
  // A rail hit: stun starts (the sim sets stunTimer on impact).
  const stun = pose.stunTimer || 0;
  if (stun > 0 && w.stun <= 0 && !wreck) {
    const speed = Math.hypot(pose.vx || 0, pose.vy || 0);
    push(w, 'sparks', pose.x, pose.y, speed > 1e-3 ? pose.vx / speed : Math.cos(pose.angle), speed > 1e-3 ? pose.vy / speed : Math.sin(pose.angle));
  }
  w.stun = stun;
  // A boost: the cooldown jumps up when one fires.
  const cd = pose._boostCd || 0;
  if (cd > w.boostCd + 0.05 && !wreck) push(w, 'boost', pose.x, pose.y, Math.cos(pose.angle), Math.sin(pose.angle));
  w.boostCd = cd;
  // The launch off the pad.
  const launched = !!lv.launched;
  if (launched && !w.launched && !wreck) push(w, 'launch', pose.x, pose.y, Math.cos(pose.angle), Math.sin(pose.angle));
  w.launched = launched;
  return w.count;
}

function markCollected(w, lv) {
  const list = lv.shardList || [];
  for (let i = 0; i < list.length; i++) if (lv.shards?.has(list[i].id)) w.flags[i] = 1;
}
