import { state, config } from "../../state.js";
import { spawnExhaust } from "./particles.js";
import { constrainToTrack } from "../track.js";
import { advanceFlight } from "./flight.js";

export function handlePlayerMovement(dt, sceneState, player, env = {}) {
  advanceFlight(dt, sceneState, player, state.keys, {
    ...env,
    countdownActive: state.ui.countdownActive,
    spawnExhaust,
    constrain(player, previous) {
      if (state.mode === "roadmap" && sceneState.track) {
        if (
          constrainToTrack(sceneState.track, player, previous, config.PLAYER_RADIUS)
        ) {
          if (sceneState.trackProgress) sceneState.trackProgress.boundaryHits++;
        }
      }

      // roadmap bounds (arena is handled by walls)
      if (state.mode === "roadmap") {
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

    },
  }, config);
}
