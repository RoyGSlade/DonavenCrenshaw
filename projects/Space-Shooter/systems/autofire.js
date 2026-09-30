// Auto fire: shoot only when something breakable is ahead of the nose. Pure
// (no DOM, no clock): it reads the scene and returns whether to hold fire this
// frame. In the weekly time trial the result becomes the recorded SHOOT bit, so
// replays stay exact.
export const AUTOFIRE = Object.freeze({
  RANGE: 8.5,        // cells
  CONE_DEG: 11,      // half-angle around the nose
  MARGIN: 0.25,      // a target this close to the cone's edge (cells) still counts
});

// Breakable things: asteroids (network rocks and weekly bouncers) and sentinel drones.
// Mines, gravity wells and weekly corner sentries can't be shot, so they never trigger it.
function targets(scene) {
  const out = [];
  for (const h of scene?.hazards || []) if (h.hp > 0 && h.destructible !== false) out.push(h);
  for (const d of scene?.drones || []) if (d.hp > 0 && d.state !== 'dead') out.push(d);
  return out;
}

export function wantsAutoFire(scene, player = scene?.player) {
  if (!scene || !player || scene.lockedInStart || scene.completed || scene.dead) return false;
  if (player.isOverheated) return false;
  const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
  const cone = Math.tan((AUTOFIRE.CONE_DEG * Math.PI) / 180);
  for (const t of targets(scene)) {
    const dx = t.x - player.x, dy = t.y - player.y;
    const ahead = dx * cos + dy * sin;
    if (ahead <= 0.3 || ahead > AUTOFIRE.RANGE) continue;
    const side = Math.abs(-dx * sin + dy * cos);
    if (side <= ahead * cone + (t.radius || 0.4) + AUTOFIRE.MARGIN) return true;
  }
  return false;
}
