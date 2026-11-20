// How the opening changes place without a hard cut (opening B, outcome 2). Pure: no DOM.
//   - TIME_SKIPS: the only fades left. A scene that begins "the morning after" fades through black with one line.
//   - fightHere(): a fight on a map the player is not standing in runs where they stand, the enemies coming in by a door.
//   - spawnAt(): a fight in the player's own room starts where they stand, never yanking them to a spawn point.
/** Scene id -> the line shown while the screen fades through black (a DRAFT: Donaven approves the words). */
export const TIME_SKIPS = Object.freeze({
  'the-eighth-gunner': 'The next morning.',
  'gunners-week': 'A few days later.',
  'day-five': 'Day five.',
});
export const skipLine = (sceneId) => TIME_SKIPS[sceneId] || null;

/** The player's own spot as a fight spawn. */
export const spawnAt = (pos, angle = 0) => ({ x: pos.x, y: pos.y, angle });

/**
 * setup: the engine's fight setup { map, spawn, enemies: [{ type, at: [tx, ty], ... }] }. here: { map: compiled map in the player's room,
 * player: { x, y, angle }, doorBox: the door the enemies come in by { x, y, w, h } or null }.
 * Returns a setup that runs in the player's room: same enemies, standing in a file just inside the door, awake.
 */
export function fightHere(setup, here) {
  const T = here.map.tile || 48;
  const door = here.doorBox || { x: here.map.w / 2 - T / 2, y: T, w: T, h: T };
  const cx = door.x + door.w / 2, cy = door.y + door.h / 2;
  // Inward: from the door toward the middle of the room, snapped to the nearest axis.
  const dx = here.map.w / 2 - cx, dy = here.map.h / 2 - cy;
  const inward = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
  const side = { x: -inward.y, y: inward.x };
  const list = (setup.enemies || []).map((e, i) => {
    const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
    const lateral = col * (T * 0.45);
    return { ...Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'at')), x: cx + inward.x * (T * 1.1 + row * T) + side.x * lateral, y: cy + inward.y * (T * 1.1 + row * T) + side.y * lateral, awake: true };
  });
  return { ...setup, map: here.map.id, spawn: spawnAt(here.player, here.player.angle ?? 0), enemies: list };
}

