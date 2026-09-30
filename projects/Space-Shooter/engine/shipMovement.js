// The network circuits' flight step with the ship's real body on the rails.
// Same as handlePlayerMovement (engine/systems/movement.js) except that the
// rails see PLAYER_HULL (engine/hull.js) instead of the PLAYER_RADIUS circle.
// movement.js keeps the circle for everything else that still calls it.
import { state, config } from "../state.js";
import { spawnExhaust } from "./systems/particles.js";
import { constrainToTrack } from "./track.js";
import { advanceFlight } from "./systems/flight.js";
import { railRules } from "./systems/movement.js";
import { PLAYER_HULL } from "./hull.js";

/** The roadmap map edge (cells), as movement.js keeps it. */
export function clampToWorld(player) {
  if (player.x < config.WORLD_PADDING) {
    player.x = config.WORLD_PADDING;
    player.vx *= config.WALL_BOUNCE_DAMPENING;
  }
  if (player.y < config.WORLD_PADDING) {
    player.y = config.WORLD_PADDING;
    player.vy *= config.WALL_BOUNCE_DAMPENING;
  }
  if (player.x > config.GRID_W - config.WORLD_PADDING) {
    player.x = config.GRID_W - config.WORLD_PADDING;
    player.vx *= config.WALL_BOUNCE_DAMPENING;
  }
  if (player.y > config.GRID_H - config.WORLD_PADDING) {
    player.y = config.GRID_H - config.WORLD_PADDING;
    player.vy *= config.WALL_BOUNCE_DAMPENING;
  }
}

export function handleShipMovement(dt, sceneState, player, env = {}) {
  advanceFlight(dt, sceneState, player, state.keys, {
    ...env,
    countdownActive: state.ui.countdownActive,
    spawnExhaust,
    constrain(player, previous) {
      if (state.mode !== "roadmap") return;
      if (sceneState.track && constrainToTrack(sceneState.track, player, previous, PLAYER_HULL, railRules(player))) {
        if (sceneState.trackProgress) sceneState.trackProgress.boundaryHits++;
      }
      clampToWorld(player);
    },
  }, config);
}
