// The sprite for a ghost flown in a custom ship. A ghost entry (engine/modes/weekly.js)
// carries the appearance it was flown with; this paints it once (renderAppearance at
// 384 px) and keeps the canvas on the entry. The ship parts are large, so they load
// only when a ghost needs them: until they have, and for a ghost with no appearance
// or one that cannot be drawn, it stays the standard sprite (null here).
import { renderAppearance, loadShipKits, shipKitsLoaded, resolveAvailableAppearance } from '../systems/shipAppearance.js';

export const GHOST_SPRITE_SIZE = 384;

const live = { loaded: shipKitsLoaded, load: loadShipKits, render: (a) => renderAppearance(resolveAvailableAppearance(a), null, GHOST_SPRITE_SIZE) };

/** The ghost's painted ship canvas, or null while it is not ready (or never will be). */
export function ghostSprite(ghost, deps = live) {
  if (!ghost?.appearance || ghost.spriteFailed) return null;
  if (ghost.sprite) return ghost.sprite;
  if (!deps.loaded()) {
    // Start loading once; the next frame after the kits land paints the ghost.
    if (!ghost.spriteLoading) {
      ghost.spriteLoading = true;
      (async () => deps.load())().catch(() => { ghost.spriteFailed = true; }).finally(() => { ghost.spriteLoading = false; });
    }
    return null;
  }
  try { ghost.sprite = deps.render(ghost.appearance); } catch { ghost.spriteFailed = true; }
  return ghost.sprite || null;
}
