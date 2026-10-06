// What the effects need to know about the ship the player is flying: how big
// it is, where its engines are and how hard they are burning. ship.js writes
// it every frame, fx.js reads it, so a swapped-in .glb with its own engine
// positions gets its exhaust in the right place without a contract change.
// There is exactly one player ship, so a module singleton is the honest shape.
export const shipInfo = {
  length: 1,                                   // cells, nose to tail
  hover: 0.26,                                 // cells above the track
  ports: [{ x: -0.42, z: -0.135 }, { x: -0.42, z: 0.135 }], // engine nozzles, ship-local cells (x forward, z starboard)
  glow: 0, boost: 0, strafe: 0, brake: 0, stunned: false, speed: 0, active: false,
  visible: false,
};

/** World position (sim x, y) of engine port i for a pose, writing into out. */
export function portWorld(pose, i, out = {}) {
  const p = shipInfo.ports[i % shipInfo.ports.length];
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
  // local x along the heading, local z toward starboard (angle + 90deg)
  out.x = pose.x + p.x * c - p.z * s;
  out.y = pose.y + p.x * s + p.z * c;
  return out;
}
