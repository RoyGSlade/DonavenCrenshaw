// Reads the player's motion preference the way the 2D renderer does
// (state.settings.reducedMotion), plus the scene flag gfx3d/index.js passes to
// the world. Shakes, strobing flashes and streak showers all check this.
import { state, config } from '../../state.js';

export function reducedMotion(lv) {
  return !!(lv?.reducedMotion || state.settings?.reducedMotion);
}

/** Cells of world visible top to bottom at zoom 1, the 2D renderer's VIEW_CELLS_H. */
export function viewCells() {
  const v = config.VIEW_CELLS_H || config.GRID_H;
  return Number.isFinite(v) && v > 0 ? v : 18;
}

