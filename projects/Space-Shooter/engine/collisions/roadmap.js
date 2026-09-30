import { state, config } from "../../state.js";
import { toast, blinkFuel } from "../../ui/hud.js";
import { isBacksideArenaEntry, touchesSignal } from "../rules.js";
import { runtimeConfig } from "../../runtime-config.js";
import { requestArenaEnterFromBack } from "../api.js";
import { labHooks } from "../../systems/lab.js";
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
        labHooks.dock();
        blinkFuel();
        toast("Dock service: hull repaired, fuel full.");
      }
    } else if (
      node.kind === "planet" &&
      touchesSignal(lv.player, node) &&
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
      if (runtimeConfig.bossFight !== false && isBacksideArenaEntry(node)) {
        requestArenaEnterFromBack();
        return;
      }
      // The finish is the start/finish line itself (engine/modes/roadmap.js);
      // the hidden gate node only keeps the dormant rear-entry secret.
    }
  }
}
