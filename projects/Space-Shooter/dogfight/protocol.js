/** Sanitize messages before they cross a room boundary. Positions belong only to the host. */
import { TRAP_RULES } from "./laserTraps.js";
import { isMode, modeSeats } from "./modes.js";
import { cleanArenaSnapshot } from "./terrainProtocol.js";
import {
  cleanLoadout,
  defaultLoadout,
  sameLoadout,
  shipStats,
} from "./ships.js";
export function inputControls(value) {
  if (
    !value ||
    (value.thrustStrength !== undefined &&
      !number(value.thrustStrength, 0, 1)) ||
    (value.backStrength !== undefined && !number(value.backStrength, 0, 0.6)) ||
    (value.strafe !== undefined && !number(value.strafe, -0.6, 0.6)) ||
    !number(value.turn, -1, 1) ||
    typeof value.thrust !== "boolean" ||
    typeof value.brake !== "boolean" ||
    typeof value.fire !== "boolean" ||
    (value.reverse !== undefined && typeof value.reverse !== "boolean") ||
    (value.boost !== undefined && typeof value.boost !== "boolean") ||
    (value.trap !== undefined && typeof value.trap !== "boolean")
  )
    return null;
  if (
    Object.keys(value).some(
      (k) =>
        ![
          "turn",
          "thrust",
          "brake",
          "fire",
          "reverse",
          "boost",
          "thrustStrength",
          "backStrength",
          "strafe",
          "trap",
        ].includes(k),
    )
  )
    return null;
  return {
    turn: value.turn,
    thrustStrength: value.thrustStrength ?? (value.thrust ? 1 : 0),
    backStrength: value.backStrength ?? (value.reverse ? 0.6 : 0),
    strafe: value.strafe ?? 0,
    thrust: value.thrust,
    brake: value.brake,
    fire: value.fire,
    reverse: value.reverse ?? false,
    boost: value.boost ?? false,
    trap: value.trap ?? false,
  };
}
const number = (v, lo, hi) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
export function cleanSnapshot(
  s,
  round,
  expectedLoadouts = null,
  expectedMapId = null,
  expectedMode = "duel",
) {
  const mode = s?.mode ?? "duel";
  if (!isMode(expectedMode) || !isMode(mode) || mode !== expectedMode)
    return null;
  const count = modeSeats(mode);
  const owners = Array.from({ length: count }, (_, i) => i);
  if (
    expectedLoadouts &&
    (!Array.isArray(expectedLoadouts) ||
      expectedLoadouts.length !== count ||
      expectedLoadouts.some((l) => !cleanLoadout(l)))
  )
    return null;
  if (
    !s ||
    s.round !== round ||
    !Number.isSafeInteger(s.tick) ||
    s.tick < 0 ||
    s.tick > 200000 ||
    !["countdown", "playing", "finished"].includes(s.phase) ||
    !number(s.countdown, 0, 3) ||
    !number(s.remaining, 0, 180) ||
    ![null, ...owners].includes(s.winner) ||
    !["", "time", "hull"].includes(s.reason)
  )
    return null;
  if (
    !Array.isArray(s.ships) ||
    s.ships.length !== count ||
    !Array.isArray(s.bullets) ||
    s.bullets.length > 80
  )
    return null;
  const ships = [];
  for (let id = 0; id < count; id++) {
    const p = s.ships[id];
    const loadout =
      p?.loadout === undefined ? defaultLoadout(id) : cleanLoadout(p.loadout);
    if (
      !loadout ||
      (expectedLoadouts && !sameLoadout(loadout, expectedLoadouts[id]))
    )
      return null;
    const maxHp = shipStats({ loadout }).hp;
    if (
      !p ||
      p.id !== id ||
      (p.flux !== undefined && !number(p.flux, 0, 100)) ||
      (p.boost !== undefined && !number(p.boost, 0, 3)) ||
      (p.heat !== undefined && !number(p.heat, 0, 100)) ||
      (p.isOverheated !== undefined && typeof p.isOverheated !== "boolean") ||
      !number(p.x, 0, 40) ||
      !number(p.y, 0, 24) ||
      !number(p.angle, -7, 7) ||
      !number(p.hp, 0, maxHp) ||
      (p.maxHp !== undefined && p.maxHp !== maxHp) ||
      !number(p.hit, 0, 1) ||
      (p.boostCooldown !== undefined && !number(p.boostCooldown, 0, 0.25)) ||
      (p.trapCooldown !== undefined &&
        !number(p.trapCooldown, 0, TRAP_RULES.recharge)) ||
      (p.trapLock !== undefined &&
        !number(p.trapLock, 0, TRAP_RULES.lockSeconds)) ||
      (p.trapImmunity !== undefined &&
        !number(
          p.trapImmunity,
          0,
          TRAP_RULES.lockSeconds + TRAP_RULES.immunitySeconds,
        ))
    )
      return null;
    ships.push({
      id,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      loadout,
      maxHp,
      hit: p.hit,
      boostCooldown: p.boostCooldown ?? 0,
      flux: p.flux ?? 30,
      boost: p.boost ?? 3,
      heat: p.heat ?? 0,
      isOverheated: p.isOverheated ?? false,
      trapCooldown: p.trapCooldown ?? 0,
      trapLock: p.trapLock ?? 0,
      trapImmunity: p.trapImmunity ?? 0,
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
      !owners.includes(b.owner) ||
      !number(b.x, 0, 40) ||
      !number(b.y, 0, 24)
    )
      return null;
    ids.add(b.id);
    bullets.push({ id: b.id, owner: b.owner, x: b.x, y: b.y });
  }
  const traps = [];
  if (
    s.traps !== undefined &&
    (!Array.isArray(s.traps) || s.traps.length > count)
  )
    return null;
  const trapIds = new Set();
  for (const trap of s.traps ?? []) {
    if (
      !trap ||
      !Number.isSafeInteger(trap.id) ||
      trap.id < 1 ||
      trap.id > 100000 ||
      trapIds.has(trap.id) ||
      !owners.includes(trap.owner) ||
      !number(trap.x, 0, 40) ||
      !number(trap.y, 0, 24) ||
      !number(trap.angle, -7, 7)
    )
      return null;
    trapIds.add(trap.id);
    traps.push({
      id: trap.id,
      owner: trap.owner,
      x: trap.x,
      y: trap.y,
      angle: trap.angle,
    });
  }
  const arena = cleanArenaSnapshot(s, expectedMapId);
  if (!arena) return null;
  return {
    ...arena,
    mode,
    round,
    tick: s.tick,
    phase: s.phase,
    countdown: s.countdown,
    remaining: s.remaining,
    winner: s.winner,
    reason: s.reason,
    ships,
    bullets,
    traps,
  };
}
