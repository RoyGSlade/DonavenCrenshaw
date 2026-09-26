import { state, config } from "../../state.js";
import { toast, blinkFuel } from "../../ui/hud.js";
import { isBacksideArenaEntry } from "../rules.js";
import { requestArenaEnterFromBack } from "../api.js";
import { isLapReady, portalCoordinates } from "../track.js";
import { tryFinishLevel } from "../modes/roadmap.js";
export function checkCollisionsAndInteractions() {
  const lv = state.run?.current;
  if (!lv) return;
  for (const node of lv.nodes) {
    const d = Math.hypot(
      lv.player.x - node.x - 0.5,
      lv.player.y - node.y - 0.5,
    );
    if (node.kind === "station" && d <= config.STATION_RADIUS + 0.15) {
      if (lv.fuel < lv.maxFuel - 1 || lv.player.hp < lv.player.maxHp) {
        lv.fuel = lv.maxFuel;
        lv.player.hp = lv.player.maxHp;
        blinkFuel();
        toast("Dock service: hull repaired, fuel full.");
      }
    } else if (
      node.kind === "planet" &&
      d <= config.PLANET_RADIUS + config.PLAYER_RADIUS &&
      !lv.shards.has(node.id)
    ) {
      lv.shards.add(node.id);
      lv.flux = Math.min(100, lv.flux + 8);
      toast(`${node.shardName}. ${node.clue}`, 4500);
      window.dispatchEvent(
        new CustomEvent("stardust:clue", {
          detail: { level: lv.level, text: node.clue },
        }),
      );
    } else if (node.kind === "gate" && d <= config.GATE_RADIUS) {
      if (isBacksideArenaEntry(node)) {
        requestArenaEnterFromBack();
        return;
      }
      // Launching on this portal is harmless; every checkpoint must be passed first.
      const relative = portalCoordinates(lv.track, lv.player);
      if (
        isLapReady(lv) &&
        relative.forward < -0.12 &&
        relative.velocity > 0.15
      ) {
        tryFinishLevel();
        return;
      }
    }
  }
}
