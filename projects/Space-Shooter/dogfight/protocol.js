/** Sanitize messages before they cross a room boundary. Positions belong only to the host. */
export function inputControls(value) {
  if (
    !value ||
    !number(value.turn, -1, 1) ||
    typeof value.thrust !== "boolean" ||
    typeof value.brake !== "boolean" ||
    typeof value.fire !== "boolean" ||
    (value.reverse !== undefined && typeof value.reverse !== "boolean") ||
    (value.boost !== undefined && typeof value.boost !== "boolean")
  )
    return null;
  if (
    Object.keys(value).some(
      (k) =>
        !["turn", "thrust", "brake", "fire", "reverse", "boost"].includes(k),
    )
  )
    return null;
  return {
    turn: value.turn,
    thrust: value.thrust,
    brake: value.brake,
    fire: value.fire,
    reverse: value.reverse ?? false,
    boost: value.boost ?? false,
  };
}
const number = (v, lo, hi) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
export function cleanSnapshot(s, round) {
  if (
    !s ||
    s.round !== round ||
    !Number.isSafeInteger(s.tick) ||
    s.tick < 0 ||
    s.tick > 200000 ||
    !["countdown", "playing", "finished"].includes(s.phase) ||
    !number(s.countdown, 0, 3) ||
    !number(s.remaining, 0, 180) ||
    ![null, 0, 1].includes(s.winner) ||
    !["", "time", "hull"].includes(s.reason)
  )
    return null;
  if (
    !Array.isArray(s.ships) ||
    s.ships.length !== 2 ||
    !Array.isArray(s.bullets) ||
    s.bullets.length > 80
  )
    return null;
  const ships = [];
  for (let id = 0; id < 2; id++) {
    const p = s.ships[id];
    if (
      !p ||
      p.id !== id ||
      !number(p.x, 0, 40) ||
      !number(p.y, 0, 24) ||
      !number(p.angle, -7, 7) ||
      !number(p.hp, 0, 100) ||
      !number(p.hit, 0, 1) ||
      (p.boostCooldown !== undefined && !number(p.boostCooldown, 0, 2))
    )
      return null;
    ships.push({
      id,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      hit: p.hit,
      boostCooldown: p.boostCooldown ?? 0,
    });
  }
  const bullets = [];
  const ids = new Set();
  for (const b of s.bullets) {
    if (
      !b ||
      !Number.isSafeInteger(b.id) ||
      b.id < 1 ||
      b.id > 100000 ||
      ids.has(b.id) ||
      ![0, 1].includes(b.owner) ||
      !number(b.x, 0, 40) ||
      !number(b.y, 0, 24)
    )
      return null;
    ids.add(b.id);
    bullets.push({ id: b.id, owner: b.owner, x: b.x, y: b.y });
  }
  return {
    round,
    tick: s.tick,
    phase: s.phase,
    countdown: s.countdown,
    remaining: s.remaining,
    winner: s.winner,
    reason: s.reason,
    ships,
    bullets,
  };
}
