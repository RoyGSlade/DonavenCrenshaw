// src/roadmap/engine/collisions/roadmap.js
import { state, config, SHARDS_PER_LEVEL } from '../../state.js';
import { withRun } from '../runGuard.js';
import { toast, blinkFuel } from '../../ui/hud.js';
import { isBacksideArenaEntry } from '../rules.js';
import { requestArenaEnterFromBack } from '../api.js';
import { tryFinishLevel } from '../modes/roadmap.js';

export function checkCollisionsAndInteractions() {
  if (!withRun(run => {
    // 'run' here is actually the current level object
    const lv = run;
    if (!lv || !Array.isArray(lv.nodes)) return;
    for (const n of lv.nodes) {
      const d = Math.hypot(lv.player.x - (n.x + 0.5), lv.player.y - (n.y + 0.5));
      if (n.kind === 'station' && d <= config.STATION_RADIUS) {
        if (lv.fuel < lv.maxFuel) { lv.fuel = lv.maxFuel; blinkFuel(); toast('Fuel Tank Refilled!'); }
      } else if (n.kind === 'planet' && d <= config.PLANET_RADIUS) {
        if (!lv.shards.has(n.id)) {
          lv.shards.add(n.id);
          toast(`Shard collected: ${n.shardName || n.title}`);
        }
      } else if (n.kind === 'gate' && d <= config.GATE_RADIUS) {
        if (isBacksideArenaEntry(n)) {
          requestArenaEnterFromBack();
          return;
        }
        tryFinishLevel();
      }
    }
  })) {
    return;
  }
}